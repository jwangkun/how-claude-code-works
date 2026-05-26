# Bash 执行系统深度分析

## 概述

Claude Code 的 Bash 执行系统是一个多层次、纵深防御的命令执行框架，涵盖从命令解析、安全校验、路径验证、权限管理到实际执行的完整链路。该系统的核心设计哲学是 **FAIL-CLOSED（默认拒绝）**：对于任何无法静态分析或理解的结构，系统回退到向用户请求明确许可，而不是试图猜测意图。

本文基于 `claude-code-rev` 项目源码，深入分析以下核心文件：

| 文件 | 路径 | 行数 | 职责 |
|------|------|------|------|
| `ast.ts` | `src/utils/bash/ast.ts` | 2679 | 基于 tree-sitter 的 AST 安全解析 |
| `bashParser.ts` | `src/utils/bash/bashParser.ts` | 4436 | 纯 TypeScript Bash 词法/语法解析器 |
| `parser.ts` | `src/utils/bash/parser.ts` | ~600 | tree-sitter 解析器封装 |
| `bashPermissions.ts` | `src/tools/BashTool/bashPermissions.ts` | 2621 | 权限决策引擎 |
| `bashSecurity.ts` | `src/tools/BashTool/bashSecurity.ts` | 2592 | 安全检查器链 |
| `readOnlyValidation.ts` | `src/tools/BashTool/readOnlyValidation.ts` | 1990 | 只读模式约束 |
| `pathValidation.ts` | `src/tools/BashTool/pathValidation.ts` | 1303 | 路径安全校验 |
| `BashTool.tsx` | `src/tools/BashTool/BashTool.tsx` | ~1800 | BashTool 工具定义与执行 |
| `Shell.ts` | `src/utils/Shell.ts` | ~450 | Shell 进程管理与执行 |
| `readOnlyCommandValidation.ts` | `src/utils/shell/readOnlyCommandValidation.ts` | ~1700 | 只读命令定义（共享） |

---

## 一、Bash 命令解析架构

### 1.1 双引擎解析策略

Bash 命令解析采用 **双引擎分层策略**，同时维护三个解析路径：

```text
  用户输入字符串
        │
        ├── tree-sitter-bash (主解析器)
        │       ├── bashParser.ts (纯TS实现, TIMEOUT=50ms)
        │       └── ast.ts (安全性分析)
        │
        ├── shell-quote (传统回退)
        │       ├── shellQuote.ts
        │       └── commands.ts
        │
        └── splitCommand_DEPRECATED (最简分割)
                └── commands.ts
```

**主路径（AST-based）**：`bashParser.ts` 实现了一个完整的纯 TypeScript Bash 词法分析器和语法分析器，生成与 tree-sitter-bash 兼容的 AST。该解析器有严格的时间预算（50ms 超时）和节点预算（50,000 节点上限），防止恶意输入导致拒绝服务。

关键类型定义（`bashParser.ts`）：

```typescript
export type TsNode = {
  type: string
  text: string
  startIndex: number  // UTF-8 字节偏移
  endIndex: number
  children: TsNode[]
}

const PARSE_TIMEOUT_MS = 50    // 50ms 硬截止
const MAX_NODES = 50_000        // 节点预算上限
```

### 1.2 AST 安全分析层

`ast.ts` 构建在 bashParser.ts 之上，提供安全导向的语义分析。其核心思想是 **显式白名单节点类型**：

```typescript
const STRUCTURAL_TYPES = new Set([
  'program',       // 根节点
  'list',          // a && b || c
  'pipeline',      // a | b
  'redirected_statement',  // 带重定向的命令
])
```

任何不在白名单中的节点类型导致 `ParseForSecurityResult` 返回 `{ kind: 'too-complex' }`，触发完整权限审批流程。

```typescript
export type ParseForSecurityResult =
  | { kind: 'simple'; commands: SimpleCommand[] }
  | { kind: 'too-complex'; reason: string; nodeType?: string }
  | { kind: 'parse-unavailable' }
```

`SimpleCommand` 类型携带解析后的 argv、环境变量、重定向信息：

