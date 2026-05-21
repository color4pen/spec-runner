# Delta: cli-commands (flatten-request-files)

## Requirements

### Requirement: `specrunner request new <slug>` は template から request.md を作成する

`specrunner request new <slug> [--type <type>]` は MUST 以下を実行する:

1. slug が `/^[a-z0-9][a-z0-9-]{0,63}$/` にマッチしない場合は slug validation error を stderr に出し exit code 2 で終了する
2. `checkSlugCollision(cwd, slug)` で active / merged 配下の slug 重複をチェックする。重複時は `SLUG_COLLISION` error で exit 1
3. `--type` で指定された type（デフォルト: `new-feature`）の template を生成する
4. `specrunner/requests/active/<slug>.md` にファイルを書き出す
5. stderr に `Created: specrunner/requests/active/<slug>.md` を出力する
6. exit code 0 で終了する

#### Scenario: 新規 slug で request new

- **WHEN** `specrunner request new my-feature` を実行し、`my-feature` slug が未使用
- **THEN** `specrunner/requests/active/my-feature.md` が作成され、stderr に `Created: specrunner/requests/active/my-feature.md` が出力され、exit code 0

#### Scenario: 既存 slug で request new（slug collision）

- **WHEN** `specrunner request new existing-slug` を実行し、`existing-slug` が active に存在
- **THEN** `SLUG_COLLISION` error メッセージが出力され、exit code 1

#### Scenario: 不正 slug で request new（path traversal 防止）

- **WHEN** `specrunner request new "../../evil"` を実行する
- **THEN** slug validation error を stderr に出し exit code 2 で終了する

### Requirement: `specrunner request show <slug>` は request.md の本文を表示する

`specrunner request show <slug>` は MUST `specrunner/requests/active/<slug>.md` の内容を stdout に出力する。slug が active 配下に存在しない場合は `Request not found: <slug>` を stderr に出力し exit code 1 で終了する。

slug は `/^[a-z0-9][a-z0-9-]{0,63}$/` に MUST マッチする。マッチしない場合は exit code 2 で拒否する。

#### Scenario: 存在する slug で request show

- **WHEN** `specrunner request show my-feature` を実行し、active 配下に `my-feature.md` が存在する
- **THEN** request.md の全文が stdout に出力され、exit code 0

#### Scenario: 存在しない slug で request show

- **WHEN** `specrunner request show nonexistent` を実行し、active 配下に `nonexistent.md` が存在しない
- **THEN** stderr に `Request not found: nonexistent` を出力し、exit code 1

### Requirement: `specrunner request rm <slug>` は active 配下から request を削除する

`specrunner request rm <slug>` は MUST `specrunner/requests/active/<slug>.md` ファイルを削除する。slug が active 配下に存在しない場合は `Request not found: <slug>` を stderr に出力し exit code 1 で終了する。

slug は `/^[a-z0-9][a-z0-9-]{0,63}$/` に MUST マッチする。マッチしない場合は exit code 2 で拒否する（path traversal 防止）。

#### Scenario: 存在する slug で request rm

- **WHEN** `specrunner request rm my-feature` を実行し、active 配下に `my-feature.md` が存在する
- **THEN** ファイルが削除され、stderr に削除メッセージが出力され、exit code 0

#### Scenario: 存在しない slug で request rm

- **WHEN** `specrunner request rm nonexistent` を実行し、active 配下に `nonexistent.md` が存在しない
- **THEN** stderr に `Request not found: nonexistent` を出力し、exit code 1

#### Scenario: path traversal slug で request rm

- **WHEN** `specrunner request rm "../../etc"` を実行する
- **THEN** slug validation error を stderr に出し exit code 2 で終了する（ファイルシステム外への削除を防ぐ）

### Requirement: `specrunner request` サブコマンド群が動作する（flat パス対応）

flat 化後、slug ベースのサブコマンドは `specrunner/requests/active/<slug>.md` を解決する。

#### Scenario: `specrunner request show <slug>` が request.md を表示する

- **WHEN** `specrunner request show my-feature` を実行する
- **THEN** `specrunner/requests/active/my-feature.md` の本文を stdout に出力し exit code 0 で終了する

#### Scenario: `specrunner request validate <slug>` が slug で解決する

- **WHEN** `specrunner request validate my-feature` を実行する（file path ではなく slug 指定）
- **THEN** `specrunner/requests/active/my-feature.md` を対象として validation を実行する

#### Scenario: `specrunner request review <slug>` が slug で解決する

- **WHEN** `specrunner request review my-feature` を実行する（file path ではなく slug 指定）
- **THEN** `specrunner/requests/active/my-feature.md` を対象としてレビューを実行する

### Requirement: `specrunner job` サブコマンド群が動作する（flat パス対応）

flat 化後、slug ベースの job start は `specrunner/requests/active/<slug>.md` を解決する。

#### Scenario: `specrunner job start <slug>` で pipeline を起動する

- **WHEN** `specrunner job start my-feature` を実行する（slug 指定）
- **THEN** `specrunner/requests/active/my-feature.md` を対象として pipeline を開始する
