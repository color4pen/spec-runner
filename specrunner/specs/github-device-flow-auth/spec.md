## Purpose

GitHub Device Flow OAuth for the CLI to obtain a personal access token.
## Requirements

### Requirement: GitHub Device Flow OAuth でトークンを取得する

`specrunner login` は MUST GitHub Device Flow（[OAuth 2.0 Device Authorization Grant](https://datatracker.ietf.org/doc/html/rfc8628)）で GitHub App の user access token を取得する。GitHub App は scope を使用しないため、device code request に scope パラメータを SHALL 含めない。フローの 3 ステップ（device code 取得 / ユーザー承認誘導 / token poll）を SHALL 順に実行する。

#### Scenario: device code 取得

- **WHEN** `specrunner login` が起動する
- **THEN** `POST https://github.com/login/device/code` に `client_id` のみを送信し（scope パラメータなし）、レスポンスから `device_code`、`user_code`、`verification_uri`、`expires_in`、`interval` を取得する

#### Scenario: ユーザー誘導表示

- **WHEN** device code 取得に成功した
- **THEN** stdout に `Open <verification_uri> and enter code: <user_code>` を表示し、`expires_in` 秒後にタイムアウトすることを併記する

#### Scenario: token polling

- **WHEN** device code を取得した直後から `interval` 秒間隔で token endpoint をポーリングする
- **THEN** `POST https://github.com/login/oauth/access_token` を `client_id`、`device_code`、`grant_type=urn:ietf:params:oauth:grant-type:device_code` と共に呼び、200 で `access_token` が返るまで継続する

### Requirement: GitHub OAuth client_id は CLI コードに固定で埋め込まれる

GitHub OAuth Device Flow は client_secret を必要としないため、SpecRunner 用 GitHub OAuth App の client_id は MUST CLI コードの定数として埋め込まれる。環境変数 `SPECRUNNER_GITHUB_CLIENT_ID` で SHALL 上書き可能である（テスト用）。

#### Scenario: 既定動作

- **WHEN** 環境変数 `SPECRUNNER_GITHUB_CLIENT_ID` が未設定
- **THEN** CLI コードに埋め込まれた client_id が使われる

#### Scenario: 環境変数オーバーライド

- **WHEN** `SPECRUNNER_GITHUB_CLIENT_ID=Iv1.test123` でログイン
- **THEN** 環境変数の値が使われる

### Requirement: ポーリングは GitHub の指示に従ってバックオフする

token endpoint のレスポンスが `authorization_pending` の場合、CLI は MUST 次の `interval` 秒で再試行する。`slow_down` の場合は SHALL `interval` を 5 秒増やす。`expired_token` または `access_denied` の場合は SHALL 即座にエラーで終了する。

#### Scenario: authorization_pending

- **WHEN** token endpoint が `{ error: "authorization_pending" }` を返す
- **THEN** 現行 `interval` 秒待って再試行する

#### Scenario: slow_down

- **WHEN** token endpoint が `{ error: "slow_down" }` を返す
- **THEN** `interval` を 5 秒増やしてから再試行する

#### Scenario: expired_token

- **WHEN** token endpoint が `{ error: "expired_token" }` を返す
- **THEN** ポーリングを終了し `Authorization timed out. Run 'specrunner login' again.` を stderr に出して exit code 1

#### Scenario: access_denied

- **WHEN** token endpoint が `{ error: "access_denied" }` を返す
- **THEN** ポーリングを終了し `Authorization denied by user.` を stderr に出して exit code 1

### Requirement: 取得した access_token は config に保存される

成功時、CLI は MUST access_token を `~/.config/specrunner/credentials.json` の `github.token` に保存する。書き込みは SHALL atomic、ファイルパーミッションは 0600 を維持する。

credential の格納・解決ルールの詳細は `specrunner/specs/credential-store/spec.md` を参照。

#### Scenario: 保存内容

- **WHEN** access_token を取得する
- **THEN** credentials.json の `github.token` が更新され、ファイルパーミッションが 0600 に維持される
- **AND** 既存の他 provider の credential（例: `anthropic.apiKey`）は保持される

token 取得元（credentials.json / GITHUB_TOKEN env var）は `specrunner doctor` の `github-token-present` check 出力および `specrunner run` の preflight info ログで可視化される。

### Requirement: 期限切れトークンは検出されリカバリ手順が表示される

`specrunner run` で GitHub API 呼び出し（リポジトリ存在確認・branch 検証）が 401 を返した場合、CLI は MUST `error.code = "GITHUB_TOKEN_EXPIRED"` を state に記録し、stderr に SHALL `GitHub token expired. Run 'specrunner login' again.` を出力する。

#### Scenario: API 呼び出しで 401

- **WHEN** GitHub API が 401 で `Bad credentials` を返す
- **THEN** state.status を `failed`、error.code を `GITHUB_TOKEN_EXPIRED` に設定し、ガイダンスメッセージを stderr に出して exit code 1
