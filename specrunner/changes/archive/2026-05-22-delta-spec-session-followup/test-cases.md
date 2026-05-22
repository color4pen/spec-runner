# Test Cases: delta-spec-session-followup

## Legend

| Field | Values |
|---|---|
| Priority | must / should / could |
| Source | T-01〜T-14 (tasks.md タスク番号) / acceptance (受け入れ基準) |
| Category | 分類 |

---

## Category: Interface / Type System

### TC-01: AgentRunContext に followUpPrompt field が追加される

- **Source**: T-01
- **Priority**: must

**GIVEN** `src/core/port/agent-runner.ts` の `AgentRunContext` interface が変更された  
**WHEN** `bun run typecheck` を実行する  
**THEN** `followUpPrompt?: string` が型エラーなしでコンパイルされる

---

### TC-02: followUpPrompt は省略可能 (既存 AgentRunContext の呼び出しに影響なし)

- **Source**: T-01
- **Priority**: must

**GIVEN** `AgentRunContext` に `followUpPrompt?: string` が追加された  
**WHEN** `followUpPrompt` を設定しない既存のコンテキスト構築コードをコンパイルする  
**THEN** 型エラーが発生しない

---

### TC-03: AgentStep に followUpPrompt field が追加される

- **Source**: T-02
- **Priority**: must

**GIVEN** `src/core/step/types.ts` の `AgentStep` interface が変更された  
**WHEN** `bun run typecheck` を実行する  
**THEN** `followUpPrompt?: string` が型エラーなしでコンパイルされる

---

### TC-04: followUpPrompt 未設定の既存 step 実装が型エラーにならない

- **Source**: T-02
- **Priority**: must

**GIVEN** `AgentStep` に `followUpPrompt?: string` が追加された  
**WHEN** `followUpPrompt` を持たない既存の step 実装 (DesignStep 以外) をコンパイルする  
**THEN** 型エラーが発生しない

---

## Category: Executor 転記

### TC-05: executor が step.followUpPrompt を ctx.followUpPrompt に転記する

- **Source**: T-03
- **Priority**: must

**GIVEN** `AgentStep.followUpPrompt` に文字列が設定されている  
**WHEN** `StepExecutor` が `runAgentStep` で ctx を構築する  
**THEN** `ctx.followUpPrompt` が `step.followUpPrompt` と同じ値になっている

---

### TC-06: followUpPrompt 未設定の step では ctx.followUpPrompt が undefined

- **Source**: T-03
- **Priority**: must

**GIVEN** `AgentStep.followUpPrompt` が未設定 (undefined)  
**WHEN** `StepExecutor` が ctx を構築する  
**THEN** `ctx.followUpPrompt` が undefined である

---

### TC-07: executor / finalizeStep が他に変更されていない

- **Source**: T-03, acceptance
- **Priority**: must

**GIVEN** T-03 の変更が適用されている  
**WHEN** `src/core/step/executor.ts` を確認する  
**THEN** `followUpPrompt` 転記以外の executor / finalizeStep のロジックに変更がない

---

### TC-08: pipeline の step 遷移・FIXER_STEP_NAMES が無改修

- **Source**: T-03, T-14, acceptance
- **Priority**: must

**GIVEN** 全タスクが完了している  
**WHEN** `grep -n "FIXER_STEP_NAMES" src/core/step/fixer-helpers.ts` を実行する  
**THEN** 変更がなく、新 step の追加も step 遷移の変更もない

---

## Category: Shared Follow-up Helper

### TC-09: shouldRunFollowUp — followUpPrompt 有 + success → true

- **Source**: T-04, T-10
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が非空文字列で、`baseCompletionReason` が `"success"` である  
**WHEN** `shouldRunFollowUp(ctx, "success")` を呼ぶ  
**THEN** 戻り値が `true` である

---

### TC-10: shouldRunFollowUp — followUpPrompt 有 + error → false

- **Source**: T-04, T-10
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が非空文字列で、`baseCompletionReason` が `"error"` である  
**WHEN** `shouldRunFollowUp(ctx, "error")` を呼ぶ  
**THEN** 戻り値が `false` である

---

### TC-11: shouldRunFollowUp — followUpPrompt 有 + timeout → false

- **Source**: T-04, T-10
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が非空文字列で、`baseCompletionReason` が `"timeout"` である  
**WHEN** `shouldRunFollowUp(ctx, "timeout")` を呼ぶ  
**THEN** 戻り値が `false` である

---

### TC-12: shouldRunFollowUp — followUpPrompt undefined → false