```typescript
export type SimpleCommand = {
  argv: string[]          // argv[0] 是命令名
  envVars: { name: string; value: string }[]
  redirects: Redirect[]   // >、>>、<、<< 等
  text: string            // 原始源码区间
}
```

### 1.3 parseForSecurity 主入口

`ast.ts:381` 的 `parseForSecurity()` 函数是整个安全解析的主入口：

1. 调用 `parseCommandRaw()` 获取 tree-sitter AST 根节点
2. 若不可用则返回 `parse-unavailable`
3. 递归遍历结构节点找到叶子 `command` 节点
4. 提取 argv（处理引号、逃逸、变量赋值）
5. 分别解析 `$()` 命令替换内部命令

命令替换（`$()`）的占位符机制尤为精妙。内部命令被单独提取检查，外层 argv 中用 `__CMDSUB_OUTPUT__` 字符串替代，这样外层路径验证不会被多行 heredoc 体污染。

```typescript
const CMDSUB_PLACEHOLDER = '__CMDSUB_OUTPUT__'
const VAR_PLACEHOLDER = '__TRACKED_VAR__'
```

### 1.4 Sherlock-level 语义检查

`checkSemantics()`（`ast.ts:2213`）在提取 argv 后进行最终语义验证：

- 检查追踪的变量赋值是否被正确解析
- 确认重定向目标是否包含未展开的 shell 变量
- 验证是否存在未闭合的引号或逃逸序列
- 检测逃逸的 shell 操作符（`\;`、`\|` 等）

```typescript
export function checkSemantics(commands: SimpleCommand[]): SemanticCheckResult
```

---

## 二、安全模型

### 2.1 纵深防御架构

Bash 安全系统采用多层校验流水线，以 `bashToolHasPermission()`（`bashPermissions.ts:1663`）为总入口：

```text
输入命令
    │
    ├── 0. AST 安全解析 (parseForSecurity)
    │       ├── too-complex → 需要用户批准
    │       └── simple → 继续下游
    │
    ├── 1. 模式验证 (checkPermissionMode)
    │       ├── acceptEdits → 自动允许文件系统操作
    │       └── bypassPermissions → 跳过
    │
    ├── 2. 安全校验链 (bashCommandIsSafe_DEPRECATED / bashCommandIsSafeAsync_DEPRECATED)
    │       ├── 控制字符检测
    │       ├── shell-quote 单引号反斜杠 bug 检测
    │       ├── 23 个安全检查器链
    │       └── tree-sitter 增强检查
    │
    ├── 3. 只读约束 (checkReadOnlyConstraints)
    │
    ├── 4. 路径约束 (checkPathConstraints)
    │       ├── 危险删除路径检查
    │       ├── 重定向目标验证
    │       └── 工作区边界检查
    │
    ├── 5. 精确匹配权限规则
    │       ├── deny 列表
    │       ├── ask 列表
    │       └── allow 列表
    │
    ├── 6. 分类器（ML-based）
    │       └── BASH_CLASSIFIER 功能标记
    │
    ├── 7. 通配符/前缀规则
    │
    └── 8. 最终 fallback → ask 用户
```

### 2.2 命令黑名单（bashSecurity.ts）

`bashSecurity.ts` 实现了 23 个安全检查器，通过 **ID 枚举系统** 进行审计追踪：

```typescript
const BASH_SECURITY_CHECK_IDS = {
  INCOMPLETE_COMMANDS: 1,
  JQ_SYSTEM_FUNCTION: 2,
  JQ_FILE_ARGUMENTS: 3,
  OBFUSCATED_FLAGS: 4,
  SHELL_METACHARACTERS: 5,
  // ... 共 23 个检查项
}
```

安全检查器通过 `bashCommandIsSafe_DEPRECATED()`（`bashSecurity.ts:2257`）串联执行，分为两类：

**早期通过（early-allow）验证器**：
- `validateEmpty` — 空命令直接允许
- `validateIncompleteCommands` — 不完整的命令需要问询
- `validateSafeCommandSubstitution` — 安全的 `$(cat <<'EOF')` 模式
- `validateGitCommit` — 安全的 `git commit -m "..."` 模式

