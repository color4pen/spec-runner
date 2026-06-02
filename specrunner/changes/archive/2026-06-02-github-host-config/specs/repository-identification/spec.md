## Requirements

### Requirement: cwd の git remote から owner/name を解決する

CLI は MUST `git remote get-url origin` を実行し、出力 URL から `owner` と `name` を抽出する。SSH 形式（`git@{host}:owner/name.git`）と HTTPS 形式（`https://{host}/owner/name.git`、`.git` suffix の有無を問わない）の SHALL 両方をサポートする。host パラメータが指定された場合はその host の URL のみを受け入れる。host 未指定時は `github.com` を既定とする。

#### Scenario: HTTPS URL（github.com 既定）

- **WHEN** `git remote get-url origin` が `https://github.com/color4pen/spec-runner.git` を返す
- **THEN** parser は `{ owner: "color4pen", name: "spec-runner" }` を返す

#### Scenario: HTTPS URL（.git なし）

- **WHEN** 出力が `https://github.com/color4pen/spec-runner` を返す
- **THEN** `{ owner: "color4pen", name: "spec-runner" }` を返す

#### Scenario: SSH URL

- **WHEN** 出力が `git@github.com:color4pen/spec-runner.git` を返す
- **THEN** `{ owner: "color4pen", name: "spec-runner" }` を返す

#### Scenario: HTTPS URL with credentials

- **WHEN** 出力が `https://x-access-token:abc@github.com/o/r.git` を返す
- **THEN** credentials 部分を除去した上で `{ owner: "o", name: "r" }` を返す

#### Scenario: GHES HTTPS URL

- **WHEN** `git remote get-url origin` が `https://ghes.corp.example.com/o/r.git` を返す
- **AND** host パラメータが `"ghes.corp.example.com"`
- **THEN** parser は `{ owner: "o", name: "r" }` を返す

#### Scenario: GHES SSH URL

- **WHEN** `git remote get-url origin` が `git@ghes.corp.example.com:o/r.git` を返す
- **AND** host パラメータが `"ghes.corp.example.com"`
- **THEN** parser は `{ owner: "o", name: "r" }` を返す

#### Scenario: host 不一致

- **WHEN** `git remote get-url origin` が `https://github.com/o/r.git` を返す
- **AND** host パラメータが `"ghes.corp.example.com"`
- **THEN** `REMOTE_NOT_GITHUB` エラーを発生させる

### Requirement: 設定 host 以外の remote はエラーとなる

origin が設定された GitHub host 以外を指す場合、CLI は MUST `REMOTE_NOT_GITHUB` エラーを返す。host 未指定時は `github.com` を既定とし、`github.com` 以外はエラーとなる（既存動作と同一）。GHES host が設定されている場合は、その host に一致する remote のみを受け入れる。

#### Scenario: GitLab remote

- **WHEN** 出力が `https://gitlab.com/u/r.git` を返す
- **THEN** `REMOTE_NOT_GITHUB` エラーを発生させる

#### Scenario: github.com remote で GHES が設定されている場合

- **WHEN** 出力が `https://github.com/o/r.git` を返す
- **AND** host パラメータが `"ghes.corp.example.com"`
- **THEN** `REMOTE_NOT_GITHUB` エラーを発生させる（host 不一致）

## Renamed

- "GitHub 以外の remote はエラーとなる" → "設定 host 以外の remote はエラーとなる"