- **Source**: T-04, T-10
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が `undefined` で、`baseCompletionReason` が `"success"` である  
**WHEN** `shouldRunFollowUp(ctx, "success")` を呼ぶ  
**THEN** 戻り値が `false` である

---

### TC-13: shouldRunFollowUp — followUpPrompt 空文字 → false

- **Source**: T-04, T-10
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が `""` (空文字) で、`baseCompletionReason` が `"success"` である  
**WHEN** `shouldRunFollowUp(ctx, "success")` を呼ぶ  
**THEN** 戻り値が `false` である

---

### TC-14: mergeFollowUpResult — sessionId が base から維持される

- **Source**: T-04, T-10
- **Priority**: must

**GIVEN** `baseResult.sessionId` が `"session-abc"` で、follow turn の resultContent が `"fixed content"` である  
**WHEN** `mergeFollowUpResult(baseResult, "fixed content")` を呼ぶ  
**THEN** 戻り値の `sessionId` が `"session-abc"` のまま維持される

---

### TC-15: mergeFollowUpResult — resultContent が follow turn の値に置き換わる

- **Source**: T-04, T-10
- **Priority**: must

**GIVEN** `baseResult.resultContent` が `"original"` で、follow turn の content が `"fixed"` である  
**WHEN** `mergeFollowUpResult(baseResult, "fixed")` を呼ぶ  
**THEN** 戻り値の `resultContent` が `"fixed"` である

---

### TC-16: mergeFollowUpResult — modelUsage が base の値を維持する

- **Source**: T-04, T-10
- **Priority**: must

**GIVEN** `baseResult.modelUsage` が adapter native で算出された最終値 (事前反映済み) である  
**WHEN** `mergeFollowUpResult(baseResult, followContent)` を呼ぶ  
**THEN** 戻り値の `modelUsage` が `baseResult.modelUsage` と同一である

---

### TC-17: shared が runtime 固有 import を含まない

- **Source**: T-04, acceptance
- **Priority**: must

**GIVEN** `src/adapter/shared/follow-up.ts` が実装されている  
**WHEN** ファイルの import 宣言を確認する  
**THEN** `AsyncGenerator` / `Turn` / poll result 等の adapter runtime 固有型の import が存在しない

---

### TC-18: 依存方向が adapter → shared 純粋関数の一方向

- **Source**: T-04, T-05, T-06, T-07, T-08, acceptance
- **Priority**: must

**GIVEN** `src/adapter/shared/follow-up.ts` が実装され、各 adapter が shared helper を import している  
**WHEN** shared の import 宣言と各 adapter のコードを確認する  
**THEN** shared が adapter のコードを import していない (循環依存なし)

---

## Category: ClaudeCode Adapter

### TC-19: followUpPrompt 指定時に queryFn が 2 回呼ばれる

- **Source**: T-05, T-11
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が非空文字列で、ClaudeCodeRunner.run() が呼ばれる  
**WHEN** queryFn の呼び出し回数をモックで記録する  
**THEN** queryFn が計 2 回呼ばれる

---

### TC-20: 2 回目の queryFn options に resume: sessionId が含まれる

- **Source**: T-05, T-11
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が指定されており、1 回目の queryFn が `session_id: "sid-1"` を返す  
**WHEN** ClaudeCodeRunner.run() が実行される  
**THEN** 2 回目の queryFn options に `resume: "sid-1"` が含まれる

---

### TC-21: 2 回目の queryFn の prompt が followUpPrompt

- **Source**: T-05, T-11
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が `"rules.md を読んで修正せよ"` である  
**WHEN** ClaudeCodeRunner.run() が実行される  
**THEN** 2 回目の queryFn に渡される prompt が `"rules.md を読んで修正せよ"` である

---

### TC-22: followUpPrompt 未指定時に queryFn が 1 回のみ

- **Source**: T-05, T-11
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が `undefined` である  
**WHEN** ClaudeCodeRunner.run() が実行される  
**THEN** queryFn が 1 回のみ呼ばれる (既存挙動)

---

### TC-23: Claude — modelUsage が follow turn の SDK 累積値

- **Source**: T-05, T-11, acceptance
- **Priority**: must

**GIVEN** follow turn の queryFn が `modelUsage: { inputTokens: 500, outputTokens: 200 }` を返す  
**WHEN** ClaudeCodeRunner.run() が完了する  
**THEN** result の `modelUsage` が follow turn の累積値 `{ inputTokens: 500, outputTokens: 200 }` である

---

### TC-24: Claude — follow turn が error の場合 completionReason が error

