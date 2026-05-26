# 命令系统深度解析

> 一份按功能领域划分并附带源码实现细节的 Claude Code 命令系统概念指南。

---

## 1. 导航与信息类

执行查询、帮助信息和诊断，不修改状态的命令。

| 命令 | 类型 | 文件 | 关键模式 | 备注 |
| --- | --- | --- | --- | --- |
| `/help` | `local-jsx` | `help/help.tsx` | 渲染 `<HelpV2>` 组件 | 通过 `context.options.commands` 获取完整命令列表 |
| `/status` | `local-jsx` | `status/status.tsx` | 渲染 `<Settings defaultTab="Status">` | 与 `/config` 共用 Settings 组件 |
| `/context` | `local-jsx` | `context/context.tsx` | 通过 `renderToAnsiString` 渲染 `<ContextVisualization>` | 使用 `toApiView()` 转换展示模型实际看到的内容 |
| `/cost` | `local` | `cost/cost.ts` | 返回 `{ type: 'text', value }` | 当用户为 Claude AI 订户时隐藏（除 Ant 内部用户外） |
| `/doctor` | `local-jsx` | `doctor/doctor.tsx` | 渲染 `<Doctor>` 屏幕 | 可通过 `DISABLE_DOCTOR_COMMAND` 环境变量禁用 |
| `/stats` | `local` | `stats/stats.ts` | 返回会话统计信息 | 支持非交互模式 |
| `/usage` | `local` | `usage/index.ts` | 显示 API 用量数据 | — |
| `/insights` | `prompt` | 在 `commands.ts` 中为懒加载 shim | 动态导入 `insights.js`（113KB, 3200 行） | 使用懒加载 shim 延迟加载 |
| `/btw` | `local` | `btw/index.ts` | 快速记笔记 | — |
| `/keybindings` | `local-jsx` | `keybindings/index.ts` | 管理键盘快捷键 | — |
| `/statusline` | `local` | `statusline.tsx` | 切换状态栏显示 | — |

### `/context` — 上下文可视化

`/context` 命令的特别之处在于它会应用与 `query.ts` 相同的消息变换逻辑，确保用户看到的 token 计数与实际 API 调用一致：

```typescript
// context/context.tsx
function toApiView(messages: Message[]): Message[] {
  let view = getMessagesAfterCompactBoundary(messages)
  if (feature('CONTEXT_COLLAPSE')) {
    const { projectView } = require('../../services/contextCollapse/operations.js')
    view = projectView(view)
  }
  return view
}
```

它还会在执行分析前调用 `microcompactMessages()`，通过 `analyzeContextUsage()` 加上完整系统提示词进行计算，然后渲染为 ANSI 字符串（保留终端颜色）。

---

## 2. 会话管理类

管理对话状态、历史和分支的命令。

| 命令 | 类型 | 文件 | 关键模式 | 备注 |
| --- | --- | --- | --- | --- |
| `/session` | `local-jsx` | `session/session.tsx` | 渲染 `<SessionInfo>` | 远程模式显示二维码；需要 `--remote` 参数 |
| `/resume` | `local-jsx` | `resume/index.ts` | 对话选择器对话框 | 别名：`continue` |
| `/compact` | `local` | `compact/compact.ts` | 返回 `{ type: 'compact' }` | ~290 行；支持会话记忆压缩、响应式压缩或传统压缩 |
| `/rewind` | `local` | `rewind/index.ts` | 恢复代码/对话状态 | 别名：`checkpoint` |
| `/rename` | `local-jsx` | `rename/index.ts` | 重命名当前会话 | — |
| `/branch` | `local-jsx` | `branch/branch.ts` | 分叉对话（~300 行） | 创建带 `forkedFrom` 元数据的新转录文件 |
| `/summary` | `prompt` | `summary/index.js` | 总结会话内容 | 仅内部使用 |
| `/release-notes` | `prompt` | `release-notes/index.ts` | 显示更新日志 | — |
| `/fast` | `local-jsx` | `fast/index.ts` | 快速模式切换 | — |

### `/compact` — 三种压缩策略

compact 命令实现了一个三层的压缩系统：

1. **会话记忆压缩**（最新，首选）：使用 `trySessionMemoryCompaction()` — 更廉价、更快、保留更多上下文。当无自定义指令时优先尝试。
2. **响应式压缩**（功能门控）：当 `REACTIVE_COMPACT` 启用且处于仅响应模式时，通过 `reactiveCompactOnPromptTooLong()` 路由。
3. **传统压缩**（回退）：原始流程——先运行 `microcompactMessages()` 减少 token，再通过 `compactConversation()` 做完整摘要。

