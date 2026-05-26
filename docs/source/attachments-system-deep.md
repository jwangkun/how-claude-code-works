# 附件系统深度剖析

## 概述

`attachments.ts`（3997 行）是 Claude Code 会话中消息构建管道的核心枢纽。每次用户发送输入或工具循环迭代时，系统都需要将各种上下文信息拼装成发送给 API 的消息。附件（Attachment）系统负责收集、验证、转换和组织这些上下文片段，使其以结构化的方式注入到对话流中。

文件位于 `src/utils/attachments.ts`，是 `query.ts` 消息构建流程中 `getAttachmentMessages()` 的依赖模块，同时也是工具结果和系统提示词的重要数据来源。

---

## 1. 附件处理架构

### 1.1 整体架构

附件系统的设计遵循 **工厂模式 + 策略模式**，以 `getAttachments()` 作为统一入口，内部通过 `maybe()` 函数包装多个独立的附件生成器，每个生成器负责一类特定的附件。

```
┌─────────────────────────────────────────────────────────────────────┐
│  query.ts 消息构建循环                                               │
│  ┌──────────────────────────────────────────────┐                   │
│  │ getAttachmentMessages() (AsyncGenerator)     │                   │
│  │  └─ getAttachments()  ──── 主入口            │                   │
│  │       │                                      │                   │
│  │       ├─ 用户输入附件 (userInputAttachments)  │                   │
│  │       │   ├─ @引用文件处理                     │                   │
│  │       │   ├─ MCP资源引用处理                   │                   │
│  │       │   ├─ Agent提及处理                     │                   │
│  │       │   └─ 技能发现                          │                   │
│  │       │                                        │                   │
│  │       ├─ 线程安全附件 (allThreadAttachments)    │                   │
│  │       │   ├─ 队列命令                           │                   │
│  │       │   ├─ 日期变更通知                       │                   │
│  │       │   ├─ 工具增量变化                       │                   │
│  │       │   ├─ Agent列表变化                      │                   │
│  │       │   ├─ MCP指令变化                        │                   │
│  │       │   ├─ 文件变更检测                       │                   │
│  │       │   ├─ 嵌套内存注入                       │                   │
│  │       │   ├─ 动态技能发现                       │                   │
│  │       │   ├─ 技能列表                           │                   │
│  │       │   ├─ 计划/自动模式                       │                   │
│  │       │   ├─ 任务提醒                           │                   │
│  │       │   ├─ 队友邮件箱                         │                   │
│  │       │   └─ 系统提醒                           │                   │
│  │       │                                        │                   │
│  │       └─ 主线程附件 (mainThreadAttachments)     │                   │
│  │           ├─ IDE选区                            │                   │
│  │           ├─ IDE打开文件                         │                   │
│  │           ├─ 输出风格                           │                   │
│  │           ├─ 诊断信息                           │                   │
│  │           ├─ LSP诊断                            │                   │
│  │           ├─ 任务状态                           │                   │
│  │           ├─ Token用量                          │                   │
│  │           └─ 预算信息                           │                   │
│  │                                                │                   │
│  └─ createAttachmentMessage() → yield AttachmentMessage            │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 核心类型定义

`Attachment` 是一个大型联合类型（~50 种变体），定义了所有可能注入到消息中的附件格式：

```typescript
export type Attachment =
  | FileAttachment           // 用户 @引用的文件
  | CompactFileReferenceAttachment  // 压缩文件引用
  | PDFReferenceAttachment   // 大PDF的轻量引用
  | AlreadyReadFileAttachment       // 已在上下文中无需重发的文件
  | { type: 'edited_text_file' ... }   // 被编辑的文本文件
  | { type: 'edited_image_file' ... }  // 被编辑的图像文件
  | { type: 'directory' ... }         // 目录列表
  | { type: 'selected_lines_in_ide' ... }  // IDE中选中的行
  | { type: 'opened_file_in_ide' ... }     // IDE中打开的文件
  | { type: 'todo_reminder' ... }          // Todo提醒
  | { type: 'relevant_memories' ... }      // 相关记忆
  | // ... 更多类型
  | AgentMentionAttachment
  | HookAttachment
  // 总共约50种类型
