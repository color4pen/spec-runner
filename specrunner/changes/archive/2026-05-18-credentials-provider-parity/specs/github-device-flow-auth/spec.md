## MODIFIED Requirements

### Requirement: 取得した access_token は config に保存される

成功時、CLI は MUST access_token を `~/.config/specrunner/credentials.json` の `github.token` に保存する。書き込みは SHALL atomic、ファイルパーミッションは 0600 を維持する。

credential の格納・解決ルールの詳細は `specrunner/specs/credential-store/spec.md` を参照。

#### Scenario: 保存内容

- **WHEN** access_token を取得する
- **THEN** credentials.json の `github.token` が更新され、ファイルパーミッションが 0600 に維持される
- **AND** 既存の他 provider の credential（例: `anthropic.apiKey`）は保持される

token 取得元（credentials.json / GITHUB_TOKEN env var）は `specrunner doctor` の `github-token-present` check 出力および `specrunner run` の preflight info ログで可視化される。
