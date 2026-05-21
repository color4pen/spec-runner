# Delta Spec: cli-commands

## Requirements

### Requirement: `specrunner request` サブコマンド群が動作する（drafts テーブル更新）

**Replaces**: 「`specrunner request` サブコマンド群が動作する（drafts テーブル更新）」

`specrunner request` は SHALL 以下の 6 サブコマンドを提供する。

| サブコマンド | 機能 |
|---|---|
| `new <slug>` | template から request.md を `specrunner/drafts/` に作る |
| `generate "<text>"` | LLM 生成で request.md を `specrunner/drafts/` に作る |
| `ls` | `specrunner/drafts/` 配下の request 一覧 |
| `validate <file\|slug>` | 構文 / 規律 check。slug で `specrunner/drafts/` 配下を解決する |
| `template` | 雛形 markdown を stdout |
| `review <slug\|file> [--json]` | architect agent によるレビュー。slug で `specrunner/drafts/` 配下を解決する |

### Requirement: `specrunner --help` は主語別グルーピングで表示される

**Replaces**: 「`specrunner --help` は主語別グルーピングで表示される」

`specrunner --help` は MUST 以下の 4 ブロック構造で usage を stdout に出力する。exit code 0 で終了する。

```
request commands:
  request new <slug>            template から request.md を作る
  request generate "<text>"     LLM 生成で request.md を作る
  request ls                    drafts 配下の request 一覧
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

### Requirement: `specrunner request` サブコマンド群が動作する（drafts パス対応）

**Replaces**: 「`specrunner request` サブコマンド群が動作する（drafts パス対応）」

drafts/ 化後、slug ベースのサブコマンドは MUST `specrunner/drafts/<slug>.md` を解決する。

#### Scenario: `specrunner request validate <slug>` が slug で解決する

- **WHEN** `specrunner request validate my-feature` を実行する（file path ではなく slug 指定）
- **THEN** `specrunner/drafts/my-feature.md` を対象として validation を実行する

#### Scenario: `specrunner request review <slug>` が slug で解決する

- **WHEN** `specrunner request review my-feature` を実行する（file path ではなく slug 指定）
- **THEN** `specrunner/drafts/my-feature.md` を対象としてレビューを実行する

### Requirement: `request new` / `request validate` / `request review` は slug validation を実行する

`request new <slug>` / `request validate <slug>` / `request review <slug>` は slug 入力に対し MUST `/^[a-z0-9][a-z0-9-]{0,63}$/` でバリデーションを実行する。マッチしない入力は exit code 2 で拒否し、path traversal（`../../` 等）を防ぐ。

#### Scenario: 不正 slug（path traversal）を拒否する

- **WHEN** `specrunner request new "../../etc/passwd"` を実行する
- **THEN** stderr に validation error を出力し exit code 2 で終了する。ファイルシステム操作は実行されない

#### Scenario: 正常 slug は受理される

- **WHEN** `specrunner request new "my-feature-123"` を実行する（slug は `/^[a-z0-9][a-z0-9-]{0,63}$/` にマッチ）
- **THEN** slug validation を通過し、通常の処理に進む

## Renamed

- "`request new` / `request show` / `request rm` / `request validate` / `request review` は slug validation を実行する" → "`request new` / `request validate` / `request review` は slug validation を実行する"

## Removed

- "`specrunner request show <slug>` は request.md の本文を表示する"
- "`specrunner request rm <slug>` は drafts 配下から request を削除する"
