## MODIFIED Requirements

### Requirement: `specrunner` バイナリは 6 つのサブコマンドを提供する

`specrunner` CLI は SHALL `init`、`login`、`run`、`ps`、`doctor`、`finish` の 6 サブコマンドを提供する。引数なし、または不明なサブコマンドが渡された場合は usage を stderr に出力し、exit code 2 で MUST 終了する。usage 文字列には `doctor` の 1 行説明（例: `Diagnose environment / config / auth prerequisites`）と `finish` の 1 行説明（例: `Finalize a merged PR: archive openspec change and squash-merge feature PR (1-PR model)`）を含む。

`finish` サブコマンドの引数 / フラグは MUST 以下の形式である:

```
specrunner finish [<slug>] [--pr <num>] [--job <jobId>] [--dry-run]
```

- 第一引数 `<slug>` は推奨形（user の mental model に一致）
- `--pr <num>` は PR 番号からの逆引き（gh pr view 経由）
- `--job <jobId>` は forensics / debug 用（互換性のため残置）
- `--dry-run` は Phase 0 pre-flight のみ実行する非破壊モード

第一引数として jobId を直接渡す形（`specrunner finish <jobId>`）は SHALL NOT サポートされない。jobId 渡しは `--job` flag 経由のみ。

#### Scenario: 引数なしで実行された場合

- **WHEN** ユーザーが `specrunner` をサブコマンドなしで実行する
- **THEN** stderr に各サブコマンドの 1 行説明（init / login / run / ps / doctor / finish）を含む usage を出力し、exit code 2 で終了する

#### Scenario: 不明なサブコマンドが渡された場合

- **WHEN** ユーザーが `specrunner foobar` を実行する
- **THEN** `Unknown command: foobar` を stderr に出し、6 サブコマンドの usage を続けて表示し、exit code 2 で終了する

#### Scenario: `--help` または `-h` が渡された場合

- **WHEN** ユーザーが `specrunner --help` を実行する
- **THEN** stdout に 6 サブコマンド分の usage を出力し、exit code 0 で終了する

#### Scenario: `specrunner finish --help` の出力に新フラグが含まれる

- **WHEN** ユーザーが `specrunner finish --help` を実行する
- **THEN** stdout に `<slug>` 第一形・`--pr` `--job` `--dry-run` の説明が含まれる、exit code 0 で終了する

### Requirement: `specrunner ps` は実行中のジョブを一覧表示する

`specrunner ps [--all]` は MUST `~/.local/share/specrunner/jobs/` 以下の状態ファイルをすべて読み込み、`JOB_ID`、`SLUG`、`STEP`、`STATUS`、`BRANCH`、`AGE` の 6 列で SHALL テーブル表示する。`--all` flag を指定した場合は MUST `status=archived` のジョブも含めて表示する。`--all` 指定なしの場合は `status=archived` のジョブを SHALL NOT 表示する（デフォルトでは active / success / failed / terminated 状態のジョブのみ表示）。出力フォーマットの詳細は以下に従う:

- **ソート順**: `createdAt` 降順（新しいジョブが上）
- **JOB_ID**: uuid の先頭 8 文字に短縮する
- **SLUG**: `getJobSlug(state)` の戻り値（`state.request.slug` → `state.branch` の prefix strip → `path.basename(state.request.path)` の fallback chain）。truncate は SHALL NOT 行う（terminal 幅による wrap は許容）
- **BRANCH**: 40 文字を超える場合は 37 文字 + `...` に truncate する
- **AGE**: `createdAt` からの経過時間を人間可読形式（例: `2m`, `1h`, `3d`）で表示する
- **非 TTY 時**: TAB 区切りの固定フォーマットで出力する（ヘッダ行を含む）。列幅のパディングは不要

#### Scenario: TTY 出力（複数ジョブ）

- **WHEN** stdout が TTY でディレクトリに 3 件の状態ファイルが存在する
- **THEN** 3 行 + ヘッダ行を固定列幅でテーブル表示し、JOB_ID は先頭 8 文字、SLUG は `getJobSlug` の戻り値で truncate なし、BRANCH は 40 文字超で truncate、AGE は人間可読で表示し exit code 0 で終了する。createdAt 降順でソートされる

#### Scenario: 非 TTY 出力（パイプ等）

- **WHEN** stdout が非 TTY（パイプ先あり等）でジョブが 2 件存在する
- **THEN** ヘッダ行 + 2 行を TAB 区切りで出力する。列幅パディングは行わない。SLUG 列も含む

#### Scenario: ジョブが 1 件もない

- **WHEN** `~/.local/share/specrunner/jobs/` が存在しないか空
- **THEN** `No jobs found.` を stdout に出力し exit code 0 で終了する

#### Scenario: 複数ジョブが存在する

- **WHEN** ディレクトリに 3 件の状態ファイルが存在する
- **THEN** 3 行 + ヘッダ行をテーブル形式で stdout に表示し、JOB_ID は短縮 8 文字、SLUG は `getJobSlug` 戻り値、AGE は人間可読（例: `2m`, `1h`）で表示し exit code 0 で終了する

#### Scenario: 破損した状態ファイルがある

- **WHEN** ある状態ファイルが JSON パース不可
- **THEN** `Skipping malformed file: <path>` を stderr に出し、残りのジョブは表示し exit code 0 で終了する

#### Scenario: archived 状態のジョブが表示される

- **WHEN** `state.status=archived` の job が存在し `specrunner ps --all` を実行する
- **THEN** STATUS 列に `archived` を表示する row が含まれ、SLUG 列にも `getJobSlug` 戻り値が表示される
