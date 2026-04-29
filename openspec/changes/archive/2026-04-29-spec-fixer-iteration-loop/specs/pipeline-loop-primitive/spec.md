## ADDED Requirements

### Requirement: `runLoopUntil` は body・evaluator・maxIterations・onExceeded を受け取る汎用 loop プリミティブである

Pipeline 層は MUST `runLoopUntil(state, deps, opts)` 関数を `src/core/loop.ts` に export する。`opts` は SHALL `{ body, evaluator, maxIterations, onExceeded?, loopName }` の構造である。`body` は `(state: JobState, deps: PipelineDeps, iter: number) => Promise<JobState>`、`evaluator` は `(state: JobState) => { verdict: "approved" | "needs-fix" | "escalation" }`、`maxIterations` は正整数、`onExceeded` は省略可（既定: state.steps の末尾 verdict を `escalation` に書き換え `state.error.code` を呼び出し側指定で記録する）、`loopName` は stdout / state.history に使う識別子である。

#### Scenario: シグネチャ

- **WHEN** `runLoopUntil` を import する
- **THEN** export 名と型が `(state: JobState, deps: PipelineDeps, opts: { body, evaluator, maxIterations, onExceeded?, loopName }) => Promise<JobState>` である

### Requirement: evaluator が `approved` を返したら即 exit する

`runLoopUntil` は MUST `body` 実行直後に `evaluator(state)` を呼び、戻り値の verdict が `approved` の場合は SHALL ループを抜けて state を返す。fixer に相当する処理（次 iter の body）は呼ばない。

#### Scenario: iter=1 で approved

- **WHEN** iter=1 の body 実行後 evaluator が `{ verdict: "approved" }` を返す
- **THEN** runLoopUntil は state を返して終了し、stdout に `[iter 1/<max>] <loopName> verdict: approved → done` を出力する

### Requirement: evaluator が `escalation` を返したら fixer を起動せず exit する

`runLoopUntil` は MUST `evaluator` の戻り値が `escalation` の場合、SHALL ループを抜けて state を返す。次 iter の body は呼ばない（fixer 起動なし）。

#### Scenario: iter=1 で escalation

- **WHEN** iter=1 の body 実行後 evaluator が `{ verdict: "escalation" }` を返す
- **THEN** runLoopUntil は state を返して終了し、stdout に `[iter 1/<max>] <loopName> verdict: escalation → halt` を出力する

### Requirement: evaluator が `needs-fix` で iter < maxIterations なら次 iter で body を再実行する

`runLoopUntil` は MUST evaluator が `needs-fix` を返し、かつ iter < maxIterations の場合、iter を +1 して `body(state, deps, iter)` を再度呼ぶ。body は内部で次 iter に必要な前処理（例: spec-fixer の起動）を含めて実行する。

#### Scenario: iter=1 needs-fix → iter=2 へ

- **WHEN** maxIterations=2、iter=1 の body 実行後 evaluator が `{ verdict: "needs-fix" }` を返す
- **THEN** runLoopUntil は iter=2 で body を再度呼ぶ。stdout に `[iter 1/2] <loopName> verdict: needs-fix → spawning fixer` 相当のメッセージを出力する

### Requirement: maxIterations 到達時は `onExceeded` を呼んで exit する

`runLoopUntil` は MUST evaluator が `needs-fix` を返し、かつ iter >= maxIterations の場合、SHALL `onExceeded(state)` を呼んで state を返す。`onExceeded` は呼び出し側が定義する終了処理（例: state.error への `SPEC_REVIEW_RETRIES_EXHAUSTED` 書き込み）。

#### Scenario: 上限到達

- **WHEN** maxIterations=2、iter=2 の body 実行後 evaluator が `{ verdict: "needs-fix" }` を返す
- **THEN** runLoopUntil は `onExceeded(state)` を呼び、その戻り値 state を返す。stdout に `[iter 2/2] retries exhausted, escalating` を出力する

### Requirement: body は必ず new state を返す（state は in-memory に保持）

`body` は MUST 必ず JobState を返す。`runLoopUntil` は SHALL body の戻り値を次 iter の入力とする。body 内部での state.steps の append は body 自身の責務であり、loop プリミティブは状態の積算ロジックに関与しない。

**永続化（writeJobState）の責務は body 内の step 関数にある**。`runLoopUntil` 自体は `writeJobState` を呼び出さない。step 関数（`runSpecReviewStep` / `runSpecFixerStep`）が各完了点で `writeJobState(state)` を呼ぶことにより、`specrunner ps` がいつでも進捗を観測できる。

#### Scenario: body が state.steps を更新

- **WHEN** body が `state.steps["spec-review"]` に新しい StepResult を push して state を返す
- **THEN** 次 iter の body には更新後の state が渡され、evaluator は最新の StepResult を参照できる

#### Scenario: runLoopUntil は writeJobState を呼ばない

- **WHEN** iter=1 の body が完了し evaluator が `needs-fix` を返す
- **THEN** `runLoopUntil` は `writeJobState` を呼ばず、iter=2 の body を呼ぶ。state の永続化は body 内の step 関数が担保済みである

### Requirement: stdout 進捗フォーマットの正規定義は pipeline-loop-primitive spec にある

`runLoopUntil` が出力する stdout フォーマット文字列の正規定義は本 spec のみとする。`pipeline-orchestrator` spec はフォーマット文字列を再定義してはならない（MUST NOT）。pipeline-orchestrator は SHALL「`runLoopUntil` が iteration progress を stdout に逐次出力する」という事実のみを記述し、具体例は本 spec の Scenario を参照するものとみなす。両 spec で文字列例を独立に保守すると将来の drift を生むため、フォーマット文字列の更新は MUST 本 spec のみで行う。

#### Scenario: フォーマット文字列の正規定義

- **WHEN** `runLoopUntil` が iter=1 開始時に stdout 出力する
- **THEN** 出力フォーマットは `[iter 1] <loopName> starting` であり、その正規定義は本 spec の Scenario 群が単一の真実の源（single source of truth）として保持する。pipeline-orchestrator spec はこのフォーマットを再記述しない

#### Scenario: フォーマット更新の影響範囲

- **WHEN** stdout フォーマット文字列を将来変更する
- **THEN** 更新は MUST 本 spec のみで行い、pipeline-orchestrator spec は再定義を含まないため自動的に整合する

### Requirement: `runLoopUntil` は state.history に loop entry を append する

各 iter 開始時、runLoopUntil は MUST `state.history` に `{ ts, step: loopName, status: "started", message: "iter <N> starting" }` を append する。各 iter 終了時に SHALL evaluator 結果に応じて `status: "ok" | "warning" | "error"` の entry を append する（approved=ok、needs-fix=warning、escalation=error）。

#### Scenario: history への記録

- **WHEN** iter=1 が `approved` で完了する
- **THEN** state.history の末尾 2 entries は `{ step: "<loopName>", status: "started" }` と `{ step: "<loopName>", status: "ok" }` である
