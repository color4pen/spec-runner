# Design: credentials-provider-parity

## Overview

credential の保存・解決を provider 間で対称にし、runtime 要件を declarative に集約する。
現状 GitHub token だけが `credentials.json` + resolver pattern を持ち、Anthropic API key は `process.env` 直読が 14+ callsite に散在している。これを `gh` / `aws-cli` と同じ「credentials.json が SOT、env は override」の model に統一する。

## Design Decisions

### D1: `core/credentials/anthropic.ts` — GitHub resolver の対称コピー

`github.ts` と同じ shape で `resolveSpecRunnerApiKey` / `saveSpecRunnerApiKey` を実装する。

- **Resolver signature**: `resolveSpecRunnerApiKey(env, opts?: { optional?: boolean })` → `{ apiKey: string; source: "credentials" | "env" }` or throw/undefined
- **Priority**: credentials.json `anthropic.apiKey` → `SPECRUNNER_API_KEY` env → throw (`ANTHROPIC_KEY_MISSING`)
- **optional semantics**: `{ optional: true }` のとき undefined を返す（throw しない）。`managed reset` のような「apiKey 不在でも続行」する callsite 向け
- **loadCredentials / saveCredentials**: `github.ts` の既存関数を共用する（provider-keyed merge が維持される）

**github.ts からの差分**:
- resolver return type: `{ token }` → `{ apiKey }` (provider の credential 名に合わせる)
- `optional` パラメータ追加（GitHub resolver には不要だった）
- error code: `GITHUB_TOKEN_MISSING` → `ANTHROPIC_KEY_MISSING`

### D2: `core/credentials/requirements.ts` — runtime → required credentials の declarative matrix

```ts
type CredentialKey = "github.token" | "anthropic.apiKey";

interface RequiredCredential {
  key: CredentialKey;
  envVar: string;           // "GITHUB_TOKEN" | "SPECRUNNER_API_KEY"
  resolverModule: string;   // hint for humans, code は import で解決
}

function requirementsFor(runtime: "local" | "managed"): RequiredCredential[]
```

- `local`: `["github.token"]`
- `managed`: `["github.token", "anthropic.apiKey"]`

この table を `preflight.checkRuntimePrereqs` / `doctor` / `bootstrap` が参照することで、runtime 分岐を各 module から消す。

**Note**: `requirementsFor` は credential key の配列を返すだけ。実際の resolve 呼び出しは callsite 側が行う（requirements は data、resolution は behavior）。

### D3: `CredentialsFile` 型拡張

```ts
export interface CredentialsFile {
  github?: { token: string };
  anthropic?: { apiKey?: string };  // NEW
}
```

`anthropic.apiKey` を optional にするのは、`saveCredentials({ anthropic: { apiKey: "..." } })` で GitHub token を消さないため（shallow merge で `anthropic` key 全体が置換される）。既存の `saveCredentials` の merge 戦略は top-level spread なので、provider 内のフィールドが消えないよう `anthropic` block を deep merge する必要がある。

**Deep merge の範囲**: `saveCredentials` の merge を `{ ...existing.github, ...creds.github }` のような provider 単位の deep merge に拡張する。これは `anthropic` 追加で初めて顕在化する問題（GitHub だけなら top-level spread で十分だった）。

### D4: callsite 書き換え戦略

すべての `process.env["SPECRUNNER_API_KEY"]` 直読を `resolveSpecRunnerApiKey(env, opts)` に置き換える。

**パターン A**: `config.runtime === "managed" && process.env["SPECRUNNER_API_KEY"]` (bootstrap / run / rm)
→ `resolveSpecRunnerApiKey(env, { optional: config.runtime !== "managed" })` に変換。managed なら必須、local なら undefined を許容。

**パターン B**: `process.env["SPECRUNNER_API_KEY"]` の直読 + guard (managed.ts `runManagedSetup`)
→ `resolveSpecRunnerApiKey(env)` に変換（required）。throw を catch して logError + exit(1)。

**パターン C**: presence boolean (managed.ts `runManagedStatus`)
→ `resolveSpecRunnerApiKey(env, { optional: true })` を呼び、`!!result` で boolean 化。

**パターン D**: optional (managed.ts `runManagedReset`)
→ `resolveSpecRunnerApiKey(env, { optional: true })` に変換。apiKey 不在でも続行。

### D5: DoctorContext 拡張 + check SRP 改善

`DoctorContext` に `resolvedSpecRunnerApiKey: string | null` と `specRunnerApiKeySource: "credentials" | "env" | null` を追加。`cli/doctor.ts` で `resolveSpecRunnerApiKey(env, { optional: true })` を呼んで pre-resolve する。

doctor check 4 つ (`managed-key-present`, `managed-key-valid`, `agent-provider-alive`, `environment-provider-alive`) は:
- `ctx.env["SPECRUNNER_API_KEY"]` → `ctx.resolvedSpecRunnerApiKey` に切り替え
- 先頭の「apiKey 不在ガード」boilerplate を削除（pre-resolve 済みなので ctx が null ならそれが answer）

