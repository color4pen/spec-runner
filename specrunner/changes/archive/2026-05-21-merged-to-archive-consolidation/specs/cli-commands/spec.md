# Delta Spec: cli-commands

## Requirements

### Requirement: `specrunner --help` は主語別グルーピングで表示される

**Replaces**: 「`specrunner --help` は主語別グルーピングで表示される」

`specrunner --help` は MUST 以下の 4 ブロック構造で usage を stdout に出力する。exit code 0 で終了する。

```
request commands:
  request new <slug>            template から request.md を作る
  request generate "<text>"     LLM 生成で request.md を作る
  request ls                    drafts 配下の request 一覧
  request show <slug>           request.md の本文を表示
  request rm <slug>             drafts 配下から削除
  request validate <file|slug>  構文 / 規律 check
  request template              雛形 markdown を stdout
  request review <slug|file>    architect agent によるレビュー

job commands:
  job start <request-slug|file>  pipeline 開始、jobId 発行
  job ls                         全 job 一覧
  job show <jobId|slug>          job state 詳細
  job rm <jobId>                 job state file 削除
  job resume <slug>              halted job を再開
  job finish <slug>              PR merge + archive

environment commands:
  init                           config scaffold
  login                          GitHub Device Flow OAuth
  doctor                         環境診断
  runtime setup|status|reset     Manage Anthropic runtime resources

Aliases:
  run <slug|file>                job start の互換 alias
```

#### Scenario: `--help` または `-h` が渡された場合

- **WHEN** ユーザーが `specrunner --help` を実行する
- **THEN** stdout に request / job / environment の 3 グループと Aliases セクションにまとめた usage を出力し、exit code 0 で終了する

#### Scenario: `--help` の Aliases セクションに `run` が記載されている

- **WHEN** ユーザーが `specrunner --help` を実行する
- **THEN** Aliases セクションに `run` が `job start` の互換 alias として記載されている

### Requirement: `specrunner request new <slug>` は template から request.md を作成する

**Replaces**: 「`specrunner request new <slug>` は template から request.md を作成する」

`specrunner request new <slug> [--type <type>]` は MUST 以下を実行する:

1. slug が `/^[a-z0-9][a-z0-9-]{0,63}$/` にマッチしない場合は slug validation error を stderr に出し exit code 2 で終了する
2. `checkSlugCollision(cwd, slug)` で drafts + changes/archive の 2 経路で slug 重複をチェックする。重複時は `SLUG_COLLISION` error で exit 1
3. `--type` で指定された type（デフォルト: `new-feature`）の template を生成する
4. `specrunner/drafts/<slug>.md` にファイルを書き出す
5. stderr に `Created: specrunner/drafts/<slug>.md` を出力する
6. exit code 0 で終了する

#### Scenario: 新規 slug で request new

- **WHEN** `specrunner request new my-feature` を実行し、`my-feature` slug が未使用
- **THEN** `specrunner/drafts/my-feature.md` が作成され、stderr に `Created: specrunner/drafts/my-feature.md` が出力され、exit code 0

#### Scenario: 既存 slug で request new（slug collision）

- **WHEN** `specrunner request new existing-slug` を実行し、`existing-slug` が drafts または changes/archive に存在
- **THEN** `SLUG_COLLISION` error メッセージが出力され、exit code 1

#### Scenario: 不正 slug で request new（path traversal 防止）

- **WHEN** `specrunner request new "../../evil"` を実行する
- **THEN** slug validation error を stderr に出し exit code 2 で終了する

### Requirement: `specrunner request show <slug>` は request.md の本文を表示する

**Replaces**: 「`specrunner request show <slug>` は request.md の本文を表示する」

`specrunner request show <slug>` は MUST `specrunner/drafts/<slug>.md` の内容を stdout に出力する。slug が drafts 配下に存在しない場合は `Request not found: <slug>` を stderr に出力し exit code 1 で終了する。

slug は `/^[a-z0-9][a-z0-9-]{0,63}$/` に MUST マッチする。マッチしない場合は exit code 2 で拒否する。

#### Scenario: 存在する slug で request show

- **WHEN** `specrunner request show my-feature` を実行し、drafts 配下に `my-feature.md` が存在する
- **THEN** request.md の全文が stdout に出力され、exit code 0

#### Scenario: 存在しない slug で request show

- **WHEN** `specrunner request show nonexistent` を実行し、drafts 配下に `nonexistent.md` が存在しない
- **THEN** stderr に `Request not found: nonexistent` を出力し、exit code 1

### Requirement: `specrunner request rm <slug>` は drafts 配下から request を削除する

**Replaces**: 「`specrunner request rm <slug>` は active 配下から request を削除する」

`specrunner request rm <slug>` は MUST `specrunner/drafts/<slug>.md` ファイルを削除する。slug が drafts 配下に存在しない場合は `Request not found: <slug>` を stderr に出力し exit code 1 で終了する。

slug は `/^[a-z0-9][a-z0-9-]{0,63}$/` に MUST マッチする。マッチしない場合は exit code 2 で拒否する（path traversal 防止）。

#### Scenario: 存在する slug で request rm

- **WHEN** `specrunner request rm my-feature` を実行し、drafts 配下に `my-feature.md` が存在する
- **THEN** ファイルが削除され、stderr に削除メッセージが出力され、exit code 0

#### Scenario: 存在しない slug で request rm

- **WHEN** `specrunner request rm nonexistent` を実行し、drafts 配下に `nonexistent.md` が存在しない
- **THEN** stderr に `Request not found: nonexistent` を出力し、exit code 1

#### Scenario: path traversal slug で request rm

- **WHEN** `specrunner request rm "../../etc"` を実行する
- **THEN** slug validation error を stderr に出し exit code 2 で終了する（ファイルシステム外への削除を防ぐ）

### Requirement: `checkSlugCollision` は drafts + changes/archive の 2 経路で重複検出する

**New requirement**

`checkSlugCollision(cwd, slug)` は MUST `specrunner/drafts/` と `specrunner/changes/archive/` の 2 経路のみを走査し、slug の重複を検出する。`specrunner/requests/merged/` への参照は SHALL NOT 含まれる。

#### Scenario: drafts に同名 slug が存在する場合に衝突を検出する

- **WHEN** `specrunner/drafts/my-feature.md` が存在する状態で `checkSlugCollision(cwd, "my-feature")` を呼ぶ
- **THEN** `SLUG_COLLISION` を返す

#### Scenario: changes/archive に同名 slug が存在する場合に衝突を検出する

- **WHEN** `specrunner/changes/archive/my-feature/` ディレクトリが存在する状態で `checkSlugCollision(cwd, "my-feature")` を呼ぶ
- **THEN** `SLUG_COLLISION` を返す

#### Scenario: requests/merged/ は衝突チェック対象に含まれない

- **WHEN** `specrunner/requests/merged/` が存在しない状態で `checkSlugCollision(cwd, "any-slug")` を呼ぶ
- **THEN** `requests/merged/` 不在による ENOENT エラーは発生せず、正常に 2 経路チェックが完了する

## Renamed

- "`specrunner request rm <slug>` は active 配下から request を削除する" → "`specrunner request rm <slug>` は drafts 配下から request を削除する"

## Removed

- "`specrunner request` サブコマンド群が動作する（flat パス対応）"
- "`specrunner job` サブコマンド群が動作する（flat パス対応）"
