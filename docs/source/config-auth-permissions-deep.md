# 配置、认证与权限系统深度分析

## 概述

Claude Code 的配置、认证与权限三大系统构成了其安全性和可管理性的基础架构。配置系统负责分层加载和管理所有运行时设置；认证系统处理与 Anthropic API 的身份验证，支持 OAuth 2.0 PKCE 流和传统 API Key 方案；权限系统则提供工具级、文件级和命令级的多层次访问控制。三者协同工作，确保 CLI 工具既能灵活适应不同工作环境，又能维护严格的安全边界。

---

## 一、配置系统 (Config System)

### 1.1 配置加载层次结构

Claude Code 的配置系统采用严格的分层覆盖模型，定义在 `src/utils/settings/constants.ts` 的 `SETTING_SOURCES` 常量中：

```typescript
export const SETTING_SOURCES = [
  'userSettings',     // 用户级全局设置 (~/.claude/settings.json)
  'projectSettings',  // 项目级共享设置 (.claude/settings.json)
  'localSettings',    // 项目级本地设置 (.claude/settings.local.json)，被 gitignore
  'flagSettings',     // CLI --settings 标志指定的设置文件
  'policySettings',   // 策略设置（managed-settings.json 或 API 远程设置）
] as const
```

**加载顺序**：后加载的源覆盖先加载的源。即 `policySettings` 拥有最高优先级，`userSettings` 优先级最低。这种设计允许组织策略覆盖用户偏好，同时 CLI 标志可以临时覆盖项目设置。

**全局配置存储**（`src/utils/config.ts`）：用户的全局偏好存储在 `~/.claude.json` 中，通过 `getGlobalConfig()` / `saveGlobalConfig()` 访问。该文件缓存了一个 `GlobalConfig` 接口定义的所有字段，从 `theme`、`verbose` 等基础开关到复杂的 `cachedGrowthBookFeatures`、`mcpServers` 等运行时状态。`GlobalConfig` 接口定义超过 100 个字段，涵盖：

- **用户偏好**：主题、编辑器模式、通知渠道、diff 工具
- **功能开关**：自动压缩、进度条、状态栏指示
- **认证状态**：`oauthAccount`、`primaryApiKey`
- **缓存数据**：Statsig 门控、GrowthBook 特性、订阅信息
- **项目特定配置**：`projects` 字段按路径映射 `ProjectConfig`

**项目配置**（`ProjectConfig`）：每个项目可以有独立的 `allowedTools`、`mcpServers`、`mcpContextUris`、信任对话框状态等。通过 `getCurrentProjectConfig()` 和 `saveCurrentProjectConfig()` 操作，写入全局配置的 `projects` 映射中。

### 1.2 配置文件格式

**用户设置文件**：默认路径为 `~/.claude/settings.json`。在 Cowork 模式下使用 `~/.claude/cowork_settings.json`。

**项目设置文件**：
- `{project_dir}/.claude/settings.json` — 共享设置，可 commit 到版本控制
- `{project_dir}/.claude/settings.local.json` — 本地覆盖，被 gitignore

**settings.json 格式**（通过 `SettingsSchema` 验证）：

```typescript
interface SettingsJson {
  permissions?: {
    allow?: string[]     // "Bash(read:*)", "FileEdit(/.claude/**)"
    deny?: string[]      // "Bash(rm -rf *)", "Read(.env)"
    ask?: string[]       // "Bash(npm publish:*)"
  }
  apiKeyHelper?: string            // 自定义 API 密钥获取命令
  awsAuthRefresh?: string          // AWS 认证刷新命令
  gcpAuthRefresh?: string          // GCP 认证刷新命令
  awsCredentialExport?: string     // AWS 凭证导出命令
  env?: Record<string, string>     // 环境变量覆盖
  allowedTools?: string[]          // 允许的工具列表
  hooks?: Record<string, string>   // 钩子脚本
  ...更多设置项
}
```

**managed-settings.json**（`policySettings`）：由组织管理员通过 IT 策略或远程 API 分发，路径为 `{managed_path}/managed-settings.json`，支持 `.d/` 目录的 drop-in 片段文件。其加载优先级顺序为：`remote > plist/HKLM > file > HKCU`。关键机制在 `getSettingsForSource` 函数中实现：