- **Source**: T-05, T-11
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が指定され、2 回目の queryFn がエラーをスローする  
**WHEN** ClaudeCodeRunner.run() が実行される  
**THEN** result の `completionReason` が `"error"` である

---

### TC-25: Claude — AbortController abort が 2 turn に伝搬する

- **Source**: T-05, T-11, acceptance
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が指定され、AbortController が abort される  
**WHEN** abort が 1 回目の turn 実行中に発生する  
**THEN** 2 回目の turn が開始されず、timeout による completion が返る

---

### TC-26: Claude — result file の読み出しが follow turn 完了後に 1 回

- **Source**: T-05
- **Priority**: should

**GIVEN** `ctx.followUpPrompt` が指定されている  
**WHEN** ClaudeCodeRunner.run() が実行される  
**THEN** result file の読み出しが 1 回 (follow turn 完了後) のみ行われる

---

## Category: Codex Adapter

### TC-27: followUpPrompt 指定時に thread.run が同一 thread で 2 回呼ばれる

- **Source**: T-06, T-12
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が非空文字列で、CodexAgentRunner.run() が呼ばれる  
**WHEN** thread mock の run 呼び出し回数を記録する  
**THEN** 同一 thread の `run()` が 2 回呼ばれる

---

### TC-28: 2 回目の thread.run prompt が followUpPrompt

- **Source**: T-06, T-12
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が `"rules.md を読んで修正せよ"` である  
**WHEN** CodexAgentRunner.run() が実行される  
**THEN** 2 回目の `thread.run()` に渡される prompt が `"rules.md を読んで修正せよ"` である

---

### TC-29: followUpPrompt 未指定時に thread.run が 1 回のみ

- **Source**: T-06, T-12
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が `undefined` である  
**WHEN** CodexAgentRunner.run() が実行される  
**THEN** `thread.run()` が 1 回のみ呼ばれる

---

### TC-30: Codex — modelUsage が turn 1 + turn 2 の加算

- **Source**: T-06, T-12, acceptance
- **Priority**: must

**GIVEN** turn 1 の usage が `{ input_tokens: 100, output_tokens: 50 }`、turn 2 が `{ input_tokens: 80, output_tokens: 30 }` である  
**WHEN** CodexAgentRunner.run() が完了する  
**THEN** result の `modelUsage` が `{ input_tokens: 180, output_tokens: 80 }` である (加算値)

---

### TC-31: Codex — modelUsage 加算で turn 1 の usage が失われない

- **Source**: T-06, acceptance
- **Priority**: must

**GIVEN** `followUpPrompt` が指定され、turn 1 の usage が存在する  
**WHEN** CodexAgentRunner.run() が内部で turn を進める  
**THEN** turn 1 の usage が turn 2 の代入で上書きされず、最終 modelUsage に turn 1 分が含まれる

---

### TC-32: Codex — signal が follow turn にも渡される

- **Source**: T-06, T-12, acceptance
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が指定され、AbortController の signal がある  
**WHEN** CodexAgentRunner.run() が実行される  
**THEN** 2 回目の `thread.run()` に同一 signal が渡される

---

### TC-33: Codex — usage に shared の一律加算ロジックが存在しない

- **Source**: T-06, acceptance
- **Priority**: must

**GIVEN** 全実装が完了している  
**WHEN** `src/adapter/shared/follow-up.ts` のコードを確認する  
**THEN** usage を加算するロジックが shared に存在しない (Codex native の加算のみ)

---

## Category: ManagedAgent Adapter (SSE 経路)

### TC-34: SSE end_turn + followUpPrompt 指定時に sendUserMessage が呼ばれる

- **Source**: T-07, T-13
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が非空文字列で、SSE が `end_turn` で完了する  
**WHEN** ManagedAgentRunner の `runDesignStyle()` が実行される  
**THEN** `sessionClient.sendUserMessage(sessionId, ctx.followUpPrompt)` が 1 回呼ばれる

---

### TC-35: SSE end_turn + followUpPrompt 指定時に pollUntilComplete が呼ばれる

- **Source**: T-07, T-13
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が指定され、SSE が `end_turn` で完了し、sendUserMessage が成功する  
**WHEN** ManagedAgentRunner の `runDesignStyle()` が実行される  
**THEN** `sessionClient.pollUntilComplete(sessionId, ...)` が follow turn として呼ばれる

---

### TC-36: SSE terminated 時に follow turn が実行されない

