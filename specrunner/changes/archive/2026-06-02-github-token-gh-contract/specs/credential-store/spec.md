## Requirements

### Requirement: Resolver は env → gh auth → credentials → error の優先順位で解決する

各 provider の resolver 関数は MUST 以下の優先順位で credential を解決する。

**GitHub token** の解決順（gh CLI env 契約に整合）:

1. `GH_TOKEN` env var（GH_ 接頭辞優先）
2. `GITHUB_TOKEN` env var
3. `gh auth token` subprocess（B-6 seam 経由の `spawnCommand` で実行。gh 不在 / 未認証 / timeout は best-effort で null として次 source にフォールスルーし、SHALL throw しない）
4. `credentials.json` の `github.token`
5. `SpecRunnerError` を throw する（hint: `GH_TOKEN` 設定 / `gh auth login` / `specrunner login`）

env var は SHALL `credentials.json` より優先される。`GH_TOKEN` は SHALL `GITHUB_TOKEN` より優先される。

`resolveGitHubToken` の戻り値 `source` は MUST `"env" | "gh" | "credentials"` の 3 値 union である。`gh auth token` から解決した場合は `source` が `"gh"` になる。

`resolveGitHubToken` は MUST optional な `host` 引数を受け取れる口を持つ。host↔token 束縛の enforce は本 requirement のスコープ外（別 request `github-host-config`）。

`resolveGitHubToken` は MUST optional な `spawn` パラメータを受け取り、テスト時に subprocess 実行を差し替え可能とする。デフォルトは `spawnCommand`。

**Anthropic API key** の解決順（変更なし）:

1. credentials.json の `anthropic.apiKey`
2. `SPECRUNNER_API_KEY` env var
3. `SpecRunnerError` を throw する（`optional: true` の場合は `undefined` を返す）

| Provider | credentials.json path | primary env var | secondary env var | error code |
|----------|----------------------|-----------------|-------------------|------------|
| GitHub | `github.token` | `GH_TOKEN` | `GITHUB_TOKEN` | `GITHUB_TOKEN_MISSING` |
| Anthropic | `anthropic.apiKey` | `SPECRUNNER_API_KEY` | — | `ANTHROPIC_KEY_MISSING` |

#### Scenario: GH_TOKEN が設定されている場合

- **GIVEN** `GH_TOKEN=ghp_gh` が設定されている
- **AND** credentials.json に `github.token` が保存されている
- **WHEN** `resolveGitHubToken(env)` を呼ぶ
- **THEN** `GH_TOKEN` の値が返る（credentials.json より優先）
- **AND** `source` は `"env"` である

#### Scenario: GH_TOKEN と GITHUB_TOKEN の両方が設定されている場合

- **GIVEN** `GH_TOKEN=ghp_gh` と `GITHUB_TOKEN=ghp_github` の両方が設定されている
- **WHEN** `resolveGitHubToken(env)` を呼ぶ
- **THEN** `GH_TOKEN` の値が返る（`GITHUB_TOKEN` より優先）
- **AND** `source` は `"env"` である

#### Scenario: env に値が無く gh 認証済みの場合

- **GIVEN** `GH_TOKEN` も `GITHUB_TOKEN` も未設定
- **AND** `gh auth token` が exit 0 で token を stdout に出力する
- **WHEN** `resolveGitHubToken(env)` を呼ぶ
- **THEN** `gh auth token` の出力が返る
- **AND** `source` は `"gh"` である

#### Scenario: gh 不在（ENOENT）の場合

- **GIVEN** `GH_TOKEN` も `GITHUB_TOKEN` も未設定
- **AND** `gh` が PATH に存在しない（spawn が ENOENT）
- **AND** credentials.json に `github.token` が保存されている
- **WHEN** `resolveGitHubToken(env)` を呼ぶ
- **THEN** credentials.json の値が返る（throw しない）
- **AND** `source` は `"credentials"` である

#### Scenario: gh 未認証の場合