```typescript
// policySettings 的 "first source wins" 策略
if (source === 'policySettings') {
  const remoteSettings = getRemoteManagedSettingsSyncFromCache()
  if (remoteSettings && Object.keys(remoteSettings).length > 0) return remoteSettings
  const mdmResult = getMdmSettings()
  if (Object.keys(mdmResult.settings).length > 0) return mdmResult.settings
  const { settings: fileSettings } = loadManagedFileSettings()
  if (fileSettings) return fileSettings
  const hkcu = getHkcuSettings()
  if (Object.keys(hkcu.settings).length > 0) return hkcu.settings
  return null
}
```

### 1.3 全局配置缓存与线程安全

`getGlobalConfig()` 函数使用两级缓存策略：

1. **内存缓存**（快速路径）：`globalConfigCache` 存储 `{ config, mtime }`。启动后，内存命中率接近 100%。

2. **文件监视器**（跨进程一致性）：`startGlobalConfigFreshnessWatcher()` 使用 `fs.watchFile` 以 1 秒间隔轮询 mtime 变化，检测来自其他进程的写入。

3. **写穿透**：`saveGlobalConfig` 写入后立即更新内存缓存（`writeThroughGlobalConfigCache`），mtime 溢出设置确保文件监视器跳过自身写入。

4. **锁机制**：`saveConfigWithLock` 使用文件锁（`lockfile.lockSync`）防止并发写入冲突。锁竞争超过 100ms 时记录告警事件。

5. **防认证丢失保护**：`wouldLoseAuthState` 函数防止损坏的配置文件覆盖有效的认证状态（GitHub issue #3117 的修复）。

```typescript
function wouldLoseAuthState(fresh: { oauthAccount?: unknown; hasCompletedOnboarding?: boolean }): boolean {
  const cached = globalConfigCache.config
  if (!cached) return false
  const lostOauth = cached.oauthAccount !== undefined && fresh.oauthAccount === undefined
  const lostOnboarding = cached.hasCompletedOnboarding === true && fresh.hasCompletedOnboarding !== true
  return lostOauth || lostOnboarding
}
```

### 1.4 环境变量集成

Claude Code 通过多种环境变量与配置系统联动：

- **`ANTHROPIC_API_KEY`**：直接设置 API 密钥，在 CI 环境中强制要求
- **`CLAUDE_CODE_OAUTH_TOKEN`**：用于 CCR 和 Claude Desktop 的 OAuth 令牌注入
- **`CLAUDE_CODE_USE_BEDROCK` / `CLAUDE_CODE_USE_VERTEX` / `CLAUDE_CODE_USE_FOUNDRY`**：切换至第三方提供商
- **`CLAUDE_CODE_REMOTE`**：标记为远程控制会话，改变认证和权限行为
- **`CLAUDE_CODE_ENTRYPOINT`**：标识入口点（`claude-desktop` 等）
- **`CLAUDE_CODE_API_KEY_HELPER_TTL_MS`**：覆盖 API 密钥助手缓存 TTL
- **`CLAUDE_CODE_TMPDIR`**：覆盖临时目录路径
- **`CLAUDE_CODE_USE_COWORK_PLUGINS`**：切换到 Cowork 设置文件

`settings.env` 字段也可在配置文件中定义环境变量，其值会注入到子进程环境中。

### 1.5 特性标志评估 (Feature Flags)

特性标志系统使用 GrowthBook 作为后端，结合 Statsig 门控的迁移支持，定义在 `src/services/analytics/growthbook.ts` 中。

**评估优先级**（从高到低）：
1. 环境变量覆盖（`getEnvOverrides()`）
2. 配置 /login 覆盖（`getConfigOverrides()`），通过 `GlobalConfig.growthBookOverrides` 设置
3. GrowthBook 远程评估结果（`remoteEvalFeatureValues`）
4. 磁盘缓存（`GlobalConfig.cachedGrowthBookFeatures`）
5. 默认值

```typescript
export function getFeatureValue_CACHED_MAY_BE_STALE<T>(
  feature: string, defaultValue: T
): T {
  const overrides = getEnvOverrides()
  if (overrides && feature in overrides) return overrides[feature] as T
  // ...
  if (remoteEvalFeatureValues.has(feature)) return remoteEvalFeatureValues.get(feature) as T
  const cached = getGlobalConfig().cachedGrowthBookFeatures?.[feature]
  return cached !== undefined ? cached as T : defaultValue
}
```

