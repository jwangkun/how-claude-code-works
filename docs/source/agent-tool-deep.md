# AgentTool 深度解析：子代理系统架构

> 本文深入分析 Claude Code 中 `AgentTool` 的实现机制，涵盖子代理的创建、配置、执行、通信和生命周期管理，包括 Fork 子代理、工作目录隔离、MCP 服务器管理、Agent 内存和颜色管理等核心子系统。

---

## 1. 概述：AgentTool 是什么

`AgentTool` 是 Claude Code 中最核心的工具之一，它提供了一种让主代理（Parent Agent）**动态生成子代理（Sub-agent）**的能力。子代理是一个独立的 Claude Code 实例，拥有自己的系统提示词（System Prompt）、工具集合（Tool Pool）和对话上下文，能够自主完成复杂的多步任务。

从架构上看，AgentTool 是 Claude Code **递归式代理架构**（Recursive Agent Architecture）的核心支点。主代理通过 AgentTool 生成子代理，子代理又可以进一步生成自己的子代理，形成代理树结构。这种设计借鉴了人类协作中的"分工-委派-汇总"模式。

AgentTool 的整体架构包含以下核心子系统：

| 子系统 | 文件 | 职责 |
|--------|------|------|
| 工具定义 | `AgentTool.tsx` | AgentTool 的工具注册、Schema 定义、call() 执行入口 |
| 代理执行 | `runAgent.ts` | 子代理的完整运行循环（query loop） |
| 代理恢复 | `resumeAgent.ts` | 恢复已暂停的异步子代理 |
| 代理定义加载 | `loadAgentsDir.ts` | 从 AGENTS.md、JSON、插件加载代理定义 |
| 内置代理注册 | `builtInAgents.ts` | 注册内置代理（General-purpose、Explore、Plan 等） |
| Fork 子代理 | `forkSubagent.ts` | 实验性的 Fork 机制，子代理继承父代理上下文 |
| 颜色管理 | `agentColorManager.ts` | 可视化区分不同代理类型 |
| 工具函数 | `agentToolUtils.ts` | 工具过滤、结果最终化、Schema 校验等 |
| UI 渲染 | `UI.tsx` | 代理执行过程的 TUI 渲染组件 |
| Prompt 生成 | `prompt.ts` | AgentTool 的工具描述提示词 |
| 代理内存 | `agentMemory.ts` | 代理持久化记忆的目录管理 |
| 内存快照 | `agentMemorySnapshot.ts` | 项目级代理记忆快照同步 |
| 显示工具 | `agentDisplay.ts` | 代理列表显示格式 |

---

## 2. 体系架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AgentTool 架构总览                          │
│                                                                     │
│  ┌───────────────────┐     ┌──────────────────────────────┐        │
│  │   buildTool()     │     │     call() 执行入口           │        │
│  │   注册为 Tool      │     │                              │        │
│  │                   │     │  ┌─ 解析输入 (Schema)        │        │
│  │  name: "Agent"    │     │  ├─ 路由代理类型              │        │
│  │  aliases: "Task"  │     │  ├─ 检查 MCP 依赖            │        │
│  └───────────────────┘     │  ├─ 处理隔离模式              │        │
│                            │  ├─ 异步/同步分支              │        │
│  ┌───────────────────┐     │  └─ 注册/执行/返回            │        │
│  │   AgentTool.tsx    │     └──────────────────────────────┘        │
│  │   (1397 行)       │                                             │
│  └───────────────────┘     ┌──────────────────────────────┐        │
│         ▲                  │     runAgent.ts               │        │
│         │                  │                              │        │
│  ┌──────┴──────┐           │  ┌─ 构造系统提示词            │        │
│  │  tools.ts    │          │  ├─ 组装工具池                │        │
│  │  注册工具    │           │  ├─ 创建子代理上下文          │        │
│  └─────────────┘           │  ├─ query() 循环             │        │
│                            │  ├─ 消息记录                  │        │
│  ┌───────────────────┐     │  └─ 清理/释放                │        │
│  │  loadAgentsDir.ts  │     └──────────────────────────────┘        │
│  │  代理定义加载器    │                                             │
│  └───────────────────┘     ┌──────────────────────────────┐        │
│         ▲                  │     forkSubagent.ts           │        │
│         │                  │                              │        │
│  ┌──────┴──────┐           │  ┌─ Fork 特性门控            │        │
│  │ AGENTS.md   │            │  ├─ 构建 Fork 消息           │        │
│  │ 配置文件    │            │  ├─ 递归 Fork 保护           │        │
│  └─────────────┘           │  └─ 工作目录通知              │        │
│                            └──────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. 代理定义与 AGENTS.md 配置

