## ADDED Requirements

### Requirement: Credential は credentials.json に provider-keyed で格納される

`~/.config/specrunner/credentials.json` (permission 0600) が credential の SOT (Single Source of Truth) である。ファイルは MUST provider をトップレベルキーとする JSON object で、各 provider は自身の credential fields を持つ。

```json
{
  "github": { "token": "ghp_..." },
  "anthropic": { "apiKey": "sk-ant-..." }
}
```

書き込みは SHALL atomic write で行われ、ファイルパーミッションは 0600 を維持する。`saveCredentials` は既存の provider key を保持する deep merge を行う（shallow merge で他 provider の key が消えない）。

#### Scenario: GitHub token のみ保存済み

- **GIVEN** credentials.json に `{ "github": { "token": "ghp_abc" } }` が保存されている
- **WHEN** `saveSpecRunnerApiKey("sk-ant-xyz")` を呼ぶ
- **THEN** credentials.json は `{ "github": { "token": "ghp_abc" }, "anthropic": { "apiKey": "sk-ant-xyz" } }` になる
- **AND** 既存の github.token は保持される

#### Scenario: Anthropic key のみ保存済み

- **GIVEN** credentials.json に `{ "anthropic": { "apiKey": "sk-ant-old" } }` が保存されている
- **WHEN** `saveCredentials({ github: { token: "ghp_new" } })` を呼ぶ
- **THEN** credentials.json に github.token と anthropic.apiKey の両方が存在する

#### Scenario: credentials.json が存在しない

- **WHEN** credentials.json が存在しない状態で `loadCredentials()` を呼ぶ
- **THEN** 空 object `{}` が返る

### Requirement: Resolver は credentials → env → error の優先順位で解決する

各 provider の resolver 関数は MUST 以下の優先順位で credential を解決する:

1. credentials.json の対応フィールド
2. 環境変数
3. `SpecRunnerError` を throw する（`optional: true` の場合は `undefined` を返す）

| Provider | credentials.json path | env var | error code |
|----------|----------------------|---------|------------|
| GitHub | `github.token` | `GITHUB_TOKEN` | `GITHUB_TOKEN_MISSING` |
| Anthropic | `anthropic.apiKey` | `SPECRUNNER_API_KEY` | `ANTHROPIC_KEY_MISSING` |

#### Scenario: credentials.json に値がある場合

- **GIVEN** credentials.json に `anthropic.apiKey` が保存されている
- **AND** `SPECRUNNER_API_KEY` env var も設定されている
- **WHEN** `resolveSpecRunnerApiKey(env)` を呼ぶ
- **THEN** credentials.json の値が返る（env より優先）
- **AND** `source` は `"credentials"` である

#### Scenario: credentials.json に値が無く env がある場合

- **GIVEN** credentials.json に `anthropic.apiKey` が無い
- **AND** `SPECRUNNER_API_KEY=sk-ant-env` が設定されている
- **WHEN** `resolveSpecRunnerApiKey(env)` を呼ぶ
- **THEN** env の値が返る
- **AND** `source` は `"env"` である

#### Scenario: どちらにも値が無い場合（required）

- **GIVEN** credentials.json に `anthropic.apiKey` が無い
- **AND** `SPECRUNNER_API_KEY` env var が未設定
- **WHEN** `resolveSpecRunnerApiKey(env)` を呼ぶ（optional なし）
- **THEN** `ANTHROPIC_KEY_MISSING` error を throw する

#### Scenario: どちらにも値が無い場合（optional）

- **GIVEN** credentials.json に `anthropic.apiKey` が無い
- **AND** `SPECRUNNER_API_KEY` env var が未設定
- **WHEN** `resolveSpecRunnerApiKey(env, { optional: true })` を呼ぶ
- **THEN** `undefined` を返す（throw しない）

### Requirement: Runtime ごとの必要 credential は declarative に定義される

`core/credentials/requirements.ts` が runtime → required credential keys の matrix を MUST export する。

| Runtime | Required credentials |
|---------|---------------------|
| `local` | `github.token` |
| `managed` | `github.token`, `anthropic.apiKey` |

preflight / doctor / bootstrap は SHALL この matrix を参照して必要 credential を判定する。各 module が `runtime === "managed"` の分岐をハードコードしない。

#### Scenario: local runtime の要件

- **WHEN** `requirementsFor("local")` を呼ぶ
- **THEN** `github.token` のみを含む配列が返る

#### Scenario: managed runtime の要件

- **WHEN** `requirementsFor("managed")` を呼ぶ
- **THEN** `github.token` と `anthropic.apiKey` を含む配列が返る

### Requirement: DoctorContext は pre-resolved credential を注入する

`DoctorContext` は MUST `resolvedSpecRunnerApiKey: string | null` と `specRunnerApiKeySource: "credentials" | "env" | null` field を持つ。`cli/doctor.ts` が SHALL resolver を呼んで pre-resolve した値を注入する。

Doctor check は MUST `ctx.env["SPECRUNNER_API_KEY"]` を直読せず、`ctx.resolvedSpecRunnerApiKey` を参照する。

#### Scenario: Anthropic key が credentials.json にある場合

- **GIVEN** credentials.json に `anthropic.apiKey` が保存されている
- **WHEN** `specrunner doctor` が実行される
- **THEN** `DoctorContext.resolvedSpecRunnerApiKey` に値が注入される
- **AND** `DoctorContext.specRunnerApiKeySource` は `"credentials"` である

#### Scenario: Anthropic key が未設定の場合

- **GIVEN** credentials.json に `anthropic.apiKey` が無く、env も未設定
- **WHEN** `specrunner doctor` が実行される
- **THEN** `DoctorContext.resolvedSpecRunnerApiKey` は `null` である
- **AND** managed-key-present check は `fail` を返す

### Requirement: callsite は process.env を直読しない

`src/` 配下で `process.env["SPECRUNNER_API_KEY"]` の直読は MUST resolver 関数内部の 1 箇所のみに制限される。他の callsite は SHALL resolver 関数を呼んで credential を取得する。

#### Scenario: env 直読の排除

- **WHEN** `grep 'process\.env\["SPECRUNNER_API_KEY"\]' src/` を実行する
- **THEN** マッチは `src/core/credentials/anthropic.ts` 内の 1 箇所のみである
