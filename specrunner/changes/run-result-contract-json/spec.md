# Spec: run / resume の終端を機械可読な --json 契約で出す

## Requirements

### Requirement: run / job start / resume は --json を受理し終端 JSON を stdout に出す

`run`（alias）・`job start`（canonical）・`job resume` は `--json` フラグを受理 SHALL する。`--json` 指定時、
これらのコマンドは終端で構造化 JSON を stdout に 1 回出力 MUST する。`run` と `job start` は別の command registry
エントリだが、両エントリの flags に `--json` が定義されていなければならない MUST。`--json` 未指定時は、
これらのコマンドは stdout に終端 JSON を出力して MUST NOT（人間向け出力は stderr に保たれる）。

#### Scenario: run --json が pr-created を stdout に出す

**Given** pipeline が `awaiting-archive` で終端し PR URL を持つ job
**When** `run --json`（または `job start --json`）で実行する
**Then** stdout に単一の有効な JSON が出力され、`result` が `pr-created` である

#### Scenario: resume --json が終端 JSON を stdout に出す

**Given** halted job を resume し pipeline が終端する
**When** `resume --json` で実行する
**Then** stdout に単一の有効な JSON が出力され、`result` が終端の種別を表す

#### Scenario: job start エントリでも --json が受理される

**Given** canonical の `job start` エントリ
**When** `--json` を付けて起動する
**Then** `Unknown flag` エラーにならず、終端 JSON が stdout に出力される

#### Scenario: --json 未指定では stdout に JSON が出ない

**Given** 任意の終端（pr-created / awaiting-human / failed）
**When** `--json` を付けずに `run` / `resume` を実行する
**Then** stdout に終端 JSON は出力されず、人間向け出力は従来どおり stderr に出る

### Requirement: 終端 JSON の種別は pr-created / awaiting-human / failed を区別する

終端 JSON の種別フィールド `result` は `pr-created` / `awaiting-human` / `failed` のいずれかで MUST ある。
`awaiting-archive` は `pr-created` に、escalation および loop 枯渇（status=`awaiting-resume`）は `awaiting-human` に、
crash および恒久失敗（status=`failed`）は `failed` に写像 SHALL される。種別の写像は単一の純粋関数に集約され、
複数の終端箇所で同一の写像が再利用 MUST される。

#### Scenario: awaiting-archive は pr-created

**Given** status=`awaiting-archive` の終端 state
**When** 終端 JSON を組み立てる
**Then** `result` が `pr-created` になる

#### Scenario: escalation は awaiting-human

**Given** status=`awaiting-resume` で `resumePoint` に escalation 事由を持つ終端 state
**When** 終端 JSON を組み立てる
**Then** `result` が `awaiting-human` になる

#### Scenario: loop 枯渇は awaiting-human

**Given** status=`awaiting-resume` で `resumePoint.iterationsExhausted` が上限の終端 state
**When** 終端 JSON を組み立てる
**Then** `result` が `awaiting-human` になる

#### Scenario: 恒久失敗は failed

**Given** status=`failed` で `error` を持つ終端 state
**When** 終端 JSON を組み立てる
**Then** `result` が `failed` になる

### Requirement: 終端 JSON は終端判定に必要な最小情報を含む

終端 JSON は `result`・`slug`・`jobId`・`step`・`prUrl`・`reason` を含 MUST む。`prUrl` は PR が存在すれば
その URL、無ければ `null` で MUST ある。`reason` は停止事由があれば `code` と `message` を持つオブジェクト、
無ければ `null` で MUST ある。`step` は停止時の step を表 SHALL す（`awaiting-human` では halt した step）。

#### Scenario: pr-created は prUrl を持ち reason が null

**Given** PR URL を持つ `awaiting-archive` の終端 state
**When** 終端 JSON を組み立てる
**Then** `prUrl` が当該 URL、`reason` が `null`、`slug`・`jobId`・`step` が埋まっている

#### Scenario: failed は reason を持ち prUrl が null

**Given** PR を持たない `failed` の終端 state（`error.code` / `error.message` あり）
**When** 終端 JSON を組み立てる
**Then** `prUrl` が `null`、`reason.code` が error code、`reason.message` が停止事由、`slug`・`jobId`・`step` が埋まっている

#### Scenario: awaiting-human は halt した step と事由を持つ

**Given** `resumePoint.step` と `resumePoint.reason` を持つ `awaiting-resume` の終端 state
**When** 終端 JSON を組み立てる
**Then** `step` が `resumePoint.step`、`reason.message` が停止事由を表す

### Requirement: exit code は現行を維持する

`--json` の有無にかかわらず、`run` / `job start` / `resume` の exit code は現行の写像を維持 MUST する。
`pr-created` は 0、`awaiting-human` は 1、`failed` は 1 で MUST あり、種別は exit code ではなく JSON field で表される。
job 生成前の失敗（preflight / 引数エラー等）の exit code（1 / 2）も不変で MUST ある。

#### Scenario: pr-created は exit 0

**Given** `awaiting-archive` で終端する run
**When** `--json` 有無それぞれで実行する
**Then** いずれも exit code が 0 である

#### Scenario: awaiting-human と failed は exit 1

**Given** `awaiting-resume`（escalation / loop 枯渇）または `failed` で終端する run
**When** `--json` 有無それぞれで実行する
**Then** いずれも exit code が 1 である

### Requirement: --json 未指定時の人間向け出力は不変である

`--json` を指定しないとき、`run` / `resume` の人間向け出力（PR URL 行・halt メッセージ・error 行など）は
本変更の前後で不変で MUST ある。これらは stderr に出力され続け SHALL る。

#### Scenario: --json 無しの人間向け出力が baseline と一致

**Given** 任意の終端
**When** `--json` を付けずに実行する
**Then** stderr の人間向け出力が baseline から変化せず、stdout には終端 JSON が出ない
