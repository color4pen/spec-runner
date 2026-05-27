## Requirements

### Requirement: `specrunner login` は GitHub Device Flow OAuth でトークンを取得する

`specrunner login` は MUST GitHub OAuth Device Flow を実行し、`repo` スコープのアクセストークンを credentials file に SHALL 保存する。トークン取得後、`saveCredentials` の前に `runDeviceFlow()` が返す `scopes` を検査し、`repo` scope が含まれない場合は warning を表示する SHALL。scope 不足でも token は保存する（token 自体は有効であり、後から scope を拡張できるため）。

#### Scenario: 通常成功フロー（repo scope あり）

- **WHEN** ユーザーが `specrunner login` を実行し、表示された `verification_uri` で `user_code` を入力し承認する
- **AND** GitHub が返す scope に `repo` が含まれる
- **THEN** access token を credentials file に保存し、warning なしで `GitHub authentication complete.` を stderr に表示し exit code 0 で終了する

#### Scenario: scope 不足（repo scope なし）

- **WHEN** ユーザーが `specrunner login` を実行し、GitHub が返す scope に `repo` が含まれない
- **THEN** `Warning: GitHub token does not include 'repo' scope.` を stderr に表示し、token は credentials file に保存し、exit code 0 で終了する

#### Scenario: scope fallback（GitHub が scope を返さない場合）

- **WHEN** GitHub の token レスポンスに `scope` フィールドが含まれない
- **THEN** `runDeviceFlow()` の fallback により scopes は `["repo"]` となり、warning なしで token が保存される

#### Scenario: 認証コード期限切れ

- **WHEN** ユーザーが期限内に承認せず、GitHub からの応答が `expired_token` になる
- **THEN** `Authorization timed out. Run 'specrunner login' again.` を stderr に出力し exit code 1 で終了する

#### Scenario: ユーザーが拒否

- **WHEN** ユーザーが GitHub 上で承認を拒否し `access_denied` が返る
- **THEN** `Authorization denied by user.` を stderr に出力し exit code 1 で終了する