```

关键基础类型：

```typescript
export type FileAttachment = {
  type: 'file'
  filename: string
  content: FileReadToolOutput     // 通过 FileReadTool 读取的内容
  truncated?: boolean             // 是否因大小限制被截断
  displayPath: string             // 相对CWD的显示路径
}
```

`AttachmentMessage` 是包裹附件的外层消息结构：

```typescript
export function createAttachmentMessage(
  attachment: Attachment,
): AttachmentMessage {
  return {
    attachment,
    type: 'attachment',
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
  }
}
```

### 1.3 调度架构

`getAttachments()` 函数是整个附件系统的唯一入口，其签名如下：

```typescript
export async function getAttachments(
  input: string | null,           // 用户输入文本
  toolUseContext: ToolUseContext,  // 工具执行的上下文
  ideSelection: IDESelection | null, // IDE选择状态
  queuedCommands: QueuedCommand[],    // 待执行的命令队列
  messages?: Message[],               // 当前会话消息
  querySource?: QuerySource,
  options?: { skipSkillDiscovery?: boolean },
): Promise<Attachment[]>
```

**超时控制**：附件生成有 1000ms 的超时阈值，超过此时间的附件生成器会被中止：

```typescript
const abortController = createAbortController()
const timeoutId = setTimeout(ac => ac.abort(), 1000, abortController)
const context = { ...toolUseContext, abortController }
```

**容错机制**：所有附件生成器通过 `maybe()` 函数包裹，单个生成器的失败不会影响其他附件：

```typescript
async function maybe<A>(
  label: string,
  f: () => Promise<A[]>
): Promise<A[]> {
  const startTime = Date.now()
  try {
    const result = await f()
    // 5%采样日志记录
    return result
  } catch (e) {
    logError(e)      // 记录错误，但不传播
    return []        // 返回空数组，保证容错
  }
}
```

**执行顺序**：用户输入附件优先处理（确保 `@引用文件` 先被解析），然后与线程安全附件并行执行；主线程附件单独执行：

```typescript
// 先处理用户输入附件（确保 @文件引用先被解析）
const userAttachmentResults = await Promise.all(userInputAttachments)

// 然后并行处理其他附件
const [threadAttachmentResults, mainThreadAttachmentResults] =
  await Promise.all([
    Promise.all(allThreadAttachments),
    Promise.all(mainThreadAttachments),
  ])
