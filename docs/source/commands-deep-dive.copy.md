# Commands Deep Dive

> Analysis of the Claude Code command system — the registration mechanism, the `Command` type hierarchy, the 4-pipeline loading architecture, conditional loading, DCE placeholder patterns, and the command/tool boundary.

---

## Overview

Claude Code's command system is the bridge between the user's keyboard and the REPL's internal action dispatcher. Every slash command a user types (`/help`, `/commit`, `/compact`, `/mcp`, `/plugin`, etc.) flows through the registry defined in `src/commands.ts` and its associated type system in `src/types/command.ts`. Together these files define over 100 commands spanning simple text output, full-screen Ink-based dialogs, and model-invokable prompts.

The system is architected around three pillars:

1. **Lazy-loading**: every command module is imported on-demand, not at startup.
2. **Four distinct loading pipelines**: built-in commands, bundled skills, disk-based skills, and plugin/MCP skills.
3. **Multi-layered gating**: feature flags (`bun:bundle` compile-time elimination), runtime `isEnabled()` checks, and `availability` auth gates.

---

## The `Command` Type Hierarchy

Defined in `src/types/command.ts`, the `Command` union type is the central abstraction:

```typescript
export type Command = CommandBase & (PromptCommand | LocalCommand | LocalJSXCommand)
```

Every command must implement `CommandBase`, which provides the metadata:

| Property | Type | Purpose |
|---|---|---|
| `name` | `string` | Unique identifier (the `/name` users type) |
| `description` | `string` | Shown in typeahead, help, and skill menus |
| `aliases?` | `string[]` | Alternative names (e.g., `config` also matches `/settings`) |
| `isEnabled?` | `() => boolean` | Runtime gating; defaults to always-enabled |
| `isHidden?` | `boolean` | Suppresses from typeahead/help while keeping the command functional |
| `availability?` | `CommandAvailability[]` | Auth-provider gating (`'claude-ai'` / `'console'`) |
| `type` | `'prompt' \| 'local' \| 'local-jsx'` | Discriminant selecting which execution path to follow |
| `load?` | `() => Promise<...>` | Lazy-loads the implementation (only for `local` / `local-jsx`) |
| `argumentHint?` | `string` | Gray hint text in the typeahead |
| `immediate?` | `boolean` | Bypasses the command queue for urgent commands like `/exit` |
| `loadedFrom?` | `'skills' \| 'plugin' \| 'bundled' \| 'mcp' \| ...` | Tracks provenance for filtering |

### Three Command Types

**`PromptCommand`** — the most common type. The command's `getPromptForCommand(args, context)` returns `ContentBlockParam[]` that gets injected into the conversation as a synthetic user message. The model processes it and responds. Used for `/commit`, `/review`, `/init`, `/security-review`, and all bundled/disk/plugin skills.

```typescript
type PromptCommand = {
  type: 'prompt'
  progressMessage: string
  contentLength: number
  argNames?: string[]
  allowedTools?: string[]       // Tool-call allowlist for this command
  model?: string                 // Model override
  source: SettingSource | 'builtin' | 'mcp' | 'plugin' | 'bundled'
  context?: 'inline' | 'fork'   // Run inline or as sub-agent
  agent?: string                 // Agent type for forked execution
  getPromptForCommand(args: string, context: ToolUseContext): Promise<ContentBlockParam[]>
}
```

**`LocalCommand`** — synchronous/side-effect commands that run in the REPL without a model round-trip. The `load()` function returns a `{ call }` module. Used for `/compact`, `/clear`, `/version`, `/copy`, `/cost`, `/stats`, `/rewind`.

```typescript
type LocalCommand = {
  type: 'local'
  supportsNonInteractive: boolean
  load: () => Promise<LocalCommandModule>  // { call: LocalCommandCall }
}
```