- **GIVEN** `GH_TOKEN` も `GITHUB_TOKEN` も未設定
- **AND** `gh auth token` が非ゼロ終了する
- **AND** credentials.json に `github.token` が保存されている
- **WHEN** `resolveGitHubToken(env)` を呼ぶ
- **THEN** credentials.json の値が返る（throw しない）
- **AND** `source` は `"credentials"` である

#### Scenario: credentials.json に値がある場合（Anthropic、変更なし）

- **GIVEN** credentials.json に `anthropic.apiKey` が保存されている
- **AND** `SPECRUNNER_API_KEY` env var も設定されている
- **WHEN** `resolveSpecRunnerApiKey(env)` を呼ぶ
- **THEN** credentials.json の値が返る（env より優先）
- **AND** `source` は `"credentials"` である

### Requirement: GH_TOKEN は SECRET_DENYLIST に含まれる

`GH_TOKEN` は MUST `src/util/env-filter.ts` の `SECRET_DENYLIST` に含まれ、`stripSecrets` によって子プロセス / 外部 SDK へ継承されない。`GITHUB_TOKEN` と同等の第一級 credential として B-6 の credential 封じ込めに含める。

#### Scenario: stripSecrets が GH_TOKEN を除去する

- **GIVEN** env に `GH_TOKEN=ghp_xxx` が含まれている
- **WHEN** `stripSecrets(env)` を呼ぶ
- **THEN** 返却された object に `GH_TOKEN` key が存在しない

### Requirement: DoctorContext は pre-resolved credential を注入する

`DoctorContext` は MUST `resolvedSpecRunnerApiKey: string | null` と `specRunnerApiKeySource: "credentials" | "env" | null` field を持つ。`DoctorContext.githubTokenSource` は MUST `"credentials" | "env" | "gh" | null` 型である。`cli/doctor.ts` が SHALL resolver を呼んで pre-resolve した値を注入する。

#### Scenario: gh auth token から解決した場合

- **GIVEN** `gh auth token` 経由で GitHub token が解決された
- **WHEN** `specrunner doctor` が実行される
- **THEN** `DoctorContext.githubTokenSource` は `"gh"` である

### Requirement: callsite は process.env を直読しない

`src/` 配下で `process.env["GH_TOKEN"]` および `process.env["GITHUB_TOKEN"]` の直読は MUST resolver 関数内部の 1 箇所のみに制限される。他の callsite は SHALL resolver 関数を呼んで credential を取得する。

#### Scenario: GH_TOKEN env 直読の排除

- **WHEN** `grep 'process\.env\["GH_TOKEN"\]' src/` を実行する
- **THEN** マッチは存在しない（resolver は引数の env dict を参照するため process.env を直読しない）

### Requirement: Runtime ごとの必要 credential は declarative に定義される

`core/credentials/requirements.ts` が runtime → required credential keys の matrix を MUST export する。

| Runtime | Required credentials |
|---------|---------------------|
| `local` | `github.token` |
| `managed` | `github.token`, `anthropic.apiKey` |

各 `RequiredCredential` の `envVar`（primary）は以下の通り:

| Credential key | envVar |
|----------------|--------|
| `github.token` | `GH_TOKEN` |
| `anthropic.apiKey` | `SPECRUNNER_API_KEY` |

preflight / doctor / bootstrap は SHALL この matrix を参照して必要 credential を判定する。各 module が `runtime === "managed"` の分岐をハードコードしない。

#### Scenario: local runtime の要件

- **WHEN** `requirementsFor("local")` を呼ぶ
- **THEN** `github.token` のみを含む配列が返る

#### Scenario: managed runtime の要件

- **WHEN** `requirementsFor("managed")` を呼ぶ
- **THEN** `github.token` と `anthropic.apiKey` を含む配列が返る

#### Scenario: github.token の envVar が GH_TOKEN である

- **WHEN** `requirementsFor("local")` を呼ぶ
- **THEN** `github.token` の `envVar` は `"GH_TOKEN"` である

## Renamed

- "Resolver は credentials → env → error の優先順位で解決する" → "Resolver は env → gh auth → credentials → error の優先順位で解決する"
