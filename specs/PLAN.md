# Claude Code 教程项目总控计划

## 项目目标

生成一个完整可运行的 VitePress 中文教学站点，主题是「Claude Code 原理与源码拆解：从逆向还原的源码树理解 Anthropic 终端 AI Agent」。

项目不做简单源码翻译，而是把 Claude Code 的核心设计拆成适合中高级开发者学习的渐进式课程：

1. 先理解 Claude Code 的整体架构和核心概念。
2. 再拆解其启动流程、工具系统、命令系统、TUI 渲染和状态管理。
3. 通过源码分析和分层拆解，让读者理解一个生产级 AI Agent 的完整设计。

## 项目背景

本教程基于 `@anthropic-ai/claude-code` 的逆向还原源码树（claude-code-rev）。该仓库通过 source map 还原和缺失模块补齐的方式，重建了 Claude Code 的源码结构。虽然部分文件包含恢复期 shim 和降级实现，但核心架构、组件关系和设计思路完整可读。

## Claude Code 核心架构

Claude Code 可以按以下层次理解：

| 层 | 核心包/目录 | 核心职责 |
| --- | --- | --- |
| 启动引导层 | `src/bootstrap-entry.ts` → `src/entrypoints/cli.tsx` | 设置 MACRO 全局变量，13 条快速路径分发 |
| CLI 框架层 | `src/main.tsx` (Commander) | 注册 102+ 子命令、插拔式命令系统 |
| 工具系统层 | `src/tools.ts` + `src/tools/` | 50+ 模型可访问工具，Bash/FileEdit/FileRead/FileWrite/Glob/Grep/MCP 等 |
| 命令系统层 | `src/commands.ts` + `src/commands/` | 102+ 用户斜杠命令，4 条加载管道 |
| TUI 渲染层 | `react-reconciler` + Ink | 终端 React 渲染，组件树驱动 UI |
| MCP 服务层 | `src/services/mcp/` | MCP 客户端管理、配置、认证、工具路由 |
| 状态管理层 | `src/bootstrap/state.ts` + `src/state/` | 三层状态：Bootstrap State / AppState / UI State |
| 技能系统层 | `src/skills/` | skill 发现、按需加载、注册 API |
| 数据持久层 | `src/utils/sessionStorage.ts` | 长会话 JSONL 恢复与分支 |
| 功能开关层 | `bun:bundle feature()` + `process.env.USER_TYPE` | 双机制功能开关，编译时 DCE + 运行时门控 |
| Shim 兼容层 | `shims/` + `vendor/` | 7 个 shim 包替换缺失的原生/私有模块 |
| 迁移系统层 | `src/migrations/` | 11 个启动时迁移脚本，版本化配置递进 |

关键链路：

1. `bun run dev` → `src/bootstrap-entry.ts` 注入 MACRO → 动态加载 `src/entrypoints/cli.tsx`
2. `cli.tsx` 检查 13 条快速路径（版本、Chrome MCP、Computer Use、远程控制、daemon、后台会话等）
3. 未命中快速路径时，导入 `src/main.tsx` 启动 Commander CLI
4. `main.tsx` 注册 102+ 子命令，并进入 `init()` → `setup()` → REPL React/Ink 树
5. 用户输入进入 Agent Loop，模型可调用 50+ 工具执行文件/终端/搜索/MCP 等操作
6. MCP 客户端管理外部服务连接，将 MCP 工具合并到工具列表
7. 长会话通过 JSONL 文件持久化，支持恢复和分支浏览
8. 功能开关通过 `feature()` 编译时消除 + `USER_TYPE` 运行时门控双层控制

## 教程信息架构

### 开始
- `docs/index.md`：课程首页。
- `docs/quick-start.md`：安装、运行、学习路线。

### 第一部分：核心概念
- `docs/concepts/what-is-claude-code.md`：Claude Code 最小定义和定位。
- `docs/concepts/cc-architecture.md`：Claude Code 整体架构。
- `docs/concepts/tools-and-tool-system.md`：50+ 工具的设计与分类。
- `docs/concepts/commands.md`：102+ 斜杠命令系统。
- `docs/concepts/sessions-and-state.md`：三层状态管理与会话持久化。
- `docs/concepts/mcp-and-extensions.md`：MCP 协议与扩展机制。

### 第二部分：源码拆解
- `docs/source/source-map.md`：源码阅读地图与目录结构总览。
- `docs/source/bootstrap-flow.md`：启动流程与 CLI 入口拆解。
- `docs/source/tools-architecture.md`：工具注册、执行、权限链路。
- `docs/source/commands-system.md`：四管道命令加载机制。
- `docs/source/ink-tui.md`：Ink + React 终端渲染引擎。
- `docs/source/mcp-client.md`：MCP 客户端、配置与工具路由。
- `docs/source/state-management.md`：三层状态架构的协同。

### 第三部分：渐进式 Demo
每个 Demo 配合一篇文档和一个独立可运行的 TypeScript 代码示例：
- `docs/demos/01-bootstrap.md`
- `docs/demos/02-tools.md`
- `docs/demos/03-commands.md`
- `docs/demos/04-sessions.md`
- `docs/demos/05-mcp.md`

### 第四部分：源码重建分析
- `docs/project/overview.md`：项目概览。
- `docs/project/code-map.md`：源码目录完整映射。
- `docs/project/build-00-roadmap.md` 到 `docs/project/build-08-shims.md`：逐层分析。
- `docs/project/testing.md`：架构分析与重构方案。
- `docs/project/backend.md`：启动链路详解。
- `docs/project/run.md`：运行与调试。
- `docs/project/extend.md`：扩展方向。

### 参考
- `docs/reference/pitfalls.md`：常见错误。
- `docs/reference/sources.md`：资料来源。
