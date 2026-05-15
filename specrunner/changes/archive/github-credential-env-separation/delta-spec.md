# Delta Spec: github-credential-env-separation

## cli-config-store

### Requirement 変更: 設定ファイルは固定スキーマに従う

以下のフィールドを config schema から **削除** する:

- ~~`github.accessToken` (string)~~
- ~~`github.tokenObtainedAt` (ISO8601)~~
- ~~`github.scopes` (string[])~~

GitHub token は `credentials.json` に分離される（後述の新 Requirement 参照）。

`init` 直後はまだ login 未実行のため ~~`github` ブロックは未設定でもよく~~、CLI は credentials file の不在を許容する。

#### Scenario 変更: login 未実行の状態で run を実行する

- **WHEN** init 完了後 login 未実行で `specrunner run` を実行する
- **THEN** ~~`github.accessToken` が無いことを検知し~~ credentials file と `GITHUB_TOKEN` env var の両方から token が取得できないことを検知し、`Run 'specrunner login' first, or set GITHUB_TOKEN env var.` を返す

### Requirement 変更: 設定ファイルはパーミッション 0600 で保存される

config から secret が完全に除去されたため、permission 警告を **削除** する。

- config の作成・更新時、CLI は MUST ファイルパーミッションを `0600` に設定する（変更なし）
- ~~読み込み時にモードをチェックし、グループまたは other に読み権限がある場合は SHALL stderr に警告を出す~~（削除: config に secret が無いため）

#### Scenario 変更: 既存ファイルの権限が緩い

- **WHEN** 既存 config が 0644 で配置されている
- **THEN** ~~stderr に `Warning: ...` を出力し~~、書き込み時には 0600 に修正する
- **AND** stderr への permission warning は出力しない

> **Note**: permission warning ロジックは credentials file に移動する（新 Requirement 参照）。

### Requirement 変更: config 書き込みは新形式のみを書き込む

`saveConfig` は SHALL `github` フィールドを strip する。既存 config に `github.accessToken` が残っていても、`saveConfig` 経由で書き直されたタイミングで `github` フィールドが除去される。

追加 strip 対象:
- `github` — credentials file に分離（本 change）
- （既存の `agent`, `timeout`, `anthropic` strip は維持）

### Requirement 変更: 機微情報は stdout に出力されない

~~`anthropic.apiKey` および `github.accessToken`~~ `anthropic.apiKey`（env var 経由）および credentials file 内の token は MUST CLI の通常出力（stdout）に出力されてはならない。

---

### Requirement 新設: credentials file による secret 分離

CLI は MUST secret を config とは別の `credentials.json` に保存する。

- パス: `${XDG_CONFIG_HOME:-$HOME/.config}/specrunner/credentials.json`
- Permission: 0600（atomic write）
- 構造: provider-keyed JSON
  ```json
  {
    "github": {
      "token": "ghp_..."
    }
  }
  ```
- `specrunner login` は MUST token を credentials file に書き込む
- credentials file 読み込み時、permission が 0600 より緩ければ SHALL stderr に警告を出す（読み込みは継続）

#### Scenario: credentials file 新規作成

- **WHEN** `specrunner login` が成功する
- **THEN** `~/.config/specrunner/credentials.json` が 0600 で作成される
- **AND** `config.json` に `github` フィールドは書き込まれない

#### Scenario: credentials file の権限が緩い

- **WHEN** credentials file が 0644 で配置されている
- **THEN** 読み込み時に stderr に `Warning: ~/.config/specrunner/credentials.json has loose permissions (recommend 0600).` を出力する
- **AND** 読み込みは継続する

#### Scenario: credentials file の既存 provider key 保持

- **GIVEN** credentials file に `{ "github": { "token": "old" }, "gitlab": { "token": "xxx" } }` が存在する
- **WHEN** `specrunner login` が新しい GitHub token を取得する
- **THEN** `github.token` のみが更新され、`gitlab` key は保持される

### Requirement 新設: GitHub token resolver

CLI は MUST 以下の優先順位で GitHub token を解決する:

1. `credentials.json` の `github.token`（最優先）
2. `GITHUB_TOKEN` env var（fallback、CI 用）
3. どちらも無ければ error

#### Scenario: credentials file と env var の両方が存在

- **WHEN** credentials file に `github.token` が存在し、かつ `GITHUB_TOKEN` env var も設定されている
- **THEN** credentials file の token が使用される

#### Scenario: credentials file 無し、env var あり

- **WHEN** credentials file が存在せず、`GITHUB_TOKEN` env var が設定されている
- **THEN** env var の token が使用される

#### Scenario: 両方無し

- **WHEN** credentials file が存在せず、`GITHUB_TOKEN` env var も未設定
- **THEN** `Run 'specrunner login' first, or set GITHUB_TOKEN env var.` エラーで停止

### Requirement 新設: `gh` CLI subprocess への token 注入

`gh` CLI を spawn する際、CLI は MUST subprocess の環境変数に `GITHUB_TOKEN` を resolver 出力から注入する。これにより `gh auth login` 未実行のユーザーでも `specrunner login` だけで `gh` 経由の操作が動作する。

#### Scenario: `gh auth login` 未実行で PR 作成

- **GIVEN** `gh auth login` 未実行、`specrunner login` 実行済み
- **WHEN** pipeline が PR 作成ステップに到達する
- **THEN** `gh pr create` が credentials file の token を `GITHUB_TOKEN` env 経由で受け取り、正常に PR を作成する

## cli-commands

### Requirement 変更: `specrunner doctor` の check 項目

以下の check を追加する:

- `gh-cli-present` (category: runtime, required: true) — `gh` バイナリが PATH に存在するかチェック

以下の check を変更する:

- `github-token-present` — ~~config の `github.accessToken`~~ credentials file または `GITHUB_TOKEN` env var から token が取得可能かチェック
- `github-token-valid` — resolved token を使った API 疎通検証（既存ロジック維持、token source を変更）

## github-device-flow-auth

### Requirement 変更: token の保存先

`specrunner login` の Device Flow OAuth ロジックは維持する。token の保存先を ~~`config.github.accessToken`~~ `credentials.json` の `github.token` に変更する。

## managed-agent-runtime

### Requirement 変更: GitHub token の取得元

`ManagedAgentRunner` は ~~`config.github!.accessToken`~~ コンストラクタ注入された `githubToken` パラメータから token を取得する。adapter 内で config や `process.env` を直接参照しない。