```

---

## 2. 文件读取与验证

### 2.1 文件大小验证

当用户通过 `@filename` 语法引用文件时，系统会通过 `generateFileAttachment()` 函数进行多级验证。

**大小检查**：使用 `isFileWithinReadSizeLimit()` 进行预检查，此函数通过 `fs.statSync()` 获取文件大小并与 `getDefaultFileReadingLimits().maxSizeBytes` 比较：

```typescript
if (
  mode === 'at-mention' &&
  !isFileWithinReadSizeLimit(
    filename,
    getDefaultFileReadingLimits().maxSizeBytes,
  )
) {
  const ext = parse(filename).ext.toLowerCase()
  if (!isPDFExtension(ext)) {
    // 非PDF文件超过大小限制则跳过
    return null
  }
  // PDF文件走PDF特殊处理路径
}
```

文件大小限制由 `FileReadingLimits` 结构定义，可通过 GrowthBook 特性标志 `tengu_amber_wren` 动态调整。

### 2.2 路径验证

使用 `FileReadTool.validateInput()` 进行文件路径有效性验证：

```typescript
const isValid = await FileReadTool.validateInput(fileInput, toolUseContext)
if (!isValid.result) {
  return null
}
```

### 2.3 权限检查

通过 `isFileReadDenied()` 函数检查文件是否被拒绝规则禁止读取：

```typescript
function isFileReadDenied(
  filePath: string,
  toolPermissionContext: ToolPermissionContext,
): boolean {
  const denyRule = matchingRuleForInput(
    filePath,
    toolPermissionContext,
    'read',
    'deny',
  )
  return denyRule !== null
}
```

### 2.4 读过缓存优化

已经读取且未修改的文件不需要重复发送到 API。系统通过 `readFileState`（100 条 LRU 缓存）追踪文件读状态：

```typescript
const existingFileState = toolUseContext.readFileState.get(filename)
if (existingFileState && mode === 'at-mention') {
  const mtimeMs = await getFileModificationTimeAsync(filename)
  if (existingFileState.timestamp <= mtimeMs && mtimeMs === existingFileState.timestamp) {
    // 文件未被修改，返回 already_read_file 附件
    return {
      type: 'already_read_file',
      filename,
      content: existingFileState.content,
      // ...
    }
  }
}
```

---

## 3. 图片附件处理

### 3.1 图片压缩与格式转换

图片处理是附件系统中技术最复杂的部分。图片的压缩和格式转换由 `imageResizer.ts` 中的 `maybeResizeAndDownsampleImageBuffer()` 函数负责。

**压缩策略**（按优先级排序）：

1. **保持原样**：如果图片大小 <= `IMAGE_TARGET_RAW_SIZE`（3.75 MB）且宽高 <= `IMAGE_MAX_WIDTH/HEIGHT`（2000px），直接返回原始数据
2. **PNG 无损压缩**：对 PNG 图片尝试 `compressionLevel: 9` + `palette: true` 压缩
3. **JPEG 有损压缩**：尝试 80 → 60 → 40 → 20 逐级降低 JPEG 质量
4. **缩放 + 压缩**：将图片缩放到最大尺寸限制内再进行压缩
5. **强制降质**：若仍超限，缩放到 1000px 宽并使用 JPEG quality 20 强制压缩

```typescript
export async function maybeResizeAndDownsampleImageBuffer(
  imageBuffer: Buffer,
  originalSize: number,
  ext: string,
): Promise<ResizeResult> {
  // 检查是否已满足限制
  if (originalSize <= IMAGE_TARGET_RAW_SIZE &&
      width <= IMAGE_MAX_WIDTH && height <= IMAGE_MAX_HEIGHT) {
    return { buffer: imageBuffer, mediaType: normalizedMediaType }
  }

  // PNG压缩尝试
  if (isPng) {
    const pngCompressed = await sharp(imageBuffer)
      .png({ compressionLevel: 9, palette: true }).toBuffer()
    if (pngCompressed.length <= IMAGE_TARGET_RAW_SIZE) { ... }
  }

  // JPEG多级质量尝试
  for (const quality of [80, 60, 40, 20]) {
    const compressedBuffer = await sharp(imageBuffer)
      .jpeg({ quality }).toBuffer()
    if (compressedBuffer.length <= IMAGE_TARGET_RAW_SIZE) { ... }
  }

  // 最后手段：缩放到1000px宽 + quality 20
  ...
}
```

### 3.2 图片附件在消息中的嵌入

当用户粘贴图片或命令队列中包含图片时，通过 `buildImageContentBlocks()` 函数构造 `ImageBlockParam` 数组：

```typescript
async function buildImageContentBlocks(
  pastedContents: Record<number, PastedContent> | undefined,
): Promise<ImageBlockParam[]> {
  const imageContents = Object.values(pastedContents).filter(isValidImagePaste)
  const results = await Promise.all(
    imageContents.map(async img => {
      const imageBlock: ImageBlockParam = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: (img.mediaType || 'image/png') as Base64ImageSource['media_type'],
          data: img.content,
        },
      }
      const resized = await maybeResizeAndDownsampleImageBlock(imageBlock)
      return resized.block
    }),
  )
  return results
}
```

图片与文本组合形成 `ContentBlockParam` 数组，嵌入到 `queued_command` 附件中：

```typescript
if (imageBlocks.length > 0) {
  const textValue = typeof _.value === 'string' ? _.value : extractTextContent(...)
  prompt = [{ type: 'text', text: textValue }, ...imageBlocks]
}
```

### 3.3 图片格式检测

`imageResizer.ts` 提供基于魔数（magic bytes）的格式检测：

```typescript
export function detectImageFormatFromBuffer(buffer: Buffer): ImageMediaType
export function detectImageFormatFromBase64(base64: string): ImageMediaType
```

支持检测的格式：PNG、JPEG、GIF、WebP。

---

## 4. @引用文件系统

### 4.1 @提及解析

用户在输入中使用 `@filename` 语法引用文件，系统通过正则表达式解析：

```typescript
export function extractAtMentionedFiles(content: string): string[] {
  const quotedAtMentionRegex = /(^|\s)@"([^"]+)"/g       // @"path with spaces"
  const regularAtMentionRegex = /(^|\s)@([^\s]+)\b/g     // @path
  // 提取并去重
  return uniq([...quotedMatches, ...regularMatches])
}
```

**支持的行范围语法**：`@file.ts#L10-20` 解析为起始行和结束行：

```typescript
export function parseAtMentionedFileLines(mention: string): AtMentionedFileLines {
  const match = mention.match(/^([^#]+)(?:#L(\d+)(?:-(\d+))?)?(?:#[^#]*)?$/)
  return {
    filename: match?.[1] ?? mention,
    lineStart: lineStartStr ? parseInt(lineStartStr, 10) : undefined,
    lineEnd: lineEndStr ? parseInt(lineEndStr, 10) : lineStart,
  }
}
```

### 4.2 文件读取管道

`processAtMentionedFiles()` 处理所有 @引用文件：