特性标志还通过构建时的 `feature()` 函数（`bun:bundle` 宏）在编译时静态启用/禁用代码路径，例如 `TRANSCRIPT_CLASSIFIER`、`TEAMMEM`、`CCR_AUTO_CONNECT` 等。

---

## 二、认证系统 (Auth System)

### 2.1 OAuth 2.0 PKCE 流程

Claude Code 实现了完整的 OAuth 2.0 授权码流程，带有 PKCE（Proof Key for Code Exchange）扩展。实现位于 `src/services/oauth/index.ts` 的 `OAuthService` 类。

**流程步骤**：

```typescript
class OAuthService {
  private codeVerifier: string

  constructor() {
    this.codeVerifier = crypto.generateCodeVerifier() // 加密随机字符串
  }

  async startOAuthFlow(authURLHandler, options?): Promise<OAuthTokens> {
    // 1. 启动本地回调服务器
    this.authCodeListener = new AuthCodeListener()
    this.port = await this.authCodeListener.start()

    // 2. 生成 PKCE 参数
    const codeChallenge = crypto.generateCodeChallenge(this.codeVerifier)  // S256 哈希
    const state = crypto.generateState()  // CSRF 令牌

    // 3. 构建认证 URL（自动和手动两种模式）
    const manualFlowUrl = client.buildAuthUrl({ ...opts, isManual: true })
    const automaticFlowUrl = client.buildAuthUrl({ ...opts, isManual: false })

    // 4. 等待授权码（自动=localhost重定向，或手动粘贴）
    const authorizationCode = await this.waitForAuthorizationCode(state, ...)

    // 5. 用授权码交换令牌（使用 code_verifier 验证 PKCE）
    const tokenResponse = await client.exchangeCodeForTokens(
      authorizationCode, state, this.codeVerifier, this.port
    )
    // ...
  }
}
```

**认证 URL 构建**：`client.buildAuthUrl()` 函数生成包含以下参数的 URL：
- `client_id`、`response_type=code`
- `redirect_uri`：自动模式为 `http://localhost:{port}/callback`，手动模式为固定值
- `scope`：`user:inference`（仅推理令牌）或完整的 `ALL_OAUTH_SCOPES`
- `code_challenge` + `code_challenge_method=S256`（PKCE 核心）
- `state`：防 CSRF
- 可选的 `orgUUID`、`login_hint`、`login_method`

**令牌交换**：`exchangeCodeForTokens()` 发送 POST 请求到 `TOKEN_URL`，携带 `code_verifier` 验证 PKCE 挑战。成功返回包含 `accessToken`、`refreshToken`、`expiresAt`、`scopes`、`subscriptionType`、`rateLimitTier` 的 `OAuthTokens`。

### 2.2 令牌管理

**令牌存储**：OAuth 令牌通过 `secureStorage` 抽象层持久化，具体实现在 `src/services/oauth/client.ts` 的 `saveOAuthTokensIfNeeded()`：

```typescript
export function saveOAuthTokensIfNeeded(tokens: OAuthTokens): { success: boolean; warning?: string } {
  const secureStorage = getSecureStorage()
  const storageData = secureStorage.read() || {}
  storageData.claudeAiOauth = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    scopes: tokens.scopes,
    subscriptionType: tokens.subscriptionType ?? existingOauth?.subscriptionType ?? null,
    rateLimitTier: tokens.rateLimitTier ?? existingOauth?.rateLimitTier ?? null,
  }
  secureStorage.update(storageData)
  // ...
}
```

**令牌刷新**：`checkAndRefreshOAuthTokenIfNeeded()` 实现带有去重和分布式锁的令牌刷新：

1. 检查磁盘变更（`invalidateOAuthCacheIfDiskChanged`）
2. 检查本地过期判断
3. 异步验证（防止另一个进程已刷新）
4. 获取文件锁（`lockfile.lock`），最多重试 5 次
5. 锁内最终检查后执行刷新
6. 持久化新令牌并清除缓存

```typescript
async function checkAndRefreshOAuthTokenIfNeededImpl(retryCount: number, force: boolean): Promise<boolean> {
  await invalidateOAuthCacheIfDiskChanged()
  const tokens = getClaudeAIOAuthTokens()
  if (!force && !isOAuthTokenExpired(tokens.expiresAt)) return false
  // ... 锁获取和刷新逻辑
  const refreshedTokens = await refreshOAuthToken(lockedTokens.refreshToken)
  saveOAuthTokensIfNeeded(refreshedTokens)
  return true
}
```

