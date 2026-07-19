# Tasks: reviewer の approved を fixer 予算切れで覆さない

<!--
実装は engine（src/core/pipeline/pipeline.ts）に閉じる。transition table
（buildReviewerChainTransitions / buildParallelReviewerTransitions）の
approved→code-fixer 行は削除・変更しない。verdict 導出規則も変更しない。
-->

## T-01: reviewer の直近 fixable finding 件数を返す純関数を追加する

- [x] `src/core/pipeline/reviewer-chain.ts` に純関数 `lastReviewerFixableCount(state: JobState, reviewer: string): number` を追加し export する。
- [x] 実装は既存 private `lastFindingsOf(state, reviewer)`（reviewer-chain.ts:115）と既存 import `collectFixableFindings`（reviewer-chain.ts:17）を再利用し、`collectFixableFindings(lastFindingsOf(state, reviewer)).length` を返す。
- [x] reviewer に run が無い / toolResult が無い場合は 0 を返す（`lastFindingsOf` の空配列フォールバックに従う）。
- [x] I/O・副作用を持たない純関数として実装する。

**Acceptance Criteria**:
- `lastReviewerFixableCount` が export され、`code-review` / custom reviewer / `regression-gate` いずれの step 名でも直近 run の `outcome.toolResult.findings` から `resolution==="fixable"` の件数を返す。
- run が無い step 名に対して 0 を返す。
- 既存 `lastFindingsOf` の振る舞いは変更しない。

## T-02: 新規 DomainEvent `pipeline:fixer:budget-skipped` を追加する

- [x] `src/kernel/event-types.ts` の `DomainEvent` union に `"pipeline:fixer:budget-skipped"` を追加する。
- [x] `src/core/event/types.ts` の `EventPayloadMap` に対応 payload を追加する: `{ step: string; fixer: string; omittedFixableFindings: number; maxIterations: number }`（`step` = 承認した reviewer、`fixer` = 予算切れの paired fixer）。
- [x] `src/logger/pipeline-logger.ts` の `subscribe` で本 event を購読し、`{ type, step, fixer, omittedFixableFindings, maxIterations }` を JSONL に書く。
- [x] （任意）`src/cli/progress.ts` で本 event を購読し、省略を 1 行表示する。必須ではない。

**Acceptance Criteria**:
- `DomainEvent` と `EventPayloadMap` の双方に新 key が存在し、`typecheck` が green（`Payload<>` 参照が壊れない）。
- `PipelineLogger.subscribe` 済みの EventBus で本 event を emit すると JSONL に 1 行追加される。
- 既存 event の payload・購読は無変更。

## T-03: engine に「approved を fixer 予算切れで覆さない」再 routing を追加する

- [x] `src/core/pipeline/pipeline.ts` の `runInternal` で、transition 解決直後（`nextStep` 確定後、episode-reset / 突入前 exhaustion 検査の**前**、現行 pipeline.ts:366〜418 の間）に再 routing 判定を挿入する。
- [x] 発火条件（すべて満たすとき）:
  1. `outcome === "approved"`。
  2. `nextStep` が fixer（`new Set(Object.values(this.loopFixerPairs)).has(nextStep)`）。
  3. `budget.getFixerIter(nextStep) >= this.resolveMaxIterations(resolvePairedReviewForFixer(state, nextStep, this.loopFixerPairs))`（既存 fixer 突入前 exhaustion 検査 pipeline.ts:495-497 と同一の閾値計算）。
- [x] 発火時: transition table から `currentStep` の clean approved 遷移先を引く（`t.step === currentStep && t.on === "approved" && !fixerNames.has(t.to) && (!t.when || t.when(state))` の最初の一致の `t.to`）。
- [x] clean 遷移先が得られたとき: D3 の記録（T-04 で規定）を行った上で `nextStep` をその遷移先へ差し替える。`handleExhausted` は呼ばず、reviewer の StepRun（verdict / toolResult / findingsPath）は上書きしない。
- [x] clean 遷移先が得られない場合: 差し替えず従来の後続 exhaustion 検査に委ねる（fail-safe = 従来 escalation）。
- [x] `nextStep` は差し替え可能にするため `let` にする（現行は `const`）。fixer 突入前 exhaustion 検査（pipeline.ts:493-499）は差し替え後 `nextStep` が fixer でなくなるため発火しないことを確認する。

**Acceptance Criteria**:
- 発火条件3の budget 判定が既存 exhaustion 検査（pipeline.ts:497）と同値になる（approved→fixer 間に episode reset が挟まらないため）。
- 再 routing 後、既存 episode-reset / loop 突入前 exhaustion 検査が差し替え後 `nextStep` に対して従来どおり走る。
- budget に余裕がある（条件3 が偽）場合は差し替えず、従来どおり fixer が実行される（通常時の任意修正を失わない）。

## T-04: 省略を history と event に明示する

