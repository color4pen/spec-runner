# Regression Gate Result — test-case-gen-design-phase — Iteration 001

## Summary

11 findings verified. 10 fixed, 1 still present.

---

## Finding-by-Finding Verdict

### 1. [MEDIUM] TC + low/medium spec 混在 needs-fix の `specReviewNeedsFixIsTcOnly` 挙動が Scenario に未記述

**Status: FIXED**

Evidence:
- `specrunner/changes/test-case-gen-design-phase/tasks.md` T-10 line 175 に "TC finding + medium/low severity spec finding の混在ケースで `specReviewNeedsFixIsTcOnly=false` → spec-fixer を固定（severity 問わず spec routable が 1 件でもあれば TC-only にならない）。" が追記されている。
- `tests/unit/core/pipeline/test-case-gen-design-phase.test.ts` に TC-028 が実装され、medium severity（line 1429）と low severity（line 1450）の混在ケースを直接 assert している。

---

### 2. [LOW] D5: TC finding 注入時の XML 区切り方針が未明示

**Status: FIXED**

Evidence:
- `specrunner/changes/test-case-gen-design-phase/design.md` D5 節（line 236）に "メッセージ全体を `<user-request>` XML タグで包む（spec-fixer の `buildMessage` 構造に倣う）。findings は agent 生成の構造化データのため直接 injection リスクは低いが、全 `buildMessage` を統一構造で囲む規律を維持する。" が明示された。

---

### 3. [HIGH] specReviewNeedsFixIsTcOnly が非 canon critical/high finding を考慮せず TC-only と誤判定する

**Status: FIXED**

Evidence:
- `src/core/pipeline/spec-observation.ts` lines 137–140 に nonCanon チェックが追加されている:
  ```typescript
  const nonCanon = findings.filter(
    (f) => (f.severity === "critical" || f.severity === "high") && !canonScope.canonPaths.has(f.file),
  );
  return specRoutable.length === 0 && nonCanon.length === 0;
  ```
- `specReviewNeedsFixIsTcOnly` は `specRoutable.length === 0 && nonCanon.length === 0` を返し、非 canon critical/high finding が存在する場合は false を返す。

---

### 4. [MEDIUM] buildMessage が TC finding のみでなく全 spec-review finding を注入する（設計 D5 gap）

**Status: FIXED**

Evidence:
- `src/core/step/test-case-gen.ts` lines 88–93 で `selectRoutableCanonFindings(allFindings, canonScope, testCaseGenEffectiveFixer)` によるフィルタが実装され、TC-routable finding のみを `buildFindingsBlock` に渡している。非 TC finding（spec.md / design.md / tasks.md）は注入されない。

---

### 5. [LOW] doc コメントのパイプライン位置が旧モデルのまま

**Status: FIXED**

Evidence:
- `src/core/step/test-case-gen.ts` line 41 のコメントが "Position in pipeline: design → test-case-gen → spec-review" に更新されている。

---

### 6. [HIGH] スコープ外変更: conformance-canon-tiers (PR #992) の差し戻し

**Status: FIXED**

Evidence:
- `src/prompts/conformance-system.ts` に normative/plan 二層宣言が維持されている（"規範（normative）"・"計画・根拠（plan / rationale）"、lines 26–28）。checkbox 完了性 gate は含まれない（"checkbox 未完了は**それ自体では finding にしない**"、line 48）。
- `tests/unit/core/step/conformance.test.ts` に TC-001〜TC-007 が全件存在し（lines 177–363）、TC-007「buildMessage に checkbox 完了性 gate 表現が存在しない」も残存している（line 342–363）。

---

### 7. [MEDIUM] buildTestCaseGenInitialMessage: メッセージ全体の `<user-request>` wrap 漏れ

**Status: FIXED**

Evidence:
- `src/prompts/test-case-gen-system.ts` lines 127–143 で、`changeFolder`・`branch`・`findingsSection`・`requestContent` の全要素が `<user-request>` タグ内に含まれている。slug/branch/findings は全て `<user-request>` 内に置かれている。

---

### 8. [LOW] TC-013 (should) の pin テスト欠落: 免除 type の spec-review reads() に test-cases.md が含まれない

**Status: FIXED**

Evidence:
- `tests/unit/core/pipeline/test-case-gen-design-phase.test.ts` lines 1015–1039 に TC-013 が実装され、chore type（免除 type）の `SpecReviewStep.reads()` が test-cases.md を含まないことを assert している。

---

### 9. [MEDIUM] loopIntermediateSteps invariant has no explicit unit pin test

**Status: FIXED**

Evidence:
- `tests/unit/core/pipeline/registry-invariants.test.ts` lines 152–165（T-06-6）に `STANDARD_DESCRIPTOR.loopIntermediateSteps` が `STEP_NAMES.TEST_CASE_GEN` を含むことを直接 assert する unit pin test が追加されている。

---

### 10. [LOW] test-case-gen role entry has phase:'impl' but step operates in spec phase

**Status: FIXED**

Evidence:
- `src/core/pipeline/registry.ts` line 74: `[STEP_NAMES.TEST_CASE_GEN]: { role: "gate", phase: "spec" }` に更新されている。

---

### 11. [MEDIUM] spec-review の escalation reason で lastCanonResolver が単一 spec-fixer を使い test-cases.md を誤って unroutable と判定する

**Status: STILL PRESENT (regression)**

Evidence:
- `src/core/step/step-completion.ts` lines 220–221:
  ```typescript
  lastCanonResolver =
    step.name === STEP_NAMES.SPEC_REVIEW ? specReviewEffectiveFixer : judgeEffectiveFixer;
  ```
  spec-review の `lastCanonResolver` は依然として `specReviewEffectiveFixer`（常に "spec-fixer"）のみ。
- lines 375–379 の escalation reason 計算:
  ```typescript
  const unroutable = selectUnroutableCanonFindings(lastUndecidedFindings, canonScope, lastCanonResolver);
  ```
  `specReviewEffectiveFixer` で `test-cases.md` を評価すると、spec-fixer の writableByFixer に `test-cases.md` が含まれないため "unroutable" と分類され、operator 向けのメッセージに誤って混入する。
- dual-resolver アプローチ（testCaseGenEffectiveFixer でも routable な finding を除外する処理）は実装されていない。
- この finding に対する unit test も存在しない。

**Impact**: escalation reason の diagnostic inaccuracy。routing 正確性には影響しないが、request.md（unroutable）と test-cases.md（TC-routable）の finding が同一 spec-review ラウンドで報告された際に、operator に「test-cases.md の修正が必要」という誤ったメッセージを出す。

---

## Evidence Counts

- checked: 11
- skipped: 0
- unverified: 0
