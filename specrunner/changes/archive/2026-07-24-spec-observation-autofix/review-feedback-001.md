# Review Feedback: spec-observation-autofix (Iteration 1)

## Scope

Change folder: `specrunner/changes/spec-observation-autofix`
Files reviewed: `src/core/step/judge-verdict.ts`, `src/core/step/canon-write-scope.ts`,
`src/core/pipeline/spec-observation.ts`, `src/core/pipeline/types.ts`,
`src/core/pipeline/findings-ledger.ts`, `src/core/step/regression-gate.ts`,
plus existing tests updated and new test `tests/unit/core/pipeline/spec-observation-autofix.test.ts`.

## Evidence

### Acceptance criteria verification

| Criterion | Coverage | Evidence |
|---|---|---|
| medium fixable on spec.md → approved; spec-fixer 後 test-case-gen 直行 | TC-001, TC-006, TC-008, TC-013 | `deriveSpecReviewVerdict` 4b が `.some(critical\|high)` のみ needs-fix に絞り、guarded 行 2 本が遷移を固定。TC-013 で Pipeline 統合テストが spec-review 実行回数 = 1 を assert ✓ |
| high fixable on spec.md → needs-fix → 往復 | TC-003, TC-027 | `routableCanon.some(high)` → needs-fix、unconditional spec-fixer → spec-review fallback が存在。TC-027 で when guard が false を返すことを assert ✓ |
| conformance needs-fix:spec-fixer 起点の spec-fixer → spec-review 再検証 | TC-010 | proper timestamps (specReview T1 < conformance T2 < specFixer T3) で `getConformanceFixContext` が non-null → `specFixerForwardsToTestGen` false を assert ✓ |
| observation pass の fixable finding が regression-gate ledger に載る | TC-011, TC-012 | `collectSpecReviewLedger` 追加、regression-gate の skipWhen / buildMessage が `dedupeFindings([...specLedger, ...implLedger])` を使用。TC-012 で spec-only ledger でも skip されないことを assert ✓ |
| request.md への fixable → escalation + escalationReason（既存テスト無変更） | TC-005（新規）、既存 TC-003 / TC-006（spec-review-fixer-routing.test.ts） | spec-review-fixer-routing.test.ts TC-003 / TC-006 は期待値変更なしで green ✓ |
| observation pass が spec-review ループ予算を消費しない | TC-013 | Pipeline.run() 統合テストで specReviewCallCount === 1 を assert ✓ |
| 期待値更新済み既存テストが implementation-notes.md に列挙 | implementation-notes.md | TC-001/002/005/013/015（spec-review-fixer-routing）、TC-003（spec-fixer-tasks-md-writable）、TC-030（pipeline.transitions）、TC-067（pipeline.test.ts）、TC-WHEN-02 の変更が列挙済み ✓ |
| typecheck && test が green | confirmed | `tsc --noEmit` エラーなし、vitest 9618 tests passed (0 failed) ✓ |

### コードレビュー

**`judge-verdict.ts` (T-01)**
4b を `routableCanon.some((f) => f.severity === "critical" || f.severity === "high") → needs-fix`、低位は fall-through に変更。4a (unroutable → escalation) は先行評価で不変。判定 5 (非 canon critical|high) / 判定 6 (approved) も不変。関数 doc コメントが新挙動を正確に記述している。✓

**`canon-write-scope.ts` (T-02)**
`buildScopeForSlug` private helper に共通ロジックを集約し、`buildCanonWriteScope(state, deps)` と `buildCanonWriteScopeFromState(state)` の両方が委譲。Single source of truth が維持されている。TC-023 で両関数の出力一致を assert ✓

**`spec-observation.ts` (T-03)**
`specReviewHasRoutableFixables` は `getLatestJudgeFindings` + `selectRoutableCanonFindings` で routable fixable の有無を判定。`specFixerForwardsToTestGen` は `getConformanceFixContext === null` かつ 最新 spec-review verdict `approved` の 2 条件で forward を決定。`types.ts` を import しないため循環依存なし。TC-024〜026 が両関数の境界を網羅 ✓

