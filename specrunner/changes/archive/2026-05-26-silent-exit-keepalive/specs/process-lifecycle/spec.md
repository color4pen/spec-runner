# process-lifecycle Specification (delta)

**Spec Name**: process-lifecycle
**Modification Type**: ADDED (new capability)
**Delta Date**: 2026-05-26
**Reason**: Pipeline / process lifecycle binding の欠落により、Bun event loop が step 遷移境界で silent exit する問題 (#386, #399) の構造的解決

## Requirements

### Requirement: KeepAlive sentinel timer で pipeline 実行中の premature exit を防止する

Pipeline が実行中の間、process の event loop に ref'd timer を保持し、Bun の「pending work なし → exit」判定を防止しなければならない (MUST)。

#### Scenario: pipeline 実行中に event loop が drain しても process は exit しない
- **GIVEN** KeepAlive が acquire されている
- **WHEN** pipeline の step 遷移境界で pending I/O が一時的にゼロになる
- **THEN** process は exit せず、次の step に進む

#### Scenario: pipeline 完了後に KeepAlive が release される
- **GIVEN** pipeline が正常完了 / escalation / error のいずれかで終了した
- **WHEN** `CommandRunner.execute()` の finally ブロックが実行される
- **THEN** KeepAlive の sentinel timer が clearInterval される
- **AND** process は `process.exit()` により明示的に exit する

#### Scenario: KeepAlive は idempotent に acquire/release できる
- **GIVEN** KeepAlive instance が存在する
- **WHEN** `acquire()` を 2 回呼ぶ
- **THEN** timer は 1 つだけ登録される
- **WHEN** `release()` を 2 回呼ぶ
- **THEN** error は発生しない

### Requirement: beforeExit handler で running 残留を検出し awaiting-resume に遷移する

process が exit する瞬間に `status: running` の job が存在する場合、`awaiting-resume` に強制遷移しなければならない (MUST)。defense-in-depth の safety net として機能する。

#### Scenario: process exit 時に running job が存在する
- **GIVEN** `.specrunner/jobs/` に `status: running` の job ファイルが存在する
- **WHEN** `process.on("beforeExit")` が発火する
- **THEN** 該当 job を `awaiting-resume` に遷移する
- **AND** stderr に warning を出力する
- **AND** handler は 1 回のみ実行される (fired boolean guard)

#### Scenario: process exit 時に running job が存在しない
- **GIVEN** `.specrunner/jobs/` に `status: running` の job ファイルが存在しない
- **WHEN** `process.on("beforeExit")` が発火する
- **THEN** 何も行わない

### Requirement: KeepAlive は CommandRunner.execute() と runFinishOrchestrator() で管理される

KeepAlive の acquire/release は最上位のオーケストレーション層のみで行わなければならない (MUST)。Pipeline 内部や step 内部では KeepAlive を操作してはならない (SHALL NOT)。

#### Scenario: CommandRunner.execute() で KeepAlive が管理される
- **GIVEN** `CommandRunner.execute()` が呼ばれる
- **WHEN** `prepare()` が成功する
- **THEN** KeepAlive を acquire する
- **AND** pipeline 実行・teardown を try/finally で包む
- **AND** finally で release する

#### Scenario: runFinishOrchestrator() で KeepAlive が管理される
- **GIVEN** `runFinishOrchestrator()` が呼ばれる
- **WHEN** early return (already archived, dry-run) でない
- **THEN** KeepAlive を acquire する
- **AND** Phase 0-4 を try/finally で包む
- **AND** finally で release する

### Requirement: 既存 timeout 機構は KeepAlive の影響を受けない

KeepAlive は timeout の発火を妨げてはならない (SHALL NOT)。Timeout 発火 → pipeline 終了 → KeepAlive release の順序が保証されなければならない (MUST)。

#### Scenario: step timeout が KeepAlive active 中に発火する
- **GIVEN** KeepAlive が active
- **AND** step の `timeoutMs` が設定されている
- **WHEN** timeoutMs が経過する
- **THEN** AbortController.abort() が発火する
- **AND** step は timeout error を返す
- **AND** pipeline が終了する
- **AND** finally で KeepAlive が release される
