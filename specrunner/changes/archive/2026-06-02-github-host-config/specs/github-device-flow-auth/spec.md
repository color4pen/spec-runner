## Requirements

### Requirement: GitHub Device Flow OAuth でトークンを取得する

`specrunner login` は MUST GitHub Device Flow（[OAuth 2.0 Device Authorization Grant](https://datatracker.ietf.org/doc/html/rfc8628)）で GitHub App の user access token を取得する。GitHub App は scope を使用しないため、device code request に scope パラメータを SHALL 含めない。フローの 3 ステップ（device code 取得 / ユーザー承認誘導 / token poll）を SHALL 順に実行する。

device code URL と token URL は host 駆動で決定される。`getDeviceCodeUrl(host)` は `https://{host}/login/device/code` を、`getTokenUrl(host)` は `https://{host}/login/oauth/access_token` を返す。host の既定値は `"github.com"` である。

#### Scenario: device code 取得（github.com）

- **WHEN** `specrunner login` が起動し、host が `github.com`（既定）
- **THEN** `POST https://github.com/login/device/code` に `client_id` のみを送信し（scope パラメータなし）、レスポンスから `device_code`、`user_code`、`verification_uri`、`expires_in`、`interval` を取得する

#### Scenario: device code 取得（GHES）

- **WHEN** `specrunner login` が起動し、config の `github.host` が `ghes.corp.example.com`
- **THEN** `POST https://ghes.corp.example.com/login/device/code` に `client_id` を送信する

#### Scenario: ユーザー誘導表示

- **WHEN** device code 取得に成功した
- **THEN** stdout に `Open <verification_uri> and enter code: <user_code>` を表示し、`expires_in` 秒後にタイムアウトすることを併記する

#### Scenario: token polling（github.com）

- **WHEN** device code を取得した直後から `interval` 秒間隔で token endpoint をポーリングし、host が `github.com`
- **THEN** `POST https://github.com/login/oauth/access_token` を `client_id`、`device_code`、`grant_type=urn:ietf:params:oauth:grant-type:device_code` と共に呼び、200 で `access_token` が返るまで継続する

#### Scenario: token polling（GHES）

- **WHEN** config の `github.host` が `ghes.corp.example.com` でポーリングする
- **THEN** `POST https://ghes.corp.example.com/login/oauth/access_token` を呼ぶ