**401 处理**：`handleOAuth401Error()` 处理服务器返回的令牌过期：
- 清除缓存，与失败令牌比对
- 若密钥链已有不同令牌（另一进程已刷新），直接使用
- 否则强制刷新（跳过本地过期判断）
- 去重：对同一 `failedAccessToken` 的并发调用合并为一次密钥链读取

**令牌缓存**：`getClaudeAIOAuthTokens` 使用 `memoize` 缓存，支持跨进程失效检测：

```typescript
export const getClaudeAIOAuthTokens = memoize((): OAuthTokens | null => {
  // 检查优先级：env var > file descriptor > secure storage
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) { ... }
  const oauthTokenFromFd = getOAuthTokenFromFileDescriptor()
  if (oauthTokenFromFd) { ... }
  const secureStorage = getSecureStorage()
  const storageData = secureStorage.read()
  return storageData?.claudeAiOauth ?? null
})
```

### 2.3 API Key 管理

API Key 支持与 OAuth 并行的认证方式，实现位于 `src/utils/auth.ts`。获取 API Key 的优先级链：

1. **`ANTHROPIC_API_KEY` 环境变量**：在非 homespace 环境下生效
2. **文件描述符提供的 Key**：用于 `claude --print` 等子进程场景
3. **`apiKeyHelper` 命令**：执行自定义脚本来获取密钥，支持缓存（默认 TTL 5 分钟）和 SWR（Stale-While-Revalidate）模式
4. **macOS Keychain**：使用 `security find-generic-password` 命令
5. **`claude.json` 配置文件中的 `primaryApiKey`**：由 `/login` 命令管理

**apiKeyHelper 实现细节**：

```typescript
async function _executeApiKeyHelper(isNonInteractiveSession: boolean): Promise<string | null> {
  // 安全检查：项目设置中的 apiKeyHelper 需要信任确认
  if (isApiKeyHelperFromProjectOrLocalSettings()) {
    const hasTrust = checkHasTrustDialogAccepted()
    if (!hasTrust && !isNonInteractiveSession) { /* 抛出错误 */ }
  }
  const result = await execa(apiKeyHelper, { shell: true, timeout: 10 * 60 * 1000 })
  return result.stdout?.trim()
}
```

**安全写入**：`saveApiKey()` 先将 Key 写入 macOS Keychain（通过 hex 编码避免命令行泄露），失败后回退到 `claude.json`。`normalizeApiKeyForConfig` 对 Key 做哈希归一化，用于批准/拒绝列表比对。

### 2.4 会话令牌处理

**CLAUD_CODE_OAUTH_TOKEN 环境变量**：CCR（Claude Code Remote）和 Claude Desktop 使用此环境变量注入 OAuth 令牌，配置为纯推理作用域（`['user:inference']`），无刷新能力。

**文件描述符令牌**：`getOAuthTokenFromFileDescriptor()` 通过 Unix 域套接字或管道文件描述符接收令牌，用于 `claude remote-control` 的子进程管理。CCR 还有磁盘回退机制（`CCR_OAUTH_TOKEN_FILE`）。

**`isManagedOAuthContext()`**: 检测是否在托管 OAuth 上下文中运行（CCR 或 Claude Desktop），防止用户 `~/.claude/settings.json` 中的 API Key 配置意外污染托管会话。

### 2.5 多账户与第三方服务支持

Claude Code 支持多种认证场景：

- **Claude.ai 订阅用户**：通过 OAuth 获取 `user:inference` 作用域，解锁 Max/Pro/Team/Enterprise 订阅
- **API 直连用户**：使用 `ANTHROPIC_API_KEY` 或 `apiKeyHelper`
- **第三方提供商**：通过 `CLAUDE_CODE_USE_BEDROCK`、`CLAUDE_CODE_USE_VERTEX`、`CLAUDE_CODE_USE_FOUNDRY` 切换至 AWS/GCP/其他服务
- **1P API 客户**：直接使用 API Key，非 Claude.ai 订阅者，非第三方云服务

账户信息通过 `AccountInfo` 类型管理，包括 `accountUuid`、`organizationUuid`、`billingType`、`subscriptionCreatedAt` 等字段。OAuth 令牌的作用域检查（`hasProfileScope()`）用于控制是否访问用户画像 API。

---

## 三、权限系统 (Permissions System)

### 3.1 权限架构概述

