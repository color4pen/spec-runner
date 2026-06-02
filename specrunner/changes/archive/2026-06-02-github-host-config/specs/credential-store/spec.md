## Requirements

### Requirement: Resolver は env → gh auth → credentials → error の優先順位で解決する

各 provider の resolver 関数は MUST 以下の優先順位で credential を解決する。

**GitHub token** の解決順（gh CLI env 契約に整合）:

host が `github.com` または未指定の場合:

1. `GH_TOKEN` env var（GH_ 接頭辞優先）
2. `GITHUB_TOKEN` env var
3. `gh auth token` subprocess（B-6 seam 経由の `spawnCommand` で実行。gh 不在 / 未認証 / timeout は best-effort で null として次 source にフォールスルーし、SHALL throw しない）
4. `credentials.json` の `github.token`
5. `SpecRunnerError` を throw する（hint: `GH_TOKEN` 設定 / `gh auth login` / `specrunner login`）

host が `github.com` 以外（GHES 等）の場合:

1. `GH_ENTERPRISE_TOKEN` env var
2. `GITHUB_ENTERPRISE_TOKEN` env var
3. `gh auth token --hostname {host}` subprocess（B-6 seam 経由）
4. `credentials.json` の `github.token`
5. `SpecRunnerError` を throw する（hint: `GH_ENTERPRISE_TOKEN` 設定 / `gh auth login --hostname {host}`）

env var は SHALL `credentials.json` より優先される。`GH_TOKEN` は SHALL `GITHUB_TOKEN` より優先される。`GH_ENTERPRISE_TOKEN` は SHALL `GITHUB_ENTERPRISE_TOKEN` より優先される。

`resolveGitHubToken` の戻り値 `source` は MUST `"env" | "gh" | "credentials"` の 3 値 union である。`gh auth token` から解決した場合は `source` が `"gh"` になる。

`resolveGitHubToken` は MUST optional な `host` 引数を受け取れる口を持つ。host 引数が指定されると、その host に対応する env var のみを検索する（host↔token 束縛 B-10 の enforce ポイント）。

`resolveGitHubToken` は MUST optional な `spawn` パラメータを受け取り、テスト時に subprocess 実行を差し替え可能とする。デフォルトは `spawnCommand`。

**Anthropic API key** の解決順（変更なし）:

1. credentials.json の `anthropic.apiKey`
2. `SPECRUNNER_API_KEY` env var
3. `SpecRunnerError` を throw する（`optional: true` の場合は `undefined` を返す）

| Provider | credentials.json path | primary env var (github.com) | secondary env var (github.com) | primary env var (GHES) | secondary env var (GHES) | error code |
|----------|----------------------|------------------------------|-------------------------------|----------------------|------------------------|------------|
| GitHub | `github.token` | `GH_TOKEN` | `GITHUB_TOKEN` | `GH_ENTERPRISE_TOKEN` | `GITHUB_ENTERPRISE_TOKEN` | `GITHUB_TOKEN_MISSING` |
| Anthropic | `anthropic.apiKey` | `SPECRUNNER_API_KEY` | — | — | — | `ANTHROPIC_KEY_MISSING` |

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

#### Scenario: GHES host で GH_ENTERPRISE_TOKEN が設定されている場合

- **GIVEN** `GH_ENTERPRISE_TOKEN=ghp_enterprise` が設定されている
- **WHEN** `resolveGitHubToken(env, { host: "ghes.corp.example.com" })` を呼ぶ
- **THEN** `GH_ENTERPRISE_TOKEN` の値が返る
- **AND** `source` は `"env"` である

#### Scenario: GHES host で GITHUB_ENTERPRISE_TOKEN が設定されている場合

- **GIVEN** `GITHUB_ENTERPRISE_TOKEN=ghp_enterprise2` が設定されている
- **AND** `GH_ENTERPRISE_TOKEN` は未設定
- **WHEN** `resolveGitHubToken(env, { host: "ghes.corp.example.com" })` を呼ぶ
- **THEN** `GITHUB_ENTERPRISE_TOKEN` の値が返る
- **AND** `source` は `"env"` である

#### Scenario: GHES host で GH_TOKEN のみ設定されている場合（B-10 enforce）

- **GIVEN** `GH_TOKEN=ghp_dotcom_token` が設定されている
- **AND** `GH_ENTERPRISE_TOKEN` も `GITHUB_ENTERPRISE_TOKEN` も未設定
- **AND** `gh auth token --hostname ghes.corp.example.com` が非ゼロ終了する
- **AND** credentials.json に `github.token` が保存されていない
- **WHEN** `resolveGitHubToken(env, { host: "ghes.corp.example.com" })` を呼ぶ
- **THEN** `GITHUB_TOKEN_MISSING` エラーが発生する
- **AND** エラーメッセージに `ghes.corp.example.com` が含まれる

#### Scenario: GHES host で gh auth token に --hostname を渡す

- **GIVEN** env に enterprise token が未設定
- **WHEN** `resolveGitHubToken(env, { host: "ghes.corp.example.com", spawn })` を呼ぶ
- **THEN** `spawn` は `"gh"`, `["auth", "token", "--hostname", "ghes.corp.example.com"]` で呼ばれる