**标准验证器链**：
- `validateJqCommand` — 防止 `jq` 中 `system` / `env` 函数调用
- `validateObfuscatedFlags` — 检测混淆标志（如 `-=x`）
- `validateShellMetacharacters` — shell 元字符检测
- `validateDangerousVariables` — 危险变量（`$PATH`、`$LD_PRELOAD` 等）
- `validateCommentQuoteDesync` — 注释引起的引号不同步
- `validateQuotedNewline` — 引号内换行符检测
- `validateCarriageReturn` — CR 字符（\r）导致的解析偏差
- `validateNewlines` — 未引用的换行符
- `validateIFSInjection` — IFS（内部字段分隔符）注入
- `validateProcEnvironAccess` — `/proc/self/environ` 访问
- `validateDangerousPatterns` — 命令替换、进程替换等
- `validateRedirections` — 重定向操作符验证
- `validateBackslashEscapedWhitespace` — 反斜杠逃逸空白
- `validateBackslashEscapedOperators` — 逃逸的 shell 操作符
- `validateUnicodeWhitespace` — Unicode 空白字符
- `validateMidWordHash` — 词中 `#` 导致注释行为差异
- `validateBraceExpansion` — 花括号展开
- `validateZshDangerousCommands` — Zsh 危险命令
- `validateMalformedTokenInjection` — 畸形 token 注入

### 2.3 tree-sitter 影子模式

一个值得注意的安全机制是 **影子模式（shadow mode）**。当功能标记 `TREE_SITTER_BASH_SHADOW` 启用时：

```typescript
if (feature('TREE_SITTER_BASH_SHADOW')) {
  // ... 记录 parsed vs legacy 差异 ...
  // 始终强制使用 legacy 路径，影子模式仅观察
  astResult = { kind: 'parse-unavailable' }
  astRoot = null
}
```

此时 tree-sitter 的结果被记录下来用于比较分析（记录到 `tengu_tree_sitter_shadow` 事件），但权限决策仍使用传统正则路径。这种模式允许团队在无缝迁移过程中验证新解析器的正确性。

---

## 三、只读模式与执行

### 3.1 只读模式的设计

只读模式是 Claude Code 的关键安全机制，让模型在不需要用户反复批准的情况下执行无害的文件读操作。实现分布在 `readOnlyValidation.ts`（BashTool）和 `readOnlyCommandValidation.ts`（共享）中。

### 3.2 命令安全标志验证

`isCommandSafeViaFlagParsing()`（`readOnlyValidation.ts:1246`）是只读验证的核心函数。它对每个命令子命令进行标志级安全分析：

```text
  解析命令
      │
      ├── AST 解析成功?
      │     ├── 是 → 使用 AST-derived argv
      │     └── 否 → 使用 shell-quote
      │
      ├── 查找命令配置
      │     ├── git → GIT_READ_ONLY_COMMANDS
      │     ├── gh  → GH_READ_ONLY_COMMANDS
      │     ├── rg  → RIPGREP_READ_ONLY_COMMANDS
      │     ├── docker → DOCKER_READ_ONLY_COMMANDS
      │     └── 其他 → EXTERNAL_READONLY_COMMANDS
      │
      ├── 验证标志安全性
      │     ├── none → 无参数标志（--color）
      │     ├── number → 数字参数（--context=3）
      │     ├── string → 字符串参数（--format=json）
      │     └── char → 单字符参数
      │
      └── 执行附加回调
            └── additionalCommandIsDangerousCallback
```

### 3.3 Git 命令的特殊处理

Git 命令由于可以执行 hooks，受到额外安全关注：

```typescript
// 阻止 cd + git 组合命令（防止裸仓库攻击）
if (compoundCommandHasCd && hasGitCommand) { ... }

// 阻止在类似裸仓库的目录中执行 git
if (hasGitCommand && isCurrentDirectoryBareGitRepo()) { ... }

// 阻止创建 git 内部文件后执行 git
if (hasGitCommand && commandWritesToGitInternalPaths(command)) { ... }
```

`GIT_READ_ONLY_COMMANDS` 详细定义了每个 git 子命令的安全标志：

