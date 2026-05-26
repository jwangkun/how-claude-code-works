# 系统提示词概念

> 更新时间: 2026-05-26

## 什么是 Agent 的系统提示词

在 LLM Agent 架构中，**系统提示词（System Prompt）** 是预置在对话开始之前的一组指令，用于定义 Agent 的身份、行为边界、可用工具和能力约束。与用户消息不同，系统提示词不由用户直接编辑，而是由 Agent 框架自动组装。

一个经典的 Agent 系统提示词通常包含：

- **身份定义**：Agent 是谁、扮演什么角色
- **行为准则**：Agent 应该如何行动、不应该做什么
- **工具描述**：Agent 可以使用哪些工具、如何调用它们
- **上下文信息**：当前环境、可访问的文件、用户偏好

Claude Code 在这个基础上做了大量工程创新。它的系统提示词不是静态文本，而是一个 **动态组装、缓存优化、多源输入** 的复杂系统。

---

## Claude Code 的独特方法

### 动态多源组装

Claude Code 的系统提示词从 **至少 10 个独立的数据源** 动态组装而来：

```
┌──────────────────────────────────────────────────────────────┐
│                    最终 API 调用                              │
├──────────────────────────────────────────────────────────────┤
│ System Prompt Blocks (cache-optimized)                       │
│ ┌──────────────────┐ ┌────────────┐ ┌──────┐ ┌───────────┐  │
│ │ Attribution      │ │ CLI Prefix │ │Static│ │ Dynamic   │  │
│ │ Header           │ │            │ │Content│ │ Content   │  │
│ └──────────────────┘ └────────────┘ └──────┘ └───────────┘  │
├──────────────────────────────────────────────────────────────┤
│ Tool Schemas (JSON 格式工具定义，作为独立块发送)              │
├──────────────────────────────────────────────────────────────┤
│ Messages                                                      │
│ ┌────────────────────────────────────────────────────────┐   │
│ │ User Context (CLAUDE.md + date + email in <system-     │   │
│ │             reminder> tags)                             │   │
│ ├────────────────────────────────────────────────────────┤   │
│ │ Conversation history (用户消息 + 工具调用 + 工具结果)    │   │
│ ├────────────────────────────────────────────────────────┤   │
│ │ Current user input                                      │   │
│ └────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### 与常见模式的关键区别

大多数 Agent 框架（如 LangChain、AutoGPT、Semantic Kernel）采用 **生成时一次性组装** 系统提示词的模式。Claude Code 的创新之处在于：

1. **系统提示词本身是可缓存的**：静态部分（核心行为指令）使用全局缓存作用域，跨对话共享
2. **内容与传输分离**：内容层的 `getSystemPrompt()` 输出抽象字符串数组，传输层的 `buildSystemPromptBlocks()` 负责 API 适配和缓存标记
3. **上下文文件不进入系统提示词**：CLAUDE.md 被注入到消息层，而非系统提示词层——这可能是最容易被误解的设计决策
4. **按需计算动态段**：通过 `systemPromptSections()` registry 实现 lazy computation + memoization

---

## 系统提示词与工具定义的关系

Claude Code 中系统提示词和工具定义的边界比一般框架更加清晰：

**系统提示词（System Prompt）** 包含：
- 行为层面的说明（"When to use tools"）
- 风险警示（"Ask before destructive operations"）
- 输出格式指导（"No emoji unless asked"）
- **不包含**工具的具体 JSON schema 描述

**工具定义（Tool Schema）** 包含：
- 每个工具的 JSON Schema 输入输出定义
- 每个工具的 `prompt` 字段——包含自然语言使用说明
- 由 API 协议层面的 `tools` 参数传递

系统提示词中的 `getUsingYourToolsSection()` 只是引用工具名称（如 `Use Read instead of cat`），实际的工具调用规范由 API 的工具 Schema 承载。这是一个 **关注点分离** 的设计：

```
系统提示词: "Use Read instead of cat"       ← 行为指导
工具 Schema: { name: "Read", input: {      ← 调用规范
  type: "object",
  properties: { file_path: { type: "string" } }
}, prompt: "Read a file from the local filesystem..." }
```

---

## 系统提示词对模型行为的影响

### 身份锚定

系统提示词的第一句就设定了身份：

```
You are Claude Code, Anthropic's official CLI for Claude.
```

这个简短的身份声明是整个行为系统的基础。它导致的后果是：
- 模型不会"忘记"自己是 Claude Code（即使上下文很长）
- 模型会自然承担 CLI 工具的职责（不尝试做浏览器能做的事）
- 不同身份前缀（Agent SDK 模式 vs 标准模式）产生不同的行为偏好

### 行为约束

系统提示词中的行为约束直接影响模型的输出质量：

**"Don't gold-plate" 指令**（`getSimpleDoingTasksSection` 中约 20 行）对代码生成质量有直接影响。它防止模型：

```
✔︎ 只修复用户要求的 bug
✘ 修复 bug 的同时"顺便重构"整个模块
✘ 添加不必要的错误处理
✘ 创建不必要抽象层
✘ 添加注释到未修改的代码
```

**"Be concise" 指令**（`getOutputEfficiencySection`）控制输出长度：

```
外部用户: "Go straight to the point. Be extra concise."
Ant 内部: 更复杂的写作指导（完整句子、避免缩写）
```

### 安全性影响

系统提示词中安全相关的指令直接影响模型在处理敏感任务时的行为：

- 提示注入检测指令让模型对工具结果中的异常内容保持警觉
- CYBER_RISK_INSTRUCTION 为网络安全相关请求提供了明确的接受/拒绝标准
- URL 生成限制防止模型生成有害的外部链接

---

## Prompt 注入与对抗性缓解

### 注入点分析

Claude Code 系统提示词暴露的潜在注入点包括：

| 注入点 | 风险级别 | 缓解措施 |
|--------|---------|----------|
| CLAUDE.md 文件 | 中 | 注入到 `<system-reminder>` 标签，附带"可能不相关"警示 |
| MCP 服务器指令 | 中 | 通过 isMcpInstructionsDeltaEnabled gate 控制 |
| 工具结果 | 低 | 明确的提示注入检测指令 |
| 用户输入 | 低 | 用户在消息级别可控制，但系统提示词是只读的 |

### sandbox 约束

系统提示词本身不执行沙箱操作（那是基础设施层的职责），但包含引导模型遵守沙箱限制的指令：

```
Tool results and user messages may include <system-reminder> tags.
<system-reminder> tags contain useful information and reminders.
```

---

## 系统提示词的性能特征

### Token 消耗

一个典型的 Claude Code 系统提示词（不含工具 Schema）消耗约 **1,500-3,000 tokens**。其中：

| 组成部分 | 大致 Token 数 |
|---------|-------------|
| 核心行为指令 (getSimpleDoingTasksSection) | ~500-800 |
| 系统规则 (getSimpleSystemSection) | ~200-300 |
| 工具使用指导 (getUsingYourToolsSection) | ~150-250 |
| 行为边界 (getActionsSection) | ~200-350 |
| 输出效率指导 | ~100-200 |
| 环境信息 | ~100-150 |
| 动态段总计 | ~200-600 |

工具 Schema（JSON 定义）通常需要 **3,000-6,000 tokens** 以上，具体取决于启用的工具数量。

### 缓存命中率优化

通过 `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` 标记分割，静态内容可以享受全局缓存：

```
静态段（可跨用户、跨组织共享）
  ↓ global cache scope
