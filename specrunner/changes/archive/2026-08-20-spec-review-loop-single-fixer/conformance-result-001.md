# Conformance Result — spec-review-loop-single-fixer — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 受け入れ基準

| # | 基準 | 確認方法 | 結果 |
|---|------|----------|------|
| 1 | **#1015 の歯**: test-case-gen がループ中に起動されないことをテストで pin | `tests/pipeline-integration.test.ts:1793` T-07 — `testCaseGenSteps.length === 1` を assert | ✅ |
| 2 | test-cases.md 宛 fixable finding が spec-fixer に route され escalation にならない | `spec-review-fixer-routing.test.ts:949`（TC-013）、`spec-fixer-tasks-md-writable.test.ts:326`（TC-005）— medium finding → "approved" | ✅ |
| 3 | 削除対象が src/ に存在しない（`specReviewNeedsFixIsTcOnly` / `testCaseGenEffectiveFixer` / TC 再生成・TC-only transition / `loopIntermediateSteps`） | grep で src/ 全体を確認、いずれも 0 件 | ✅ |
| 4 | test-case-gen が review loop 中に起動されない（transition 検証） | `pipeline.transitions.test.ts:393-405`（T-07 transition pin）で SPEC_REVIEW→TEST_CASE_GEN・SPEC_FIXER→TEST_CASE_GEN が不在を assert | ✅ |
| 5 | design → test-case-gen 初回経路と exempt bypass の既存テストが green | `types.ts:235-236` に両行存在確認。全 791 テストファイル green | ✅ |
| 6 | spec-review ⇄ spec-fixer の convergence budget が透過化なしで正しく計上される | `tests/pipeline-integration.test.ts:395`（TC-012）— maxRetries=2 で 3 回 needs-fix → SPEC_REVIEW_RETRIES_EXHAUSTED。`pipeline.ts:517` の newEpisode 判定は `currentStep !== pairedFixerForNext` のみ | ✅ |
| 7 | `bun run typecheck` / `bun run test` green | `verification-result.md`: typecheck/test/build/lint 全 passed、791 test files、11802 tests passed | ✅ |

### spec.md Requirements

**Requirement: spec-review の fixable canon finding は spec-fixer に route される（SHALL）**

- effective fixer は spec-fixer 一本: `deriveSpecReviewVerdict`（`judge-verdict.ts:84`）は `specReviewEffectiveFixer`（= "spec-fixer"）のみ使用。`testCaseGenEffectiveFixer` 参照なし（削除済み）。✅
- test-cases.md 宛 finding → not escalation: `canonScope.writableByFixer["spec-fixer"]` に `test-cases.md` を含む（`canon-write-scope.ts:43`）ため `selectRoutableCanonFindings` が positive を返し、4a（escalation）に到達しない。TC-013・TC-005 で pin。✅
- request.md 宛 finding → escalation: spec-fixer が request.md を writable に含まないため、4a の `fixableCanon.some(f => !specRoutableFiles.has(f.file))` が true → escalation。TC-006 で維持確認。✅

**Requirement: spec-fixer は test-cases.md を targeted に修正し再生成しない（MUST）**

- write scope: `writableByFixer["spec-fixer"]` に `test-cases.md` 追加（`canon-write-scope.ts:43`）。`SpecFixerStep.writes()` が `test-cases.md` を返す（`spec-fixer.ts:105`）。TC-001/TC-002/drift-guard TC-029 で pin。✅
- system prompt: `spec-fixer-system.ts:37` に「既存の TC を尊重した targeted 修正」「再生成はしない（finding が指す TC のみを最小限に変更し、無関係な TC・operator 編集には触れない）」の記述あり。TC-009 で文字列確認。✅

**Requirement: test-case-gen は design 後に一度だけ走る producer である（SHALL）**

- ループ内不起動: `STANDARD_TRANSITIONS` に `SPEC_REVIEW → TEST_CASE_GEN`・`SPEC_FIXER → TEST_CASE_GEN` が存在しない（`types.ts` 確認）。T-07 transition pin で機械的に検証。✅
- needs-fix 一巡に test-case-gen が現れない: T-07 integration test（`pipeline-integration.test.ts:1793`）で `testCaseGenSteps.length === 1` を assert。✅
- 初回経路維持: `DESIGN → TEST_CASE_GEN`（`types.ts:236`）・`TEST_CASE_GEN → SPEC_REVIEW`（`types.ts:246`）存在確認。✅

**Requirement: operator が採用した test-cases.md 編集は needs-fix 一巡で保存される（MUST）**

- 構造的保証: ループ内に test-cases.md を wholesale 再生成する step が存在しないことで保証（test-case-gen ループ排除 = T-07 integration pin）。design.md Risk 3 の mitigation に一致。✅
- targeted 修正の prompt 指示: spec-fixer system prompt が「finding が指す TC のみ最小限に変更、無関係な TC・operator 編集には触れない」を指示。✅

**Requirement: spec-review ⇄ spec-fixer の収束予算は透過化なしで数えられる（SHALL）**

- `loopIntermediateSteps` 削除: `types.ts`・`pipeline.ts`・`registry.ts`・`run.ts` から完全削除（grep 0 件）。TC-06-6（`registry-invariants.test.ts:157`）で `STANDARD_DESCRIPTOR.loopIntermediateSteps === undefined` を pin。✅
- newEpisode 判定: `pipeline.ts:517` で `let newEpisode = currentStep !== pairedFixerForNext;` のみ（loopIntermediateSteps 条件除去済み）。✅
- 予算枯渇: TC-012 integration test（maxRetries=2 → 3 回 needs-fix → SPEC_REVIEW_RETRIES_EXHAUSTED）が green。✅

### 削除対象の不在確認

| シンボル | 対象ファイル | 結果 |
|---------|------------|------|
| `testCaseGenEffectiveFixer` | `canon-escalation.ts`（削除元）、src/ 全体 | 0 件 ✅ |
| `specReviewNeedsFixIsTcOnly` | `spec-observation.ts`（削除元）、src/ 全体 | 0 件 ✅ |
| `specFixerNeedsFixForward` | `spec-observation.ts`（削除元）、src/ 全体 | 0 件 ✅ |
| `loopIntermediateSteps` | `types.ts`/`pipeline.ts`/`registry.ts`/`run.ts`、src/ 全体 | 0 件 ✅ |
| `SPEC_REVIEW → TEST_CASE_GEN` transition | `STANDARD_TRANSITIONS` | 0 件 ✅ |
| `SPEC_FIXER → TEST_CASE_GEN` transition | `STANDARD_TRANSITIONS` | 0 件 ✅ |

### STANDARD_TRANSITIONS 行数確認

削除 2 行（SPEC_REVIEW→TEST_CASE_GEN、SPEC_FIXER→TEST_CASE_GEN）で 47 → 45。`pipeline.transitions.test.ts:275`・`test-case-gen-design-phase.test.ts:1224`・`transition-when.test.ts:196`・`spec-observation-autofix.test.ts:1430` の 4 テストがいずれも 45 を assert。✅

## 検証できなかった項目

None — すべての受け入れ基準を実装とテストで確認済み。

## Findings 詳細

None — 規範違反は検出されなかった。

### 参考（非ブロッキング）

- `canon-write-scope.test.ts:286` の TC-029 describe タイトルが旧記述（`{spec.md, design.md, tasks.md}`）のまま、test-cases.md を未追記。テスト本体はサイズと集合要素を動的比較するため green を維持し、spec 規範の侵害なし。将来の保守性のため任意更新推奨。