- **Source**: T-07, T-13
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が指定されているが、SSE が `terminated` で終了する  
**WHEN** ManagedAgentRunner の `runDesignStyle()` が実行される  
**THEN** `sendUserMessage` が follow turn 用途で呼ばれない

---

### TC-37: SSE 経路 — followUpPrompt 未指定時に既存挙動

- **Source**: T-07, T-13
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が `undefined` である  
**WHEN** ManagedAgentRunner の `runDesignStyle()` が実行される  
**THEN** follow turn 用の `sendUserMessage` が呼ばれない (既存挙動)

---

### TC-38: SSE 経路 — sendUserMessage 失敗時に graceful degradation

- **Source**: T-07, T-13
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が指定され、SSE が `end_turn` で完了するが、`sendUserMessage` がエラーをスローする  
**WHEN** ManagedAgentRunner の `runDesignStyle()` が実行される  
**THEN** 警告が stderr に出力され、作業 turn の result がそのまま返される (非致命的)

---

## Category: ManagedAgent Adapter (Polling 経路)

### TC-39: polling idle + followUpPrompt 指定時に sendUserMessage が 2 回呼ばれる

- **Source**: T-08, T-13
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が指定され、作業 turn の polling が `idle` で完了する  
**WHEN** ManagedAgentRunner の `runPollingStyle()` が実行される  
**THEN** `sendUserMessage` が作業 turn 1 回 + follow turn 1 回の計 2 回呼ばれる

---

### TC-40: polling idle + followUpPrompt 指定時に pollUntilComplete が 2 回呼ばれる

- **Source**: T-08, T-13
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が指定され、作業 turn の polling が `idle` で完了する  
**WHEN** ManagedAgentRunner の `runPollingStyle()` が実行される  
**THEN** `pollUntilComplete` が作業 turn + follow turn で計 2 回呼ばれる

---

### TC-41: polling terminated 時に follow turn が実行されない

- **Source**: T-08, T-13
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が指定されているが、作業 turn の polling が `terminated` で終了する  
**WHEN** ManagedAgentRunner の `runPollingStyle()` が実行される  
**THEN** follow turn 用の `sendUserMessage` が呼ばれない

---

### TC-42: polling 経路 — sendUserMessage 失敗時に graceful degradation

- **Source**: T-08, T-13
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が指定され、follow turn の `sendUserMessage` がエラーをスローする  
**WHEN** ManagedAgentRunner の `runPollingStyle()` が実行される  
**THEN** 警告が stderr に出力され、作業 turn の result が返される

---

## Category: DesignStep Wiring

### TC-43: DesignStep.followUpPrompt が非 undefined の string

- **Source**: T-09
- **Priority**: must

**GIVEN** `src/core/step/design.ts` が変更されている  
**WHEN** `DesignStep.followUpPrompt` の値を確認する  
**THEN** 非 undefined の非空文字列である

---

### TC-44: DesignStep の followUpPrompt 文面に rules.md の Read 指示が含まれる

- **Source**: T-09
- **Priority**: must

**GIVEN** `DesignStep.followUpPrompt` が設定されている  
**WHEN** 文面を確認する  
**THEN** `rules.md` を Read tool で読む指示が含まれる

---

### TC-45: DesignStep の followUpPrompt 文面に delta spec 記法の具体規律が含まれる

- **Source**: T-09
- **Priority**: must

**GIVEN** `DesignStep.followUpPrompt` が設定されている  
**WHEN** 文面を確認する  
**THEN** `## Removed` / `## Renamed` / `### Requirement:` / `#### Scenario:` / SHALL/MUST 等の規律が列挙されている

---

### TC-46: DesignStep の followUpPrompt 文面が action 指示 (self-fix) であって検出ゲートではない

- **Source**: T-09
- **Priority**: must

**GIVEN** `DesignStep.followUpPrompt` が設定されている  
**WHEN** 文面を確認する  
**THEN** 「修正」「fix」等の action 指示が含まれ、「判定」「違反していないか確認」等の self-review 的表現が含まれない

---

## Category: Timeout / AbortController

### TC-47: followUpPrompt 指定時に wall-clock timeout が 2 turn 合算で 1 本

- **Source**: T-05, T-06, T-07, T-08, acceptance
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が指定され、AbortController が `run()` 全体をカバーしている  
**WHEN** タイムアウトが設定された状態で run() が実行される  
**THEN** 作業 turn と follow turn の合計時間でタイムアウトが判定される (turn ごとに独立したタイマーを持たない)

---

### TC-48: AbortController abort が作業 turn と follow turn の両方に伝搬する

- **Source**: T-05, T-11, acceptance
- **Priority**: must

