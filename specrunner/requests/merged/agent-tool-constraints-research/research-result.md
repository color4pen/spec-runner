# Agent Tool Constraints Research Result

## SDK バージョン

- `@anthropic-ai/claude-agent-sdk`: 0.2.128
- `@anthropic-ai/sdk`: 0.91.1

---

## 1. Claude Code SDK (`@anthropic-ai/claude-agent-sdk`) の調査

### 1.1 tool 制約関連フィールド

`sdk.d.ts` の `Options` 型（runAgent/query の第2引数）に以下の3フィールドが存在する:

```typescript
// Options 型 (lines 1183-1219)
allowedTools?: string[];
// 権限プロンプトなしで自動実行される tools のリスト。
// ツールの利用可否制御ではなく「承認プロンプトをスキップする」フィールド。
// 制限には tools オプションを使うことが推奨されている。

disallowedTools?: string[];
// モデルのコンテキストから完全に除外される tools のリスト。
// 指定したツールは利用不可になる。

tools?: string[] | { type: 'preset'; preset: 'claude_code' };
// 利用可能な built-in tools のベースセット。
// - string[]: 特定ツール名の配列 (例: ['Read', 'Grep', 'Glob'])
// - []: 全 built-in tools を無効化
// - { type: 'preset', preset: 'claude_code' }: デフォルトの Claude Code tools 全体
```

`SubagentOptions` 型（AgentDefinition レベル）にも同様のフィールドが存在する:

```typescript
// SubagentOptions (lines 40-50)
tools?: string[];          // 利用可能ツールの上書き（親から継承しない場合）
disallowedTools?: string[]; // 明示的に禁止するツール
```

### 1.2 現在の ClaudeCodeRunner における使用状況

`src/adapter/claude-code/agent-runner.ts:131` で `allowedTools` を使用:

```typescript
options: {
  cwd,
  allowedTools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"],
  permissionMode: "bypassPermissions",
  ...maxTurnsOption,
  model: resolvedConfig.model,
},
```

現状: `allowedTools` を「承認プロンプトをスキップするリスト」として使用。全ツールを許可済みとして渡している。`disallowedTools` や `tools` は未使用。

### 1.3 reviewer 向け制約の実現方法

**方法A: `tools` で許可ツールを限定する（推奨）**

```typescript
options: {
  cwd,
  tools: ["Read", "Grep", "Glob"],  // Write/Edit/Bash を含めない
  allowedTools: ["Read", "Grep", "Glob"],  // 承認プロンプトもスキップ
  permissionMode: "bypassPermissions",
  model: resolvedConfig.model,
}
```

→ `tools` に含まれないツールはモデルのコンテキストに現れない。Write/Edit/Bash は使用不可になる。

**方法B: `disallowedTools` で禁止ツールを指定する**

```typescript
options: {
  cwd,
  disallowedTools: ["Write", "Edit", "Bash", "WebFetch", "WebSearch"],
  allowedTools: ["Read", "Grep", "Glob"],
  permissionMode: "bypassPermissions",
  model: resolvedConfig.model,
}
```

→ `disallowedTools` に指定したツールはコンテキストから削除される。ツールが増えたときに漏れが出るリスクがあるため、`tools` による明示的な許可リストの方が安全。

**結論**: Claude Code SDK では `tools: string[]` でツールを明示的に限定することで、reviewer に Read/Grep/Glob のみを許可することがネイティブに可能。

---

## 2. Managed Agents SDK (`@anthropic-ai/sdk`) の調査

### 2.1 agent 作成パラメータの tool 制約関連型

`resources/beta/agents/agents.d.ts` に以下の型が定義されている:

```typescript
// BetaManagedAgentsAgentToolset20260401Params (agent 作成時)
interface BetaManagedAgentsAgentToolset20260401Params {
  type: 'agent_toolset_20260401';
  configs?: Array<BetaManagedAgentsAgentToolConfigParams>;  // per-tool 設定
  default_config?: BetaManagedAgentsAgentToolsetDefaultConfigParams | null;
}

// per-tool 設定
interface BetaManagedAgentsAgentToolConfigParams {
  name: 'bash' | 'edit' | 'read' | 'write' | 'glob' | 'grep' | 'web_fetch' | 'web_search';
  enabled?: boolean | null;  // false にすると無効化
  permission_policy?: BetaManagedAgentsAlwaysAllowPolicy | BetaManagedAgentsAlwaysAskPolicy | null;
}

// デフォルト設定（全ツールへの一括制御）
interface BetaManagedAgentsAgentToolsetDefaultConfigParams {
  enabled?: boolean | null;  // false にすると全ツール無効化
  permission_policy?: BetaManagedAgentsAlwaysAllowPolicy | BetaManagedAgentsAlwaysAskPolicy | null;
}
```

### 2.2 `agent_toolset_20260401` のサブセット指定

`configs` + `enabled: false` でサブセット指定が可能。以下の2パターンが使える:

**パターン1: デフォルト全無効 + 個別有効化（許可リスト方式・推奨）**

```typescript
{
  type: 'agent_toolset_20260401',
  default_config: { enabled: false },  // 全ツール無効
  configs: [
    { name: 'read', enabled: true, permission_policy: { type: 'always_allow' } },
    { name: 'grep', enabled: true, permission_policy: { type: 'always_allow' } },
    { name: 'glob', enabled: true, permission_policy: { type: 'always_allow' } },
  ]
}
```

**パターン2: デフォルト全有効 + 個別無効化（禁止リスト方式）**

