# Test Cases: pipeline-transition-migration

Source: proposal.md, design.md, tasks.md

---

## TC-01 [must] — history スプレッド: MAX_HISTORY_SIZE ガードが loop entry で機能する

**Category**: correctness  
**Source**: Task 2.1, Design D4

**GIVEN**: history が MAX_HISTORY_SIZE に達している job state で、ループステップ（例: spec-review）に入ろうとしている  
**WHEN**: loop entry bookkeeping が `appendHistoryEntry` で history エントリを追加する  
**THEN**: `state.history.length` は MAX_HISTORY_SIZE を超えない（先頭エントリが evict される）

---

## TC-02 [must] — history スプレッド: loop entry に "started" エントリが追加される

**Category**: correctness  
**Source**: Task 2.1

**GIVEN**: 実行中の job が spec-review ループステップの iter 1 に入る  
**WHEN**: loop entry bookkeeping が実行される  
**THEN**: `history` の末尾に `{ status: "started", message: "spec-review iteration 1 started" }` のエントリが追加される

---

## TC-03 [must] — history スプレッド: loop exit に完了エントリが追加される

**Category**: correctness  
**Source**: Task 2.2

**GIVEN**: spec-review ループステップが verdict "approved" で完了する  
**WHEN**: loop exit bookkeeping が実行される  
**THEN**: `history` の末尾に `{ status: "ok", message: "spec-review iteration 1 completed with verdict: approved" }` のエントリが追加される

---

## TC-04 [should] — history スプレッド: "needs-fix" verdict は history status "warning" にマップされる

**Category**: correctness  
**Source**: Task 2.2

**GIVEN**: loop ステップが verdict "needs-fix" で完了する  
**WHEN**: loop exit bookkeeping が実行される  
**THEN**: 追加される history エントリの `status` が `"warning"` である

---

## TC-05 [should] — history スプレッド: "escalation" verdict は history status "error" にマップされる

**Category**: correctness  
**Source**: Task 2.2

**GIVEN**: loop ステップが verdict "escalation" で完了する  
**WHEN**: loop exit bookkeeping が実行される  
**THEN**: 追加される history エントリの `status` が `"error"` である

---

## TC-06 [must] — running→awaiting-merge: transitionJob 経由で遷移する

**Category**: correctness  
**Source**: Task 3.1, Design D1

**GIVEN**: job が `"running"` 状態で、全ステップが成功し `nextStep === "end"` になる  
**WHEN**: pipeline の terminal 条件（end）が評価される  
**THEN**: `state.status === "awaiting-merge"` であり、`store.persist(state)` が呼ばれる

---

## TC-07 [must] — running→awaiting-merge: transitionJob が history エントリを自動追記する

**Category**: correctness  
**Source**: Task 3.1, Design D7

**GIVEN**: job が `"running"` 状態で awaiting-merge への遷移が実行される  
**WHEN**: `transitionJob(state, "awaiting-merge", { trigger: "pipeline", reason: "pipeline complete" })` が呼ばれる  
**THEN**: `result.state.history` の末尾エントリの `message` が `"running → awaiting-merge: pipeline complete"` を含む

---

## TC-08 [should] — running→awaiting-merge: running 以外のステータスから呼ぶと例外がスローされる

**Category**: correctness  
**Source**: Design D1, lifecycle.ts VALID_TRANSITIONS

**GIVEN**: job が `"awaiting-resume"` 状態である  
**WHEN**: `transitionJob(state, "awaiting-merge", ...)` が呼ばれる  
**THEN**: `"Invalid transition: awaiting-resume → awaiting-merge"` を含む Error がスローされる

---

## TC-09 [must] — catch block: 未処理例外で running→awaiting-resume に遷移する

**Category**: correctness  
**Source**: Task 3.2

**GIVEN**: job が `"running"` 状態のときに pipeline 内で未処理の例外が発生する  
**WHEN**: pipeline の outer catch block が実行される  
**THEN**: `finalState.status === "awaiting-resume"` であり、`error.code === "PIPELINE_UNHANDLED_ERROR"` が設定される

---

## TC-10 [must] — catch block: resumePoint と error が transitionJob の patch で設定される

**Category**: correctness  
**Source**: Task 3.2, Design D3

**GIVEN**: エラーメッセージ "unexpected failure" を持つ例外が pipeline catch block に到達する  
**WHEN**: `transitionJob(finalState, "awaiting-resume", { patch: { resumePoint, error } })` が呼ばれる  
**THEN**: `result.state.resumePoint.reason === "unexpected failure"` かつ `result.state.error.code === "PIPELINE_UNHANDLED_ERROR"` である

---

## TC-11 [must] — catch block: 遷移後の state が persist される

**Category**: correctness  
**Source**: Task 3.2