**`LocalJSXCommand`** — commands that render full-screen Ink React components. The `load()` function returns a `{ call }` module where `call(onDone, context, args)` returns a React node. Used for `/help`, `/config`, `/status`, `/session`, `/mcp`, `/plugin`, `/memory`, `/skills`, `/plan`, `/tasks`, `/doctor`, `/diff`, `/branch`, `/resume`.

```typescript
type LocalJSXCommand = {
  type: 'local-jsx'
  load: () => Promise<LocalJSXCommandModule>  // { call: LocalJSXCommandCall }
}
```

---

## The 4-Pipeline Loading Architecture

`src/commands.ts` orchestrates commands from four distinct sources, merged in order via the memoized `loadAllCommands(cwd)` function:

```
loadAllCommands(cwd)
  │
  ├── getSkills(cwd)
  │     ├── skillDirCommands    (disk skills from .claude/skills/ and CLAUDE.md dirs)
  │     ├── pluginSkills        (skills provided by installed plugins)
  │     ├── bundledSkills       (skills compiled into the binary via registerBundledSkill)
  │     └── builtinPluginSkills (built-in plugin commands)
  │
  ├── pluginCommands            (plugin-provided slash commands, not skills)
  ├── workflowCommands          (WorkflowTool scripts, gated by WORKFLOW_SCRIPTS feature flag)
  └── COMMANDS()                (hard-coded built-in commands from the memoized array)
```

**Pipeline 1 — Built-in Commands (`COMMANDS()`):** A memoized array of ~80+ command definitions imported as ES module defaults at the top of `commands.ts`. Each is a plain object satisfying the `Command` type. These are the traditional slash commands: `help`, `clear`, `commit`, `diff`, `config`, `mcp`, `plugin`, etc.

**Pipeline 2 — Bundled Skills (`getBundledSkills()`):** Skills that ship inside the CLI binary, registered programmatically via `registerBundledSkill()` in `src/skills/bundledSkills.ts`. The function wraps each definition into a full `Command` object with `type: 'prompt'`, `source: 'bundled'`, and `loadedFrom: 'bundled'`. Bundled skills also support inline reference files that are lazily extracted to disk on first invocation.

**Pipeline 3 — Disk Skills (`getSkillDirCommands(cwd)`):** User-authored `.claude/skills/<name>/SKILL.md` files and legacy `.claude/commands/` entries. Loaded by `src/skills/loadSkillsDir.ts` which walks project directories, parses YAML frontmatter, and constructs `PromptCommand` objects with `loadedFrom: 'skills'` or `'commands_DEPRECATED'`.

**Pipeline 4 — Plugin & MCP Skills:** Plugin commands come from two sub-pipelines — `getPluginCommands()` for slash commands and `getPluginSkills()` for prompt-type skills, both loaded via `src/utils/plugins/loadPluginCommands.ts`. MCP skills are handled separately in `getMcpSkillCommands()` which filters `AppState.mcp.commands` for prompt-type, MCP-loaded commands.

---

## Conditional Command Loading

Claude Code uses several gating strategies to conditionally include commands:

### 1. Build-time Dead Code Elimination (`feature()` from `bun:bundle`)

The `feature()` function is a compile-time macro that returns a boolean based on a build-time feature definition. Commands wrapped in `if (feature('X'))` are either included or completely eliminated by the bundler:

```typescript
const voiceCommand = feature('VOICE_MODE')
  ? require('./commands/voice/index.js').default
  : null

const bridge = feature('BRIDGE_MODE')
  ? require('./commands/bridge/index.js').default
  : null
```

Feature flags used include: `PROACTIVE`, `KAIROS`, `KAIROS_BRIEF`, `BRIDGE_MODE`, `DAEMON`, `VOICE_MODE`, `HISTORY_SNIP`, `WORKFLOW_SCRIPTS`, `CCR_REMOTE_SETUP`, `EXPERIMENTAL_SKILL_SEARCH`, `KAIROS_GITHUB_WEBHOOKS`, `ULTRAPLAN`, `TORCH`, `UDS_INBOX`, `FORK_SUBAGENT`, `BUDDY`, `REACTIVE_COMPACT`, `CONTEXT_COLLAPSE`, `MCP_SKILLS`, `NEW_INIT`.

