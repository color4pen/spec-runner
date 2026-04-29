## MODIFIED Requirements

### Requirement: runPipeline は step 関数を順次実行する上位オーケストレーターである

`runPipeline(jobState, deps)` は MUST propose step を実行した後、SHALL spec-review verdict を見届ける iteration loop を `runLoopUntil` で実行する。loop body は iter=1 では spec-review のみ、iter ≥ 2 では spec-fixer step → spec-review step の順で連結する。各 step 関数は SHALL `(state: JobState, deps: PipelineDeps) => Promise<JobState>` のシグネチャに従う。step は state.history への append を通じて進捗を記録し、戻り値の state を次の step に渡す。`runPipeline` の公開シグネチャは `(state: JobState, deps: PipelineDeps) => Promise<JobState>` のまま無変更である。

#### Scenario: 全 step 正常完了（iter=1 で approved）

- **WHEN** propose step と iter=1 の spec-review step がともに正常完了し、spec-review verdict が `approved` である
- **THEN** state.history には propose 由来の entries → spec-review 由来の entries の順で記録され、state.status が `success` になり、loop は spec-fixer を起動せずに終了する

#### Scenario: 1 つ目の step が失敗

- **WHEN** propose step が `state.status = "failed"` を返した
- **THEN** runPipeline は spec-review loop を呼び出さず、即座に state を返して終了する

#### Scenario: iter=1 needs-fix → iter=2 で approved

- **WHEN** iter=1 の spec-review verdict が `needs-fix`、iter=2 で spec-fixer step → spec-review step が実行され spec-review verdict が `approved` になる
- **THEN** state.steps["spec-review"] が長さ 2 の配列、state.steps["spec-fixer"] が長さ 1 の配列になり、最終的な state.status は `success`

### Requirement: runPipeline は verdict に応じて以降の step を skip する

spec-review iteration loop 完了後、`getLatestStepResult(state, "spec-review").verdict` が `needs-fix` または `escalation` の場合、runPipeline は MUST 以降の step（implementer 等）を呼び出さずに state を返す。`approved` の場合のみ次 step に進む。Phase 1 では spec-review が最後の step であるため、いずれの verdict でも state を返して終了する。

#### Scenario: approved verdict

- **WHEN** spec-review loop が `approved` で完了する
- **THEN** runPipeline は state.status を `success` で返す

#### Scenario: needs-fix verdict（loop 内で消化されず最終も needs-fix）

- **WHEN** spec-review loop が retry 上限到達で終了し、最終 verdict が `escalation` に書き換えられている
- **THEN** runPipeline は state.status を `success` のまま返し、最終 verdict が `escalation`、state.error.code が `SPEC_REVIEW_RETRIES_EXHAUSTED` であることが state ファイルから読み取れる

#### Scenario: escalation verdict（loop 内で escalation 即停止）

- **WHEN** iter=1 の spec-review verdict が `escalation`
- **THEN** runPipeline は spec-fixer を起動せず loop を抜け、state.status を `success` のまま返し、最終 verdict が `escalation` であることが state ファイルから読み取れる

### Requirement: runPipeline は step ごとに新規セッションを起動する (fresh-per-task dispatcher)

runPipeline は MUST 各 step 呼び出しごと、各 iteration ごとに `client.beta.agents.sessions.create` を新たに呼び出す。propose / spec-fixer / spec-review それぞれセッションを共有しない。同一 step の異なる iteration もセッションを共有しない。これにより各 step・各 iteration は独立したコンテキスト・独立したセッション ID を持つ（Author-Bias Elimination）。

#### Scenario: セッション ID が step ごとに異なる

- **WHEN** propose step と iter=1 の spec-review step が両方完了した
- **THEN** state.steps["propose"][0].session.id ≠ state.steps["spec-review"][0].session.id である

#### Scenario: セッション ID が iteration ごとに異なる

- **WHEN** spec-review loop が iter=1（needs-fix）→ iter=2（approved）で完了する
- **THEN** state.steps["spec-review"][0].session.id ≠ state.steps["spec-review"][1].session.id である

### Requirement: step 関数は src/core/steps/ 配下に配置される

各 step 関数は MUST `src/core/steps/<step>.ts` に配置される（例: `src/core/steps/propose.ts`、`src/core/steps/spec-review.ts`、`src/core/steps/spec-fixer.ts`）。`src/core/pipeline.ts` は SHALL step 関数の合成と loop プリミティブ呼び出しのみを担う。loop プリミティブ自体は SHALL `src/core/loop.ts` に配置される。

#### Scenario: ファイル配置

- **WHEN** spec-fixer step と loop プリミティブを実装する
- **THEN** `src/core/steps/spec-fixer.ts`（`runSpecFixerStep`）と `src/core/loop.ts`（`runLoopUntil`）の 2 ファイルが存在する

