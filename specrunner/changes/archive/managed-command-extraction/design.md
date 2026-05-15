# Design: managed-command-extraction

## Overview

`specrunner init` から managed runtime 固有のセットアップを切り出し、`specrunner managed` 親コマンド（setup / status / reset）を新設する。config から `anthropic` フィールドを削除し、API key を `SPECRUNNER_API_KEY` env var に一本化する。runtime デフォルトを `"local"` に反転する。

## D1: `managed` 親コマンド構造

`specrunner managed` を `ParentCommandDef` として `command-registry.ts` に追加する。サブコマンドは `setup` / `status` / `reset` の 3 つ。

```
specrunner managed setup   — idempotent reconciliation（AgentSyncer + Environment）
specrunner managed status  — config 状態の表示（API 通信なし）
specrunner managed reset   — Environment 削除 + config クリア
```

実装ファイル: `src/cli/managed.ts`（3 サブコマンドのハンドラを export）。

## D2: `managed setup` の処理フロー

既存 `init.ts` の managed パスをほぼそのまま移管する。差分は API key の取得元のみ。

```
1. process.env.SPECRUNNER_API_KEY を読む → 未設定なら early-fail
2. createAnthropicClient(apiKey) で SDK を生成
3. loadConfig() で既存 config を best-effort 読み込み
4. AgentRegistry.fromSteps([...]) でレジストリ構築
5. AgentSyncer(client, registry, storedConfig).syncAll()
6. Environment create/retrieve（既存 init のロジックをそのまま移管）
7. config に runtime: "managed", agents, environment を書き込み（apiKey は書き込まない）
8. saveConfig(newConfig)
```

失敗時の rollback（Environment 作成失敗時の agent archive）も既存 init から移管する。

## D3: `managed status` の出力

API 通信なしで以下を表示:

```
Runtime:     managed
Environment: env_xxxx (synced 2026-05-15T...)
Agents:
  design:       agent_xxx (synced ...)
  spec-review:  agent_xxx (synced ...)
  ...
API Key:     SPECRUNNER_API_KEY is set
```

config が local runtime の場合は `Runtime: local (managed setup not required)` を表示して終了。

## D4: `managed reset` の処理

1. 確認プロンプト（`--force` で skip）
2. `beta.environments.delete(config.environment.id)` で Anthropic 側の Environment を削除
3. config 更新: `runtime` を削除、`agents` を `{}`、`environment` を削除
4. agent リソースは Anthropic 側に残る（SDK に delete API なし）— help で明示

## D5: config schema からの `anthropic` フィールド削除

### 型変更

- `SpecRunnerConfig` から `anthropic: AnthropicConfig` を削除
- `RawConfig` から `anthropic?: Partial<AnthropicConfig>` を削除
- `AnthropicConfig` interface は export を残す（doctor check 等で参照がなくなった時点で削除）→ 実際は不要になるため削除

### validateConfig 変更

- L195-203 の `anthropic.apiKey` 必須チェックを削除
- `isLocalRuntime` 変数は `isManaged` の判定に書き換え（runtime default 反転に伴い `runtime !== "managed"` → local 扱い）

### checkConfigComplete 変更

- managed 専用チェック（apiKey / agents.design.agentId / environment.id）を全て削除
- `github.accessToken` チェックのみ残す
- managed 専用の前提検証は `checkRuntimePrereqs` に委譲

### applyMigration 変更

- L112-113: `rawConfig.runtime === "local" ? "local" : "managed"` → `rawConfig.runtime === "managed" ? "managed" : "local"`
- L117-118: `anthropic` フィールドの構築を削除
- L125: `anthropic` を canonical に含めない

### configIncompleteError 変更

- 現在の固定ヒント `"Run 'specrunner init' first."` に加え、managed incomplete のヒントは `checkRuntimePrereqs` 側の `RUNTIME_PREREQ_MISSING` エラーで返す。`configIncompleteError` 自体は github.accessToken 用のみとなるため、ヒントは `"Run 'specrunner login' first."` に特化可能。

## D6: runtime デフォルト反転

- `applyMigration` L112-113: 未指定 → `"local"`
- `validateConfig` L336: `isManagedRuntime` の判定を `runtime === "managed"` のみに変更（`runtime === undefined` を managed 扱いしない）
- 既存 config で `runtime` 未指定のユーザーは local に自動切り替わる

## D7: `specrunner init` の責務縮小

`init` は config 雛形の生成のみに縮小する:

```typescript
async function runInit(): Promise<void> {
  let existingConfig = {};
  try { existingConfig = await loadConfig(); } catch {}

  const newConfig = {
    ...existingConfig,
    version: 1,
    agents: existingConfig.agents ?? {},
    steps: existingConfig.steps ?? {
      defaults: { model: "claude-sonnet-4-6", maxTurns: null, timeoutMs: null },
    },
  };
  // runtime は書き込まない（未指定 = local default）
  await saveConfig(newConfig);
}
```

- `--api-key` フラグを廃止
- `--runtime` フラグを受けたらエラーで停止し migration path を案内

## D8: API key 参照箇所の移行

`config.anthropic.apiKey` → `process.env.SPECRUNNER_API_KEY`:

| File | Line | Pattern |
|------|------|---------|
| `src/cli/run.ts` | 47-48 | `config.runtime !== "local" && config.anthropic?.apiKey` → `config.runtime === "managed" && process.env.SPECRUNNER_API_KEY` |
| `src/cli/rm.ts` | 57-58 | 同上 |
| `src/cli/bootstrap.ts` | 34-35 | 同上 |

全箇所で `createAnthropicClient(process.env.SPECRUNNER_API_KEY!)` に置き換え。env var 未設定時は `undefined` → `createAnthropicClient` に渡さない（sessionClient = undefined → local fallback）。

## D9: `checkRuntimePrereqs` の新設

`src/core/preflight.ts` に追加する純粋関数:

```typescript
export function checkRuntimePrereqs(
  cfg: SpecRunnerConfig,
  env: Record<string, string | undefined>,
): { field: string; hint: string } | null {
  if (cfg.runtime !== "managed") return null;

  if (!env["SPECRUNNER_API_KEY"]) {
    return { field: "SPECRUNNER_API_KEY", hint: "Set SPECRUNNER_API_KEY env var." };
  }
  // 必須 step の agentId 検証
  const requiredSteps = ["design"] as const; // 最低限 design があれば起動可能
  for (const step of requiredSteps) {
    if (!cfg.agents?.[step]?.agentId) {
      return { field: `agents.${step}.agentId`, hint: "Run 'specrunner managed setup' first." };
    }
  }
  if (!cfg.environment?.id) {
    return { field: "environment.id", hint: "Run 'specrunner managed setup' first." };
  }
  return null;
}
```

`runPreflight` の Step 2 直後に Step 2.5 として挿入。新規エラーコード `RUNTIME_PREREQ_MISSING` を `errors.ts` に追加。

## D10: doctor check registry の分離

`src/core/doctor/checks/index.ts` の `allChecks` を 3 配列に再構成:

```typescript
export const commonChecks: DoctorCheck[] = [
  nodeVersionCheck, bunVersionCheck, gitVersionCheck,
  configFileExistsCheck, githubTokenPresentCheck,
  githubClientIdCheck, githubTokenValidCheck,
  gitRepositoryCheck, githubOriginCheck,
  specrunnerProjectMdCheck, workflowStructureCheck,
  jobsWritableCheck, oldStateFilesCheck,
];

export const managedChecks: DoctorCheck[] = [
  managedApiKeyPresentCheck,    // 旧 anthropicKeyPresentCheck を rename + env var チェックに変更
  managedApiKeyValidCheck,      // 旧 anthropicKeyValidCheck を rename + env var 経由に変更
  agentsRegisteredCheck,        // hint を 'managed setup' に書き換え
  environmentRegisteredCheck,   // hint を 'managed setup' に書き換え
  definitionDriftCheck,         // hint を 'managed setup' に書き換え
];

export const localChecks: DoctorCheck[] = [
  codexCliCheck,
];
```

`doctor.ts` の `runDoctor` で `config.runtime` に応じて配列を組み立てる:

```typescript
const runtime = rawConfig?.runtime ?? "local";
const checks = [
  ...commonChecks,
  ...(runtime === "managed" ? managedChecks : localChecks),
];
const results = await runChecks(checks, ctx);
```

## D11: help 表示の更新

`USAGE` 定数を更新:

- `init`: `Initialize config scaffold`
- `login`: `Authenticate with GitHub via Device Flow`
- `managed setup|status|reset`: `Manage Anthropic Managed Agents resources`
- フロー例示: `Standard flow (local): init -> login -> run`
- フロー例示: `Standard flow (managed): init -> login -> (set SPECRUNNER_API_KEY) -> managed setup -> run`

## 影響範囲

### 新規ファイル
- `src/cli/managed.ts` — managed 親コマンドハンドラ（setup / status / reset）

### 変更ファイル
- `src/cli/command-registry.ts` — managed コマンド登録、init フラグ廃止、USAGE 更新
- `src/cli/init.ts` — 責務縮小（config 雛形のみ）
- `src/cli/run.ts` — apiKey 参照を env var に移行
- `src/cli/rm.ts` — 同上
- `src/cli/bootstrap.ts` — 同上
- `src/cli/doctor.ts` — check registry の runtime 別組み立て
- `src/config/schema.ts` — anthropic 削除、checkConfigComplete 縮退、validateConfig 修正
- `src/config/migrate.ts` — runtime デフォルト反転、anthropic 構築削除
- `src/core/preflight.ts` — checkRuntimePrereqs 追加
- `src/errors.ts` — RUNTIME_PREREQ_MISSING 追加、configIncompleteError 更新
- `src/core/doctor/checks/index.ts` — 3 配列分離
- `src/core/doctor/checks/config/anthropic-key-present.ts` — rename + env var チェックに変更
- `src/core/doctor/checks/auth/anthropic-key-valid.ts` — rename + env var 経由に変更
- `src/core/doctor/checks/agents/agents-registered.ts` — hint 書き換え
- `src/core/doctor/checks/agents/environment-registered.ts` — hint 書き換え
- `src/core/doctor/checks/agents/definition-drift.ts` — hint 書き換え

### 削除対象のインターフェース
- `AnthropicConfig` — schema.ts から削除

### テストファイル（新規 or 変更）
- `tests/unit/core/preflight.test.ts` — checkRuntimePrereqs の 6 ケース
- `tests/unit/cli/managed.test.ts` — setup / status / reset のテスト
- 既存テストの `config.anthropic` 参照更新