Claude Code 的权限系统采用多层决策流水线架构，核心实现在 `src/utils/permissions/permissions.ts` 的 `hasPermissionsToUseTool()` 函数。该架构按顺序执行以下检查步骤：

```typescript
export const hasPermissionsToUseTool: CanUseToolFn = async (tool, input, context, assistantMessage, toolUseID) => {
  const result = await hasPermissionsToUseToolInner(tool, input, context)
  // 步骤后处理：重置连续拒绝计数、dontAsk 模式转换、auto 模式分类器
  // ...
}
```

**内部决策流水线**（`hasPermissionsToUseToolInner`）包含以下阶段：

| 步骤 | 检查内容 | 返回行为 |
|------|----------|----------|
| 1a | 整个工具被 deny 规则匹配 | `deny` |
| 1b | 整个工具被 ask 规则匹配 | `ask`（沙箱环境可自动允许） |
| 1c | 工具自身的 `checkPermissions()` | `allow/deny/ask/passthrough` |
| 1d | 工具实现拒绝（如 Bash 子命令拒绝） | `deny` |
| 1e | 工具需要用户交互 | 保留 `ask` |
| 1f | 内容特定的 ask 规则（覆盖 bypass 模式） | `ask` |
| 1g | **安全检查**（Git 目录、Claude 配置等） | `ask`（bypass 免疫） |
| 2a | bypassPermissions 模式检查 | `allow`（跳过后续所有规则） |
| 2b | 全局 allow 规则匹配 | `allow` |
| 3 | passthrough → ask 转换 | `ask` |

### 3.2 权限规则系统

**规则类型**：三种行为类型定义在 `PermissionBehavior`：

- **`allow`**：自动允许，不提示用户
- **`deny`**：自动拒绝，不提示用户
- **`ask`**：需要用户交互确认

**规则来源**（`PermissionRuleSource`）：规则的来源决定了其优先级和持久性：

```typescript
const PERMISSION_RULE_SOURCES = [
  'userSettings',      // ~/.claude/settings.json
  'projectSettings',   // .claude/settings.json
  'localSettings',     // .claude/settings.local.json
  'flagSettings',      // --settings 标志
  'policySettings',    // managed-settings.json
  'cliArg',            // --allowed-tools 或 --disallowed-tools
  'command',           // SDK 控制协议
  'session',           // 会话级临时规则
] as const
```

**规则语法**：权限规则使用 `ToolName(contentPattern)` 格式：

- `Bash` — 匹配整个 Bash 工具（所有命令）
- `Bash(read:*)` — 匹配所有以 `read:` 为前缀的命令
- `Bash(npm publish:*)` — 匹配 npm publish 相关命令
- `FileEdit(/.claude/**)` — 匹配 `.claude/` 目录下的所有文件编辑
- `Read(.env)` — 匹配读取 `.env` 文件
- `Agent(Explore)` — 匹配 Explore 子代理

**MCP 工具匹配**：规则引擎通过 `mcpInfoFromString()` 解析 MCP 工具的完全限定名（`mcp__server__tool`），支持服务器级通配（`mcp__server1__*`）。`getToolNameForPermissionCheck()` 处理 `CLAUDE_AGENT_SDK_MCP_NO_PREFIX` 模式下名称冲突的回避。

### 3.3 权限模式 (Permission Modes)

定义在 `src/utils/permissions/PermissionMode.ts`，Claude Code 支持以下权限模式：

| 模式 | 名称 | 行为 |
|------|------|------|
| `default` | 默认模式 | 标准交互式权限请求 |
| `plan` | 计划模式 | 仅允许读操作和计划文件写入 |
| `acceptEdits` | 接受编辑 | 允许对安全路径的写操作（不提示） |
| `bypassPermissions` | 绕过权限 | 允许所有操作（YOLO 模式） |
| `dontAsk` | 不询问 | 拒绝所有需要权限的操作 |
| `auto` | 自动模式 | 使用 AI 分类器自动决策（ant-only） |

**自动模式（auto）**：仅限 Anthropic 内部使用的特性，通过 `TRANSCRIPT_CLASSIFIER` 构建标志启用。使用 AI 分类器（`classifyYoloAction`）自动评估操作安全性的流程：

1. 跳过安全允许列表中的工具（`isAutoModeAllowlistedTool`）
2. 检查 `acceptEdits` 快速路径
3. 调用 `classifyYoloAction` 分类器
4. 根据分类决策允许/阻断操作
5. 跟踪连续拒绝次数（最多 3 次连续或 20 次总计后回退到人工确认）

