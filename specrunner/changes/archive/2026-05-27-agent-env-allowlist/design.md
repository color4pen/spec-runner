## Context

specrunner は agent (Claude Code SDK) を `permissionMode: "bypassPermissions"` + Bash 許可で起動する。
現在 `process.env` がフィルタなしで子プロセスに継承されるため、agent が `echo $GITHUB_TOKEN` 等を
実行すると認証情報が漏洩する。prompt injection がなくても agent が env を参照するケースは起こりうる。

対象 secret はすべて起動時に解決済みでインスタンスに保持されており、env に残す必要がない:
- `GITHUB_TOKEN` → `GitHubClient` コンストラクタ引数で保持
- `SPECRUNNER_API_KEY` → `resolveAnthropicApiKey()` で解決済み
- `ANTHROPIC_API_KEY` → specrunner 自身は未使用。local runtime の Claude Code SDK は独自認証機構を持つ
- `ANTHROPIC_BASE_URL` → 別 request (#429) で SDK に baseURL を明示するため env override を残す必要なし

Closes #422

## Goals / Non-Goals

**Goals:**

- `process.env` から secret key を除去した env を全子プロセス起動経路に適用する
- verification commands / fallback phase spawn にも同じフィルタを適用する
- Claude Code SDK の `query()` に filtered env を `env` オプションで渡す
- `opts.env` による明示的上書きは引き続き機能させる（既存の PATH 拡張等）

**Non-Goals:**

- `permissionMode: "bypassPermissions"` の廃止
- prompt injection 防御の強化
- agent に渡す tool allowlist の変更
- allowlist 方式（許可 key 列挙）への切り替え

## Decisions

### D1. `src/util/env-filter.ts` に共有フィルタ関数を新設する

**Decision**: `stripSecrets(env: Record<string, string | undefined>): Record<string, string | undefined>` を
`src/util/env-filter.ts` に新設する。denylist に列挙された key を除去した shallow copy を返す。

```ts
const SECRET_DENYLIST: readonly string[] = [
  "GITHUB_TOKEN",
  "SPECRUNNER_API_KEY",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
];

export function stripSecrets(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const filtered = { ...env };
  for (const key of SECRET_DENYLIST) {
    delete filtered[key];
  }
  return filtered;
}
```

`SECRET_DENYLIST` は named export し、テストから参照可能にする。

**Rationale**: 5 箇所の適用先が同一のフィルタを必要とする。ユーティリティに集約することで
denylist の追加が 1 箇所で済み、漏れを防ぐ。

### D2. `src/util/spawn.ts:spawnCommand()` に env フィルタを組み込む

**Decision**: `spawnCommand()` 内部の env 構築ロジックを変更する。

変更前:
```ts
env: opts.env ? { ...process.env, ...opts.env } : process.env
```

変更後:
```ts
const baseEnv = stripSecrets(process.env as Record<string, string | undefined>);
env: opts.env ? { ...baseEnv, ...opts.env } : baseEnv
```

`opts.env` による明示的上書きは `stripSecrets` の後に spread するため、
呼び出し側が意図的に secret を渡した場合はそのまま通る（将来の拡張ポイント）。

**Rationale**: `spawnCommand()` はプロジェクト内の全 subprocess の共通経路であり、
ここに組み込むことで漏れを構造的に防ぐ（architect 評価済み）。

### D3. Claude Code SDK `query()` に filtered env を渡す

**Decision**: 2 箇所の queryOptions 構築に `env: stripSecrets(process.env)` を追加する。

1. `src/adapter/claude-code/agent-runner.ts` の `queryOptions` (line 185-194)
2. `src/core/runtime/local.ts` の `buildSdkOptions()` (line 97-104)

SDK の `env` オプション (`sdk.d.ts:1232`) は `process.env` の代わりに使われる。
`stripSecrets(process.env)` を渡すことで SDK が spawn する Claude Code プロセスから secret が除去される。

**Rationale**: SDK の `query()` は `spawnCommand()` を経由しないため、D2 だけでは不十分。
SDK 自身が Claude Code プロセスを spawn する際の env を制御する必要がある。

### D4. verification 経路にも同じフィルタを適用する

**Decision**: 2 箇所の spawn に `stripSecrets` を適用する。

1. `src/core/verification/commands.ts:spawnCommand()` — `{ ...process.env, PATH: ... }` を
   `{ ...stripSecrets(process.env), PATH: ... }` に変更
2. `src/core/verification/runner.ts:spawnScript()` — `env: process.env` を
   `env: stripSecrets(process.env)` に変更

**Rationale**: verification は agent ではなく CLI 内部処理だが、`sh -c` で任意コマンドを実行するため
env に secret が残っていると `$GITHUB_TOKEN` 等が展開されうる。defense-in-depth として統一適用する。
