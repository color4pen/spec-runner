## Removed
- "Pipeline Emits Iteration Progress to Stdout"
- "Pipeline Emits Step Progress for Non-Loop CliSteps"

## Requirements

### Requirement: Pipeline は進捗メッセージを DomainEvent 経由で出力する

`Pipeline` クラス (`src/core/pipeline/pipeline.ts`) は MUST stdout/stderr に直接出力しない。パイプラインの進捗・状態メッセージは DomainEvent 経由で emit し、プレゼンテーション層 (`src/cli/progress.ts`) が subscribe して stderr に出力する。新 DomainEvent として `"pipeline:iteration:start"` / `"pipeline:iteration:verdict"` / `"pipeline:iteration:exhausted"` / `"pipeline:summary"` / `"pipeline:cli-step"` を `src/core/event/types.ts` に追加する。

`ProgressDisplay` の TTY 検出は MUST `process.stderr.isTTY` を参照する。heartbeat の `\r` 上書きとカラム幅は `process.stderr.columns` を SHALL 使用する。

#### Scenario: pipeline.ts が stdout/stderr に直接出力しない

- **GIVEN** pipeline が実行される
- **WHEN** iteration 開始 / verdict / exhaustion / summary が発生する
- **THEN** `Pipeline` は対応する DomainEvent を emit するのみで、`process.stdout.write` / `process.stderr.write` / `stdoutWrite` を直接呼び出さない

#### Scenario: progress.ts が新 event を stderr に出力する

- **GIVEN** ProgressDisplay が EventBus に wire されている
- **WHEN** `pipeline:iteration:start` event が emit される
- **THEN** `[iter N/M] starting <step>\n` が stderr に出力される

#### Scenario: TTY 検出が stderr を参照する

- **GIVEN** `process.stderr.isTTY === false` (stderr がリダイレクトされている)
- **WHEN** heartbeat timer が fire する
- **THEN** `\r` 上書きは使用されず、改行付きの行が出力される
