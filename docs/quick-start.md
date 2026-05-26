# 运行与学习路线

本教程基于 `claude-code-rev` 项目——一个通过 source map 逆向还原 + 缺失模块补齐得到的 `@anthropic-ai/claude-code` 源码树。本教程的目标不是教你怎么使用 Claude Code，而是帮你理解它的内部架构和设计原理。

## 环境要求

| 工具 | 建议版本 | 用途 |
| --- | --- | --- |
| Node.js | 20+，推荐 22+ | 运行 VitePress 教程站点 |
| npm | 10+ | 安装依赖 |
| 终端 | 任意 | 阅读源码结构 |

## 安装依赖

```bash
npm install
```

## 启动教程站点

```bash
npm run docs:dev
```

默认会启动 VitePress。终端会打印本地地址，通常是 `http://localhost:5173/`。

## 预览目标项目源码

本教程分析的目标是 [claude-code-rev](https://github.com/jwangkun/claude-code-rev) 项目中的 `@anthropic-ai/claude-code` 源码树。如果你也想阅读源码，可以克隆项目：

```bash
git clone https://github.com/jwangkun/claude-code-rev.git
cd claude-code-rev
```

## 推荐学习顺序

1. 先读 [Claude Code 到底是什么](/concepts/what-is-claude-code)，建立最小模型。
2. 再读 [总体架构](/concepts/cc-architecture)，理解分层设计。
3. 依次阅读核心概念章节（工具系统、命令系统、系统提示词、会话状态、MCP 扩展）。
4. 进入[源码阅读地图](/source/source-map)，按推荐路线阅读源码。
5. 按需阅读源码分析章节。每个章节独立讲解一个子系统的实现。
6. 最后进入[源码重建分析](/project/overview)，理解完整的架构决策和重构方案。

## 目录总览

```text
how-claude-code-works/
├─ docs/                         # VitePress 教程站点
│  ├─ concepts/                  # 核心概念（7篇）
│  ├─ source/                    # 源码深度分析（16篇）
│  ├─ project/                   # 源码重建分析（15篇）
│  └─ reference/                 # 常见错误与资料来源（3篇）
└─ specs/                        # 项目计划与工作日志
```

## 学习时的一个建议

每次读到一个机制，都问自己三个问题：

| 问题 | 目的 |
| --- | --- |
| 这个机制解决了什么痛点？ | 防止把架构设计背成术语 |
| 如果没有它，会在哪里崩？ | 理解边界条件 |
| 它和前后一个机制怎么接上？ | 建立系统视角 |