**`types.ts` (T-04)**
guarded 行 2 本を既存の unconditional 行より前に挿入（先頭一致採用のため順序が重要）:
- `SPEC_REVIEW approved → SPEC_FIXER when specReviewHasRoutableFixables` (新規)
- `SPEC_REVIEW approved → TEST_CASE_GEN` (既存 fallback)
- `SPEC_FIXER approved → TEST_CASE_GEN when specFixerForwardsToTestGen` (新規)
- `SPEC_FIXER approved → SPEC_REVIEW` (既存 fallback)
FAST_TRANSITIONS 不変。TC-029 で length === 46 を assert ✓

**`findings-ledger.ts` (T-05)**
`collectSpecReviewLedger` は全 spec-review StepRun を走査し、canonScope 付きの場合は `specReviewEffectiveFixer` (spec-fixer 基準) で unroutable canon finding (request.md / test-cases.md / attestation) を除外。spec.md / design.md / tasks.md は保持される。TC-028 でフィルタ動作を assert ✓

**`regression-gate.ts` (T-05)**
`skipWhen` と `buildMessage` の双方で `dedupeFindings([...specLedger, ...implLedger])` を構築。specLedger が先行するため同一 finding は spec-review 版が優先（first-occurrence wins）。skipWhen は合流後が空のときのみ skip。TC-012 で spec-only ledger で skip されないことを assert ✓

### T-03 reroute (pipeline.ts) との互換性確認

pipeline.ts (変更なし) の T-03 budget reroute は `cleanTransition` を `transitions.find(t => t.step === currentStep && t.on === "approved" && !fixerNamesForReroute.has(t.to) && ... && (!t.when || t.when(state)))` で探す。新規 guarded 行 `SPEC_REVIEW approved → SPEC_FIXER` は `fixerNamesForReroute.has("spec-fixer") === true` で除外され、unconditional `SPEC_REVIEW approved → TEST_CASE_GEN` が clean transition として選択される。spec-fixer budget 枯渇時の挙動は不変 ✓

---

## Findings

なし（low 以下の観察のみ）

---

## Observations

### [LOW] TC-CONFRT-07 が conformance reverification フローを検証しなくなる（same-timestamp edge）

**File**: `tests/unit/core/pipeline/pipeline.conformance-routing.test.ts`

guarded 遷移追加後、TC-CONFRT-07 の conformance 起動 spec-fixer は `getConformanceFixContext` が同一タイムスタンプで null を返すため、spec-review reverification をスキップして test-case-gen へ直行する。テストは引き続き green（最終アサーション `specFixerCallCount===3 / awaiting-archive` は通過）が、conformance→spec-fixer→spec-review reverification フローの検証が失われた。`implementation-notes.md` に記録済み、`spec-observation-autofix.test.ts` TC-010 が proper timestamps で reverification 不変条件を代替カバー。

### [LOW] mixed severity (medium + high 共存) の明示的テストがない

**File**: `tests/unit/core/pipeline/spec-observation-autofix.test.ts`

spec.md に medium fixable と high fixable が共存する場合「high が存在するため needs-fix」となる境界ケースの明示的テストがない。コード (`routableCanon.some(critical|high)`) は `.some()` で正しく扱い、TC-003/TC-004 のカバレッジから挙動は導出可能。受け入れ基準にも含まれていないため、現状は受け入れ可能。

### [LOW] `specFixerForwardsToTestGen` の verdict 読み取りが直接アクセス

**File**: `src/core/pipeline/spec-observation.ts`, lines 65-69

`specFixerForwardsToTestGen` は `state.steps?.[STEP_NAMES.SPEC_REVIEW]` に直接アクセスして verdict を読む。一方 `specReviewHasRoutableFixables` は `getLatestJudgeFindings` 経由で findings を取得しており、抽象化レベルが微妙に異なる。`getConformanceFixContext` 等の既存関数も state.steps への直アクセスパターンを使用しており確立されたパターン内。機能上の問題はない。

<!-- original template footer below -->

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

（何をどう確認したか。読んだファイル・辿った diff・確認したコード等を記載する）

## 検証できなかった項目

（確認できなかった項目と理由。無ければ None と明記する）

## Findings 詳細

（typed findings の補足説明。指摘がない場合は None と明記する）