```typescript
if (classifierResult.shouldBlock) {
  const newDenialState = recordDenial(denialState)
  if (shouldFallbackToPrompting(newDenialState)) {
    // 超过拒绝限制，回退到用户提示
    return handleDenialLimitExceeded(newDenialState, ...)
  }
  return {
    behavior: 'deny',
    decisionReason: { type: 'classifier', classifier: 'auto-mode', reason: classifierResult.reason },
    message: buildYoloRejectionMessage(classifierResult.reason),
  }
}
```

**自动模式危险权限剥离**：`stripDangerousPermissionsForAutoMode()` 自动移除会绕过分类器的权限规则，包括：
- `Bash(*)` — 允许所有 Bash 命令
- `Bash(python:*)` — 允许任意 Python 代码
- `Bash(python*)` — 通配匹配 Python 解释器
- `Agent(*)` — 允许所有子代理
- `PowerShell(iex)` — 允许表达式求值

退出自动模式时通过 `restoreDangerousPermissions()` 恢复这些规则。

### 3.4 YOLO 模式（绕过权限）

`bypassPermissions` 模式（俗称 YOLO 模式）在流水线的 2a 步骤生效：

```typescript
const shouldBypassPermissions =
  appState.toolPermissionContext.mode === 'bypassPermissions' ||
  (appState.toolPermissionContext.mode === 'plan' &&
    appState.toolPermissionContext.isBypassPermissionsModeAvailable)

if (shouldBypassPermissions) {
  return {
    behavior: 'allow',
    updatedInput: getUpdatedInputOrFallback(toolPermissionResult, input),
    decisionReason: { type: 'mode', mode: appState.toolPermissionContext.mode },
  }
}
```

**YOLO 不可越过的安全检查**：即使绕过模式开启，以下检查仍然强制执行：
- **1g. 安全检查**：`.git/`、`.claude/`、`.vscode/`、shell 配置文件等危险路径的编辑
- **1f. 内容 ask 规则**：用户显式设置了 ask 行为的规则
- **1e. 用户交互**：需要用户交互的工具（如浏览器、对话框）

**禁用 YOLO**：`initialPermissionModeFromCLI()` 检查 `tengu_disable_bypass_permissions_mode` 门控和 `settings.permissions.disableBypassPermissionsMode` 设置，可禁用 YOLO 模式。

### 3.5 文件系统权限执行

**代码位置**：`src/utils/permissions/filesystem.ts`

**读权限检查**（`checkReadPermissionForTool`）- 12 步流水线：

1. **UNC 路径阻断**：检测 `\\` 或 `//` 开头的网络路径
2. **可疑 Windows 路径检测**：NTFS 备用数据流、8.3 短名、长路径前缀、尾随点/空格、DOS 设备名、连续点号（`...`）、UNC 路径
3. **读 deny 规则**：显式拒绝特定路径的读取
4. **读 ask 规则**：显式要求确认的读取路径
5. **编辑权限隐式允许读**：若有编辑权限，自动允许读取
6. **工作目录内读取允许**：在允许的工作目录内自动允许
7. **内部路径读取允许**：会话内存、计划文件、工具结果目录
8. **读取 allow 规则**：显式允许的读取路径

**写权限检查**（`checkWritePermissionForTool`）：

1. **写 deny 规则**：拒绝匹配路径的写入
2. **内部可编辑路径**：计划文件、临时目录
3. **`.claude/` 会话级规则**：允许会话级规则绕过 `.claude/` 安全块
4. **综合安全检查**（`checkPathSafetyForAutoEdit`）：Windows 路径模式、Claude 配置、危险文件
5. **写 allow 规则**：路径允许规则
6. **工作目录写入允许**：允许的工作目录内写入
7. **默认 ask**：回退到用户确认

**危险文件保护**（`isDangerousFilePathToAutoEdit`）：
- `.gitconfig`、`.gitmodules`、`.bashrc`、`.zshrc`、`.profile` 等配置文件
- `.git/`、`.vscode/`、`.idea/`、`.claude/` 目录
- UNC 路径

**Claude 设置文件保护**（`isClaudeSettingsPath`）：
- 大小写不敏感的比较，防止 `./.cLauDe/Settings.locaL.json` 等绕过
- `.claude/settings.json`、`.claude/settings.local.json`
- `.claude/commands/`、`.claude/agents/`、`.claude/skills/` 目录

