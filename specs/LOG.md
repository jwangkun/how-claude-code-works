# Claude Code 教程项目工作日志

## 2026-05-26

### 1. 初始化调研

- 检查 `claude-code-rev` 项目：确认这是一个通过 source map 逆向还原 + 缺失模块补齐得到的 `@anthropic-ai/claude-code` 源码树。
- 阅读 `CLAUDE.md`、`AGENTS.md` 和 `README.md`，确认项目架构、启动流程和核心模块。
- 阅读 `docs/architecture-analysis.md`，获取完整的架构分析报告。
- 确认教程的目标：基于参考项目 `how-pi-agent-works` 的结构，为 `claude-code-rev` 创建镜像的完整教程项目。

### 2. 核心理解整理

- 确认 Claude Code 的启动链路：`bootstrap-entry.ts → cli.tsx → main.tsx → init() → setup() → REPL`
- 确认核心模块边界：
  - 工具系统：`src/tools.ts` + `src/tools/` 下的 50+ 工具
  - 命令系统：`src/commands.ts` + `src/commands/` 下的 102+ 命令
  - TUI：React + Ink（`src/components/`、`src/ink/`、`src/main.tsx`）
  - MCP：`src/services/mcp/` 
  - 状态管理：`src/bootstrap/state.ts` + `src/state/AppStateStore.tsx`
  - 技能系统：`src/skills/bundled/` + `src/skills/bundledSkills.ts`
  - Shim 层：`shims/` 下的 7 个包
  - 功能开关：`feature()` 编译时 DCE + `USER_TYPE` 运行时门控

### 3. 需要注意的关键发现

- `src/bootstrap/state.ts` 是一个 1758 行的全局状态单体，混合了 8 个不相关的域
- `src/main.tsx` 超过 4600 行，action handler 内联了所有会话初始化路径
- 4 条并行技能/命令加载管道，共享代码为零
- 存在 18 个 DCE 占位符 `index.js` 文件
- 零测试框架，所有变更依赖手动冒烟测试
- 81 个文件使用条件 `require()`（在 ESM 代码库中有 244+ 调用点）

### 4. 创建教程站点骨架

- 新增根 `package.json`，包含 VitePress 相关脚本
- 创建 `docs/.vitepress/config.mts`，完整侧边栏和导航
- 创建 VitePress 主题目录
- 创建 `specs/VISION.md`、`specs/PLAN.md`、`specs/LOG.md`
- 创建 README.md

### 5. 创建教程内容页面

所有页面已创建完成。

### 6. 验证记录

- 所有文档页面创建完毕，内容覆盖了 Claude Code 的所有主要模块。