### 3.1 AgentDefinition 联合类型

所有代理定义均归一化为 `AgentDefinition` 联合类型，包含三种变体：

```typescript
// loadAgentsDir.ts 中的类型定义
type AgentDefinition = BuiltInAgentDefinition | CustomAgentDefinition | PluginAgentDefinition
```

- **BuiltInAgentDefinition**（`source: 'built-in'`）：内置代理，通过代码中的 `getSystemPrompt` 函数动态生成提示词
- **CustomAgentDefinition**（`source: 'userSettings' | 'projectSettings' | 'localSettings' | 'policySettings' | 'flagSettings'`）：自定义代理，从 AGENTS.md 或 JSON 配置加载
- **PluginAgentDefinition**（`source: 'plugin'`）：插件代理，由插件系统注册

### 3.2 BaseAgentDefinition 核心字段

所有代理共享的 `BaseAgentDefinition` 包含以下关键字段：

```typescript
type BaseAgentDefinition = {
  agentType: string           // 代理类型名（唯一标识）
  whenToUse: string           // 使用场景描述
  tools?: string[]            // 允许的工具列表（'*' = 全部）
  disallowedTools?: string[]  // 禁止的工具列表
  skills?: string[]           // 预加载的 Skill 名
  mcpServers?: AgentMcpServerSpec[]  // 专属 MCP 服务器
  hooks?: HooksSettings       // 会话钩子
  color?: AgentColorName      // 显示颜色
  model?: string              // 模型别名（sonnet/opus/haiku/inherit）
  effort?: EffortValue        // 努力级别
  permissionMode?: PermissionMode  // 权限模式
  maxTurns?: number           // 最大轮次
  background?: boolean        // 是否强制后台运行
  initialPrompt?: string      // 首次提示词前置内容
  memory?: AgentMemoryScope   // 持久化记忆范围
  isolation?: 'worktree' | 'remote'  // 隔离模式
  omitClaudeMd?: boolean      // 是否省略 CLAUDE.md 上下文
  requiredMcpServers?: string[]  // 必需的 MCP 服务器名模式
}
```

### 3.3 AGENTS.md 配置文件格式

用户可以通过 `.claude/agents/` 目录下的 Markdown 文件定义自定义代理。每个文件是一个独立的代理定义，使用 YAML frontmatter 声明元数据：

```markdown
---
name: code-reviewer
description: Review code changes for bugs, style issues, and security concerns
model: sonnet
tools:
  - Read
  - Glob
  - Grep
  - Bash
disallowedTools:
  - Write
  - Edit
color: purple
maxTurns: 30
permissionMode: acceptEdits
background: false
memory: project
skills: my-plugin:lint-check
mcpServers:
  - slack
  - my-custom-server:
      command: npx
      args: ["@my/server"]
hooks:
  SubagentStart:
    - command: echo "Agent started"
initialPrompt: Focus on security-critical paths first.
---

你是一位代码审查专家...

```

关键约束：
- `name` 和 `description` 是必需的
- `tools` 缺失时表示允许所有工具
- `tools: []` 表示不允许任何工具
- 加载时会按优先级覆盖（built-in < plugin < userSettings < projectSettings < flagSettings < policySettings）

### 3.4 代理加载优先级

`getActiveAgentsFromList()` 函数实现了多源代理的优先级合并策略：

```typescript
const agentGroups = [
  builtInAgents,     // 优先级最低（被其他源同名覆盖）
  pluginAgents,      // 插件注册
  userAgents,        // 用户级别设置
  projectAgents,     // 项目级别设置
  flagAgents,        // CLI 参数
  managedAgents,     // 策略管理（最高优先级）
]
```

后出现的组中的代理会覆盖先出现的同名代理。这使得组织策略可以覆盖项目配置，项目配置可以覆盖用户配置。

---

## 4. 内置代理类型

### 4.1 内置代理列表

`getBuiltInAgents()` 在 `builtInAgents.ts` 中组装所有内置代理：

