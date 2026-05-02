## RENAMED Requirements

- FROM: `### Requirement: \`specrunner\` バイナリは 5 つのサブコマンドを提供する`
- TO: `### Requirement: \`specrunner\` バイナリは 6 つのサブコマンドを提供する`

## MODIFIED Requirements

### Requirement: `specrunner` バイナリは 6 つのサブコマンドを提供する

`specrunner` CLI は SHALL `init`、`login`、`run`、`ps`、`doctor`、`finish` の 6 サブコマンドを提供する。引数なし、または不明なサブコマンドが渡された場合は usage を stderr に出力し、exit code 2 で MUST 終了する。usage 文字列には `doctor` の 1 行説明（例: `Diagnose environment / config / auth prerequisites`）と `finish` の 1 行説明（例: `Finalize a merged PR: archive openspec change and migrate request dir`）を含む。

#### Scenario: 引数なしで実行された場合

- **WHEN** ユーザーが `specrunner` をサブコマンドなしで実行する
- **THEN** stderr に各サブコマンドの 1 行説明（init / login / run / ps / doctor / finish）を含む usage を出力し、exit code 2 で終了する

#### Scenario: 不明なサブコマンドが渡された場合

- **WHEN** ユーザーが `specrunner foobar` を実行する
- **THEN** `Unknown command: foobar` を stderr に出し、6 サブコマンドの usage を続けて表示し、exit code 2 で終了する

#### Scenario: `--help` または `-h` が渡された場合

- **WHEN** ユーザーが `specrunner --help` を実行する
- **THEN** stdout に 6 サブコマンド分の usage を出力し、exit code 0 で終了する