`managed-key-present` check は `ctx.resolvedSpecRunnerApiKey` の有無 + `ctx.specRunnerApiKeySource` の表示に変わる（GitHub token check と対称）。

### D6: preflight の declarative 化

`checkRuntimePrereqs` は `requirementsFor(runtime)` を呼んで credential key を loop する形に書き換える。`SPECRUNNER_API_KEY` のハードコードを消し、credential key に基づく resolver 呼び出しに変換する。

ただし agents / environment の prereq check（`cfg.agents?.["design"]?.agentId`, `cfg.environment?.id`）は credential ではなく config field の check なので、requirements.ts には含めず従来通り preflight に残す。

### D7: Spec 新設・更新

- **新設**: `specrunner/specs/credential-store/spec.md` — provider 別 credential の格納・解決ルールを Requirement として明文化
- **更新**: `specrunner/specs/github-device-flow-auth/spec.md` — 「config に保存」の記述を credential-store spec への参照に変更
- **更新**: `specrunner/specs/managed-agent-runtime/spec.md` — secret 要求記述を credential-store spec への参照に変更

### D8: saveCredentials の deep merge

現状の `saveCredentials` は top-level spread（`{ ...existing, ...creds }`）。これだと `saveCredentials({ anthropic: { apiKey: "new" } })` が既存の `github` key を消す問題は無いが、`saveCredentials({ github: { token: "new" } })` が既存の `anthropic` key を消す問題も無い（top-level key が異なるため）。

ただし同一 provider 内のフィールドが増えた場合（例: `github: { token, scopes }`）に問題が出る。現時点では provider 内は single field なので top-level spread で十分だが、将来の安全のために provider 単位の deep merge に変更する。

```ts
const merged: CredentialsFile = {
  github: { ...existing.github, ...creds.github },
  anthropic: { ...existing.anthropic, ...creds.anthropic },
};
```

ただし undefined spread は安全なので、provider が存在しない場合も問題ない。

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `src/core/credentials/types.ts` | modify | `anthropic?: { apiKey?: string }` 追加 |
| `src/core/credentials/anthropic.ts` | create | resolver + save 関数 |
| `src/core/credentials/requirements.ts` | create | runtime → credentials matrix |
| `src/core/credentials/github.ts` | modify | `saveCredentials` を deep merge に変更 |
| `src/errors.ts` | modify | `ANTHROPIC_KEY_MISSING` 追加 |
| `src/core/doctor/types.ts` | modify | `resolvedSpecRunnerApiKey` / `specRunnerApiKeySource` 追加 |
| `src/cli/doctor.ts` | modify | pre-resolve 追加 |
| `src/core/doctor/checks/config/managed-key-present.ts` | modify | ctx.resolvedSpecRunnerApiKey 参照に変更 |
| `src/core/doctor/checks/auth/managed-key-valid.ts` | modify | ctx.resolvedSpecRunnerApiKey 参照 + ガード削除 |
| `src/core/doctor/checks/agents/agent-provider-alive.ts` | modify | 同上 |
| `src/core/doctor/checks/agents/environment-provider-alive.ts` | modify | 同上 |
| `src/core/preflight.ts` | modify | `checkRuntimePrereqs` を requirements-based に書き換え |
| `src/cli/bootstrap.ts` | modify | resolver 経由に変更 |
| `src/cli/run.ts` | modify | resolver 経由に変更 |
| `src/cli/rm.ts` | modify | resolver 経由に変更 |
| `src/cli/managed.ts` | modify | 3 関数とも resolver 経由に変更 |
| `tests/core/credentials/anthropic.test.ts` | create | resolver の 3 経路 + optional テスト |
| `tests/core/credentials/requirements.test.ts` | create | matrix テスト |
| `tests/core/doctor/mock-context.ts` | modify | 新 field 追加 |
| `tests/core/doctor/checks/config/managed-key-present.test.ts` | modify | ctx.resolvedSpecRunnerApiKey ベースに変更 |
| `tests/core/doctor/checks/auth/managed-key-valid.test.ts` | modify | 同上 |
| `specrunner/specs/credential-store/spec.md` | create | credentials.json の provider 対称 spec |
| `specrunner/specs/github-device-flow-auth/spec.md` | modify | credential-store spec への参照追加 |
| `specrunner/specs/managed-agent-runtime/spec.md` | modify | credential-store spec への参照追加 |

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| 行番号ズレ（main 進行） | 着手前に `grep -n 'process\.env\["SPECRUNNER_API_KEY"\]' src/` で全 callsite を再確認 |
| saveCredentials の deep merge で既存テストが壊れる | TC-CRED-005 が merge 動作を検証済み。deep merge 化後も同じ assertion が成立することを確認 |
| optional resolver の型が呼び出し元で unsound | overload signature で `optional: true` → `undefined | { apiKey, source }`、`optional?: false` → `{ apiKey, source }` を型レベルで区別 |