| 代理类型 | 描述 | 工具 | 条件 |
|---------|------|------|------|
| `general-purpose` | 通用代理，处理复杂多步任务 | 全部工具 | 始终存在 |
| `explore` | 只读代码搜索，快速定位文件 | Read/Glob/Grep/Bash(只读) | 受 `tengu_amber_stoat` 功能开关控制 |
| `plan` | 只读架构规划，设计方案 | Read/Glob/Grep/Bash(只读) | 受 `tengu_amber_stoat` 功能开关控制 |
| `statusline-setup` | 状态栏设置向导 | 受限工具 | 始终存在 |
| `claude-code-guide` | Claude Code 使用指南 | 搜索/Web 工具 | 非 SDK 入口点 |
| `verification` | 验证代理，尝试破坏性测试 | 全部工具 | 受 `tengu_hive_evidence` 功能开关控制 |

### 4.2 General-purpose 代理

这是默认的子代理类型，也是最通用的代理。其系统提示词简洁明了：

```typescript
function getGeneralPurposeSystemPrompt(): string {
  return `You are an agent for Claude Code, Anthropic's official CLI for Claude...
  When you complete the task, respond with a concise report covering what was
  done and any key findings — the caller will relay this to the user, so it
  only needs the essentials.`
}
```

它拥有全部工具权限（`tools: ['*']`），适合大多数子任务。

### 4.3 Explore 和 Plan 代理

这两个代理是**只读的**，它们的系统提示词中明确禁止写操作：

```
=== CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS ===
This is a READ-ONLY exploration task. You are STRICTLY PROHIBITED from:
- Creating new files (no Write, touch, or file creation)
- Modifying existing files (no Edit operations)
- Deleting files (no rm or deletion)
```

它们也没有 `Write`、`Edit` 等写工具，从根本上杜绝了修改文件的可能性。这使得主代理可以安全地委派探索性任务。

优化方面，Explore 和 Plan 代理的上下文会省略 CLAUDE.md 的提交/PR/Lint 规则（`omitClaudeMd: true`）和 Git 状态信息，每次启动节省约 5-15 Gtok（根据官方注释，覆盖 34M+ 次 Explore 启动）。

### 4.4 Verification 代理

验证代理的角色是"尝试破坏实现"，而非确认工作正常。其系统提示词强调：
- 识别验证回避模式（如只读代码不运行测试）
- 不被前 80% 的完成度迷惑
- 针对不同变更类型（前端/后端/CLI/配置等）采用不同策略
- 识别并克服自己的合理化倾向

---

## 5. 代理生命周期深度分析

### 5.1 完整生命周期流程图

```
┌──────────────────────────────────────────────────────────────────┐
│                    代理生命周期                                    │
└──────────────────────────────────────────────────────────────────┘

用户/主代理
  │
  │ Agent({ description, prompt, subagent_type, ... })
  ▼
┌─────────────────────────────────────┐
│  AgentTool.call()                    │
│                                     │
│  ① Schema 解析与参数校验              │
│     - 解析 description/prompt/...    │
│     - 校验 subagent_type 存在性      │
│                                     │
│  ② 代理类型路由                       │
│     - Fork 路径 (subagent_type 省略)  │
│     - 常规路径 (指定 subagent_type)   │
│     - Team 路径 (team_name + name)   │
│                                     │
│  ③ MCP 依赖检查                      │
│     - requiredMcpServers 存在性      │
│     - 等待 Pending 中的服务器         │
│                                     │
│  ④ 隔离处理                          │
│     - worktree 创建                  │
│     - (ant-only) remote 部署         │
│                                     │
│  ⑤ 系统提示词与消息构建                │
│     - Fork: 继承父代理              │
│     - 常规: 构建代理专有提示词        │
│                                     │
│  ⑥ 执行模式分支                       │
│     ┌───────────┐   ┌───────────┐   │
│     │ 同步执行   │   │ 异步执行    │   │
│     │ (前台阻塞) │   │ (后台通知)   │   │
│     └─────┬─────┘   └─────┬─────┘   │
│           │               │          │
│           ▼               ▼          │
│      runAgent()       注册异步任务    │
│     query 循环          runAgent()    │
│     返回结果           返回 agentId  │
│                        完成时通知     │
└─────────────────────────────────────┘
```

### 5.2 阶段一：Schema 解析与路由