### Requirement: `PipelineDeps` の正規ロケーションは `src/core/types.ts` である

`PipelineDeps` 型は MUST `src/core/types.ts` に定義される。`src/core/pipeline.ts`、`src/core/loop.ts`、`src/core/steps/*.ts` のすべては SHALL `import type { PipelineDeps } from "../types.js"` の形で参照する。`pipeline.ts` から直接 import する形は SHALL 採用しない。これにより `pipeline.ts` ↔ `loop.ts` の循環 import を構造的に防ぐ（module-architect decision 行 1 / module-analysis 2.2 と整合）。

#### Scenario: 循環 import の排除

- **WHEN** `src/core/loop.ts` を実装する
- **THEN** `loop.ts` の import 行に `from "../pipeline.js"` は現れず、`PipelineDeps` は `from "../types.js"` または `from "./types.js"` 経由で参照される

### Requirement: runPipeline は state ファイルを single source of truth として扱う

各 step は MUST 完了時に state ファイルへの persist を完了させる。runPipeline は SHALL step 間で state を in-memory に保持しつつ、各 step 完了後（同一 iter の中での spec-fixer 完了後・spec-review 完了後を含む）に `writeJobState(state)` を呼び出す。これにより `specrunner ps` がいつでも進捗を観測できる。

#### Scenario: 中断後の状態確認

- **WHEN** iter=1 の spec-review 完了後・iter=2 の spec-fixer 開始前に CLI が異常終了する
- **THEN** state ファイルには propose 完了の history と steps["propose"][0]、steps["spec-review"][0]（needs-fix）が記録されており、`specrunner ps` で確認可能である

## ADDED Requirements

### Requirement: runPipeline は spec-review needs-fix で spec-fixer → spec-review iteration loop を起動する

runPipeline は MUST `runLoopUntil` を `loopName: "spec-review"`、`maxIterations: deps.config.pipeline.maxRetries`（既定 2）、`body` は iter=1 で spec-review のみ・iter ≥ 2 で spec-fixer step → spec-review step を実行、`evaluator` は state.steps["spec-review"] の末尾要素の verdict を返す、という構成で呼び出す。

#### Scenario: needs-fix → 自動再評価

- **WHEN** iter=1 の spec-review verdict が `needs-fix` を返す
- **THEN** runPipeline は spec-fixer step を起動し、その完了後に新規セッションで spec-review step を再実行する

### Requirement: runPipeline は retry 上限到達時に escalation verdict と SPEC_REVIEW_RETRIES_EXHAUSTED を記録する

runPipeline が `runLoopUntil` に渡す `onExceeded` は MUST 以下を実行する: (a) state.steps["spec-review"] の末尾要素の verdict を `escalation` に書き換える、(b) state.error を `{ code: "SPEC_REVIEW_RETRIES_EXHAUSTED", message: "spec-review did not approve after <N> iterations", hint: "Review spec-review-result-<NNN>.md and adjust the request manually." }` に設定する（`<NNN>` は 3 桁ゼロ埋めの iteration 番号）、(c) stdout に `[iter <N>/<max>] retries exhausted, escalating` を出力する。新しい verdict 値は SHALL 導入しない（`escalation` に統合）。

#### Scenario: 上限到達時の state

- **WHEN** maxRetries=2 で iter=1 needs-fix → iter=2 needs-fix が起きる
- **THEN** state.steps["spec-review"] は長さ 2 の配列で、末尾要素の verdict が `escalation`（書き換え）、state.error.code が `SPEC_REVIEW_RETRIES_EXHAUSTED` になる

### Requirement: runPipeline は iteration progress を stdout に逐次出力する

`runLoopUntil` は MUST 以下のフォーマットで stdout に進捗を出力する: iter 開始時 `[iter <N>/<max>] starting <loopName>`、spec-review 完了時 `[iter <N>] <loopName> verdict: <verdict>`、needs-fix 継続時 `[iter <N>] <loopName> verdict: needs-fix → spawning fixer`、approved 終了時 `[iter <N>] <loopName> verdict: approved → done`、escalation 終了時 `[iter <N>] <loopName> verdict: escalation → halt`、上限超過時 `[iter <N>/<max>] retries exhausted, escalating`。runPipeline 終了時に SHALL `Pipeline finished: <loopName> iterations=<N>, final verdict=<v>` を 1 行出力する。

#### Scenario: needs-fix → approved のログ出力

- **WHEN** iter=1 needs-fix → iter=2 approved の経路を通る
- **THEN** stdout に `[iter 1/2] starting spec-review` → `[iter 1] spec-review verdict: needs-fix → spawning fixer` → `[iter 2/2] starting spec-review` → `[iter 2] spec-review verdict: approved → done` → `Pipeline finished: spec-review iterations=2, final verdict=approved` の 5 行が順に出力される