```typescript
export const GIT_READ_ONLY_COMMANDS: Record<string, ExternalCommandConfig> = {
  'git log': { safeFlags: { /* ... ~40 个安全标志 ... */ } },
  'git status': { safeFlags: { '-s': 'none', '--short': 'none', /* ... */ } },
  'git diff': { safeFlags: { '--staged': 'none', '--cached': 'none', /* ... */ },
    additionalCommandIsDangerousCallback: ... },
  // ... 还有 show、branch、remote、reflog 等
}
```

### 3.4 checkReadOnlyConstraints 主入口

`checkReadOnlyConstraints()`（`readOnlyValidation.ts:1876`）的完整流程：

1. Shell-quote 解析尝试 → 解析失败则 `passthrough`
2. `bashCommandIsSafe_DEPRECATED` 安全检查 → 不安全则 `passthrough`
3. Windows UNC 路径检测 → 发现则 `ask`
4. Git 安全检测 → cd+git、裸仓库等
5. 拆分子命令 → 每个子命令调用 `isCommandReadOnly`
6. 全部只读 → `allow`；否则 → `passthrough`

---

## 四、路径验证与沙箱

### 4.1 路径验证系统

`pathValidation.ts` 是路径安全的核心模块，针对 27 种路径操作命令提供精细的路径验证：

```typescript
export type PathCommand =
  | 'cd' | 'ls' | 'find' | 'mkdir' | 'touch' | 'rm' | 'rmdir'
  | 'mv' | 'cp' | 'cat' | 'head' | 'tail' | 'grep' | 'rg' | 'sed'
  | 'git' | 'jq' | 'awk' | ... (共 27 个)
```

### 4.2 路径提取器

`PATH_EXTRACTORS` 是为每个路径命令定制的参数提取函数。例如 `rm` 的提取器需要跳过 `-rf` 等标志提取目标路径：

```typescript
export const PATH_EXTRACTORS: Record<
  PathCommand, (args: string[]) => string[]
> = {
  rm: (args) => { /* 跳过 -rf、--recursive 等，收集路径参数 */ },
  mv: (args) => { /* 第一个是源，最后一个是目标 */ },
  // ...
}
```

### 4.3 危险删除路径保护

`checkDangerousRemovalPaths()` 对 `rm`/`rmdir` 命令进行深度检查，检测目标是否为系统关键路径：

```typescript
function checkDangerousRemovalPaths(
  command: 'rm' | 'rmdir',
  args: string[],
  cwd: string,
): PermissionResult {
  // 展开 ~、解析为绝对路径
  // 检查 isDangerousRemovalPath（非符号链接解析版本）
  // 危险路径 → 强制 ask，不能被权限规则自动允许
}
```

注意这里特意**不解析符号链接**：macOS 上 `/tmp` 是 `/private/tmp` 的符号链接，系统想要检测原始路径 `/tmp`。

### 4.4 进程替换检测

进程替换 `>(cmd)` 和 `<(cmd)` 是已知的攻击向量：

```typescript
if (!astCommands && />>\s*>\s*\(|>\s*>\s*\(|<\s*\(/.test(input.command)) {
  return { behavior: 'ask', message: '进程替换需要手动批准' }
}
```

### 4.5 沙箱集成

沙箱集成在 `Shell.ts` 中，通过 `SandboxManager.wrapWithSandbox()` 实现：

```typescript
if (shouldUseSandbox) {
  commandString = await SandboxManager.wrapWithSandbox(
    commandString,
    sandboxBinShell,
    undefined,
    abortSignal,
  )
}
```

沙箱创建临时目录、限制文件系统访问、隔离进程。输出文件使用 `O_NOFOLLOW` 标志防止符号链接跟踪攻击。

---

## 五、权限系统

### 5.1 权限决策树

`bashToolHasPermission()`（`bashPermissions.ts:1663`）是权限决策的总入口，以下是简化的决策流程：