在 `AgentTool.call()` 入口，首先通过 Zod Schema 解析输入参数：

```typescript
const baseInputSchema = z.object({
  description: z.string().describe('A short (3-5 word) description of the task'),
  prompt: z.string().describe('The task for the agent to perform'),
  subagent_type: z.string().optional().describe('The type of specialized agent to use'),
  model: z.enum(['sonnet', 'opus', 'haiku']).optional(),
  run_in_background: z.boolean().optional(),
})
```

然后根据参数路由到三种不同的代理执行路径：

```typescript
if (teamName && name) {
  // 路径 A：多代理团队（Multi-agent Swarm）
  // 调用 spawnTeammate() 在团队中生成队友
  const result = await spawnTeammate({...}, toolUseContext)
  return { data: { status: 'teammate_spawned', ... } }
}

const effectiveType = subagent_type ?? (isForkSubagentEnabled() ? undefined : GENERAL_PURPOSE_AGENT.agentType)
if (isForkPath) {
  // 路径 B：Fork 子代理（继承父代理上下文）
  // 递归 Fork 保护检查
  // 构建 Fork 消息（保留父代理的全部 tool_use）
  selectedAgent = FORK_AGENT
} else {
  // 路径 C：常规子代理（全新启动）
  // 从 activeAgents 查找对应类型
  // 权限检查
  selectedAgent = found
}
```

### 5.3 阶段二：MCP 依赖检查

当代理定义了 `requiredMcpServers` 时，AgentTool 在启动前需要进行依赖检查：

```typescript
if (requiredMcpServers?.length) {
  // 等待 Pending 状态的服务器连接完成（最多 30 秒）
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)  // 500ms 轮询
    currentAppState = toolUseContext.getAppState()
    // 检查是否仍有 Pending 的必需服务器
    if (!stillPending) break
  }
  // 验证必需服务器是否实际提供了工具
  if (!hasRequiredMcpServers(selectedAgent, serversWithTools)) {
    throw new Error(`Agent '...' requires MCP servers matching: ...`)
  }
}
```

这确保了代理启动时所需的外部服务已就绪。

### 5.4 阶段三：系统提示词构建

不同的代理路径有不同的提示词构建策略：

**Fork 路径**：
```typescript
if (isForkPath) {
  // 优先使用父代理已渲染的系统提示词（字节精确，缓存一致）
  if (toolUseContext.renderedSystemPrompt) {
    forkParentSystemPrompt = toolUseContext.renderedSystemPrompt
  } else {
    // 回退：重新计算（可能有微小差异）
    forkParentSystemPrompt = buildEffectiveSystemPrompt({...})
  }
  // 构建 Fork 消息 = 父代理的完整 assistant 消息 + 指令
  promptMessages = buildForkedMessages(prompt, assistantMessage)
}
```

**常规路径**：
```typescript
else {
  // 调用代理自己的 getSystemPrompt 函数
  const agentPrompt = selectedAgent.getSystemPrompt({ toolUseContext })
  // 添加环境细节
  enhancedSystemPrompt = await enhanceSystemPromptWithEnvDetails(
    [agentPrompt], resolvedAgentModel, additionalWorkingDirectories
  )
  // 简单用户消息作为 prompt
  promptMessages = [createUserMessage({ content: prompt })]
}
```

### 5.5 阶段四：执行（同步 vs 异步）

AgentTool 支持两种执行模式：

**同步模式**（默认）：
- 主代理的 turn 保持打开状态
- 子代理的结果直接作为返回值
- 支持在 2 秒后显示 BackgroundHint（提示用户可以按 Ctrl+C 转入后台）
- 支持自动后台转换（`getAutoBackgroundMs()` 返回 120000ms 时）

```typescript
// 同步执行的核心循环
while (true) {
  const raceResult = await Promise.race([
    agentIterator.next(),    // 子代理的下一条消息
    backgroundPromise        // 用户触发了后台化
  ])
  if (raceResult.type === 'background') {
    // 转入后台执行，返回 async_launched
    wasBackgrounded = true
    void runWithAgentContext(syncAgentContext, async () => {
      // ...在后台继续执行...
    })
    return { data: { status: 'async_launched', ... } }
  }
  // 正常处理消息
  agentMessages.push(message)
  // 更新进度，转发 bash_progress 事件等
}
```