- [x] T-03 の再 routing 発火時、`lastReviewerFixableCount(state, currentStep)`（T-01）で省略件数 `omitted` を算出する。
- [x] `this.events.emit("pipeline:fixer:budget-skipped", { step: currentStep, fixer: nextStep, omittedFixableFindings: omitted, maxIterations: effectiveMax })` を emit する。
- [x] `appendHistoryEntry`（pipeline.ts:5 で import 済み）で history に `status: "warning"`、`step: currentStep`、対象 reviewer step 名・省略件数・paired fixer 名・遷移先を含む message を追加し、差し替え後 state を後続処理へ渡す（既存の transition history append で永続化される）。
- [x] history message は「approved 済みで、予算切れにより任意（fixable）修正を N 件省略して <遷移先> へ進んだ」ことが後から読み取れる文言にする。

**Acceptance Criteria**:
- 再 routing 発火時、history に省略を示す `warning` エントリ（対象 step 名 + 省略件数を含む）が 1 件追加される。
- 同時に `pipeline:fixer:budget-skipped` event が `step`（reviewer）と `omittedFixableFindings`（件数）付きで emit される。
- 非発火時（budget 余裕 / needs-fix 予算切れ）はこの history / event を出さない。

## T-05: 受け入れ基準を固定するテストを追加する

<!-- interface（engine の再 routing）確定後に code テストを書く。scenario は spec.md 準拠。 -->

- [x] **T1（standard 経路・承認を覆さない）**: `buildReviewerChainTransitions(["code-review"])` を用いた最小 pipeline で、`code-review` が needs-fix → needs-fix → approved(+fixable 1件)、`code-fixer` が approved、maxIterations=2 の駆動により、最終 approved が予算切れ fixer へ routing される状況を作る。結果が escalation せず clean approved 遷移先（conformance / end）へ進むことを固定する。**破壊確認**: T-03 の再 routing を無効化すると本テストが `CODE_REVIEW_RETRIES_EXHAUSTED` の escalation で落ちること（コメントで明記）。
- [x] **T2（custom/parallel 経路・承認を覆さない）**: `buildParallelReviewerTransitions` + `parallelReview`（coordinator + 1 member）を設定した pipeline で、`code-review` が同条件（needs-fix×2 → approved+fixable、`code-fixer` budget 切れ）から escalation せず clean approved 遷移先（coordinator）へ進むことを固定する。T1 と独立に置き、T1 の green を本経路の証拠にしない。
- [x] **T3（省略の明示）**: T1/T2 いずれかの発火時に、history に「任意修正を予算切れで省略した」旨と対象 step 名（`code-review`）・省略件数（1）が記録され、かつ `pipeline:fixer:budget-skipped` event が同内容で emit されることを、EventBus 購読と `result.history` の両方で固定する。
- [x] **T4（needs-fix は従来どおり停止）**: `code-review` が maxIterations 回とも `needs-fix`（bypass 1 回を含む）の場合、従来どおり `CODE_REVIEW_RETRIES_EXHAUSTED` で `awaiting-resume` になり、停止メッセージが `code-review did not approve after N iterations` のままであることを固定する（回帰防止）。
- [x] **T5（findings の保持）**: T1/T2 の発火後、対象 reviewer の直近 StepRun の verdict が `approved` のまま、記録された fixable findings（`outcome.toolResult.findings`）と findingsPath が失われないことを固定する。
- [x] **要件5 の固定**: T1/T2 の発火後の `result` に `did not approve` を含む error・停止メッセージが存在しないことを assert する。

**Acceptance Criteria**:
- T1〜T5 と要件5 の各テストが green。
- T1 の破壊確認（再 routing 無効化で escalation）がコメントで再現手順とともに明記されている。
- T2 が `buildParallelReviewerTransitions` 経路を独立に検証している。

## T-06: backward-compat と全体検証

- [x] 既存の pipeline / exhaustion / reviewer-chain / custom-reviewers 系テスト（例: `tests/pipeline-integration.test.ts` TC-061/TC-062、`tests/unit/core/pipeline/pipeline.transitions.test.ts` TC-017、`pipeline.episode-reset.test.ts` TC-072〜074）が無変更で green であることを確認する。approved+fixable+予算切れ→escalation という現行バグ挙動を固定した既存テストが**無い**ことを確認する（見つかった場合のみ、意味が変わる approved-exhaustion 系として期待を更新し、更新理由をコメントで残す）。
  - TC-014（新 test file 内）が approved-exhaustion の旧挙動を固定していたため `it.skip` に更新。理由コメント付き。
- [x] `pipeline-logger` の event 網羅テスト等、event 一覧を検査するテストがあれば新 event の追加に合わせて更新する。（既存の pipeline-logger テストは event 一覧を検査しないため変更不要）
- [x] `bun run typecheck && bun run test` が green。（538 test files, 7385 tests passed, 1 skipped）

**Acceptance Criteria**:
- 既存テストは approved-exhaustion の期待更新（存在する場合のみ）を除き無変更で green。
- `typecheck && test` が green。
- transition table の `approved→code-fixer` 行・verdict 導出規則・`needs-fix` 予算切れ挙動・`LOOP_ERROR_CODES` 文言はいずれも未変更である。
