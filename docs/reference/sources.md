---
title: 资料来源
---

# 资料来源

## 主要来源

### claude-code-rev 还原源码树

**仓库地址**：https://github.com/jwangkun/claude-code-rev

**描述**：`@anthropic-ai/claude-code` npm 包的源代码还原版本，也是本教程分析的基础。

**来源方式**：通过 npm 发布包中的 source map `sourcesContent` 还原。

**使用方式**：
```bash
git clone https://github.com/jwangkun/claude-code-rev.git
cd claude-code-rev
bun install
bun run dev --help
```

**限制**：
- 部分私有模块被 shim 替换
- 文件后缀为 `.js`（但内容为 TypeScript）
- 包含 source map 残留

### CLAUDE.md 和 AGENTS.md

**描述**：还原项目根目录下的项目说明文件，包含架构概览、目录结构和运行指南。

**来源方式**：还原团队编写。

### architecture-analysis.md

**描述**：还原项目 `docs/` 目录下的架构分析文档，包含详细的架构图和问题分析。

**来源方式**：还原团队编写。

## Anthropic 官方资源

### Anthropic API 文档

**URL**：https://docs.anthropic.com/

**相关内容**：
- API 接口（Messages API、Streaming）
- 模型列表和能力
- Tool Use / Function Calling

### Claude Code 官方文档

**URL**：https://docs.anthropic.com/en/docs/claude-code/

**相关内容**：
- 安装和使用指南
- 工具配置
- MCP 集成

### Anthropic Cookbook

**URL**：https://github.com/anthropics/anthropic-cookbook

**相关内容**：
- Tool Use 示例代码
- Stream 处理示例

## MCP 协议规范

### MCP 规范

**URL**：https://spec.modelcontextprotocol.io/

**相关内容**：
- 协议架构
- 传输层定义（stdio/SSE）
- 工具/资源/提示原语
- 安全模型

### MCP TypeScript SDK

**URL**：https://github.com/modelcontextprotocol/typescript-sdk

**相关内容**：
- Server 和 Client 实现
- Transport 层（stdio、SSE）
- 工具调用和资源操作

## Ink 文档

### Ink 官方文档

**URL**：https://github.com/vadimdemedes/ink

**相关内容**：
- 渲染原理（react-reconciler）
- 组件 API（Box, Text, Spacer）
- 输入处理
- 自定义渲染

### React Reconciler

**URL**：https://github.com/facebook/react/tree/main/packages/react-reconciler

**相关内容**：
- 自定义宿主环境
- Fiber 架构
- 渲染生命周期

## Commander.js 文档

### Commander.js 官方文档

**URL**：https://github.com/tj/commander.js

**相关内容**：
- 命令定义和选项
- 子命令
- 自动帮助信息
- 参数解析

## Bun 文档

### Bun 官方文档

**URL**：https://bun.sh/docs

**相关内容**：
- 运行时和包管理器
- TypeScript 支持
- 内置模块（`bun:test`, `bun:sqlite` 等）
- Bun.build API
- `import { feature } from 'bun:bundle'` 编译时 API

## 工具与框架

### 本项目使用的技术栈

| 技术 | 用途 | 官方文档 |
|------|------|----------|
| React 18+ | UI 框架 | https://react.dev/ |
| TypeScript 5+ | 类型系统 | https://www.typescriptlang.org/ |
| Ink 4+ | 终端 React 渲染 | https://github.com/vadimdemedes/ink |
| Commander 11+ | CLI 框架 | https://github.com/tj/commander.js |
| Bun 1.3+ | 运行时/构建工具 | https://bun.sh/docs |
| MCP SDK | MCP 协议实现 | https://github.com/modelcontextprotocol/typescript-sdk |
| GrowthBook | 特性开关 | https://docs.growthbook.io/ |

## 外部 shim 包

### 已安装的外部包

| 包名 | 用途 | 原始来源 |
|------|------|----------|
| cors | CORS 中间件 | 公共 npm |
| ajv-formats | JSON Schema 格式验证 | 公共 npm |
| pkce-challenge | PKCE 认证流 | 公共 npm |
| eventsource | SSE 客户端 | 公共 npm |
| eventsource-parser | SSE 解析 | 公共 npm |
| cross-spawn | 跨平台进程生成 | 公共 npm |
| express | HTTP 服务器 | 公共 npm |
| jose | JWT 加密 | 公共 npm |

## 本教程

### 项目结构

```
docs/
├── index.md                                    # 课程首页
├── quick-start.md                              # 运行与学习路线
├── concepts/                                   # 核心概念
├── source/                                     # 源码深度分析
├── project/                                    # 源码重建分析
└── reference/                                  # 参考
    ├── pitfalls.md                             # 常见错误
    └── sources.md                              # 资料来源
```

## 许可证声明

`claude-code-rev` 还原项目标注为 "SEE LICENSE IN LICENSE.md"，仅供学习和研究使用。

本教程内容仅用于教育和研究目的，不用于商业用途。