**异步模式**（`run_in_background: true` 或 `background: true`）：
- 立即返回 `async_launched` 状态和 `agentId`
- 子代理在后端独立运行
- 完成时通过 `enqueueAgentNotification` 通知主代理
- 主代理通过 `SendMessage({to: agentId})` 与子代理通信

```typescript
// 异步注册
const agentBackgroundTask = registerAsyncAgent({
  agentId: asyncAgentId, description, prompt, selectedAgent,...
})
// 后台执行（fire-and-forget）
void runWithAgentContext(asyncAgentContext, () =>
  runAsyncAgentLifecycle({
    taskId: agentBackgroundTask.agentId,
    abortController: agentBackgroundTask.abortController!,
    makeStream: onCacheSafeParams => runAgent({...}),
    ...
  })
)
return { data: { status: 'async_launched', agentId: '...', ... } }
```

---

## 6. Fork 子代理机制

### 6.1 设计目标

Fork 子代理是 AgentTool 的一个重要实验特性（`FORK_SUBAGENT` 功能开关），其核心设计目标是：

1. **上下文继承**：子代理继承父代理的全部对话上下文和系统提示词，不需要重新说明背景
2. **缓存共享**：所有 Fork 子代理产生字节一致的 API 请求前缀，最大化 Prompt Cache 命中率
3. **统一交互模型**：所有代理的执行都通过异步后台 + 通知完成

### 6.2 实现机制

`forkSubagent.ts` 中的 `buildForkedMessages()` 函数实现了 Fork 消息的构建：

```typescript
export function buildForkedMessages(directive, assistantMessage): MessageType[] {
  // 1. 克隆父代理的 assistant 消息（保持所有 tool_use 块）
  const fullAssistantMessage = { ...assistantMessage, uuid: randomUUID() }

  // 2. 为每个 tool_use 构建占位 tool_result（字节一致）
  const toolResultBlocks = toolUseBlocks.map(block => ({
    type: 'tool_result',
    tool_use_id: block.id,
    content: [{ type: 'text', text: FORK_PLACEHOLDER_RESULT }]  // "Fork started..."
  }))

  // 3. 构建最终消息序列
  return [fullAssistantMessage, toolResultMessage]
}
```

关键优化：所有 Fork 子代理的 `tool_result` 占位文本完全相同（`"Fork started — processing in background"`），使得 API 请求前缀字节一致，最大化 Prompt Cache 命中率。

### 6.3 Fork 子代理的指令格式

Fork 指令包含一套严格的约束规则：

```
<fork>
STOP. READ THIS FIRST.
You are a forked worker process...
RULES:
1. DO NOT spawn sub-agents; execute directly
2. Do NOT converse, ask questions
3. USE your tools directly: Bash, Read, Write, etc.
...
Output format:
  Scope: <echo back your assigned scope>
  Result: <the answer or key findings>
  Key files: <relevant file paths>
  Files changed: <list with commit hash>
  Issues: <list>
</fork>
```

### 6.4 递归 Fork 保护

使用两重保护机制防止递归 Fork：

```typescript
// 主要检查：querySource（不受自动压缩影响）
if (toolUseContext.options.querySource === `agent:builtin:fork`) {
  throw new Error('Fork is not available inside a forked worker...')
}
// 后备检查：对话历史中的 Fork 标记
if (isInForkChild(toolUseContext.messages)) {
  throw new Error('Fork is not available inside a forked worker...')
}
```

---

## 7. 父代理与子代理通信

### 7.1 通信架构

```
┌─────────────────────────────────────────────────────────────┐
│                    通信模型                                   │
│                                                              │
│  ┌──────────────┐   同步/异步     ┌──────────────┐          │
│  │  主代理       │ ◄──────────►  │  子代理       │          │
│  │  (Parent)     │   消息流       │  (Sub-agent)  │          │
│  └──────┬───────┘                └──────┬───────┘          │
│         │                               │                   │
│         │  AgentTool.call()             │ runAgent()        │
│         │  返回 agentId                  │ query() 循环      │
│         │                               │                   │
│         ▼                               ▼                   │
│  ┌──────────────────────────────────────────────┐           │
│  │           共享数据平面                        │           │
│  │                                              │           │
│  │  - agentNameRegistry (名称→ID 映射)           │           │
│  │  - LocalAgentTask (任务注册/进度/通知)         │           │
│  │  - sidechainTranscript (旁链对话记录)          │           │
│  │  - AppState.todos (待办事项共享)              │           │
│  └──────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 SendMessage 通信

异步子代理可以通过 `SendMessage` 工具与主代理继续对话：

```typescript
// 主代理可以通过 agentId 或 name 发送消息
toolUseContext.options.tools.find(t => t.name === 'SendMessage')