```
用户输入文本
     │
     ▼
extractAtMentionedFiles()  ← 正则解析提取文件路径
     │
     ▼
parseAtMentionedFileLines()  ← 解析行范围
     │
     ▼
expandPath()  ← 将相对路径转为绝对路径
     │
     ▼
isFileReadDenied()  ← 权限检查
     │
     ▼
stat() → isDirectory()  ← 目录检测
     ├── 是目录 → readdir() 返回目录列表（最多1000条）
     └── 是文件 → generateFileAttachment()
                     │
                     ├─ isFileWithinReadSizeLimit()  ← 大小检查
                     ├─ tryGetPDFReference()  ← PDF特殊处理（>10页）
                     ├─ readFileState 查重  ← 已读优化
                     └─ FileReadTool.call()  ← 实际文件读取
                          ├─ 成功 → FileAttachment
                          ├─ MaxFileReadTokenExceededError → 截断读取
                          └─ FileTooLargeError → 截断读取
```

### 4.3 PDF 特殊处理

当 @引用一个 PDF 文件且页数超过阈值（`PDF_AT_MENTION_INLINE_THRESHOLD = 10` 页）时，不再内联读取，而是生成一个轻量引用：

```typescript
export async function tryGetPDFReference(
  filename: string,
): Promise<PDFReferenceAttachment | null> {
  const ext = parse(filename).ext.toLowerCase()
  if (!isPDFExtension(ext)) return null

  const [stats, pageCount] = await Promise.all([
    getFsImplementation().stat(filename),
    getPDFPageCount(filename),
  ])
  const effectivePageCount = pageCount ?? Math.ceil(stats.size / (100 * 1024))

  if (effectivePageCount > PDF_AT_MENTION_INLINE_THRESHOLD) {
    return {
      type: 'pdf_reference',
      filename,
      pageCount: effectivePageCount,
      fileSize: stats.size,
      displayPath: relative(getCwd(), filename),
    }
  }
  return null
}
```

### 4.4 MCP 资源引用

除了文件引用外，系统还支持 `@server:uri` 格式的 MCP 资源引用：

```typescript
export function extractMcpResourceMentions(content: string): string[] {
  const atMentionRegex = /(^|\s)@([^\s]+:[^\s]+)\b/g
  // 匹配 @serverName:resourcePath 格式
}
```

这允许用户在输入中直接引用 MCP 服务器提供的资源，系统会通过 MCP 客户端的 `readResource()` 方法获取资源内容。

### 4.5 Agent 提及

支持 `@agent-code-reviewer` 和 `@"code-reviewer (agent)"` 两种格式的 Agent 引用：

```typescript
export function extractAgentMentions(content: string): string[] {
  const quotedAgentRegex = /(^|\s)@"([\w:.@-]+) \(agent\)"/g
  const unquotedAgentRegex = /(^|\s)@(agent-[\w:.@-]+)/g
  return uniq(results)
}
```

---

## 5. Token 估算与预算控制

### 5.1 Token 用量附件

系统支持在消息中附加 Token 使用统计信息：

```typescript
function getTokenUsageAttachment(
  messages: Message[],
  model: string,
): Attachment[] {
  if (!isEnvTruthy(process.env.CLAUDE_CODE_ENABLE_TOKEN_USAGE_ATTACHMENT)) {
    return []
  }
  const contextWindow = getEffectiveContextWindowSize(model)
  const usedTokens = tokenCountFromLastAPIResponse(messages)
  return [{
    type: 'token_usage',
    used: usedTokens,
    total: contextWindow,
    remaining: contextWindow - usedTokens,
  }]
}
```

### 5.2 输出 Token 预算

当启用 `TOKEN_BUDGET` 特性时，每轮对话的输出 Token 预算控制：

```typescript
function getOutputTokenUsageAttachment(): Attachment[] {
  if (feature('TOKEN_BUDGET')) {
    const budget = getCurrentTurnTokenBudget()
    if (budget === null || budget <= 0) return []
    return [{
      type: 'output_token_usage',
      turn: getTurnOutputTokens(),
      session: getTotalOutputTokens(),
      budget,
    }]
  }
  return []
}
```

### 5.3 美金额度控制

当设置了 `maxBudgetUsd` 时，提供消费预算跟踪：

```typescript
function getMaxBudgetUsdAttachment(maxBudgetUsd?: number): Attachment[] {
  if (maxBudgetUsd === undefined) return []
  const usedCost = getTotalCostUSD()
  return [{
    type: 'budget_usd',
    used: usedCost,
    total: maxBudgetUsd,
    remaining: maxBudgetUsd - usedCost,
  }]
}
```

### 5.4 Token 限制与截断

`readFileInRange` 函数实现了智能的文件读取和 Token 控制：

