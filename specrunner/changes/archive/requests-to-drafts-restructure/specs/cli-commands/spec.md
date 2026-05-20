# Delta Spec: cli-commands

## Requirements

### Requirement: `specrunner request` サブコマンド群が動作する（drafts パス対応）

**Replaces**: 「`specrunner request` サブコマンド群が動作する（flat パス対応）」

drafts/ 化後、slug ベースのサブコマンドは `specrunner/drafts/<slug>.md` を解決する。

#### Scenario: `specrunner request show <slug>` が request.md を表示する

- **WHEN** `specrunner request show my-feature` を実行する
- **THEN** `specrunner/drafts/my-feature.md` の本文を stdout に出力し exit code 0 で終了する

#### Scenario: `specrunner request show <slug>` が旧 path を fallback で解決する

- **GIVEN** `specrunner/drafts/my-feature.md` が存在しない
- **AND** `specrunner/requests/active/my-feature.md` が存在する
- **WHEN** `specrunner request show my-feature` を実行する
- **THEN** `specrunner/requests/active/my-feature.md` の本文を stdout に出力し exit code 0 で終了する
- **AND** stderr に deprecation warning を出力する

#### Scenario: `specrunner request validate <slug>` が slug で解決する

- **WHEN** `specrunner request validate my-feature` を実行する（file path ではなく slug 指定）
- **THEN** `specrunner/drafts/my-feature.md` を対象として validation を実行する

#### Scenario: `specrunner request review <slug>` が slug で解決する

- **WHEN** `specrunner request review my-feature` を実行する（file path ではなく slug 指定）
- **THEN** `specrunner/drafts/my-feature.md` を対象としてレビューを実行する

### Requirement: `specrunner request` サブコマンド群が動作する（drafts テーブル更新）

**Replaces**: 「`specrunner request` サブコマンド群が動作する」のうち request サブコマンドテーブル

`specrunner request` は SHALL 以下の 8 サブコマンドを提供する。

| サブコマンド | 機能 |
|---|---|
| `new <slug>` | template から request.md を `specrunner/drafts/` に作る |
| `generate "<text>"` | LLM 生成で request.md を `specrunner/drafts/` に作る |
| `ls` | `specrunner/drafts/` 配下の request 一覧 |
| `show <slug>` | request.md の本文を stdout に表示（`drafts/` 優先、旧 `requests/active/` fallback） |
| `rm <slug>` | `specrunner/drafts/` 配下から削除 |
| `validate <file\|slug>` | 構文 / 規律 check。slug で `specrunner/drafts/` 配下を解決する |
| `template` | 雛形 markdown を stdout |
| `review <slug\|file> [--json]` | architect agent によるレビュー。slug で `specrunner/drafts/` 配下を解決する |

### Requirement: `specrunner job` サブコマンド群が動作する（drafts パス対応）

**Replaces**: 「`specrunner job` サブコマンド群が動作する（flat パス対応）」

drafts/ 化後、slug ベースの job start は `specrunner/drafts/<slug>.md` を解決する。

#### Scenario: `specrunner job start <slug>` で pipeline を起動する

- **WHEN** `specrunner job start my-feature` を実行する（slug 指定）
- **THEN** `specrunner/drafts/my-feature.md` を対象として pipeline を開始する

#### Scenario: `specrunner job start <slug>` で pipeline を起動する (旧 path)

- **WHEN** `specrunner job start my-feature` を実行する（slug 指定）
- **AND** `specrunner/drafts/my-feature.md` が存在しない
- **THEN** `specrunner/requests/active/my-feature.md` が存在すればそれを対象として pipeline を開始する

### Requirement: `specrunner job finish` 引数なし呼び出しはエラーで終了する

**New requirement**

`specrunner job finish` を slug / --pr / --job いずれも指定せず呼び出した場合、MUST `No slug specified. Specify <slug>, --pr, or --job.` を stderr に出し exit code 2 で終了する。旧 auto-detect (= `requests/active/` の 1 件自動選択) は SHALL NOT 動作する。

#### Scenario: `specrunner job finish` 引数なしで実行した場合

- **WHEN** `specrunner job finish` を引数なしで実行する
- **THEN** `No slug specified. Specify <slug>, --pr, or --job.` を stderr に出し exit code 2 で終了する