**路径归一化**：多个函数处理跨平台路径一致性问题：
- `normalizeCaseForComparison`：防止大小写差异绕过
- `relativePath`：跨平台 POSIX 风格相对路径
- `toPosixPath`：Windows 路径转换
- `expandPath` + `normalize`：解析 `..` 段，防止目录遍历

### 3.6 权限设置向导

**代码位置**：`src/utils/permissions/permissionSetup.ts`

**初始化流程**（`initialPermissionModeFromCLI`）：解析 CLI 标志和设置，确定初始权限模式，优先级顺序为：
1. `--dangerously-skip-permissions` → `bypassPermissions`
2. `--permission-mode <mode>` → 指定模式
3. `settings.permissions.defaultMode` → 设置中配置的默认模式
4. 默认 → `default` 模式

**模式切换**（`transitionPermissionMode`）：统一处理所有模式切换的副作用：

```typescript
export function transitionPermissionMode(fromMode, toMode, context): ToolPermissionContext {
  handlePlanModeTransition(fromMode, toMode)
  handleAutoModeTransition(fromMode, toMode)
  // Plan 模式进入/退出
  // Auto 模式 → 剥离危险权限 / 恢复危险权限
  if (toUsesClassifier && !fromUsesClassifier) {
    autoModeStateModule?.setAutoModeActive(true)
    context = stripDangerousPermissionsForAutoMode(context)
  } else if (fromUsesClassifier && !toUsesClassifier) {
    autoModeStateModule?.setAutoModeActive(false)
    setNeedsAutoModeExitAttachment(true)
    context = restoreDangerousPermissions(context)
  }
  return context
}
```

**危险权限警告**：`findDangerousClassifierPermissions()` 扫描所有启用的设置源和 CLI 参数，识别所有会绕过分类器的权限规则（Bash 通配、解释器模式、Agent 规则），在进入自动模式前给出警告。

### 3.7 拒绝跟踪与策略限制

**代码位置**：`src/utils/permissions/denialTracking.ts`

```typescript
export const DENIAL_LIMITS = {
  maxConsecutive: 3,   // 最大连续拒绝次数
  maxTotal: 20,        // 最大总拒绝次数
} as const
```

`DenialTrackingState` 跟踪 `consecutiveDenials`（连续拒绝）和 `totalDenials`（总拒绝数）。当超过任一限制时，`shouldFallbackToPrompting()` 返回 true，系统回退到用户提示。

在无头模式（headless）下，超过限制会导致 `AbortError` 抛出：

```typescript
if (isHeadless) {
  throw new AbortError('Agent aborted: too many classifier denials in headless mode')
}
```

**策略限制集成**（`permissionsLoader.ts`）：

- **`allowManagedPermissionRulesOnly`**：在 `managed-settings.json`（策略设置）中启用时，仅使用受管权限规则，忽略用户设置中的权限规则
- **`shouldShowAlwaysAllowOptions()`**：当启用受管规则时，隐藏权限提示中的"始终允许"选项

### 3.8 权限规则的 Gitignore 模式匹配

文件路径权限规则使用 `ignore` 库进行 gitignore 风格的模式匹配，通过 `matchingRuleForInput()` 函数实现。模式根路径系统支持：

- **`//` 前缀** → 匹配根目录 `/`
- **`~/` 前缀** → 匹配用户主目录
- **`/` 前缀** → 匹配当前设置源根目录
- **无前缀** → 任意位置匹配

模式通过 `patternWithRoot()` 函数解析，并由 `normalizePatternsToPath()` 归一化为相对于设置源根目录的路径。

### 3.9 范围限定的技能权限

`getClaudeSkillScope()` 函数检测文件是否在 `.claude/skills/{name}/` 目录内（项目级或全局），如果是则返回技能名称和路径模式。这使得权限对话框可以提供"仅允许编辑此技能"的细化选项，避免需要授予对整个 `.claude/` 目录的访问权限。

---

## 四、系统交互与数据流

### 4.1 认证→配置→权限的联动

三个系统的交互在启动流程中紧密关联：

1. **启动阶段**：`getGlobalConfig()` 加载全局配置，触发令牌读取
2. **认证阶段**：`isAnthropicAuthEnabled()` 根据配置和设置判断是否启用 OAuth
3. **权限初始化**：`initialPermissionModeFromCLI()` 读取 CLI 标志和设置，结合 GrowthBook 特性标志确定初始权限模式
4. **运行阶段**：每次工具调用触发 `hasPermissionsToUseTool()`，该函数同时使用配置中的权限规则和认证状态