```typescript
export async function readFileInRange(
  filePath: string,
  offset = 0,
  maxLines?: number,
  maxBytes?: number,
  signal?: AbortSignal,
  options?: { truncateOnByteLimit?: boolean },
): Promise<ReadFileRangeResult>
```

**两条代码路径**：
- **快速路径**（<10MB 常规文件）：`readFile()` 整文件读取，内存切行
- **流式路径**（大文件/管道）：`createReadStream` 逐块扫描换行符，仅累积目标范围内的行

**MAX_MEMORY_BYTES**：记忆文件注入的字节上限为 4096 bytes，5 个文件最多 20KB/轮，会话累积上限 60KB：

```typescript
const MAX_MEMORY_LINES = 200
const MAX_MEMORY_BYTES = 4096

export const RELEVANT_MEMORIES_CONFIG = {
  MAX_SESSION_BYTES: 60 * 1024,
}
```

---

## 6. 与消息构造管道的集成

### 6.1 消息生成器

`getAttachmentMessages()` 是 AsyncGenerator，将附件数组逐个 yield 为 `AttachmentMessage`：

```typescript
export async function* getAttachmentMessages(
  input: string | null,
  toolUseContext: ToolUseContext,
  ideSelection: IDESelection | null,
  queuedCommands: QueuedCommand[],
  messages?: Message[],
  querySource?: QuerySource,
  options?: { skipSkillDiscovery?: boolean },
): AsyncGenerator<AttachmentMessage, void> {
  const attachments = await getAttachments(...)
  if (attachments.length === 0) return

  logEvent('tengu_attachments', {
    attachment_types: attachments.map(_ => _.type),
  })

  for (const attachment of attachments) {
    yield createAttachmentMessage(attachment)
  }
}
```

### 6.2 在消息管道中的位置

```
query.ts 主循环
     │
     ├─ 收集附件
     │   ├─ 调用 getAttachmentMessages()
     │   ├─ 异步迭代 yield 的 AttachmentMessage
     │   └─ 插入到 messages 数组中
     │
     ├─ 构造 user message
     │   ├─ 附件在 content 中作为独立的 content block
     │   └─ 附件与用户输入文本组合成 ContentBlockParam[]
     │
     └─ 发送 API 请求
```

### 6.3 附件与系统提示词的关系

附件不属于系统提示词，而是作为用户消息的一部分注入。但某些附件类型（如 `relevant_memories`、`nested_memory`）最终会在消息渲染中被格式化为 `<system-reminder>` 块，从而表现得像系统提示词扩展。

---

## 7. 附件存储与清理

### 7.1 内存中附件

附件本身不持久化到磁盘。`Attachment` 对象作为消息数组的一部分存在内存中，随消息数组的 compaction 或会话结束而释放。

### 7.2 文件状态缓存清理

`readFileState` 是 100 条 LRU 缓存，跟踪所有已读取的文件内容。清理策略：

- **LRU 淘汰**：缓存满时淘汰最久未使用的文件状态
- **文件删除清理**：当文件被删除（ENOENT）时从缓存中移除
- **Compact 重置**：上下文压缩后旧附件从消息数组中移除，但 `readFileState` 保留

```typescript
// 文件变更检测中的清理逻辑
if (isENOENT(err)) {
  toolUseContext.readFileState.delete(filePath) // Evict deleted files
  return null
}
```

### 7.3 异步响应清理

异步 Hook 响应在转换为附件后从注册表中移除：

```typescript
if (responses.length > 0) {
  const processIds = responses.map(r => r.processId)
  removeDeliveredAsyncHooks(processIds)
}
```

---

## 8. 支持的文件类型及处理

### 8.1 文件类型分类

| 类型 | 处理方式 | 特殊处理 |
|------|----------|----------|
| 文本文件 (.ts, .py, .md, ...) | `FileReadTool.call()` 按行读取 | 截断时读前 MAX_LINES_TO_READ 行 |
| 图片文件 (.png, .jpg, .gif, .webp) | `readImageWithTokenBudget()` | `maybeResizeAndDownsampleImageBuffer()` 压缩 |
| PDF 文件 (.pdf) | `getPDFPageCount()` 判断页数 | >10 页返回轻量引用 |
| 二进制文件 | 由 `FileReadTool` 检测 | 拒绝或截断 |
| 目录 | `readdir()` 列出内容 | 最多 1000 条 |

### 8.2 图片格式

```typescript
type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
```

通过 `sharp` 库处理，支持格式转换（如 PNG → JPEG）和压缩。

### 8.3 已编辑文件的差异检测