// 注册名称→ID 映射
rootSetAppState(prev => {
  const next = new Map(prev.agentNameRegistry)
  next.set(name, asAgentId(asyncAgentId))
  return { ...prev, agentNameRegistry: next }
})
```

### 7.3 进度通知与异步完成

异步代理完成后通过以下机制通知：

```
runAgent 消息流 → finalizeAgentTool() → completeAgentTask()
  → enqueueAgentNotification({
      taskId, status: 'completed', finalMessage, usage: { totalTokens, toolUses, durationMs }
    })
  → AppState 更新 → <task-notification> 触发主代理下一轮
```

### 7.4 同步代理的实时进度

同步执行时，子代理的每个消息都会通过 `onProgress` 回调转发给主代理的 TUI 渲染层：

```typescript
if (onProgress) {
  onProgress({
    toolUseID: `agent_${assistantMessage.message.id}`,
    data: {
      message: m,
      type: 'agent_progress',
      prompt: '',
      agentId: syncAgentId
    }
  })
}
```

UI 层（`UI.tsx`）负责将这些进度渲染为可折叠的进度消息组，最多显示 3 条。

---

## 8. 代理沙箱与权限

### 8.1 工具隔离

AgentTool 通过 `agentToolUtils.ts` 中的 `filterToolsForAgent()` 实现工具隔离：

```typescript
export function filterToolsForAgent({ tools, isBuiltIn, isAsync, permissionMode }) {
  return tools.filter(tool => {
    // MCP 工具始终允许
    if (tool.name.startsWith('mcp__')) return true
    // 所有代理禁止的工具
    if (ALL_AGENT_DISALLOWED_TOOLS.has(tool.name)) return false
    // 自定义代理额外禁止的工具
    if (!isBuiltIn && CUSTOM_AGENT_DISALLOWED_TOOLS.has(tool.name)) return false
    // 异步代理只允许部分工具
    if (isAsync && !ASYNC_AGENT_ALLOWED_TOOLS.has(tool.name)) return false
    return true
  })
}
```

### 8.2 权限模式

代理可以定义自己的权限模式：

```typescript
// 在 runAgent.ts 中，如果代理定义了 permissionMode 且父代理模式不是
// bypassPermissions 或 acceptEdits，则使用代理自身的权限模式
if (agentPermissionMode && parentMode !== 'bypassPermissions' && parentMode !== 'acceptEdits') {
  toolPermissionContext = { ...toolPermissionContext, mode: agentPermissionMode }
}

// 异步代理自动避免权限提示
if (isAsync) {
  toolPermissionContext = { ...toolPermissionContext, shouldAvoidPermissionPrompts: true }
}
```

### 8.3 Git Worktree 隔离

当设置 `isolation: "worktree"` 时，子代理在一个临时 Git 工作目录中运行：

```typescript
if (effectiveIsolation === 'worktree') {
  const slug = `agent-${earlyAgentId.slice(0, 8)}`
  worktreeInfo = await createAgentWorktree(slug)
}
```

其生命周期管理：
- 工作目录在代理完成后自动清理（如果无变更）
- 有变更时保留并返回路径
- 自动恢复时重新验证工作目录是否存在

---

## 9. Agent 颜色管理

`agentColorManager.ts` 实现了代理的视觉区分系统，为每种代理类型分配一种颜色：

```typescript
type AgentColorName = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange' | 'pink' | 'cyan'

