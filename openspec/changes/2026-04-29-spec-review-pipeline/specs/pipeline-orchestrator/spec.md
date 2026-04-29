## ADDED Requirements

### Requirement: runPipeline は step 関数を順次実行する上位オーケストレーターである

`runPipeline(jobState, deps)` は MUST `[propose, spec-review]` の step 関数を順次実行する。各 step 関数は SHALL `(state: JobState, deps: PipelineDeps) => Promise<JobState>` のシグネチャに従う。step は state.history への append を通じて進捗を記録し、戻り値の state を次の step に渡す。

#### Scenario: 全 step 正常完了

- **WHEN** propose step と spec-review step がともに正常完了する
- **THEN** state.history には propose 由来の entries → spec-review 由来の entries の順で記録され、state.status が `success` になる

#### Scenario: 1 つ目の step が失敗

- **WHEN** propose step が `state.status = "failed"` を返した
- **THEN** runPipeline は spec-review step を呼び出さず、即座に state を返して終了する

### Requirement: runPipeline は verdict に応じて以降の step を skip する

spec-review 完了後、`state.steps["spec-review"].verdict` が `needs-fix` または `escalation` の場合、runPipeline は MUST 以降の step（implementer 等）を呼び出さずに state を返す。`approved` の場合のみ次 step に進む。Phase 1 では spec-review が最後の step であるため、いずれの verdict でも state を返して終了する。

#### Scenario: approved verdict

- **WHEN** spec-review step が `state.steps["spec-review"].verdict = "approved"` で正常完了する
- **THEN** runPipeline は state.status を `success` で返す

#### Scenario: needs-fix verdict

- **WHEN** spec-review step が `state.steps["spec-review"].verdict = "needs-fix"` で完了する
- **THEN** runPipeline は state.status を `success` のまま返し、state.steps["spec-review"].verdict が `needs-fix` であることが state ファイルから読み取れる

#### Scenario: escalation verdict

- **WHEN** spec-review step が `state.steps["spec-review"].verdict = "escalation"` で完了する
- **THEN** runPipeline は state.status を `success` のまま返し、state.steps["spec-review"].verdict が `escalation` であることが state ファイルから読み取れる

### Requirement: runPipeline は step ごとに新規セッションを起動する (fresh-per-task dispatcher)

runPipeline は MUST 各 step ごとに `client.beta.agents.sessions.create` を新たに呼び出す。propose と spec-review でセッションを共有しない。これにより各 step は独立したコンテキスト・独立したセッション ID を持つ。

#### Scenario: セッション ID が step ごとに異なる

- **WHEN** propose step と spec-review step が両方完了した
- **THEN** state.steps["propose"].session.id ≠ state.steps["spec-review"].session.id である

### Requirement: step 関数は src/core/steps/ 配下に配置される

各 step 関数は MUST `src/core/steps/<step>.ts` に配置される（例: `src/core/steps/propose.ts`、`src/core/steps/spec-review.ts`）。`src/core/pipeline.ts` は SHALL step 関数の合成と verdict 分岐のみを担う。

#### Scenario: ファイル配置

- **WHEN** spec-review step を実装する
- **THEN** `src/core/steps/spec-review.ts` というファイルが存在し、`runSpecReviewStep` 関数が export される

### Requirement: runPipeline は state ファイルを single source of truth として扱う

各 step は MUST 完了時に state ファイルへの persist を完了させる。runPipeline は SHALL step 間で state を in-memory に保持しつつ、各 step 完了後に `writeJobState(state)` を呼び出す。これにより `specrunner ps` がいつでも進捗を観測できる。

#### Scenario: 中断後の状態確認

- **WHEN** propose step 完了後・spec-review step 開始前に CLI が異常終了する
- **THEN** state ファイルには propose 完了の history と steps["propose"] が記録されており、`specrunner ps` で確認可能である