`getChangedFiles()` 通过对比文件状态缓存中的内容和磁盘上最新内容来检测文件变更：

```typescript
// 文本文件：通过 diff 提取变更片段
if (result.data.type === 'text') {
  const snippet = getSnippetForTwoFileDiff(
    fileState.content,
    result.data.file.content,
  )
  if (snippet === '') return null  // 文件被触但未修改
  return { type: 'edited_text_file', filename, snippet }
}

// 图片文件：重新读取并压缩
if (result.data.type === 'image') {
  const data = await readImageWithTokenBudget(normalizedPath)
  return { type: 'edited_image_file', filename, content: data }
}
```

---

## 9. 记忆系统集成

### 9.1 嵌套内存附件

当用户 @引用文件时，系统会自动注入适用于该文件的嵌套内存指令。处理顺序是固定的：

```
处理顺序（必须保持）:
1. Managed/User 条件规则（匹配 targetPath）
2. 嵌套目录（CWD → target）：CLAUDE.md + 无条件规则 + 条件规则
3. CWD 级别目录（root → CWD）：仅条件规则
```

```typescript
async function getNestedMemoryAttachmentsForFile(
  filePath: string,
  toolUseContext: ToolUseContext,
  appState: { toolPermissionContext: ToolPermissionContext },
): Promise<Attachment[]> {
  // Phase 1: Managed 和 User 条件规则
  const managedUserRules = await getManagedAndUserConditionalRules(filePath, ...)

  // Phase 2: 获取待处理目录
  const { nestedDirs, cwdLevelDirs } = getDirectoriesToProcess(filePath, originalCwd)

  // Phase 3: 处理嵌套目录（CWD → target）
  for (const dir of nestedDirs) {
    const memoryFiles = await getMemoryFilesForNestedDirectory(dir, filePath, ...)
    // 注入内存附件
  }

  // Phase 4: 处理 CWD 级别目录（root → CWD）
  for (const dir of cwdLevelDirs) {
    const conditionalRules = await getConditionalRulesForCwdLevelDirectory(dir, filePath, ...)
    // 注入条件规则附件
  }
}
```

### 9.2 相关记忆预取

`startRelevantMemoryPrefetch()` 实现了一个非阻塞的记忆预取机制：

```
用户输入到达
     │
     ▼
检查自动记忆是否启用 + 特性标志
     │
     ▼
提取用户最后一条非元消息的文本
     │
     ▼
collectSurfacedMemories() → 计算已注入记忆的累积字节数
     │
     ▼
创建子级 AbortController（绑定到用户 Escape）
     │
     ▼
启动后台查询：findRelevantMemories()
     │
     ▼
通过 MemoryPrefetch 句柄跟踪状态
     │
     ▼
在附件收集阶段：检查 settledAt
  ├─ 已就绪 → filterDuplicateMemoryAttachments() → 注入
  └─ 未就绪 → 跳过本轮，下一轮重试
```

预取句柄实现为 `Disposable`，使用 `using` 关键字绑定到 `query.ts` 的循环生命周期：

```typescript
export type MemoryPrefetch = {
  promise: Promise<Attachment[]>
  settledAt: number | null       // Promise 解决时间戳
  consumedOnIteration: number    // 被消费的迭代编号
  [Symbol.dispose](): void       // 退出时中止并记录遥测
}
```

### 9.3 去重保护

`filterDuplicateMemoryAttachments()` 确保已通过 `FileReadTool` 读取过的文件不会再次作为记忆附件注入：

```typescript
export function filterDuplicateMemoryAttachments(
  attachments: Attachment[],
  readFileState: FileStateCache,
): Attachment[] {
  return attachments.map(attachment => {
    if (attachment.type !== 'relevant_memories') return attachment
    const filtered = attachment.memories.filter(
      m => !readFileState.has(m.path),  // 过滤已在上下文的文件
    )
    // 注入后标记为已读
    for (const m of filtered) {
      readFileState.set(m.path, { content: m.content, timestamp: m.mtimeMs, ... })
    }
    return filtered.length > 0 ? { ...attachment, memories: filtered } : null
  }).filter((a): a is Attachment => a !== null)
}
```

---

## 10. 错误处理与边缘情况

### 10.1 附件级容错

每个附件生成器都通过 `maybe()` 函数独立执行，单个失败不会影响整个管道：

| 错误场景 | 行为 | 日志 |
|----------|------|------|
| 附件生成超时 | 返回 `[]` | 记录到 `tengu_attachment_compute_duration` |
| 附件生成抛出异常 | 返回 `[]` | `logError(e)` + `logAntError()` |
| 文件不存在 | 返回 `null` | `tengu_attachment_file_too_large` |
| 权限拒绝 | 返回 `null` | 不记录（预期行为） |
| 内存不足 | 返回 `null` | `tengu_watched_file_compression_failed` |

