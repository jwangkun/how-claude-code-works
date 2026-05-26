---
title: 源码目录映射
---

# 源码目录映射

## 完整目录映射

下表展示了 `claude-code-rev` 源码树的完整目录结构、每个目录的用途以及关键文件的估算代码行数。

### 根级文件

| 文件 | 用途 | 估算行数 |
|------|------|----------|
| `bootstrap-entry.ts` | 应用入口，注入 MACRO 常量 | ~10 |
| `bootstrapMacro.ts` | MACRO 配置定义 | ~30 |
| `main.tsx` | Commander CLI 主逻辑、init/setup 流程 | ~500+ |
| `tools.ts` | 工具注册中心，getAllBaseTools() | ~300 |
| `Tool.ts` | Tool 接口和类型定义 | ~200 |
| `commands.ts` | 命令注册中心，四管道加载 | ~200 |

### entrypoints/ 目录

| 文件 | 用途 | 估算行数 |
|------|------|----------|
| `cli.tsx` | CLI 入口，13 条快速路径 | ~300 |
| `agentSdkTypes.ts` | Agent SDK 类型声明 | ~50 |

### bootstrap/ 目录

| 文件 | 用途 | 估算行数 |
|------|------|----------|
| `state.ts` | Bootstrap State 定义和管理 | ~1,300+（大型文件，需要重构） |

### state/ 目录

| 文件 | 用途 | 估算行数 |
|------|------|----------|
| `AppState.ts` | AppState 定义和类型 | ~200 |
| `AppStateStore.tsx` | React Context 绑定 | ~100 |

### tools/ 目录（核心工具）

| 目录/文件 | 用途 | 行数 |
|-----------|------|------|
| `BashTool/` | 终端命令执行 | ~1,000+ |
| `FileEditTool/` | 文件编辑 | ~500+ |
| `FileReadTool/` | 文件读取 | ~300+ |
| `FileWriteTool/` | 文件写入 | ~300+ |
| `GlobTool/` | 文件搜索（glob） | ~200+ |
| `GrepTool/` | 文件搜索（grep） | ~200+ |
| `WebFetchTool/` | 网页抓取 | ~200+ |
| `WebSearchTool/` | 网页搜索 | ~300+ |
| `AgentTool/` | 子代理执行 | ~500+ |
| `SkillTool/` | 技能调用 | ~300+ |
| `TaskStopTool/` | 任务停止 | ~100 |
| `TaskCreateTool/` | 任务创建 | ~150 |
| `TaskGetTool/` | 任务查询 | ~150 |
| `TaskUpdateTool/` | 任务更新 | ~150 |
| `TaskListTool/` | 任务列表 | ~150 |
| `AskUserQuestionTool/` | 询问用户 | ~200+ |
| `EnterPlanModeTool/` | 进入计划模式 | ~200+ |
| `ExitPlanModeV2Tool/` | 退出计划模式 | ~200+ |
| `TodoWriteTool/` | 待办事项 | ~150 |
| `NotebookEditTool/` | Jupyter 编辑 | ~300+ |
| `ConfigTool/` | 配置管理（Ant 内部） | ~300+ |
| `LSPTool/` | Language Server 协议 | ~300+ |
| `MCPTool`（在 services/mcp/） | MCP 工具包装 | ~200 |
| `ListMcpResourcesTool/` | MCP 资源列表 | ~100 |
| `ReadMcpResourceTool/` | MCP 资源读取 | ~100 |
| `TungstenTool/` | Ant 内部测试 | ~500+ |
| `ToolSearchTool/` | 工具搜索 | ~150 |

### tools/ 目录（条件工具）

| 目录/文件 | 条件 | 用途 |
|-----------|------|------|
| `REPLTool/` | USER_TYPE === 'ant' | 交互式 REPL |
| `PowerShellTool/` | PowerShell 可用 | PowerShell 执行 |
| `WebBrowserTool/` | feature('WEB_BROWSER_TOOL') | 浏览器自动化 |
| `WorkflowTool/` | feature('WORKFLOW_SCRIPTS') | 工作流执行 |
| `SleepTool/` | feature('PROACTIVE/KAIROS') | 等待 |
| `ScheduleCronTool/` | feature('AGENT_TRIGGERS') | 定时任务 |
| `RemoteTriggerTool/` | feature('AGENT_TRIGGERS_REMOTE') | 远程触发 |
| `MonitorTool/` | feature('MONITOR_TOOL') | 监控 |
| `SendUserFileTool/` | feature('KAIROS') | 发送文件 |
| `PushNotificationTool/` | feature('KAIROS') | 推送通知 |
| `SubscribePRTool/` | feature('KAIROS_GITHUB_WEBHOOKS') | PR 订阅 |
| `SnipTool/` | feature('HISTORY_SNIP') | 历史裁剪 |
| `CtxInspectTool/` | feature('CONTEXT_COLLAPSE') | 上下文检查 |
| `OverflowTestTool/` | feature('OVERFLOW_TEST_TOOL') | 溢出测试 |
| `TerminalCaptureTool/` | feature('TERMINAL_PANEL') | 终端捕获 |
| `ListPeersTool/` | feature('UDS_INBOX') | 对等节点列表 |

### commands/ 目录