```typescript
// compact/compact.ts — 决策树
if (!customInstructions) {
  const sessionMemoryResult = await trySessionMemoryCompaction(messages, context.agentId)
  if (sessionMemoryResult) { /* 使用 SM 结果 */ }
}
if (reactiveCompact?.isReactiveOnlyMode()) {
  return await compactViaReactive(messages, context, customInstructions, reactiveCompact)
}
// 回退到 microcompact + 传统压缩
```

### `/branch` — 完整可追溯的分叉

branch 命令创建一个完整的分支，包括替换记录和每条消息的 `forkedFrom` 元数据：

```typescript
const forkedEntry: TranscriptEntry = {
  ...entry,
  sessionId: forkSessionId,
  parentUuid,
  isSidechain: false,
  forkedFrom: {
    sessionId: originalSessionId,
    messageUuid: entry.uuid,
  },
}
```

它还通过生成唯一编号后缀（如 "Project (Branch 2)"）来处理分支名称冲突。

### `/resume` — 对话搜索

resume 命令支持按会话 ID 或自定义标题搜索，使用基于 Ink 的对话框进行选择。

---

## 3. 代码操作类

与 git、代码审查和文件系统权限交互的命令。

| 命令 | 类型 | 文件 | 关键模式 | 备注 |
| --- | --- | --- | --- | --- |
| `/commit` | `prompt` | `commit.ts` | `executeShellCommandsInPrompt` | 通过模板字符串内联 `git status`、`git diff HEAD` 等 |
| `/diff` | `local-jsx` | `diff/diff.tsx` | 懒加载 `<DiffDialog>` | 动态导入 DiffDialog 组件 |
| `/review` | `prompt` | `review.ts` | 模板字符串提示词 | `gh pr view` / `gh pr diff` — 纯 git CLI 工作流 |
| `/ultrareview` | `local-jsx` | `review.ts` | 懒加载 `ultrareviewCommand.js` | 由 `isUltrareviewEnabled()` 门控 |
| `/security-review` | `prompt` | `security-review.ts` | `createMovedToPluginCommand` | 244 行带 frontmatter 的 Markdown 提示词；路由至插件 |
| `/autofix-pr` | — | `autofix-pr/index.js` | 仅内部使用 | — |
| `/add-dir` | `local-jsx` | `add-dir/add-dir.tsx` | 渲染 `<AddWorkspaceDirectory>` | 处理权限更新、沙箱配置刷新 |
| `/files` | `local` | `files/index.ts` | 列出追踪的文件 | — |
| `/pr_comments` | — | `pr_comments/index.ts` | PR 评论处理 | — |
| `/bughunter` | — | `bughunter/index.js` | 仅内部使用 | — |
| `/subscribe-pr` | — | （条件加载） | 由 `KAIROS_GITHUB_WEBHOOKS` 门控 | — |

### `/commit` — 带 Shell 执行的提示词

commit 命令展示了 PromptCommand 模式下的 `executeShellCommandsInPrompt()` — 模板字符串中的 `!\`command\`` 语法会被当作 shell 命令执行，其输出被内联到提示词中：

```
- Current git status: !`git status`
- Current git diff (staged and unstaged changes): !`git diff HEAD`
- Current branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -10`
```

它通过 `ALLOWED_TOOLS = ['Bash(git add:*)', 'Bash(git status:*)', 'Bash(git commit:*)']` 限制模型只能使用特定工具。

### `/add-dir` — 权限系统集成

add-dir 命令展示了命令与权限系统的集成方式：
- 调用 `validateDirectoryForWorkspace()` 进行路径校验
- 使用 `applyPermissionUpdate()` 更新会话权限
- 调用 `persistPermissionUpdate()` 持久化（记忆）设置
- 通过 `SandboxManager.refreshConfig()` 刷新沙箱配置
- 通过 `setAdditionalDirectoriesForClaudeMd()` 更新 bootstrap 状态

---

## 4. 配置类

调整设置、外观和行为的命令。

| 命令 | 类型 | 文件 | 关键模式 | 备注 |
| --- | --- | --- | --- | --- |
| `/config` | `local-jsx` | `config/config.tsx` | `<Settings defaultTab="Config">` | 别名：`settings` |
| `/theme` | `local-jsx` | `theme/index.ts` | 主题选择对话框 | — |
| `/effort` | `local-jsx` | `effort/index.ts` | 推理力度选择器 | — |
| `/model` | `local` | `model/index.ts` | 模型切换 | — |
| `/output-style` | — | `output-style/index.ts` | 输出格式设置 | — |
| `/permissions` | `local-jsx` | `permissions/index.ts` | 权限管理 | — |
| `/color` | `local` | `color/index.ts` | 修改 Agent 颜色 | — |
| `/tags` | `local-jsx` | `tag/index.ts` | 标签管理 | — |
| `/privacy-settings` | — | `privacy-settings/index.ts` | 隐私控制 | — |
| `/hooks` | `local-jsx` | `hooks/index.ts` | Hook 管理 | — |
| `/remote-env` | — | `remote-env/index.ts` | 远程环境配置 | — |
| `/sandbox-toggle` | — | `sandbox-toggle/index.ts` | 沙箱开关 | — |

### `/config` — 共享设置组件

`/config` 和 `/status` 使用同一个 `<Settings>` React 组件，但传入不同的 `defaultTab` 属性：

```typescript
// config/config.tsx
export const call: LocalJSXCommandCall = async (onDone, context) => {
  return <Settings onClose={onDone} context={context} defaultTab="Config" />
}