### 10.2 文件读取错误处理

```typescript
try {
  const result = await FileReadTool.call(fileInput, toolUseContext)
  // 成功 → FileAttachment
} catch (error) {
  if (error instanceof MaxFileReadTokenExceededError ||
      error instanceof FileTooLargeError) {
    return await readTruncatedFile()  // 截断后读取前 N 行
  }
  throw error  // 其他错误继续传播
}
```

### 10.3 图片处理错误分类

`imageResizer.ts` 中的错误分类体系：

```
ERROR_TYPE_MODULE_LOAD  (1)  - sharp/napi 模块加载失败
ERROR_TYPE_PROCESSING   (2)  - 格式不识别、数据损坏
ERROR_TYPE_UNKNOWN      (3)  - 未知错误
ERROR_TYPE_PIXEL_LIMIT  (4)  - 像素/尺寸超出限制
ERROR_TYPE_MEMORY       (5)  - 内存分配失败
ERROR_TYPE_TIMEOUT      (6)  - 处理超时
ERROR_TYPE_VIPS         (7)  - Vips 相关错误
ERROR_TYPE_PERMISSION   (8)  - 权限错误
```

每种错误类型都对应特定的日志事件 `tengu_image_resize_failed`，包含原始大小、错误类型和错误信息哈希。

### 10.4 空文件和损坏文件处理

空图片会显式抛出异常：

```typescript
if (imageBuffer.length === 0) {
  throw new ImageResizeError('Image file is empty (0 bytes)')
}
```

大数据文件会触发截断读取，通过 `MAX_LINES_TO_READ` 限制读取行数：

```typescript
async function readTruncatedFile(): Promise<FileAttachment | null> {
  const truncatedInput = {
    file_path: filename,
    offset: offset ?? 1,
    limit: MAX_LINES_TO_READ,
  }
  const result = await FileReadTool.call(truncatedInput, toolUseContext)
  return {
    type: 'file',
    filename,
    content: result.data,
    truncated: true,
    displayPath: relative(getCwd(), filename),
  }
}
```

### 10.5 特殊模式下的跳过

在简单模式（`CLAUDE_CODE_SIMPLE`）或无附件模式（`CLAUDE_CODE_DISABLE_ATTACHMENTS`）下，大部分附件生成被跳过，只保留队列命令：

```typescript
if (
  isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS) ||
  isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)
) {
  return getQueuedCommandAttachments(queuedCommands)
}
```

---

## 11. 其他重要附件

### 11.1 计划模式附件

`getPlanModeAttachments()` 实现计划模式下的周期性提醒：

- **全量提醒**：每 5 次附件（第 1、6、11...次）发送完整计划指令
- **精简提醒**：间隔轮次仅发送简短提醒
- **退出检测**：`getPlanModeExitAttachment()` 在退出计划模式时发送一次性通知

```typescript
export const PLAN_MODE_ATTACHMENT_CONFIG = {
  TURNS_BETWEEN_ATTACHMENTS: 5,
  FULL_REMINDER_EVERY_N_ATTACHMENTS: 5,
}
```

**轮次计数逻辑**：计数 `human turns`（非元用户消息），而非 `assistant turns`，避免工具循环中过度触发。

### 11.2 自动模式附件

与计划模式类似，`getAutoModeAttachments()` 在自动模式下每 5 轮注入一次提醒：

```typescript
export const AUTO_MODE_ATTACHMENT_CONFIG = {
  TURNS_BETWEEN_ATTACHMENTS: 5,
  FULL_REMINDER_EVERY_N_ATTACHMENTS: 5,
}
```

### 11.3 日期变更通知

当本地日期跨天时（如用户编程到午夜），通过 `getDateChangeAttachments()` 通知模型：

```typescript
export function getDateChangeAttachments(
  messages: Message[] | undefined,
): Attachment[] {
  const currentDate = getLocalISODate()
  const lastDate = getLastEmittedDate()
  if (currentDate === lastDate) return []
  setLastEmittedDate(currentDate)
  return [{ type: 'date_change', newDate: currentDate }]
}
```

**缓存设计**：日期变更附加在消息尾部，不修改 `messages[0]`（系统提示词前缀），避免触发缓存重新创建。

### 11.4 压缩提醒

`getCompactionReminderAttachment()` 在上下文使用量超过有效窗口 25% 时提示模型使用压缩：