const AGENT_COLOR_TO_THEME_COLOR = {
  red: 'red_FOR_SUBAGENTS_ONLY',
  blue: 'blue_FOR_SUBAGENTS_ONLY',
  // ...
}
```

颜色管理与代理的定义加载同步，在初始化阶段进行分配：

```typescript
// loadAgentsDir.ts 中加载完成后初始化所有颜色
for (const agent of activeAgents) {
  if (agent.color) {
    setAgentColor(agent.agentType, agent.color)
  }
}
```

General-purpose 代理没有颜色（返回 `undefined`），因为它实际上是主代理自身的延续。

---

## 10. 代理内存系统

### 10.1 三范围记忆

AgentMemory 支持三种范围：

| 范围 | 存储路径 | 特点 |
|------|---------|------|
| `user` | `~/.claude/agent-memory/<agentType>/` | 跨项目共享，用户级记忆 |
| `project` | `.claude/agent-memory/<agentType>/` | 项目专属，可进入版本控制 |
| `local` | `.claude/agent-memory-local/<agentType>/` | 本地专属，不进入版本控制 |

### 10.2 快照同步

`agentMemorySnapshot.ts` 实现了项目快照到本地记忆的同步机制，用于团队协作场景。当项目快照比本地同步的版本更新时，自动同步或将更新标记为待处理。

---

## 11. 错误处理与超时

### 11.1 多层级错误处理

AgentTool 实现了多层级错误处理策略：

```
call() 层：
  ├─ Schema 校验失败 → Zod 错误抛出
  ├─ 代理类型未找到 → 明确错误消息（含可用代理列表）
  ├─ MCP 依赖不满足 → 提示用户配置 MCP
  ├─ 权限拒绝 → denyRule 错误消息
  └─ Fork 递归 → 明确禁止消息

runAgent() 层：
  ├─ AbortError → 用户取消，记录终止事件
  ├─ 同步错误但已收集消息 → 返回部分结果
  └─ 同步错误无消息 → 重新抛出错误
```

### 11.2 超时保护

- **MCP 等待超时**：最多 30 秒等待必需的 MCP 服务器连接
- **Worktree 清理超时**：后台化时最多 1 秒等待 MCP 清理
- **自动后台化**：120 秒后端任务自动转入后台（通过环境变量或 GrowthBook 控制）

---

## 12. 与 tools.ts 的集成

### 12.1 注册机制

AgentTool 通过 `buildTool()` 注册为 Claude Code 的标准工具：

```typescript
// tools.ts
import { AgentTool } from './tools/AgentTool/AgentTool.js'

