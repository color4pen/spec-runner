## Requirements

### Requirement: GitHubApiClient は baseUrl 経由で API endpoint にアクセスする

`GitHubApiClient` は MUST constructor で受け取った `baseUrl` を使って全 API endpoint の URL を構築する。adapter 内に `api.github.com` のハードコードは SHALL 存在しない（コメント除く）。`createGitHubClient` factory は MUST `baseUrl` パラメータを受け取り、`GitHubApiClient` に渡す。

`GitHubClient` port interface は host / baseUrl を露出せず不変とする。baseUrl は adapter の内部詳細であり、port を経由して domain に漏れてはならない（B-2 の延長）。

#### Scenario: github.com の baseUrl

- **GIVEN** `baseUrl` が `https://api.github.com`
- **WHEN** `verifyBranch("owner", "repo", "main")` を呼ぶ
- **THEN** `https://api.github.com/repos/owner/repo/branches/main` にリクエストする

#### Scenario: GHES の baseUrl

- **GIVEN** `baseUrl` が `https://ghes.corp.example.com/api/v3`
- **WHEN** `verifyBranch("owner", "repo", "main")` を呼ぶ
- **THEN** `https://ghes.corp.example.com/api/v3/repos/owner/repo/branches/main` にリクエストする

#### Scenario: カスタム apiBaseUrl

- **GIVEN** `baseUrl` が `https://custom-proxy.example.com/gh`
- **WHEN** `getRawFile("owner", "repo", "main", "README.md")` を呼ぶ
- **THEN** `https://custom-proxy.example.com/gh/repos/owner/repo/contents/README.md?ref=main` にリクエストする

#### Scenario: port interface は変更されない

- **WHEN** `GitHubClient` port interface の型定義を確認する
- **THEN** `host` / `baseUrl` に関するメンバーは存在しない