// status/status.tsx
export async function call(onDone: LocalJSXCommandOnDone, context: LocalJSXCommandContext) {
  return <Settings onClose={onDone} context={context} defaultTab="Status" />
}
```

---

## 5. 外部集成类

将 Claude Code 连接到外部服务和设备的命令。

| 命令 | 类型 | 文件 | 备注 |
| --- | --- | --- | --- |
| `/mcp` | `local-jsx` | `mcp/mcp.tsx` | 子命令：`enable`、`disable`、`reconnect`、`no-redirect` |
| `/chrome` | `local-jsx` | `chrome/index.ts` | Chrome DevTools 集成 |
| `/desktop` | `local-jsx` | `desktop/index.ts` | 桌面应用连接 |
| `/mobile` | `local-jsx` | `mobile/index.ts` | 移动设备二维码 |
| `/ide` | `local-jsx` | `ide/index.ts` | IDE 集成 |
| `/install-github-app` | — | `install-github-app/index.ts` | GitHub App 安装 |
| `/install-slack-app` | — | `install-slack-app/index.ts` | Slack App 安装 |

### `/mcp` — 多命令路由器

`/mcp` 命令解析参数并将其路由到不同的子组件：

```typescript
// mcp/mcp.tsx 参数路由
if (parts[0] === 'no-redirect')     → <MCPSettings>
if (parts[0] === 'reconnect')       → <MCPReconnect serverName="...">
if (parts[0] === 'enable|disable')  → <MCPToggle action="..." target="...">
Default                             → <MCPSettings>（Ant 用户则为 <PluginSettings>）
```

`MCPToggle` 组件是一个值得注意的模式——它使用 `useEffect` + `useRef` 执行一次性切换操作，因为 `toggleMcpServer` 函数只能通过 React 的 `useContext` 访问（在组件外部不可用）。

---

## 6. 系统类

管理 CLI 进程本身的命令。

| 命令 | 类型 | 文件 | 备注 |
| --- | --- | --- | --- |
| `/clear` | `local` | `clear/clear.ts` | 别名：`reset`、`new` |
| `/exit` | `local-jsx` | `exit/index.ts` | 别名：`quit`；`immediate: true` |
| `/update` | — | （内置） | — |
| `/upgrade` | `local-jsx` | `upgrade/upgrade.tsx` | 打开浏览器进入升级页面 |
| `/init` | `prompt` | `init.ts` | 功能门控：`NEW_INIT` 在旧提示词和新提示词之间切换 |
| `/terminal-setup` | — | `terminalSetup/index.ts` | 终端配置 |
| `/login` | — | `login/index.ts` | OAuth 登录 |
| `/logout` | — | `logout/index.ts` | OAuth 退出 |
| `/version` | `local` | `version.ts` | 仅内部使用（`USER_TYPE === 'ant'`） |

### `/init` — 双提示词架构

`/init` 命令根据功能标志和环境检查在两个完全不同的提示词之间切换：

```typescript
get description() {
  return feature('NEW_INIT') &&
    (process.env.USER_TYPE === 'ant' || isEnvTruthy(process.env.CLAUDE_CODE_NEW_INIT))
    ? 'Initialize new CLAUDE.md file(s) and optional skills/hooks'
    : 'Initialize a new CLAUDE.md file with codebase documentation'
}

