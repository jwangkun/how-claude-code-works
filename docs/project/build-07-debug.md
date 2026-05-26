---
title: Step 7：调试与验证
---

# Step 7：调试与验证

## 分析目标

掌握 Claude Code 还原版源码树的调试方法、运行验证和常见问题排查。

## 运行验证

### 基础验证

```bash
# 1. 检查依赖是否完整
cd claude-code-rev
bun install

# 2. 测试 --version 快速路径
bun run src/bootstrap-entry.ts -- --version
# 预期输出: 999.0.0-restored (Claude Code)

# 3. 测试正常启动
bun run src/bootstrap-entry.ts
# 预期: 进入 CLI（可能因缺少 API key 而报错）
```

### 验证清单

| 检查项 | 命令 | 预期结果 | 状态 |
|--------|------|----------|------|
| Bun 版本 | `bun --version` | >=1.3.5 | [ ] |
| 依赖安装 | `bun install` | 无错误 | [ ] |
| 版本输出 | `bun run src/bootstrap-entry.ts -- --version` | 999.0.0-restored | [ ] |
| 启动链路 | `bun run src/bootstrap-entry.ts` | CLI 显示 | [ ] |
| 快速路径 | 检查 cli.tsx | 13 条路径 | [ ] |
| 工具注册 | 查看 getAllBaseTools | 50+ 工具 | [ ] |
| 命令注册 | 查看 commands.ts | 102+ 命令 | [ ] |
| MCP 配置 | 查看 services/mcp/ | 存在 | [ ] |
| Shim 加载 | 运行依赖 shim 的记录 | 不崩溃 | [ ] |

## 调试技巧

### 1. 使用 console.log 调试

Bun 运行 TypeScript 时直接输出 `console.log` 到标准输出：

```typescript
// 在 cli.tsx 中添加调试输出
console.error('[DEBUG] args:', process.argv.slice(2))
```

### 2. 启动性能分析

```typescript
// 在 cli.tsx 中，profileCheckpoint 用于记录时间戳
// 你可以添加自己的计时点
console.time('fast-path-check')
// ...
console.timeEnd('fast-path-check')
```

### 3. 跟踪模块加载

使用 Bun 的 `--inspect` 标志启动调试服务器：

```bash
bun --inspect run src/bootstrap-entry.ts
```

然后在 Chrome DevTools 中连接 `ws://localhost:6499/` 进行断点调试。

### 4. 使用 Node.js 兼容模式

```bash
# Bun 默认模拟 Node.js API，但有些 shim 依赖 Node.js 原生模块
# 可以尝试使用 tsx 运行
npx tsx src/bootstrap-entry.ts
```

## 常见问题

### Q1: 启动后立即退出

**可能原因**：缺少 API Key 或配置未正确加载。

**解决**：
```bash
# 设置 API Key
export ANTHROPIC_API_KEY=your-key-here

# 或者创建配置文件
mkdir -p ~/.claude
echo '{}' > ~/.claude/settings.json
```

### Q2: Shim 相关错误

部分 shim 包可能不完整，导致运行时错误：

```bash
# 错误示例
Error: Cannot find module 'color-diff-napi'

# 解决方案
# 检查 shims/ 目录下对应的 shim 包是否完整
ls shims/color-diff-napi/
```

### Q3: TypeScript 类型错误

还原后的文件扩展名为 `.js`，但内容为 TypeScript：

```bash
# Bun 可以运行 .js 文件中的 TS 语法
# 但如果使用 tsc 检查类型，需要特殊配置

# 建议仅使用 Bun 运行，不使用 tsc 检查
```

### Q4: Source Map 警告

文件尾部包含 base64 source map，Bun 运行时可能会警告：

```bash
# 这是正常的还原痕迹，不影响运行
# 忽略 source map 相关警告
```

### Q5: 循环依赖

```bash
Error: Cannot instantiate module due to circular dependency
```

**解决**：检查是否有工具通过惰性 `require()` 打破了循环，但惰性加载函数本身尚未被调用。

## 验证步骤详解

### 验证 1：快速路径测试

```bash
# 测试各个快速路径
bun run src/bootstrap-entry.ts -- --version
bun run src/bootstrap-entry.ts -- --help
bun run src/bootstrap-entry.ts -- --bare
```

### 验证 2：工具系统验证

```bash
# 添加临时调试代码验证工具列表
# 在 tools.ts 的 getAllBaseTools() 末尾添加：
// console.log('Tools loaded:', tools.map(t => t.name).join(', '))
```

### 验证 3：MCP 连接验证

```bash
# 确保 MCP 服务器配置正确
# 在 claude .claude/settings.json 中添加：
# {
#   "mcpServers": {
#     "example": {
#       "command": "echo",
#       "args": ["hello"]
#     }
#   }
# }
```

## 练习

1. 运行 `bun run src/bootstrap-entry.ts -- --version` 并记录启动时间。对比添加 `--help` 后的时间差异
2. 在 `cli.tsx` 的每个快速路径分支中添加 `console.log`，验证每个分支的执行路径
3. 使用 `bun --inspect` 启动并在 Chrome DevTools 中设置断点，调试启动流程
4. 创建一个最小化的启动环境，只包含一个核心工具和一个核心命令
