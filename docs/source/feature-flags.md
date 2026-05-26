# 功能开关系统

> Claude Code 拥有一个精心设计的两层功能开关系统：编译时死代码消除（DCE）和运行时门控。这套系统支撑了同一份代码库同时服务于内部 Ant 构建和外部 npm 构建两种截然不同的分发渠道。

## 为什么需要两层开关

一个代码库需要同时交付两种产物：

| 产物 | 使用者 | 包含的功能 |
|------|--------|-----------|
| 内部构建（Ant 构建） | Anthropic 内部团队 | 全部功能，包括实验性、内部功能 |
| 外部构建（npm 发布） | 公众用户 | 仅稳定功能，内部功能完全消除 |

如果只用运行时门控，外部构建中会包含大量永远不会执行的死代码，增加包体积和启动时间。如果只用编译时门控，内部团队无法动态切换功能。

Claude Code 的解决方案是两层叠加：

```mermaid
flowchart TD
    A["源代码"] --> B{feature() 标记?}
    B -->|"是"| C["编译时评估"]
    C --> D{"构建类型"}
    D -->|"外部构建"| E["死代码消除<br/>代码完全不存在于 bundle"]
    D -->|"内部构建"| F["保留代码"]
    F --> G{USER_TYPE 门控?}
    G -->|"ant"| H["运行时生效"]
    G -->|"外部"| I["运行时跳过"]
    B -->|"否"| J["始终保留"]
```

## 第一层：编译时 DCE（`feature()`）

### 原理

`feature()` 是来自 `bun:bundle` 的编译时宏。它在 Bun 打包时被静态评估，不是运行时函数调用：

```typescript
import { feature } from 'bun:bundle'

// 这行代码在外部构建中编译时被完全消除
if (feature('BRIDGE_MODE')) {
  const { bridgeMain } = await import('../bridge/bridgeMain.js')
  await bridgeMain(args)
}
```

### 所有功能开关

| 功能键 | 用途 | 门控范围 |
|--------|------|---------|
| `KAIROS` | 助手模式（assistant mode） | 内部构建 |
| `PROACTIVE` | 主动行为功能 | 内部构建 |
| `BRIDGE_MODE` | 远程桥接/远程控制 | 内部构建 |
| `DAEMON` | 后台守护进程模式 | 内部构建 |
| `SSH_REMOTE` | SSH 远程连接 | 内部构建 |
| `BG_SESSIONS` | 后台会话（ps/logs/attach/kill） | 内部构建 |
| `TEMPLATES` | 模板任务系统（new/list/reply） | 内部构建 |
| `MCP_SKILLS` | MCP 技能 | 内部构建 |
| `TORCH` | Agent 追溯分析 | 内部构建 |
| `FORK_SUBAGENT` | 子 Agent 分支 | 内部构建 |
| `BUDDY` | 伙伴模式 | 内部构建 |
| `COORDINATOR_MODE` | 协调者模式 | 内部构建 |
| `VOICE_MODE` | 语音模式 | 内部构建 |
| `ABLATION_BASELINE` | 消融实验基线 | 内部构建 |
| `DUMP_SYSTEM_PROMPT` | 导出系统提示词 | 内部构建 |
| `CHICAGO_MCP` | Computer Use MCP | 内部构建 |
| `BYOC_ENVIRONMENT_RUNNER` | BYOC 环境运行器 | 内部构建 |
| `SELF_HOSTED_RUNNER` | 自托管运行器 | 内部构建 |
| `MONITOR_TOOL` | 监控工具 | 内部构建 |
| `AGENT_TRIGGERS` | Agent 触发器（Cron） | 内部构建 |
| `AGENT_TRIGGERS_REMOTE` | 远程触发器 | 内部构建 |
| `EXPERIMENTAL_SKILL_SEARCH` | 实验性技能搜索 | 内部构建 |
| `COMMIT_ATTRIBUTION` | 提交溯源 | 内部构建 |
| `KAIROS_PUSH_NOTIFICATION` | 推送通知 | 内部构建 |
| `KAIROS_GITHUB_WEBHOOKS` | GitHub Webhooks | 内部构建 |
| `KAIROS_BRIEF` | 简报功能 | 内部构建 |
| `WORKFLOW_SCRIPTS` | 工作流脚本 | 内部构建 |
| `CCR_REMOTE_SETUP` | 远程设置 | 内部构建 |

