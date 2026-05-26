# Claude Code 原理与源码拆解

这是一个完整可运行的中文 VitePress 教程项目，基于 [claude-code-rev](https://github.com/jwangkun/claude-code-rev)（`@anthropic-ai/claude-code` 的逆向还原源码树），从工程视角完整拆解 Claude Code 的核心架构与实现原理。

## 内容特点

教程不是逐文件源码翻译，而是按学习路径组织：

- **核心概念**：Claude Code 整体架构、55 个工具系统、102+ 命令系统、系统提示词构造、三层状态管理、MCP 扩展机制。
- **源码深度分析**：启动流程（9 阶段 + 13 条快速路径）、工具注册与执行管线、四管道命令加载、系统提示词 5 阶段组装、技能/插件/MCP 客户端实现、Ink TUI 渲染引擎、功能开关双机制（编译时 DCE + 运行时门控）。
- **源码重建分析**：完整分析逆向还原源码树的设计决策、架构缺陷（5 大问题）和 4 阶段重构方案。

## 为什么看这个教程

Claude Code 是 Anthropic 官方的终端 AI Agent，它的源码实现了：
- React + Ink 的终端 TUI 框架
- 55 个模型可访问工具（Bash、文件编辑、Glob、Grep、MCP 等）
- 四管道并行命令加载系统
- 三层渐进式状态架构
- 编译时 + 运行时双机制功能开关
- MCP (Model Context Protocol) 完整客户端实现

这些不是学术概念，而是真实产品级代码。本教程把这些机制拆开，让你能看到每一个设计决策的「为什么」。

## 运行教程站点

```bash
npm install
npm run docs:dev
```

构建验证：

```bash
npm run docs:build
```

## 项目结构

```text
docs/                         # VitePress 教程站点
├─ concepts/                  # 核心概念（7篇）
├─ source/                    # 源码深度分析（16篇）
├─ project/                   # 源码重建分析（15篇）
└─ reference/                 # 常见错误与资料来源（3篇）
specs/                        # 项目计划与工作日志
```

## 源码目标项目

本教程基于 [claude-code-rev](https://github.com/jwangkun/claude-code-rev) 项目，这是一个通过 source map 逆向还原 + 缺失模块补齐得到的 `@anthropic-ai/claude-code` 源码树。

## 关于作者

**鲲鹏Talk** —— AI 趋势研究者、开源 Agent 深度玩家。

自 2023 年起持续关注大语言模型与 AI Agent 领域，亲历了从 ChatGPT 引爆全球到多模态大模型百花齐放，再到 AI Agent 自主执行能力实现质的飞跃的全过程。

全平台搜索「鲲鹏Talk」关注我。

## 致谢

感谢所有为 claude-code-rev 项目做出贡献的开发者，以及 Claude Code 的用户社区。本教程的诞生离不开逆向还原团队的卓越工作。

## License

MIT