**GIVEN** `ctx.followUpPrompt` が指定され、ClaudeCodeRunner が実行中である  
**WHEN** AbortController の `abort()` が呼ばれる  
**THEN** 進行中の turn に abort が伝搬し、follow turn が開始済みであれば中断される

---

## Category: Pipeline Integrity (非回帰)

### TC-49: executor からは run() が 1 回の await に見える

- **Source**: T-03, acceptance
- **Priority**: must

**GIVEN** 全タスクが完了し、`followUpPrompt` が指定されている  
**WHEN** `StepExecutor` が `runner.run(ctx)` を呼ぶ  
**THEN** executor から見て `run()` が 1 回の await で完了し、内部 2 turn は隠蔽されている

---

### TC-50: dsv が self-fix 後に通常通り実行される

- **Source**: acceptance
- **Priority**: must

**GIVEN** design step が `followUpPrompt` 付きで実行された  
**WHEN** step が完了し、次の pipeline 処理に進む  
**THEN** `delta-spec-validation` が通常通り (無改修で) 実行される

---

### TC-51: 新しい step が pipeline に追加されていない

- **Source**: acceptance
- **Priority**: must

**GIVEN** 全タスクが完了している  
**WHEN** pipeline の step 定義を確認する  
**THEN** follow-up のための新 step が追加されていない

---

### TC-52: step 遷移の state machine に変更がない

- **Source**: acceptance
- **Priority**: must

**GIVEN** 全タスクが完了している  
**WHEN** step 遷移のロジックを確認する  
**THEN** followUpPrompt による step 遷移の変更がない

---

## Category: 汎用性

### TC-53: DesignStep 以外の step が followUpPrompt を追加 infra なしで設定できる

- **Source**: T-09, acceptance (汎用 field)
- **Priority**: should

**GIVEN** `AgentStep` interface に `followUpPrompt?: string` が追加されている  
**WHEN** DesignStep 以外の任意の step に `followUpPrompt` を設定する  
**THEN** primitive (adapter / executor / shared helper) の改修なしで 2 段実行が機能する

---

## Category: 全体検証

### TC-54: bun run typecheck が green

- **Source**: T-14
- **Priority**: must

**GIVEN** 全タスク (T-01〜T-13) が完了している  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーなしで終了する

---

### TC-55: bun run test が green

- **Source**: T-14
- **Priority**: must

**GIVEN** 全タスク (T-01〜T-13) が完了している  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass する

---

### TC-56: shared の unit test が全 case green (T-10)

- **Source**: T-10
- **Priority**: must

**GIVEN** `tests/adapter/shared/follow-up.test.ts` が実装されている  
**WHEN** `bun run test` を実行する  
**THEN** shouldRunFollowUp の 5 ケースと mergeFollowUpResult の 3 ケースが全て pass する

---

### TC-57: ClaudeCodeRunner の unit test が全 case green (T-11)

- **Source**: T-11
- **Priority**: must

**GIVEN** `tests/unit/adapter/claude-code/agent-runner.test.ts` に follow-up テストが追加されている  
**WHEN** `bun run test` を実行する  
**THEN** 7 テストケースが全て pass する

---

### TC-58: CodexAgentRunner の unit test が全 case green (T-12)

- **Source**: T-12
- **Priority**: must

**GIVEN** `tests/adapter/codex/agent-runner.test.ts` に follow-up テストが追加されている  
**WHEN** `bun run test` を実行する  
**THEN** 5 テストケースが全て pass する

---

### TC-59: ManagedAgentRunner の unit test が全 case green (T-13)

- **Source**: T-13
- **Priority**: must

**GIVEN** `tests/unit/adapter/managed-agent/agent-runner.test.ts` に follow-up テストが追加されている  
**WHEN** `bun run test` を実行する  
**THEN** SSE 経路 4 ケース + polling 経路 3 ケースが全て pass する

---

## Summary

| Priority | Count |
|---|---|
| must | 55 |
| should | 3 |
| could | 0 |
| **Total** | **58** |

| Category | Count |
|---|---|
| Interface / Type System | 4 |
| Executor 転記 | 4 |
| Shared Follow-up Helper | 10 |
| ClaudeCode Adapter | 8 |
| Codex Adapter | 7 |
| ManagedAgent (SSE) | 5 |
| ManagedAgent (Polling) | 4 |
| DesignStep Wiring | 4 |
| Timeout / AbortController | 2 |
| Pipeline Integrity | 4 |
| 汎用性 | 1 |
| 全体検証 | 6 |