export function getAllBaseTools(): Tools {
  return [
    AgentTool,
    TaskOutputTool,
    BashTool,
    // ... 其他工具
  ]
}
```

### 12.2 工具过滤

在 `agentToolUtils.ts` 中，`resolveAgentTools()` 函数实现了代理工具过滤的核心逻辑：

```typescript
export function resolveAgentTools(agentDefinition, availableTools, isAsync, isMainThread) {
  // 1. 基础过滤（禁用工具、代理类型限制）
  const filteredAvailableTools = filterToolsForAgent({...})
  
  // 2. 通配符处理（'*' = 全部工具）
  if (hasWildcard) {
    return { hasWildcard: true, resolvedTools: filteredAvailableTools }
  }
  
  // 3. 白名单 + 黑名单组合过滤
  // 白名单和黑名单同时存在时：先用黑名单过滤白名单
  // 白名单仅黑名单：黑名单中的工具从全部中移除
}
```

### 12.3 Agent(x,y) 语法

工具规范支持 `Agent(worker, researcher)` 语法限制可生成的代理类型：

```typescript
if (toolName === AGENT_TOOL_NAME) {
  if (ruleContent) {
    // "worker, researcher" → ["worker", "researcher"]
    allowedAgentTypes = ruleContent.split(',').map(s => s.trim())
  }
}
```

---

## 13. 子代理执行引擎 runAgent

### 13.1 核心流程

`runAgent.ts` 是子代理的执行引擎，负责：

1. **初始化 MCP 服务器**：连接代理专属的 MCP 服务器
2. **构建系统提示词**：结合代理定义、用户上下文和系统上下文
3. **注册 Frontmatter Hooks**：在代理生命周期内生效
4. **预加载 Skills**：按代理定义加载指定的技能
5. **执行 query 循环**：运行完整的 LLM 查询循环
6. **记录旁链对话**：记录子代理的完整对话轨迹
7. **清理释放**：释放 MCP 连接、钩子、文件状态缓存等

### 13.2 Agent 专有 MCP 服务器

代理可以在 frontmatter 中定义自己的 MCP 服务器：

```typescript
async function initializeAgentMcpServers(agentDefinition, parentClients) {
  for (const spec of agentDefinition.mcpServers) {
    if (typeof spec === 'string') {
      // 引用已有服务器（共享连接）
      config = getMcpConfigByName(spec)
    } else {
      // 内联定义（代理私有，需要清理）
      config = { ...serverConfig, scope: 'dynamic' }
      isNewlyCreated = true
    }
  }
  // 只清理新建的服务器连接
  const cleanup = async () => {
    for (const client of newlyCreatedClients) {
      await client.cleanup()
    }
  }
  return { clients: [...parentClients, ...agentClients], tools: agentTools, cleanup }
}
```

---

## 14. 代理恢复机制

### 14.1 resumeAgent 系统

`resumeAgent.ts` 实现了异步代理的恢复机制：

```typescript
export async function resumeAgentBackground({ agentId, prompt, toolUseContext, canUseTool }) {
  // 1. 从持久化存储读取之前的对话记录
  const [transcript, meta] = await Promise.all([
    getAgentTranscript(asAgentId(agentId)),
    readAgentMetadata(asAgentId(agentId)),
  ])
  
  // 2. 还原工作目录路径
  const resumedWorktreePath = meta?.worktreePath
  
  // 3. 还原工具结果替换状态
  const resumedReplacementState = reconstructForSubagentResume(...)
  
  // 4. 还原 Fork 父代理系统提示词
  if (meta?.agentType === FORK_AGENT.agentType) {
    forkParentSystemPrompt = toolUseContext.renderedSystemPrompt
  }
  
  // 5. 重新注册异步任务
  const agentBackgroundTask = registerAsyncAgent({...})
  
  // 6. 在新的上下文中运行
  void runWithAgentContext(asyncAgentContext, () =>
    runAsyncAgentLifecycle({
      taskId: agentBackgroundTask.agentId,
      makeStream: onCacheSafeParams => runAgent({...}),
      ...
    })
  )
}
```

---

## 15. 性能优化策略

AgentTool 系统中多处体现了性能优化考量：

1. **Prompt Cache 共享**：Fork 子代理使用字节一致的占位文本最大化缓存命中
2. **单次 Built-in 省略尾部**：`ONE_SHOT_BUILTIN_AGENT_TYPES`（Explore、Plan）省略 agentId/SendMessage/usage 尾部，每次节省约 135 字符
3. **CLAUDE.md 省略**：Explore/Plan 省略 CLAUDE.md 上下文，每次节省 5-15 Gtok
4. **Agent 列表附件消息**：`shouldInjectAgentListInMessages()` 将代理列表从工具描述分离到附件消息，避免每次工具 Schema 变更都导致缓存失效
5. **惰性 Schema**：使用 `lazySchema()` 延迟 Zod Schema 的初始化
6. **死代码消除**：使用 `"external" === 'ant'` 守卫实现 ant-only 代码的死代码消除

---

## 16. Coordinator 模式

当设置 `CLAUDE_CODE_COORDINATOR_MODE=true` 时，系统中所有内置代理被替换为 Coordinator 架构：

```typescript
if (feature('COORDINATOR_MODE') && isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE)) {
  const { getCoordinatorAgents } = require('../../coordinator/workerAgent.js')
  return getCoordinatorAgents()
}
```

协调者模式中，主代理成为协调者（Coordinator），子代理成为工作者（Worker）。协调者负责任务分解、分配和结果整合，工作者专注于执行。AgentTool 在这个模式下承担了更复杂的团队协作角色。

---

## 17. 总结

AgentTool 是 Claude Code 中一个设计精巧的子代理系统，其核心设计理念是**递归委派**。通过提供一套完整的代理定义、加载、执行和通信机制，AgentTool 使得 Claude Code 能够将复杂任务分解为多个子任务并行处理，大幅提升了系统的处理能力和扩展性。

关键设计决策：

- **统一的 AgentDefinition 联合类型**：使内置代理、自定义代理和插件代理可以无缝共存和叠加
- **灵活的加载优先级**：支持从多源（用户/项目/策略/内置）加载代理，按优先级覆盖
- **多执行模式**：同步、异步、后台化、Fork 四种模式满足不同场景需求
- **多层隔离保护**：工具过滤、权限模式、Worktree 隔离、MCP 依赖检查形成安全边界
- **极致的性能优化**：从 Prompt Cache 共享到 CLI 上下文省略，每个细节都服务于降低 API 成本和延迟