| 文件/目录 | 用途 | 类型 |
|-----------|------|------|
| `init.js` | 初始化项目 | 单文件 |
| `commit.js` | Git 提交 | 单文件 |
| `review.js` | 代码审查 | 单文件 |
| `security-review.js` | 安全审查 | 单文件 |
| `help/index.js` | 帮助 | 目录 |
| `config/index.js` | 配置管理 | 目录 |
| `mcp/index.js` | MCP 管理 | 目录 |
| `session/index.js` | 会话管理 | 目录 |
| `memory/index.js` | 记忆管理 | 目录 |
| `skills/index.js` | 技能管理 | 目录 |
| `add-dir/index.js` | 添加目录 | 目录 |
| `clear/index.js` | 清理屏幕 | 目录 |
| `compact/index.js` | 压缩对话 | 目录 |
| `context/index.js` | 上下文管理 | 目录 |
| `login/index.js` | 登录 | 目录 |
| `logout/index.js` | 登出 | 目录 |
| `desktop/index.js` | 桌面集成 | 目录 |
| `copy/index.js` | 复制 | 目录 |
| `diff/index.js` | 差异查看 | 目录 |
| `status/index.js` | 状态查询 | 目录 |
| `cost/index.js` | 费用查看 | 目录 |
| `rename/index.js` | 重命名会话 | 目录 |
| `resume/index.js` | 恢复会话 | 目录 |
| `share/index.js` | 分享 | 目录 |
| `proactive.js` | 主动模式 | 条件 |
| `voice/index.js` | 语音模式 | 条件 |
| `bridge/index.js` | 远程控制 | 条件 |

### services/ 目录

| 目录 | 用途 | 关键文件 |
|------|------|----------|
| `mcp/` | MCP 客户端实现 | `client.ts`, `discovery.ts`, `transport.ts`, `types.ts` |
| `policyLimits/` | 策略限制 | `index.ts` |
| `skillSearch/` | 技能搜索 | `localSearch.ts` |

### components/ 目录

| 文件 | 用途 |
|------|------|
| `Spinner.js` | 加载动画组件 |
| `MessageList.js` | 消息列表渲染 |
| `InputBox.js` | 用户输入框 |
| `PermissionDialog.js` | 权限对话框 |
| `ConfigWindow.js` | 配置窗口 |

### utils/ 目录（关键文件）

| 文件 | 用途 | 估算行数 |
|------|------|----------|
| `config.ts` | 配置加载和解析 | ~500+ |
| `sessionStorage.ts` | 会话持久化 | ~300+ |
| `startupProfiler.ts` | 启动性能分析 | ~100 |
| `earlyInput.ts` | 提前输入捕获 | ~100 |
| `process.ts` | 进程管理 | ~200+ |
| `auth.ts` | 用户认证 | ~300+ |
| `sinks.ts` | 遥测/分析 | ~200+ |
| `model/model.ts` | 模型配置 | ~500+ |
| `permissions/permissions.ts` | 权限系统 | ~400+ |
| `theme.ts` | 主题管理 | ~200+ |
| `worktree.ts` | 工作树模式 | ~200+ |
| `tasks.ts` | 任务管理 | ~200+ |
| `toolSearch.ts` | 工具搜索 | ~100 |

### 其他目录

| 目录 | 用途 |
|------|------|
| `daemon/` | 守护进程模式 |
| `bridge/` | 远程控制/桥接模式 |
| `cli/` | CLI 辅助（bg.js, handlers/） |
| `environment-runner/` | BYOC 环境运行器 |
| `self-hosted-runner/` | 自托管运行器 |
| `constants/` | 常量定义 |
| `hooks/` | React Hooks |
| `context/` | React Context |
| `migrations/` | 版本迁移脚本 |
| `types/` | 类型定义 |
| `coordinator/` | 协调器模式 |

## 文件大小热力图

基于还原后的源码分析，各主要模块的代码量分布：

```
bootstrap/state.ts        ████████████████████████████████   ~1,300 行
main.tsx                  ████████████████                   ~500+ 行
BashTool/                 ██████████████████████████         ~1,000+ 行
config.ts                 ██████████████                     ~500+ 行
model/model.ts            ██████████████                     ~500+ 行
commands.ts               ██████                             ~200 行
tools.ts                  ████████                           ~300 行
cli.tsx                   ████████                           ~300 行
Tool.ts                   ██████                             ~200 行
FileEditTool/             ██████████████                     ~500+ 行
AgentTool/                ██████████████                     ~500+ 行
permissions.ts            ████████████                       ~400+ 行
sessionStorage.ts         ████████                           ~300+ 行
auth.ts                   ████████                           ~300+ 行
```

> **注意**：行数为估算值，基于还原后的源码反编译结果。实际原始 TypeScript 代码量可能有所不同。

## 目录结构文件总览

```
claude-code-rev/
├── src/                              # 主要源码目录
│   ├── bootstrap-entry.ts           # 应用入口
│   ├── bootstrapMacro.ts            # MACRO 注入
│   ├── main.tsx                     # CLI 主逻辑
│   ├── tools.ts                     # 工具注册
│   ├── Tool.ts                      # 工具接口
│   ├── commands.ts                  # 命令注册
│   ├── entrypoints/
│   │   ├── cli.tsx                  # CLI 入口
│   │   └── agentSdkTypes.ts         # SDK 类型
│   ├── bootstrap/
│   │   └── state.ts                 # Bootstrap State
│   ├── state/
│   │   ├── AppState.ts              # AppState
│   │   └── AppStateStore.tsx        # React 绑定
│   ├── services/
│   │   └── mcp/                     # MCP 客户端
│   ├── tools/                       # 50+ 工具
│   ├── commands/                    # 102+ 命令
│   ├── components/                  # React 组件
│   ├── hooks/                       # React Hooks
│   ├── context/                     # React Context
│   ├── constants/                   # 常量
│   ├── cli/                         # CLI 功能
│   ├── daemon/                      # 守护进程
│   ├── bridge/                      # 远程控制
│   ├── migrations/                  # 迁移脚本
│   └── types/                       # 类型定义
├── shims/                           # 7 个 shim 包
└── vendor/                          # 供应商代码
```
