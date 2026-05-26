---
title: 运行与调试
---

# 运行与调试

## 运行方式

### 1. 标准启动

```bash
# 使用 Bun 运行
bun run src/bootstrap-entry.ts

# 或者直接
bun run src/bootstrap-entry.ts -- --model claude-sonnet-4-20250514
```

### 2. 开发模式

被还原的源码树不支持 `bun run dev`（对应的脚本指向被还原的入口），但可以直接运行：

```bash
# 等效于开发模式
bun --watch run src/bootstrap-entry.ts
```

`--watch` 标志会在文件变更时自动重启，适合在修改代码后实时观察效果。

### 3. 验证启动链

```bash
# 测试快速路径
bun run src/bootstrap-entry.ts -- --version
# 输出: 999.0.0-restored (Claude Code)

# 测试帮助
bun run src/bootstrap-entry.ts -- --help

# 测试 bare 模式
CLAUDE_CODE_SIMPLE=1 bun run src/bootstrap-entry.ts
```

## 常用命令

```bash
# 版本查询
bun run src/bootstrap-entry.ts -- --version

# 指定模型
bun run src/bootstrap-entry.ts -- --model claude-sonnet-4-20250514

# 指定工具预设
bun run src/bootstrap-entry.ts -- --tools default

# 简单模式（仅 Bash/Read/Edit）
bun run src/bootstrap-entry.ts -- --bare

# 后台模式
bun run src/bootstrap-entry.ts -- --bg

# 调试模式
bun run src/bootstrap-entry.ts -- --verbose
```

## 环境变量

| 环境变量 | 用途 | 取值 |
|----------|------|------|
| `ANTHROPIC_API_KEY` | API 密钥 | 您的 API Key |
| `CLAUDE_CODE_SIMPLE` | 简单模式 | `1` 启用 |
| `CLAUDE_CODE_REMOTE` | 远程环境 | `true` 启用 |
| `DISABLE_BACKGROUND_TASKS` | 禁用后台任务 | `1` |
| `USER_TYPE` | 用户类型 | `ant`（内部） |
| `CLAUDE_CODE_VERIFY_PLAN` | 验证计划模式 | `true` |
| `ENABLE_LSP_TOOL` | 启用 LSP 工具 | `true` |
| `NODE_OPTIONS` | Node.js 选项 | `--max-old-space-size=8192` |

## 功能状态

### 正常工作

| 功能 | 说明 |
|------|------|
| 快速路径检查 | 13 条快速路径全部可用 |
| Commander CLI 组装 | 命令注册和解析 |
| 工具注册 | getAllBaseTools() 正常返回 |
| MCP 客户端 | 服务发现和连接 |
| 状态管理 | AppState 和 UI State |
| Ink 渲染 | React 组件树渲染 |

### 可能受限

| 功能 | 限制说明 |
|------|----------|
| Ant 内部工具 | REPLTool, ConfigTool 等需要 USER_TYPE=ant |
| Chrome MCP | shim 可能不完整 |
| Computer Use | 需要原生模块支持 |
| 远程控制 | 需要 Ant 基础设施 |
| 原生模块性能 | Napi 模块被纯 JS shim 替换 |

### 不工作

| 功能 | 原因 |
|------|------|
| Daemon 模式 | 依赖未还原的后台进程管理 |
| Bridge 模式 | 依赖 Ant 远程控制基础设施 |
| 某些条件工具 | 依赖未发布的 feature flag |

## 调试指南

### 1. 使用 console.log/error

```typescript
// 在目标文件中添加调试输出
console.error('[DEBUG] current state:', JSON.stringify(someState, null, 2))

// 使用颜色区分不同模块
console.log('\x1b[32m%s\x1b[0m', '[Tools]', '加载完成')  // 绿色
console.log('\x1b[33m%s\x1b[0m', '[MCP]', '连接成功')     // 黄色
console.log('\x1b[31m%s\x1b[0m', '[Error]', '连接失败')    // 红色
```

### 2. 使用 Bun 内置调试器

```bash
# 启动调试服务器
bun --inspect run src/bootstrap-entry.ts

# 或者等待调试器连接
bun --inspect-wait run src/bootstrap-entry.ts
```

然后在 Chrome 浏览器中打开 `chrome://inspect`，点击 "Open dedicated DevTools for Node"。

### 3. 跟踪模块加载

```bash
# 使用 --eval 在启动前注入代码
bun --eval "process.env.DEBUG='1'" run src/bootstrap-entry.ts
```

### 4. 断点调试

在代码中添加 `debugger` 语句：

```typescript
async function main(): Promise<void> {
  debugger  // 执行到这里会暂停
  const args = process.argv.slice(2)
  // ...
}
```

### 5. 使用 Bun 的堆栈跟踪

```bash
# 显示完整的异步堆栈
bun --stack-trace-limit=100 run src/bootstrap-entry.ts
```

## 快速验证脚本

创建一个最小的验证脚本 `verify.ts`：

```typescript
// verify.ts — 验证核心功能
import { ensureBootstrapMacro } from './src/bootstrapMacro.js'

// 1. 验证 MACRO 注入
ensureBootstrapMacro()
console.log('MACRO:', MACRO.VERSION)

// 2. 验证工具注册（简化版）
async function verifyTools() {
  const { getAllBaseTools } = await import('./src/tools.js')
  const tools = getAllBaseTools()
  console.log(`Tools count: ${tools.length}`)
  console.log('Tool names:', tools.map(t => t.name).join(', '))
}

// 3. 验证命令注册（简化版）
async function verifyCommands() {
  // 直接导入 commands.ts 会触发副作用
  // 这里只验证模块是否可加载
  try {
    await import('./src/commands.js')
    console.log('Commands module loaded successfully')
  } catch (err) {
    console.error('Commands module failed to load:', err)
  }
}

await verifyTools()
await verifyCommands()
```

运行：
```bash
bun run verify.ts
```

## 练习

1. 使用 `--watch` 模式运行并修改 `bootstrapMacro.ts` 中的 `VERSION` 字符串，观察自动重启
2. 在 `cli.tsx` 中添加一个 `--debug-startup` 标志，在启动时输出所有 `profileCheckpoint` 的时间差
3. 使用 `bun --inspect` 启动并在 Chrome DevTools 中设置断点，观察快速路径检查的执行过程
4. 编写一个自动验证脚本，检测所有 shim 包是否加载正常
