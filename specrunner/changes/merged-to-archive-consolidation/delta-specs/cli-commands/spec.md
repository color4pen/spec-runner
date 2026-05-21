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
2. `checkSlugCollision(cwd, slug)` で drafts + changes/archive の 2 経路の slug 重複をチェックする。重複時は `SLUG_COLLISION` error で exit 1
3. `--type` で指定された type（デフォルト: `new-feature`）の template を生成する
4. `specrunner/drafts/<slug>.md` にファイルを書き出す
5. stderr に `Created: specrunner/drafts/<slug>.md` を出力する
6. exit code 0 で終了する

#### Scenario: 新規 slug で request new

- **WHEN** `specrunner request new my-feature` を実行し、`my-feature` slug が未使用
- **THEN** `specrunner/drafts/my-feature.md` が作成され、stderr に `Created: specrunner/drafts/my-feature.md` が出力され、exit code 0

#### Scenario: 既存 slug で request new（slug collision）

- **WHEN** `specrunner request new existing-slug` を実行し、`existing-slug` が drafts に存在
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

### Requirement: `specrunner request` サブコマンド群が動作する

**Replaces**: 「`specrunner request` サブコマンド群が動作する」

`specrunner request` は SHALL 以下の 8 サブコマンドを提供する。

| サブコマンド | 機能 |
|---|---|
| `new <slug>` | template から request.md を作る |
| `generate "<text>"` | LLM 生成で request.md を作る（旧 `request create` の rename） |
| `ls` | drafts 配下の request 一覧（旧 `request list` の rename） |
| `show <slug>` | request.md の本文を stdout に表示 |
| `rm <slug>` | drafts 配下から削除 |
| `validate <file|slug>` | 構文 / 規律 check（静的、LLM 不使用）。slug で drafts 配下を解決する |
| `template` | 雛形 markdown を stdout |
| `review <slug|file> [--json]` | architect agent によるレビュー（one-shot LLM、state-less）。slug で drafts 配下を解決する。`--json` フラグで機械可読 JSON を stdout に出力する |

旧 `request create` は SHALL NOT 動作する（`Unknown request subcommand: create` を返す）。
旧 `request list` は SHALL NOT 動作する（`Unknown request subcommand: list` を返す）。

#### Scenario: `specrunner request show <slug>` が request.md を表示する

- **WHEN** `specrunner request show my-feature` を実行する
- **THEN** `specrunner/drafts/my-feature.md` の本文を stdout に出力し exit code 0 で終了する

#### Scenario: `specrunner request validate <slug>` が slug で解決する

- **WHEN** `specrunner request validate my-feature` を実行する（file path ではなく slug 指定）
- **THEN** `specrunner/drafts/my-feature.md` を対象として validation を実行する

#### Scenario: `specrunner request review <slug>` が slug で解決する

- **WHEN** `specrunner request review my-feature` を実行する（file path ではなく slug 指定）
- **THEN** `specrunner/drafts/my-feature.md` を対象としてレビューを実行する

#### Scenario: 旧 `request create` を実行した場合

- **WHEN** ユーザーが `specrunner request create "..."` を実行する
- **THEN** `Unknown request subcommand: create` を stderr に出し exit code 2 で終了する

#### Scenario: 旧 `request list` を実行した場合

- **WHEN** ユーザーが `specrunner request list` を実行する
- **THEN** `Unknown request subcommand: list` を stderr に出し exit code 2 で終了する

### Requirement: `specrunner job` サブコマンド群が動作する

**Replaces**: 「`specrunner job` サブコマンド群が動作する」

`specrunner job` は SHALL 以下の 6 サブコマンドを提供する。

| サブコマンド | 機能 |
|---|---|
| `start <request-slug\|file>` | pipeline 開始、jobId 発行（旧 `run` の主流名）。slug / file path 両方を受ける |
| `ls` | 全 job 一覧（旧 `ps`） |
| `show <jobId\|slug>` | job state の主要フィールド（jobId / status / branch / step / createdAt / updatedAt）を stdout に表示 |
| `rm <jobId>` | job state file 削除 |
| `resume <slug>` | halted job を再開 |
| `finish <slug>` | PR merge + archive |

不明な job サブコマンドは MUST `Unknown job subcommand: <name>` を stderr に出し exit code 2 で終了する。

#### Scenario: `specrunner job start <slug>` で pipeline を起動する

- **WHEN** `specrunner job start my-feature` を実行する（slug 指定）
- **THEN** `specrunner/drafts/my-feature.md` を対象として pipeline を開始する

#### Scenario: `specrunner job start <file>` で pipeline を起動する

- **WHEN** `specrunner job start path/to/request.md` を実行する（file path 指定）
- **THEN** 指定された request.md ファイルを対象として pipeline を開始する

#### Scenario: `specrunner job ls` で job 一覧を表示する

- **WHEN** `specrunner job ls` を実行する
- **THEN** `~/.local/share/specrunner/jobs/` 以下の job state をテーブル表示する（旧 `ps` と同等）

#### Scenario: `specrunner job show <jobId>` で job state を表示する

- **WHEN** `specrunner job show <jobId>` を実行する
- **THEN** jobId / status / branch / step / createdAt / updatedAt の主要フィールドを stdout に表示し exit code 0 で終了する

#### Scenario: 不明な job サブコマンドを実行した場合

- **WHEN** ユーザーが `specrunner job unknown` を実行する
- **THEN** `Unknown job subcommand: unknown` を stderr に出し exit code 2 で終了する