```typescript
export function getCompactionReminderAttachment(
  messages: Message[],
  model: string,
): Attachment[] {
  const effectiveWindow = getEffectiveContextWindowSize(model)
  const usedTokens = tokenCountWithEstimation(messages)
  if (usedTokens < effectiveWindow * 0.25) return []
  return [{ type: 'compaction_reminder' }]
}
```

---

## 12. 附件类型注册表

下表列出所有已注册的附件类型及其生成条件：

| 附件类型 | 生成函数 | 触发条件 |
|----------|----------|----------|
| `file` | `generateFileAttachment()` | 用户 @引用文件 |
| `compact_file_reference` | `generateFileAttachment()` | compact 模式下的文件引用 |
| `already_read_file` | `generateFileAttachment()` | 文件已在上下文且未修改 |
| `pdf_reference` | `tryGetPDFReference()` | PDF > 10 页 |
| `directory` | `processAtMentionedFiles()` | @引用目录路径 |
| `queued_command` | `getQueuedCommandAttachments()` | 命令队列非空 |
| `date_change` | `getDateChangeAttachments()` | 本地日期跨天 |
| `deferred_tools_delta` | `getDeferredToolsDeltaAttachment()` | 延迟工具集变化 |
| `agent_listing_delta` | `getAgentListingDeltaAttachment()` | Agent 工具列表变化 |
| `mcp_instructions_delta` | `getMcpInstructionsDeltaAttachment()` | MCP 指令变化 |
| `changed_files` | `getChangedFiles()` | 已读文件被修改 |
| `plan_mode` | `getPlanModeAttachments()` | 处于计划模式 |
| `plan_mode_exit` | `getPlanModeExitAttachment()` | 刚退出计划模式 |
| `auto_mode` | `getAutoModeAttachments()` | 处于自动模式 |
| `auto_mode_exit` | `getAutoModeExitAttachment()` | 刚退出自动模式 |
| `todo_reminder` | `getTodoReminderAttachments()` | 长时间未用 TodoWrite |
| `task_reminder` | `getTaskReminderAttachments()` | 长时间未用 Task tools |
| `relevant_memories` | `getRelevantMemoryAttachments()` | 异步记忆预取完成 |
| `nested_memory` | `getNestedMemoryAttachmentsForFile()` | 文件路径有嵌套内存规则 |
| `diagnostics` | `getDiagnosticAttachments()` | IDE 有新诊断 |
| `token_usage` | `getTokenUsageAttachment()` | 特性标志启用 |
| `budget_usd` | `getMaxBudgetUsdAttachment()` | 设定了 maxBudgetUsd |
| `output_token_usage` | `getOutputTokenUsageAttachment()` | TOKEN_BUDGET 启用 |
| `teammate_mailbox` | `getTeammateMailboxAttachments()` | Agent 群中有未读消息 |
| `team_context` | `getTeamContextAttachment()` | Agent 群首次启动 |
| `skill_listing` | `getSkillListingAttachments()` | 技能列表有变化 |
| `skill_discovery` | `prefetch.getTurnZeroSkillDiscovery()` | 实验性技能搜索 |
| `compaction_reminder` | `getCompactionReminderAttachment()` | 上下文使用 > 25% |
| `context_efficiency` | `getContextEfficiencyAttachment()` | HISTORY_SNIP 启用 |
| `verify_plan_reminder` | `getVerifyPlanReminderAttachment()` | 计划验证未完成 |
| `ultrathink_effort` | `getUltrathinkEffortAttachment()` | Ultrathink 关键词触发 |
| `critical_system_reminder` | `getCriticalSystemReminderAttachment()` | 系统有必要提醒 |

---

## 总结

Claude Code 的附件系统是一个高度模块化、容错性强的上下文收集框架。其核心设计原则包括：

1. **独立容错**：每个附件生成器通过 `maybe()` 隔离，单个失败不扩散
2. **异步友好**：支持并行生成和预取机制，不阻塞主流程
3. **资源感知**：内置大小限制、Token 预算、截断策略
4. **缓存优化**：`readFileState` LRU 缓存避免重复读取和 API 传输
5. **智能记忆注入**：嵌套内存按目录层级注入，相关记忆异步预取
6. **模式感知**：不同操作模式（计划/自动/正常）注入不同类型的附件
7. **遥测驱动**：5% 采样率的性能日志帮助追踪附件生成瓶颈

这个系统是 Claude Code 能够处理复杂、长会话的关键基础设施——它确保了模型在每一轮都有足够的上下文信息来做出正确的决策，同时避免过度消耗 Token 预算。