async getPromptForCommand() {
  return [{ type: 'text', text: feature('NEW_INIT') ? NEW_INIT_PROMPT : OLD_INIT_PROMPT }]
}
```

`NEW_INIT_PROMPT`（启用功能标志时使用）是一个 8 阶段编排流程：询问要设置什么、探索代码库（通过子 Agent）、补充空白（AskUserQuestion）、写入 CLAUDE.md、写入 CLAUDE.local.md、建议并创建技能、建议额外优化、总结。

---

## 7. 技能与知识类

发现和管理 Claude Code 专长领域的命令。

| 命令 | 类型 | 文件 | 备注 |
| --- | --- | --- | --- |
| `/skills` | `local-jsx` | `skills/skills.tsx` | 渲染 `<SkillsMenu>` |
| `/memory` | `local-jsx` | `memory/memory.tsx` | 渲染带 `<MemoryFileSelector>` 的 `<MemoryCommand>` |

### `/memory` — 文件系统集成

memory 命令展示了带有 Suspense 支持的懒加载文件系统操作：

```typescript
export const call: LocalJSXCommandCall = async onDone => {
  clearMemoryFileCaches()
  await getMemoryFiles()     // 渲染前预热缓存
  return <MemoryCommand onDone={onDone} />
}
```

在 `<MemoryCommand>` 内部，`handleSelectMemoryFile` 函数：
1. 如果 claude 配置目录不存在则递归创建
2. 如果记忆文件不存在则创建（`flag: 'wx'` 避免覆盖）
3. 在用户编辑器中打开文件（`$VISUAL` → `$EDITOR` → 默认）
4. 显示关于修改编辑器的提示

---

## 8. 高级功能类

实验性和高级功能命令。

| 命令 | 类型 | 文件 | 备注 |
| --- | --- | --- | --- |
| `/plan` | `local-jsx` | `plan/plan.tsx` | 切换计划模式；在编辑器中打开计划文件 |
| `/tasks` | `local-jsx` | `tasks/tasks.tsx` | 渲染 `<BackgroundTasksDialog>` |
| `/agents` | `local-jsx` | `agents/index.ts` | Agent 管理 |
| `/stickers` | `local-jsx` | `stickers/index.ts` | Stickers 功能 |
| `/think-back` | `local-jsx` | `thinkback/index.ts` | 年度回顾；由 `tengu_thinkback` 功能门控 |
| `/thinkback-play` | `local-jsx` | `thinkback-play/index.ts` | Thinkback 播放 |
| `/voice` | — | （功能门控） | 由 `VOICE_MODE` 门控 |
| `/teleport` | — | （仅内部使用） | — |
| `/ultraplan` | — | （功能门控） | 由 `ULTRAPLAN` 门控 |
| `/torch` | — | （功能门控） | 由 `TORCH` 门控 |

### `/plan` — 带状态变更的模式切换

plan 命令是一个有状态切换——它从 `toolPermissionContext.mode` 读取当前模式并执行状态转换：

```typescript
if (currentMode !== 'plan') {
  handlePlanModeTransition(currentMode, 'plan')
  setAppState(prev => ({
    ...prev,
    toolPermissionContext: applyPermissionUpdate(
      prepareContextForPlanMode(prev.toolPermissionContext),
      { type: 'setMode', mode: 'plan', destination: 'session' },
    ),
  }))
  onDone('Enabled plan mode', { shouldQuery: true })
  return null
}
```

当已处于计划模式时，它会读取计划文件，支持 `/plan open` 在外部编辑器中修改，并通过 `renderToString()` 渲染计划内容。

---

## 9. 插件管理类

管理插件生态系统的命令。

| 命令 | 类型 | 文件 | 备注 |
| --- | --- | --- | --- |
| `/plugin` | `local-jsx` | `plugin/index.tsx` | 别名：`plugins`、`marketplace` |
| `/reload-plugins` | `local-jsx` | `reload-plugins/index.ts` | 清除所有缓存并重新加载 |

### `/plugin` — 带子命令的市场

plugin 命令通过 React 组件提供完整的管理界面：

```typescript
// plugin/index.tsx
const plugin = {
  type: 'local-jsx',
  name: 'plugin',
  aliases: ['plugins', 'marketplace'],
  description: 'Manage Claude Code plugins',
  immediate: true,
  load: () => import('./plugin.js'),
}
```

---

## 命令类型分布总览

```
COMMANDS() 中注册的命令总数：                              ~80+
功能门控命令：                                               ~15
仅内部使用命令：                                             ~25
动态命令（技能/插件/工作流）：                               可变
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

按类型分布：
  prompt     （模型调用型命令）：                             ~30%
  local      （副作用型命令）：                               ~25%
  local-jsx  （Ink UI 对话框）：                             ~45%

按门控分布：
  无条件可用：                                               ~70%
  isEnabled() 运行时检查：                                   ~10%
  feature() 编译时标志：                                     ~15%
  USER_TYPE === 'ant' 专用：                                 ~25%
  权限认证门控：                                             少量子集
```

注意：各百分比存在重叠（一个命令可以同时有编译时和运行时门控）。
