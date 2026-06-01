## Requirements

### Requirement: `specrunner login` は GitHub Device Flow OAuth でトークンを取得する

`specrunner login` は MUST GitHub App の Device Flow（[OAuth 2.0 Device Authorization Grant](https://datatracker.ietf.org/doc/html/rfc8628)）を実行し、user access token を credentials file に SHALL 保存する。GitHub App は scope を使用しないため、scope の検査・警告は行わない。

#### Scenario: 通常成功フロー

- **WHEN** ユーザーが `specrunner login` を実行し、表示された `verification_uri` で `user_code` を入力し承認する
- **THEN** access token を credentials file に保存し、`GitHub authentication complete.` を stderr に表示し exit code 0 で終了する

#### Scenario: 認証コード期限切れ

- **WHEN** ユーザーが期限内に承認せず、GitHub からの応答が `expired_token` になる
- **THEN** `Authorization timed out. Run 'specrunner login' again.` を stderr に出力し exit code 1 で終了する

#### Scenario: ユーザーが拒否

- **WHEN** ユーザーが GitHub 上で承認を拒否し `access_denied` が返る
- **THEN** `Authorization denied by user.` を stderr に出力し exit code 1 で終了する

### Requirement: `specrunner doctor` の `github-token-present` check は token 取得元を表示する

`github-token-present` check の pass message は MUST 解決元 (`resolveGitHubToken` の `source`) を含める。

- credentials.json 由来: `GitHub token is available (source: credentials)`
- `GITHUB_TOKEN` env var 由来: `GitHub token is available (source: env)`

`github-token-valid` check は token 有効性検証が責務のため source を出力しない。

#### Scenario: credentials.json から token が解決される

- **WHEN** `~/.config/specrunner/credentials.json` の `github.token` が存在し、env var が unset
- **THEN** `github-token-present` check は `pass` を返し、message は `GitHub token is available (source: credentials)`

#### Scenario: env var から token が解決される

- **WHEN** credentials.json は空または不在、かつ `GITHUB_TOKEN` env var が設定されている
- **THEN** `github-token-present` check は `pass` を返し、message は `GitHub token is available (source: env)`