### 2. Runtime `isEnabled()` Gates

Commands can declare an `isEnabled` function for runtime checks:

```typescript
// compact.ts index
const compact = {
  isEnabled: () => !isEnvTruthy(process.env.DISABLE_COMPACT),
  // ...
}

// doctor/index.ts
const doctor: Command = {
  isEnabled: () => !isEnvTruthy(process.env.DISABLE_DOCTOR_COMMAND),
  // ...
}

// thinkback/index.ts
const thinkback = {
  isEnabled: () => checkStatsigFeatureGate_CACHED_MAY_BE_STALE('tengu_thinkback'),
  // ...
}
```

### 3. Auth-based `availability` Gates

Commands can declare `availability` to restrict by auth provider:

```typescript
// From commands.ts meetsAvailabilityRequirement()
export function meetsAvailabilityRequirement(cmd: Command): boolean {
  if (!cmd.availability) return true
  for (const a of cmd.availability) {
    switch (a) {
      case 'claude-ai':
        if (isClaudeAISubscriber()) return true
        break
      case 'console':
        if (!isClaudeAISubscriber() && !isUsing3PServices() && isFirstPartyAnthropicBaseUrl())
          return true
        break
    }
  }
  return false
}
```

### 4. USER_TYPE Environment Variable

Commands can gate on `process.env.USER_TYPE === 'ant'` for internal-only features:

```typescript
// Only Ants can see the version command
const version = {
  isEnabled: () => process.env.USER_TYPE === 'ant',
  // ...
}

// The INTERNAL_ONLY_COMMANDS array is only spread in for Ant builds
...(process.env.USER_TYPE === 'ant' && !process.env.IS_DEMO
  ? INTERNAL_ONLY_COMMANDS
  : []),
```

### 5. Dynamic Auth-State Re-evaluation

Unlike memoized loading, `meetsAvailabilityRequirement()` and `isCommandEnabled()` are re-evaluated on every `getCommands()` call so auth changes like `/login` take effect immediately:

```typescript
export async function getCommands(cwd: string): Promise<Command[]> {
  const allCommands = await loadAllCommands(cwd)
  const baseCommands = allCommands.filter(
    _ => meetsAvailabilityRequirement(_) && isCommandEnabled(_),
  )
  // ...dynamic skills dedup
}
```

---

## DCE Placeholder Pattern (`index.js` / `index.ts`)

Every directory-based command follows a consistent two-file pattern: an `index.ts` registration shim and a separate implementation file (e.g., `help.tsx`, `clear.ts`, `mcp.js`). The index file is deliberately tiny — it only declares the `Command` metadata and a `load()` function that lazily imports the heavy implementation:

```typescript
// src/commands/clear/index.ts
const clear = {
  type: 'local',
  name: 'clear',
  description: 'Clear conversation history and free up context',
  aliases: ['reset', 'new'],
  supportsNonInteractive: false,
  load: () => import('./clear.js'),    // <-- lazy import
} satisfies Command
```

```typescript
// src/commands/help/index.ts
const help = {
  type: 'local-jsx',
  name: 'help',
  description: 'Show help and available commands',
  load: () => import('./help.js'),      // <-- lazy import
} satisfies Command
```

This pattern allows the bundler to split the implementation into separate chunks and only load them when first invoked. The index file is what `commands.ts` imports statically — the heavy React component trees (e.g., `Settings`, `MCPSettings`, `SkillsMenu`, `MemoryFileSelector`) are never loaded at startup.

For non-internal commands that go through `require()` (not static `import`), the same principle applies but with `null` as the fallback:

