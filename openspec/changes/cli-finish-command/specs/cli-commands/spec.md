## MODIFIED Requirements

### Requirement: `specrunner` バイナリは 6 つのサブコマンドを提供する

`specrunner` CLI は SHALL `init`、`login`、`run`、`ps`、`doctor`、`finish` の 6 サブコマンドを提供する。引数なし、または不明なサブコマンドが渡された場合は usage を stderr に出力し、exit code 2 で MUST 終了する。usage 文字列には `finish` の 1 行説明（例: `Finalize a merged PR: archive openspec change and migrate request dir`）を含む。

#### Scenario: 引数なしで実行された場合

- **WHEN** ユーザーが `specrunner` をサブコマンドなしで実行する
- **THEN** stderr に各サブコマンドの 1 行説明（init / login / run / ps / doctor / finish）を含む usage を出力し、exit code 2 で終了する

#### Scenario: 不明なサブコマンドが渡された場合

- **WHEN** ユーザーが `specrunner foobar` を実行する
- **THEN** `Unknown command: foobar` を stderr に出し、6 サブコマンドの usage を続けて表示し、exit code 2 で終了する

#### Scenario: `--help` または `-h` が渡された場合

- **WHEN** ユーザーが `specrunner --help` を実行する
- **THEN** stdout に 6 サブコマンド分の usage を出力し、exit code 0 で終了する

### Requirement: `specrunner ps --active` は active 状態のジョブのみを表示する

`specrunner ps --active` は MUST `status` が `running` のジョブのみを表示する SHALL フィルタである。`archived` / `success` / `failed` / `terminated` 状態のジョブは `--active` フィルタにより出力から除外される。フィルタなし（`specrunner ps` のみ）は全ジョブを従来通り表示する。

#### Scenario: --active フィルタで running のみ表示

- **WHEN** ジョブが `running` 1 件、`success` 1 件、`archived` 1 件存在し `specrunner ps --active` を実行する
- **THEN** `running` ジョブの 1 行のみが出力される。`success` / `archived` ジョブは出力に含まれない

#### Scenario: --active フィルタで archived を除外

- **WHEN** `specrunner ps --active` を実行し `archived` 状態の job が存在する
- **THEN** `archived` 状態の job は出力に含まれない

## ADDED Requirements

### Requirement: `specrunner finish` のサブコマンド固有の usage と exit code 規約

`specrunner finish` は MUST `<jobId>` の位置引数と `--force` / `--cleanup-only` / `--slug <slug>` のオプションフラグを受け付ける SHALL CLI 引数定義を持つ。`specrunner finish --help` は stdout に各引数 / フラグの説明とサンプルを出力し exit code 0 で終了する。引数解析エラー時は `Usage: specrunner finish <jobId> [--force] [--cleanup-only] [--slug <slug>]` を stderr に出し exit code 2 で停止する。実行系のエラー（PR 状態 escalation / subprocess 失敗）は exit code 1 とし、引数エラーの 2 と区別する。

#### Scenario: --help

- **WHEN** ユーザーが `specrunner finish --help` を実行する
- **THEN** 各フラグの説明と例を含む usage を stdout に出し、exit code 0 で終了する

#### Scenario: 引数なし + awaiting-merge も空

- **WHEN** ユーザーが `specrunner finish` を実行し `awaiting-merge/` が空である
- **THEN** usage を stderr に出し exit code 2 で停止する（引数解析範囲のエラーとして扱う）

#### Scenario: 実行系エラーは exit code 1

- **WHEN** PR 状態が OPEN_BEHIND と判定され escalation で終了する
- **THEN** exit code は 1（引数 OK だが実行段階で停止）であり、2（usage エラー）ではない