**GIVEN**: pipeline catch block で awaiting-resume 遷移が発生する  
**WHEN**: `transitionJob` が新しい state を返す  
**THEN**: `store.persist(finalState)` が transitionJob の戻り値の state を引数として呼ばれる

---

## TC-12 [should] — catch block: state が running 以外の場合は遷移しない

**Category**: correctness  
**Source**: Task 3.2, pipeline.ts L85

**GIVEN**: 例外に `err.state` が付属しており、その `state.status === "failed"` である  
**WHEN**: pipeline outer catch block が実行される  
**THEN**: `transitionJob` は呼ばれず（`status !== "running"` のため）、state は "failed" のまま維持される

---

## TC-13 [must] — escalation: running→awaiting-resume に transitionJob 経由で遷移する

**Category**: correctness  
**Source**: Task 3.3

**GIVEN**: 実行中の job で `nextStep === "escalate"` かつ `state.status !== "failed"` である  
**WHEN**: escalation 分岐が評価される  
**THEN**: `state.status === "awaiting-resume"` であり、`resumePoint` が設定され、`store.persist(state)` が呼ばれる

---

## TC-14 [must] — escalation: resumePoint.step が currentStep の名前になる

**Category**: correctness  
**Source**: Task 3.3, Design D3

**GIVEN**: `currentStep === "spec-review"` で 2 回目のイテレーションで escalation が発生する  
**WHEN**: `transitionJob` の patch に resumePoint が渡される  
**THEN**: `result.state.resumePoint.step === "spec-review"` かつ `resumePoint.iterationsExhausted === 2` である

---

## TC-15 [must] — escalation: fatal error code は awaiting-resume 遷移をスキップする

**Category**: correctness  
**Source**: Task 3.3, pipeline.ts FATAL_ERROR_CODES

**GIVEN**: job が `"failed"` 状態で `error.code === "SESSION_CREATE_FAILED"`（FATAL_ERROR_CODES に含まれる）  
**WHEN**: `nextStep === "escalate"` が評価される  
**THEN**: `transitionJob` は呼ばれず、state は `"failed"` のまま維持される

---

## TC-16 [should] — escalation: 非 fatal エラーで failed 状態の場合でも awaiting-resume に遷移する

**Category**: correctness  
**Source**: Task 3.3

**GIVEN**: job が `"failed"` 状態で `error.code === "AGENT_STEP_FAILED"`（FATAL_ERROR_CODES に含まれない）  
**WHEN**: `nextStep === "escalate"` が評価される  
**THEN**: `state.status === "awaiting-resume"` に遷移する

---

## TC-17 [must] — handleExhausted: ループ exhaustion で awaiting-resume に遷移する

**Category**: correctness  
**Source**: Task 4.1

**GIVEN**: ループステップが `maxIterations` 回に達し `handleExhausted` が呼ばれる  
**WHEN**: `transitionJob(stateWithSteps, "awaiting-resume", { patch: { resumePoint, error } })` が実行される  
**THEN**: 戻り値の `state.status === "awaiting-resume"` であり、`error.code` は LOOP_ERROR_CODES から引かれた値になる

---

## TC-18 [must] — handleExhausted: 最後のループ step result の verdict が "escalation" に更新される

**Category**: correctness  
**Source**: Task 4.1, Design D5

**GIVEN**: spec-review が 3 回実行され、最後の StepRun.verdict が "needs-fix" である  
**WHEN**: `handleExhausted` が呼ばれる  
**THEN**: `result.state.steps["spec-review"]` の最後のエントリの verdict が `"escalation"` に変更されている

---

## TC-19 [must] — handleExhausted: resumePoint.iterationsExhausted が maxIterations と一致する

**Category**: correctness  
**Source**: Task 4.1

**GIVEN**: Pipeline の `maxIterations === 3` でループが 3 回完走した  
**WHEN**: `handleExhausted` が呼ばれる  
**THEN**: `result.state.resumePoint.iterationsExhausted === 3` である

---

## TC-20 [must] — handleExhausted: 遷移後の state が persist される

**Category**: correctness  
**Source**: Task 4.1, Design D2

**GIVEN**: ループ exhaustion 条件が成立した  
**WHEN**: `handleExhausted` が完了する  
**THEN**: `store.persist()` が `transitionJob` の戻り値の state を引数として呼ばれる

---

## TC-21 [should] — handleExhausted: LOOP_ERROR_CODES に登録されたループ名は専用 error code を使う

**Category**: correctness  
**Source**: Task 4.1, pipeline.ts LOOP_ERROR_CODES

**GIVEN**: exhaustedLoopName が LOOP_ERROR_CODES に存在するキー（例: "spec-review"）である  
**WHEN**: `handleExhausted` が error shape を解決する  
**THEN**: `state.error.code` が `LOOP_ERROR_CODES["spec-review"].code` と一致する

---

## TC-22 [could] — handleExhausted: 未登録のループ名はループ名から error code を生成する

**Category**: correctness  
**Source**: Task 4.1