### 4.2 特性标志对认证的影响

GrowthBook 特性标志（如 `tengu_disable_bypass_permissions_mode`）可以动态禁用特性，而构建时 `feature()` 标志（如 `TRANSCRIPT_CLASSIFIER`）则在编译时决定代码是否包含。认证配置同时受两者影响：

```typescript
// 自动模式仅在构建时启用了分类器时才可用
const autoModeStateModule = feature('TRANSCRIPT_CLASSIFIER')
  ? require('./autoModeState.js')
  : null
```

### 4.3 安全保证层级

```
┌─────────────────────────────────────────┐
│          bypassPermissions 模式           │  ← 零信任
│   ┌───────────────────────────────────┐  │
│   │       YOLO 不可越过的安全检查        │  │  ← 强制扫描
│   │   (.git/ .bashrc 等危险路径)        │  │
│   │   ┌─────────────────────────────┐  │  │
│   │   │    工具级权限规则             │  │  │  ← 可配置规则
│   │   │    (allow/deny/ask)         │  │  │
│   │   │   ┌───────────────────────┐  │  │  │
│   │   │   │  文件系统路径检查       │  │  │  │  ← 路径级别
│   │   │   │  (UNC/Windows/遍历)    │  │  │  │
│   │   │   │ ┌─────────────────────┐│  │  │  │
│   │   │   │ │  AI 分类器 (auto)   ││  │  │  │  ← 自动模式
│   │   │   │ └─────────────────────┘│  │  │  │
│   │   │   └───────────────────────┘  │  │  │
│   │   └─────────────────────────────┘  │  │
│   └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

---

## 五、关键架构决策与设计模式

1. **分层覆盖模型**：配置系统采用类似 CSS 的特定性层次结构，策略设置覆盖一切，用户设置是最低优先级。这允许管理者通过 `policySettings` 强制执行安全基线。

2. **穿透写缓存**：全局配置使用写穿透策略，每次写入立即更新内存缓存，而其他进程的写入通过文件监视器异步发现。mtime 溢出保证避免自身写入的重复处理。

3. **OS 原生密钥链优先**：API Key 存储优先使用 macOS Keychain，hex 编码避免命令行参数泄露，仅当密钥链不可用时才回退到配置文件。

4. **安全边界模式（bare mode）**：`--bare` 标志创建完全隔离的认证环境，仅允许 `ANTHROPIC_API_KEY` 环境变量或 `--settings` 标志中的 `apiKeyHelper`，禁用所有 OAuth 和密钥链功能。

5. **跨平台路径安全**：文件系统权限函数统一处理 macOS/Linux/Windows/WSL 路径差异，大小写归一化防止非敏感文件系统上的安全检查绕过。

6. **安全分析的快速路径**：自动模式中，`acceptEdits` 快速路径和允许列表提供了免分类器的安全操作处理，减少延迟和 API 调用成本。安全操作（如工作目录内文件编辑）无需 AI 分类器评估。

7. **反认证丢失保护**：`wouldLoseAuthState` 检查防止损坏的配置文件覆盖有效认证状态，是 GitHub issue #3117 修复的关键组成部分。

8. **模式切换的事务性**：`transitionPermissionMode` 统一处理所有模式切换的副作用（Plan 模式附加信息、Auto 模式危险权限剥离/恢复），确保所有进入路径行为一致。

---

## 六、统计信息

- **`utils/config.ts`**：1817 行，定义了 `GlobalConfig` 接口（100+ 字段）、`ProjectConfig` 接口、配置读写缓存逻辑
- **`utils/auth.ts`**：2002 行，实现 OAuth 令牌管理、API Key 管理、AWS/GCP 认证集成
- **`utils/permissions/permissions.ts`**：1486 行，实现核心权限决策流水线
- **`utils/permissions/filesystem.ts`**：1777 行，实现文件系统级别的读写权限检查
- **`utils/permissions/permissionSetup.ts`**：1532 行，实现权限模式切换、向导流程
- **`utils/permissions/denialTracking.ts`**：46 行，精简的拒绝跟踪实现
- **`utils/settings/constants.ts`**：定义了 5 种设置源
- **`services/oauth/index.ts`**：完整的 PKCE 授权码流实现