```typescript
{
  type: 'agent_toolset_20260401',
  configs: [
    { name: 'bash', enabled: false },
    { name: 'edit', enabled: false },
    { name: 'write', enabled: false },
  ]
}
```

### 2.3 現在の `toSdkTool()` 実装の確認

`src/adapter/managed-agent/anthropic-client.ts` の `toSdkTool()`:

```typescript
function toSdkTool(spec: ToolSpec): Record<string, unknown> {
  if (spec.type === AGENT_TOOLSET_TYPE) {
    return { type: spec.type };  // configs を渡していない
  }
  // custom tool ...
}
```

現状: `{ type: 'agent_toolset_20260401' }` のみを渡しており、`configs` も `default_config` も未設定。全ツールがデフォルト有効の状態。

---

## 3. 比較表

| 観点 | Claude Code SDK | Managed Agents SDK |
|------|----------------|-------------------|
| **制約方式** | `tools: string[]`（許可リスト）または `disallowedTools: string[]`（禁止リスト） | `configs[].enabled: boolean`（per-tool）+ `default_config.enabled`（一括） |
| **設定タイミング** | query/runAgent 呼び出し時（実行ごと） | agent 作成時（永続的）または run 起動時 |
| **ツール名の形式** | PascalCase: `"Read"`, `"Write"`, `"Bash"` | lowercase: `"read"`, `"write"`, `"bash"` |
| **MCP tools 対応** | `McpServerToolPolicy` / server ごとの `tools` フィールドで制御可能 | `BetaManagedAgentsMCPToolConfigParams` で per-tool 制御可能 |
| **許可リスト方式** | `tools: ["Read", "Grep", "Glob"]` | `default_config: { enabled: false }` + configs で有効化 |
| **禁止リスト方式** | `disallowedTools: ["Write", "Edit", "Bash"]` | configs で `enabled: false` を個別指定 |
| **実装コスト** | 低：`options` に1フィールド追加 | 中：`AgentToolsetSpec` に `configs` を追加し adapter で変換 |

---

## 4. 結論と設計案

### 結論

**両 SDK ともネイティブにツール制約が可能。** システムプロンプト指示は補完手段として有効だが、構造的な制約（ツール定義をコンテキストから削除）の代替にはならない。

### 設計案: `AgentDefinition` に `allowedTools` フィールドを追加

`src/core/agent/definition.ts` に `allowedTools` フィールドを追加し、各アダプタが runtime 固有の形式に変換する:

```typescript
// src/core/agent/definition.ts
export interface AgentDefinition {
  readonly name: string;
  readonly role: StepName;
  readonly model: string;
  readonly system: string;
  readonly tools: ToolSpec[];
  readonly capabilities?: AgentCapabilities;
  /**
   * Restrict which built-in tools the agent can use.
   * If omitted, all tools are available (current behavior).
   * Tool names use the Claude Code SDK convention (PascalCase).
   * Adapter layer converts to runtime-specific format.
   *
   * Examples:
   *   reviewer: ["Read", "Grep", "Glob"]
   *   implementer/fixer: omit (full access)
   */
  readonly allowedTools?: readonly string[];
}
```

#### Claude Code アダプタ側の変換 (`agent-runner.ts`)

```typescript
const toolOptions = agentDef.allowedTools
  ? {
      tools: [...agentDef.allowedTools],        // コンテキストから除外
      allowedTools: [...agentDef.allowedTools], // 承認プロンプトもスキップ
    }
  : {
      allowedTools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"],
    };

options: {
  cwd,
  ...toolOptions,
  permissionMode: "bypassPermissions",
  model: resolvedConfig.model,
}
```

#### Managed Agents アダプタ側の変換 (`anthropic-client.ts`)

```typescript
function toSdkToolset(spec: AgentToolsetSpec, allowedTools?: readonly string[]): Record<string, unknown> {
  const ALL_TOOLS = ['bash', 'edit', 'read', 'write', 'glob', 'grep', 'web_fetch', 'web_search'] as const;

  if (!allowedTools) {
    return { type: spec.type };  // 現状維持
  }

  const allowedLower = new Set(allowedTools.map(t => t.toLowerCase()));
  return {
    type: spec.type,
    default_config: { enabled: false },
    configs: ALL_TOOLS
      .filter(name => allowedLower.has(name))
      .map(name => ({
        name,
        enabled: true,
        permission_policy: { type: 'always_allow' },
      })),
  };
}
```

### ロール別プリセット

```typescript
export const TOOL_PRESETS = {
  reviewer: ["Read", "Grep", "Glob"] as const,
  implementer: undefined,  // 全ツール（omit = full access）
  fixer: undefined,        // 全ツール（omit = full access）
} satisfies Record<string, readonly string[] | undefined>;
```

各 Step の `agent` 定義で:

```typescript
// 例: CodeReviewerStep
agent: {
  name: "specrunner-code-reviewer",
  role: "code-reviewer",
  model: DEFAULT_MODEL,
  system: CODE_REVIEWER_PROMPT,
  tools: [{ type: AGENT_TOOLSET_TYPE }],
  allowedTools: TOOL_PRESETS.reviewer,
} satisfies AgentDefinition
```

---

## 5. 実装対象外の確認

本調査のスコープ外として以下を確認した:
- システムプロンプトでの `"Do NOT modify any source files"` 指示は現状維持（実装の判断は別 request）
- MCP tools の制約詳細設計は対象外
- テスト方法の検討は対象外