**GIVEN**: exhaustedLoopName が "custom-loop"（LOOP_ERROR_CODES に存在しない）  
**WHEN**: `handleExhausted` が error shape をフォールバックで生成する  
**THEN**: `state.error.code === "CUSTOM_LOOP_RETRIES_EXHAUSTED"` である

---

## TC-23 [must] — executor timeout: poll timeout で running→awaiting-resume に遷移する

**Category**: correctness  
**Source**: Task 5.1

**GIVEN**: agent step が `"running"` 状態のときに `runner.run` が `completionReason: "timeout"` を返す  
**WHEN**: executor の timeout 分岐が実行される  
**THEN**: `state.status === "awaiting-resume"` かつ `resumePoint.reason === "timeout"` である

---

## TC-24 [must] — executor timeout: resumePoint.step がタイムアウトしたステップ名になる

**Category**: correctness  
**Source**: Task 5.1, Design D3

**GIVEN**: step.name === "spec-review" の agent step がタイムアウトする  
**WHEN**: `transitionJob` の patch に `resumePoint` が渡される  
**THEN**: `result.state.resumePoint.step === "spec-review"` かつ `resumePoint.iterationsExhausted === 0` である

---

## TC-25 [must] — executor timeout: 遷移後の state が persist される

**Category**: correctness  
**Source**: Task 5.1, Design D2

**GIVEN**: agent step がタイムアウトし `transitionJob` が新しい state を返す  
**WHEN**: timeout ハンドラが完了する  
**THEN**: `store.persist()` が `transitionJob` の戻り値の state を引数として呼ばれる

---

## TC-26 [should] — executor timeout: error.code がランナーエラーに含まれない場合は "POLL_TIMEOUT" が使われる

**Category**: correctness  
**Source**: Task 5.1

**GIVEN**: `runner.run` が `completionReason: "timeout"` を返し、`error.code` が undefined である  
**WHEN**: errorInfo が構築される  
**THEN**: `errorInfo.code === "POLL_TIMEOUT"` である

---

## TC-27 [must] — 受け入れ基準: pipeline.ts に status 直接代入が残っていない

**Category**: correctness  
**Source**: Request 受け入れ基準, Task 6.3

**GIVEN**: 移行後の `src/core/pipeline/pipeline.ts`  
**WHEN**: `status: "awaiting-` または `status: "running"` パターンを grep する（transitionJob への引数文字列を除く）  
**THEN**: マッチなし（全遷移が `transitionJob` 経由）

---

## TC-28 [must] — 受け入れ基準: pipeline.ts に history スプレッド構文が残っていない

**Category**: correctness  
**Source**: Request 受け入れ基準, Task 6.4

**GIVEN**: 移行後の `src/core/pipeline/pipeline.ts`  
**WHEN**: `history: [...state.history` パターンを grep する  
**THEN**: マッチなし（全 history 操作が `appendHistoryEntry` または `transitionJob` 経由）

---

## TC-29 [must] — 受け入れ基準: 既存テストスイートが全て通る

**Category**: testing  
**Source**: Request 受け入れ基準, Task 6.2

**GIVEN**: 移行後のコードベース  
**WHEN**: `bun run test` を実行する  
**THEN**: 全テストが PASS し、リグレッションが存在しない

---

## TC-30 [must] — 受け入れ基準: TypeScript 型チェックが通る

**Category**: testing  
**Source**: Request 受け入れ基準, Task 6.1

**GIVEN**: 移行後のコードベース  
**WHEN**: `bun run typecheck` を実行する  
**THEN**: 型エラーが 0 件である

---

## TC-31 [must] — transitionJob: 全遷移で history エントリが 1 件追加される

**Category**: correctness  
**Source**: Design D7, lifecycle.ts

**GIVEN**: `transitionJob(state, to, ctx)` が呼ばれる（任意の有効遷移）  
**WHEN**: 遷移が完了する  
**THEN**: `result.state.history.length === state.history.length + 1` であり、追加エントリの `message` が `"{from} → {to}: {reason}"` を含む

---

## TC-32 [should] — transitionJob: 同一ステータスへの遷移は noop を返す

**Category**: correctness  
**Source**: lifecycle.ts D3

**GIVEN**: job が `"awaiting-resume"` 状態である  
**WHEN**: `transitionJob(state, "awaiting-resume", ctx)` が呼ばれる  
**THEN**: `result.noop === true` であり `result.state` は入力 state と同一参照

---

## TC-33 [must] — transitionJob: 無効遷移は詳細メッセージ付きで例外をスローする

**Category**: correctness  
**Source**: lifecycle.ts

**GIVEN**: job が `"archived"` 状態（terminal status）である  
**WHEN**: `transitionJob(state, "running", { trigger: "test", reason: "bad" })` が呼ばれる  
**THEN**: `"Invalid transition: archived → running"` を含む Error がスローされる