### 使用模式

所有 `feature()` 门控代码遵循相同的惰性加载模式：

```typescript
// Dead code elimination: conditional import for KAIROS (assistant mode)
const assistantModule = feature('KAIROS')
  ? require('./assistant/index.js') as typeof import('./assistant/index.js')
  : null
```

注意这里是 `require()` 而不是 `import()`。这是因为 `require()` 可以被 `feature()` 的编译时消除完整包裹。外部构建中，这个 `require()` 调用在编译时被完全删除，依赖的模块也不会被打入 bundle。

## 第二层：运行时门控（`USER_TYPE`）

运行时门控通过 `process.env.USER_TYPE` 实现：

```typescript
const REPLTool =
  process.env.USER_TYPE === 'ant'
    ? require('./tools/REPLTool/REPLTool.js').REPLTool
    : null
```

这和 `feature()` 有两个关键区别：

| 维度 | `feature()` | `USER_TYPE` |
|------|-------------|-------------|
| 评估时机 | 编译时 | 运行时 |
| 对包体积影响 | 条件为 false 时完全消除 | 代码始终存在 |
| 对环境要求 | Bun 构建系统 | Node.js 进程环境变量 |
| 安全性 | 外部构建不可见 | 可通过环境变量绕过 |

## 两层配合的实际效果

以一个典型的外部用户启动流程为例：

```typescript
// 编译时消除：这整块代码不在外部 bundle 中
if (feature('BRIDGE_MODE') && args[0] === 'remote-control') {
  const { bridgeMain } = await import('../bridge/bridgeMain.js')
  await bridgeMain(args.slice(1))
  return
}

// 运行时检查：代码存在但条件为 false
const REPLTool = process.env.USER_TYPE === 'ant'
  ? require('./tools/REPLTool/REPLTool.js').REPLTool
  : null
```

对于 Ant 内部员工，他们运行的是内部构建，`feature('BRIDGE_MODE')` 为 true，`USER_TYPE` 为 `'ant'`，所以两层的功能都可用。

## 条件命令系统

命令系统利用相同的机制控制哪些命令出现在 CLI 中：

```typescript
import { feature } from 'bun:bundle'

const proactive = feature('PROACTIVE') || feature('KAIROS')
  ? require('./commands/proactive.js').default
  : null

const bridge = feature('BRIDGE_MODE')
  ? require('./commands/bridge/index.js').default
  : null

const voiceCommand = feature('VOICE_MODE')
  ? require('./commands/voice/index.js').default
  : null
```

这些命令在外部构建中完全不存在。用户无法通过任何方式发现或调用它们。

## DCE 占位符文件

在 `src/commands/` 中存在 18 个 DCE 占位符 `index.js` 文件：

```javascript
export default { isEnabled: () => false, isHidden: true, name: 'stub' }
```

这些文件的真实 `.ts` 源文件仅存在于内部构建中。外部构建通过这些占位符确保导入不失败，但命令本身不可用。

## 常见误区

| 误区 | 正确理解 |
|------|---------|
| `feature()` 是运行时函数 | 它是 Bun 编译时宏，在打包阶段被静态评估 |
| 可以用 `mockFeature()` 测试 DCE 代码 | 不能。DCE 代码在测试构建中已被消除 |
| `USER_TYPE` 可以替代 `feature()` | 不能。`USER_TYPE` 不减少包体积 |
| 所有内部功能都用了两层门控 | 部分内部功能只用了一层，取决于安全需求等级 |