动态段（按会话单独计算）
  ↓ 不缓存
```

这意味着如果一个组织内的多个用户都使用 Claude Code，静态系统提示词段的缓存可以 **跨用户共享**，大幅降低首 token 延迟。

---

## 实践练习

### 练习 1：观察系统提示词

在 Claude Code 中使用 `/share` 命令导出一个会话的完整内容，然后查看其中的 `system_prompt` 字段。注意观察：

1. 系统提示词被分割成了多少个块（block）？
2. 哪些块带有 `cache_control` 标记？
3. CLAUDE.md 内容出现在系统提示词中还是消息中？

### 练习 2：对比不同配置

1. 使用 `--output-style Explanatory` 运行 Claude Code，观察系统提示词如何变化
2. 使用 `claude --system-prompt "You are a code review specialist"`，观察系统提示词替换效果
3. 使用 `claude --append-system-prompt "Always write tests"`，观察追加效果

### 练习 3：MCP 指令注入

配置一个带有 `instructions` 字段的 MCP 服务器，观察系统提示词中 `# MCP Server Instructions` 段的出现。

### 练习 4：缓存行为验证

开启调试日志（`claude --debug api`），观察：
1. 首轮 API 调用的 `cache_creation` token 数
2. 后续调用的 `cache_read` token 数
3. 系统提示词块的缓存作用域分布

---

## 关键源码位置

| 功能 | 文件路径 |
|------|---------|
| 系统提示词主构造 | `src/constants/prompts.ts` |
| 系统提示词 section registry | `src/constants/systemPromptSections.ts` |
| 系统上下文 | `src/context.ts` |
| 有效系统提示词构建 | `src/utils/systemPrompt.ts` |
| 缓存分割 | `src/utils/api.ts` |
| API 层组装 | `src/services/api/claude.ts` |
| CLAUDE.md 处理 | `src/utils/claudemd.ts` |
| 自动记忆 | `src/memdir/memdir.ts` |
| 输出风格配置 | `src/constants/outputStyles.ts` |
| CLI 前缀常量 | `src/constants/system.ts` |
| 网络安全指令 | `src/constants/cyberRiskInstruction.ts` |