```text
bashToolHasPermission(input, context)
    │
    ├── 0. 如果启用 AST 解析
    │       ├── too-complex → 快速拒绝 + 分类器
    │       └── simple → 提取 argv 供后续使用
    │
    ├── 1. 影子模式记录
    ├── 2. 模式验证 (checkPermissionMode)
    ├── 3. 安全校验 (bashCommandIsSafe)
    │
    ├── 4. 只读约束 (checkReadOnlyConstraints)
    │       └── allow → 直接返回 allow
    │
    ├── 5. 路径验证 (checkPathConstraints)
    │       └── ask/deny → 直接返回
    │
    ├── 6. 精确匹配规则 (exact-match)
    │       ├── deny → deny
    │       ├── ask → ask
    │       └── allow → allow
    │
    ├── 7. 分类器 (BASH_CLASSIFIER)
    │       ├── auto_approve → allow
    │       ├── deny → deny
    │       └── ask → 继续
    │
    ├── 8. 通配符/前缀规则
    │       ├── deny → deny
    │       ├── ask → ask
    │       └── allow → allow
    │
    └── 9. 最终 fallback → ask (带建议规则)
```

### 5.2 权限规则匹配

权限规则支持三种匹配模式：

```typescript
// 精确匹配: "npm run lint"
// 前缀匹配: "npm run test:*" (星号为通配符)
// 通配符匹配: "git *"

export function matchWildcardPattern(pattern: string, command: string): boolean
export const permissionRuleExtractPrefix = sharedPermissionRuleExtractPrefix
```

### 5.3 ML 分类器集成

当功能标记 `BASH_CLASSIFIER` 启用时，系统使用 ML 模型自动分类命令：

```typescript
export async function executeAsyncClassifierCheck(
  command: string,
  context: ToolUseContext,
): Promise<ClassifierResult>
```

分类器返回 `auto_approve`、`deny` 或 `ask`，与规则系统叠加使用。

---

## 六、BashTool 实现

### 6.1 工具定义

`BashTool` 通过 `buildTool()` 工厂函数定义（`BashTool.tsx:420`）：

```typescript
export const BashTool = buildTool({
  name: BASH_TOOL_NAME,
  maxResultSizeChars: 30_000,
  strict: true,
  // ...
})
```

### 6.2 输入/输出模式

输入模式精细控制参数：

```typescript
const fullInputSchema = lazySchema(() => z.strictObject({
  command: z.string(),                                 // 要执行的命令
  timeout: semanticNumber(z.number().optional()),      // 超时（毫秒）
  description: z.string().optional(),                  // 人类可读描述
  run_in_background: semanticBoolean(z.boolean().optional()),  // 后台运行
  dangerouslyDisableSandbox: semanticBoolean(z.boolean().optional()), // 危险覆盖
  _simulatedSedEdit: z.object({...}).optional(),       // 内部 sed 编辑
}))
```

输出模式包含丰富的结果信息：

```typescript
const outputSchema = lazySchema(() => z.object({
  stdout: z.string(),                              // 标准输出
  stderr: z.string(),                              // 标准错误
  rawOutputPath: z.string().optional(),             // 大输出文件路径
  interrupted: z.boolean(),                         // 是否被中断
  isImage: z.boolean().optional(),                  // 是否包含图片
  backgroundTaskId: z.string().optional(),           // 后台任务 ID
  persistedOutputPath: z.string().optional(),        // 持久化输出路径
  persistedOutputSize: z.number().optional(),        // 输出大小
  // ...
}))
```

### 6.3 执行流程

`call()` 方法是执行的入口（`BashTool.tsx:624`），主执行逻辑在 `runShellCommand()` 异步生成器中：

```text
call(input)
    │
    ├── 模拟 sed 编辑处理（_simulatedSedEdit）
    │
    └── runShellCommand() (async generator)
            │
            ├── exec(command, signal, 'bash', { 超时, 进度回调, 沙箱 })
            │       │
            │       ├── Shell.ts → resolveProvider['bash']
            │       │       ├── getShellConfig() → bashProvider
            │       │       └── provider.buildExecCommand()
            │       │
            │       ├── 沙箱集成（可选）
            │       │
            │       └── spawn + wrapSpawn → ShellCommand
            │
            ├── 进度轮询（每 tick 从 TaskOutput 读取）
            │       └── yield progress 事件
            │
            ├── 超时处理
            │       ├── 自动后台化（onTimeout）
            │       └── 助手模式自动后台（ASSISTANT_BLOCKING_BUDGET_MS=15s）
            │
            ├── 输出累积
            │       ├── EndTruncatingAccumulator
            │       └── 大输出持久化（> 30K chars）
            │
            ├── 后处理
            │       ├── 解释退出码（interpretCommandResult）
            │       ├── 检测 git 索引锁
            │       ├── 清理空行
            │       ├── 提取 Claude Code Hints
            │       └── 图片输出缩放
            │
            └── 返回 Out 对象
```