```typescript
const proactive =
  feature('PROACTIVE') || feature('KAIROS')
    ? require('./commands/proactive.js').default
    : null
```

---

## Command → Tool Boundary and Overlap

Commands and tools operate at different layers of the architecture but share some conceptual overlap:

| Layer | Purpose | Invoked by | Responsible |
|---|---|---|---|
| **Commands** | User-facing slash commands | User typing `/name` in REPL | `commands.ts` → `processSlashCommand()` |
| **Tools** | Model-facing capabilities | AI model during response generation | `Tool.ts` + tool implementations |
| **Skills** | Both — prompt-type commands AND model-usable tools | User `/name` + model tool calls | Both systems |

The key intersecting point is **skills**. Prompt-type commands with `loadedFrom: 'skills' | 'plugin' | 'bundled'` appear in both registries:
- As user-facing commands (in the typeahead, via `getCommands()`)
- As model-facing tools (via `getSkillToolCommands()` and `getSlashCommandToolSkills()`)

The filtering in `getSkillToolCommands()` ensures only commands with proper descriptions appear as model tools:

```typescript
export const getSkillToolCommands = memoize(async (cwd: string): Promise<Command[]> => {
  const allCommands = await getCommands(cwd)
  return allCommands.filter(
    cmd =>
      cmd.type === 'prompt' &&
      !cmd.disableModelInvocation &&
      cmd.source !== 'builtin' &&
      (cmd.loadedFrom === 'bundled' ||
        cmd.loadedFrom === 'skills' ||
        cmd.loadedFrom === 'commands_DEPRECATED' ||
        cmd.hasUserSpecifiedDescription ||
        cmd.whenToUse),
  )
})
```

---

## Command Execution Context

Every command receives a `ToolUseContext` (and for JSX commands, a `LocalJSXCommandContext`) that provides access to the full REPL state:

```typescript
export type LocalJSXCommandContext = ToolUseContext & {
  canUseTool?: CanUseToolFn
  setMessages: (updater: (prev: Message[]) => Message[]) => void
  options: {
    dynamicMcpConfig?: Record<string, ScopedMcpServerConfig>
    ideInstallationStatus: IDEExtensionInstallationStatus | null
    theme: ThemeName
  }
  onChangeAPIKey: () => void
  onChangeDynamicMcpConfig?: (config: Record<string, ScopedMcpServerConfig>) => void
  onInstallIDEExtension?: (ide: IdeType) => void
  resume?: (sessionId: UUID, log: LogOption, entrypoint: ResumeEntrypoint) => Promise<void>
}
```

Local commands (non-JSX) receive a simpler `LocalJSXCommandContext` and return a `LocalCommandResult`:

```typescript
type LocalCommandResult =
  | { type: 'text'; value: string }
  | { type: 'compact'; compactionResult: CompactionResult; displayText?: string }
  | { type: 'skip' }
```

The `onDone` callback pattern is critical for JSX commands — it signals completion to the REPL and can carry optional display metadata:

```typescript
type LocalJSXCommandOnDone = (
  result?: string,
  options?: {
    display?: CommandResultDisplay  // 'skip' | 'system' | 'user'
    shouldQuery?: boolean            // Send to model after command completes
    metaMessages?: string[]
    nextInput?: string
    submitNextInput?: boolean
  },
) => void
```

---

## Key Code Patterns

### Pattern 1: The Two-File Command Module

Every directory-based command follows this exact structure:

```
commands/<name>/
  index.ts       — Minimal Command metadata object with load()
  <name>.tsx     — Implementation exporting { call }
```

Commands with no subdirectory (single-file) export the Command object directly:

```
commands/commit.ts       — exports default command
commands/review.ts       — exports default review + named ultrareview
commands/security-review.ts
commands/init.ts
commands/version.ts
```

### Pattern 2: Prompt-as-Command (the "Skill" Pattern)

Prompt-type commands define `getPromptForCommand()` which constructs the content blocks to inject:

```typescript
// commit.ts — a built-in prompt command
const command = {
  type: 'prompt',
  name: 'commit',
  description: 'Create a git commit',
  allowedTools: ALLOWED_TOOLS,
  contentLength: 0,
  progressMessage: 'creating commit',
  source: 'builtin',
  async getPromptForCommand(_args, context) {
    const promptContent = getPromptContent()
    const finalContent = await executeShellCommandsInPrompt(promptContent, context, '/commit')
    return [{ type: 'text', text: finalContent }]
  },
} satisfies Command
```

### Pattern 3: JSX Dialog Command

JSX commands render full-screen Ink components and use the `onDone` pattern:

```typescript
// config/config.tsx
export const call: LocalJSXCommandCall = async (onDone, context) => {
  return <Settings onClose={onDone} context={context} defaultTab="Config" />
}
```

### Pattern 4: Local Side-Effect Command

Local commands perform operations and return a result:

```typescript
// clear/clear.ts
export const call: LocalCommandCall = async (_, context) => {
  await clearConversation(context)
  return { type: 'text', value: '' }
}
```

### Pattern 5: Feature-Gated Dynamic Import

Critical for enabling external-only builds to tree-shake internal features:

```typescript
const torch = feature('TORCH') ? require('./commands/torch.js').default : null
// ...later spread into COMMANDS array:
...(torch ? [torch] : []),
```

### Pattern 6: Command Argument Routing

Some commands parse arguments for sub-commands (e.g., `/mcp enable <server>`):

```typescript
// mcp/mcp.tsx — argument-based sub-command routing
if (parts[0] === 'enable' || parts[0] === 'disable') {
  return <MCPToggle action={parts[0]} target={parts.length > 1 ? parts.slice(1).join(' ') : 'all'} onComplete={onDone} />
}
if (parts[0] === 'reconnect' && parts[1]) {
  return <MCPReconnect serverName={parts.slice(1).join(' ')} onComplete={onDone} />
}
```

### Pattern 7: Remote/Bridge Safety

Commands declare their safety for remote execution via two allowlists:

```typescript
export const REMOTE_SAFE_COMMANDS: Set<Command> = new Set([
  session, exit, clear, help, theme, color, vim, cost, usage, copy, btw, feedback, plan, keybindings, statusline, stickers, mobile,
])

export const BRIDGE_SAFE_COMMANDS: Set<Command> = new Set([
  compact, clear, cost, summary, releaseNotes, files,
])
```

---

## Command Registration Statistics

Based on analysis of `src/commands.ts`:

| Category | Count | Examples |
|---|---|---|
| Always-loaded built-in commands | ~80 | `help`, `clear`, `config`, `mcp`, `commit`, `diff` |
| Feature-gated commands | ~15 | `voiceCommand`, `bridge`, `workflowsCmd`, `torch`, `buddy` |
| Internal-only commands | ~25 | `version`, `breakCache`, `bughunter`, `antTrace`, `perfIssue` |
| **Total in COMMANDS()** | **~102+** | |

Plus dynamically loaded sources:
- Bundled skills: variable (compiled-in)
- Disk skills: user-dependent (from `.claude/skills/`)
- Plugin skills: user-dependent (from installed plugins)
- Workflow commands: user-dependent (from WorkflowTool scripts)

---

## Summary

The Claude Code command system is a sophisticated, layered architecture designed for minimal startup cost and maximum flexibility. The three-tier command type system (`prompt` / `local` / `local-jsx`) cleanly separates concerns between model-invokable prompts, side-effect operations, and full-screen UI dialogs. The 4-pipeline loading architecture merges commands from built-in definitions, compiled-in bundled skills, user-authored disk skills, and plugin/MCP ecosystems. Multi-layered gating through build-time `feature()` flags, runtime `isEnabled()` checks, and auth-based `availability` constraints ensures that every user sees only the commands relevant to their environment and plan tier.
