# Regression Gate Result — Iteration 002

**Change**: test-case-gen-design-phase
**Iteration**: 2
**Findings checked**: 11 / 11
**Regressions**: 0

---

## Verification Summary

All 11 findings from the ledger were verified against the current branch code. No regressions detected.

---

## Per-Finding Verification

### [HIGH] Finding 3: specReviewNeedsFixIsTcOnly が非 canon critical/high finding を考慮せず TC-only と誤判定する

**File**: `src/core/pipeline/spec-observation.ts:128`
**Status**: FIXED

`specReviewNeedsFixIsTcOnly` (lines 128–141) now includes the nonCanon check:

```typescript
const nonCanon = findings.filter(
  (f) => (f.severity === "critical" || f.severity === "high") && !canonScope.canonPaths.has(f.file),
);
return specRoutable.length === 0 && nonCanon.length === 0;
```

Both conditions must hold: no spec-fixer-routable findings AND no non-canon critical/high findings.

---

### [HIGH] Finding 6: スコープ外変更: conformance-canon-tiers (PR #992) の差し戻し

**File**: `src/prompts/conformance-system.ts`, `tests/unit/core/step/conformance.test.ts`
**Status**: FIXED

`conformance-system.ts` now has the normative/plan two-tier structure:
- `request.md / spec.md` → **規範（normative）**
- `design.md / tasks.md` → **計画・根拠（plan / rationale）**
- checkbox 未完了は **それ自体では finding にしない** (no checkbox gate)

`conformance.test.ts` now contains all 7 conformance-canon-tiers tests (TC-001 through TC-007), including TC-007 asserting that the buildMessage has no checkbox completion gate.

---

### [MEDIUM] Finding 1: TC + low/medium spec 混在 needs-fix の `specReviewNeedsFixIsTcOnly` 挙動が Scenario に未記述

**File**: `specrunner/changes/test-case-gen-design-phase/spec.md`, `tasks.md`
**Status**: FIXED

`tasks.md` T-10 acceptance criteria (line 182) now explicitly states:
> "TC + medium/low spec 混在ケースは `specReviewNeedsFixIsTcOnly=false` を直接 assert するテストで固定される。"

TC-028 in `tests/unit/core/pipeline/test-case-gen-design-phase.test.ts` (lines 1418–1505) covers:
- TC finding + medium severity spec finding → `specReviewNeedsFixIsTcOnly === false`
- TC finding + low severity spec finding → `specReviewNeedsFixIsTcOnly === false`

The spec.md Scenario text (line 78) correctly states "少なくとも 1 件" without severity constraint, which is the correct semantics (any severity spec-routable finding disqualifies TC-only).

---

### [MEDIUM] Finding 4: buildMessage が TC finding のみでなく全 spec-review finding を注入する

**File**: `src/core/step/test-case-gen.ts:84`
**Status**: FIXED

`buildMessage` (lines 83–104) now filters using `selectRoutableCanonFindings(allFindings, canonScope, testCaseGenEffectiveFixer)` before passing to `buildFindingsBlock`. Only TC-routable (test-cases.md) findings are injected.

---

### [MEDIUM] Finding 7: buildTestCaseGenInitialMessage: メッセージ全体の `<user-request>` wrap 漏れ

**File**: `src/prompts/test-case-gen-system.ts`
**Status**: FIXED

`buildTestCaseGenInitialMessage` (lines 118–144) now wraps the entire message in `<user-request>` tags, including slug (changeFolder), branch, findingsSection, and requestContent.

---

### [MEDIUM] Finding 9: loopIntermediateSteps invariant has no explicit unit pin test

**File**: `src/core/pipeline/registry.ts:89`
**Status**: FIXED

`STANDARD_DESCRIPTOR.loopIntermediateSteps = new Set([STEP_NAMES.TEST_CASE_GEN])` is present (registry.ts:89).

`tests/unit/core/pipeline/registry-invariants.test.ts` now has T-06-6 (lines 152–165) with two explicit assertions:
- `loopIntermediateSteps` is defined
- `loopIntermediateSteps.has(STEP_NAMES.TEST_CASE_GEN)` is true

---

### [MEDIUM] Finding 11: spec-review の escalation reason で lastCanonResolver が test-cases.md を誤って unroutable と判定する

**File**: `src/core/step/step-completion.ts:221`
**Status**: FIXED

`step-completion.ts` (lines 221–231) now uses a dual-resolver for the SPEC_REVIEW step:

```typescript
if (step.name === STEP_NAMES.SPEC_REVIEW) {
  lastCanonResolver = (f) => {
    const tcTarget = testCaseGenEffectiveFixer(f);
    return canonScope.writableByFixer.get(tcTarget)?.has(f.file) ? tcTarget : specReviewEffectiveFixer(f);
  };
}
```

test-cases.md findings are correctly resolved to `test-case-gen`, preventing false unroutable escalation reasons.

---

### [LOW] Finding 2: D5: TC finding 注入時の XML 区切り方針が未明示

**File**: `specrunner/changes/test-case-gen-design-phase/design.md:231`
**Status**: FIXED

Design.md D5 (line 236) now explicitly states:
> "メッセージ全体を `<user-request>` XML タグで包む（spec-fixer の `buildMessage` 構造に倣う）。findings は agent 生成の構造化データのため直接 injection リスクは低いが、全 `buildMessage` を統一構造で囲む規律を維持する。"

---

### [LOW] Finding 5: doc コメントのパイプライン位置が旧モデルのまま

**File**: `src/core/step/test-case-gen.ts:39`
**Status**: FIXED

`test-case-gen.ts` line 41 now reads:
> `Position in pipeline: design → test-case-gen → spec-review`

---

### [LOW] Finding 8: TC-013 の pin テスト欠落: 免除 type の spec-review reads() に test-cases.md が含まれない

**File**: `tests/unit/core/pipeline/test-case-gen-design-phase.test.ts`
**Status**: FIXED

TC-013 (lines 1008–1039) is now present with two explicit assertions:
- `chore` type: `reads()` does NOT contain `test-cases.md`
- `chore` type: `reads()` still contains `spec.md / design.md / tasks.md`

---

### [LOW] Finding 10: test-case-gen role entry has phase:'impl' but step operates in spec phase

**File**: `src/core/pipeline/registry.ts:74`
**Status**: FIXED

`registry.ts` line 74 now has:
```typescript
[STEP_NAMES.TEST_CASE_GEN]:    { role: "gate",     phase: "spec" },
```

---

## Evidence

- **checked**: 11 (all ledger findings verified against current code)
- **skipped**: 0
- **unverified**: 0