### 6.4 大输出处理

当命令输出超过 30KB 时，系统将完整输出持久化到磁盘：

```typescript
const MAX_PERSISTED_SIZE = 64 * 1024 * 1024  // 64MB 上限
if (result.outputFilePath && result.outputTaskId) {
  // 复制到工具结果目录
  // 超过 64MB 则截断
  await fsTruncate(result.outputFilePath, MAX_PERSISTED_SIZE)
}
```

向模型返回的结果中包含预览（前 5000 字节）和文件路径，模型可通过 `FileRead` 工具继续读取。

---

## 七、PowerShell 并行实现

### 7.1 跨平台架构

`PowerShellTool` 是 `BashTool` 的 Windows 对等实现，共享大部分架构理念但针对 PowerShell 语义调整：

**文件结构**：
```
src/tools/PowerShellTool/
├── PowerShellTool.tsx    # 工具定义（~900 行）
├── powershellPermissions.ts  # 权限引擎
├── pathValidation.ts     # 路径验证
├── readOnlyValidation.ts # 只读校验
├── modeValidation.ts     # 模式验证
├── commonParameters.ts   # PowerShell 通用参数
├── dangerousCmdlets.ts   # 危险 cmdlet 列表
├── commandSemantics.ts   # 语义解释
└── UI.tsx               # React UI 组件
```

### 7.2 关键差异

**命令分类**：PowerShell 的搜索/读取命令使用 cmdlet 名称：
```typescript
const PS_SEARCH_COMMANDS = new Set([
  'select-string',   // grep 等价
  'get-childitem',   // find 等价（带 -Recurse）
  'findstr',         // 原生 Windows 搜索
  'where.exe',       // 原生 which
])
```

**危险 cmdlet**：PowerShell 工具维护独立的危险命令列表（`dangerousCmdlets.ts`），包含 `Invoke-Expression`、`Invoke-Command`、`Start-Process` 等。

**执行路径**：`Shell.ts` 通过 `resolveProvider['powershell']` 选择 `powershellProvider`。沙箱模式下，PowerShell 命令通过 base64 编码的 `-EncodedCommand` 参数传递。

### 7.3 共享基础设施

两个工具共享大量跨平台基础设施：
- `readOnlyCommandValidation.ts` — 只读命令标志配置（`GIT_READ_ONLY_COMMANDS`、`GH_READ_ONLY_COMMANDS` 等）
- `Shell.ts` — ShellProvider 抽象和执行编排
- `SandboxManager` — 沙箱适配器
- `shouldUseSandbox.ts` — 沙箱启用检测

---

## 八、跨平台考量

### 8.1 平台适配层

系统通过 `getPlatform()` 和条件编译处理平台差异：

```typescript
import { getPlatform } from '../../utils/platform.js'
import { windowsPathToPosixPath } from '../../utils/windowsPaths.js'
```

### 8.2 文件系统差异

输出文件的打开模式因平台不同：

```typescript
outputHandle = await open(
  taskOutput.path,
  process.platform === 'win32'
    ? 'w'                      // Windows: 使用字符串模式
    : fsConstants.O_WRONLY |   // POSIX: 使用数值标志
        fsConstants.O_CREAT |
        fsConstants.O_APPEND |
        O_NOFOLLOW,
)
```

`O_APPEND` 在 POSIX 上保证原子追加写入；在 Windows 上，使用 `'w'` 模式而非 `'a'` 模式，因为 MSYS2/Cygwin 将仅追加句柄视为只读。

### 8.3 Shell 发现

`findSuitableShell()`（`Shell.ts:73`）的优先级逻辑：

1. `CLAUDE_CODE_SHELL` 环境变量显式指定
2. `$SHELL` 环境变量（仅 bash/zsh）
3. 通过 `which('bash')` / `which('zsh')` 发现
4. 回退到 `/bin/bash` / `/usr/bin/zsh` 等标准路径

### 8.4 Windows 路径转换

Windows 路径转换在关键边界执行：

```typescript
import { posixPathToWindowsPath } from './windowsPaths.js'
import { windowsPathToPosixPath } from './utils/windowsPaths.js'
```

CWD 文件路径（由 `pwd -P >| $path` 写入）在 Windows 上需要从 POSIX 转换为原生 Windows 路径后才能被 Node.js `readFileSync` 读取。

---

## 九、错误处理与超时管理

### 9.1 多层次超时

系统实现了多层次超时策略：

```text
默认超时: 30 分钟（DEFAULT_TIMEOUT = 30 * 60 * 1000）
  └── 工具指定超时（默认 60 秒）
        └── 助手模式自动后台（15 秒）
              └── 睡眠检测（>2 秒 → 建议 Monitor 工具）
```

### 9.2 后台执行

命令在三种情况下进入后台：

1. **显式后台**：`run_in_background: true`
2. **超时后台**：`shellCommand.onTimeout` → 注册后台任务
3. **助手模式自动后台**：阻塞超过 15 秒自动进入后台

```typescript
// 助手模式 15 秒预算
const ASSISTANT_BLOCKING_BUDGET_MS = 15_000
if (feature('KAIROS') && getKairosActive() && ...) {
  setTimeout(() => {
    if (shellCommand.status === 'running' && backgroundShellId === undefined) {
      assistantAutoBackgrounded = true
      startBackgrounding('tengu_bash_command_assistant_auto_backgrounded')
    }
  }, ASSISTANT_BLOCKING_BUDGET_MS).unref()
}
```

### 9.3 输出截断

输出截断由 `EndTruncatingAccumulator` 和 `isOutputLineTruncated` 处理：

```typescript
export function isResultTruncated(output: Out): boolean {
  return isOutputLineTruncated(output.stdout) || isOutputLineTruncated(output.stderr)
}
```

当结果超过 `maxResultSizeChars: 30_000` 时，向模型返回持久化的文件路径。

### 9.4 退出码解释

`interpretCommandResult()` 对非零退出码进行语义解释：

```typescript
const interpretationResult = interpretCommandResult(input.command, result.code, ...)
// 例如: diff 返回 1 表示文件不同（非错误）
```

---

## 十、输出流式处理

### 10.1 输出累积机制

`EndTruncatingAccumulator` 维护一个可截断的输出缓冲区，支持进度报告：

```typescript
const stdoutAccumulator = new EndTruncatingAccumulator()
```

### 10.2 实时进度

通过 `onProgress` 回调实现实时进度报告：

```typescript
onProgress(lastLines, allLines, totalLines, totalBytes, isIncomplete) {
  lastProgressOutput = lastLines
  fullOutput = allLines
  // 唤醒生成器 yield 进度
}
```

### 10.3 文件模式 vs 管道模式

输出收集有两种模式：

**文件模式**（默认）：stdout 和 stderr 通过文件描述符合并写入同一个文件：

```text
childProcess (stdout) ──┐
                        ├──→ outputHandle (合并 fd)
childProcess (stderr) ──┘
```

**管道模式**（`onStdout` 回调）：输出通过 Node.js 可读流传输：

```text
childProcess.stdout → StreamWrapper → TaskOutput (内存缓冲区)
                   → onStdout(data) → 调用者实时处理
```

---

## 总结

Claude Code 的 Bash 执行系统是一个精心设计的纵深防御框架，其主要特点包括：

1. **双引擎解析**：纯 TypeScript 实现的 tree-sitter 兼容解析器配合传统 shell-quote，通过析取器差异检测防止逃逸
2. **FAIL-CLOSED 设计**：任何无法静态分析的结构触发用户审批流程
3. **多层安全校验**：从词法分析、语法分析、语义检查到运行时沙箱的 7 层防御
4. **跨平台原生支持**：通过 ShellProvider 抽象层统一 Linux/macOS/Windows
5. **智能权限分类**：精确匹配 + 通配符 + ML 分类器的三层权限决策
6. **输出管道架构**：支持实时进度、大文件持久化、图片输出检测
7. **完整的审计链路**：每个安全决策都记录到 `tengu_bash_security_check_triggered` 事件
