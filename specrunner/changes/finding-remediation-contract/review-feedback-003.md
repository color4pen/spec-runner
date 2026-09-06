# Review Feedback — Iteration 003

**Change**: finding-remediation-contract  
**Reviewer**: code-review (iteration 3)  
**Scope**: Implementation files changed in `feat/finding-remediation-contract-d394de74`

---

## Summary

Core implementation is sound: the `FindingRemediation` contract is cleanly typed, parse enforcement is correct, fixer prompts expand the contract faithfully, ledger merges remediation, and the regression-gate carries sites. Three `must`-priority test cases from `test-cases.md` are absent from the test suite — the regression guards for prompt inclusion of `FINDING_REMEDIATION_DEFINITION` and the ledger block's all-site verification wording.

---

## Findings

### [HIGH] TC-T04-03 prompt-inclusion regression guard absent

**File**: `src/prompts/__tests__/fragment-coverage.test.ts`  
**Resolution**: fixable

`fragment-coverage.test.ts` verifies TC-T04-04 (scanning-obligation phrases inside the `FINDING_REMEDIATION_DEFINITION` constant) but contains **no assertion** that any of the five judge prompts (CODE_REVIEW, SPEC_REVIEW, CONFORMANCE, REGRESSION_GATE, `buildCustomReviewerSystemPrompt`) actually *contain* `FINDING_REMEDIATION_DEFINITION`. The analogous OBSERVATION_DEFINITION test (lines 236–257) covers five prompts; the FINDING_REMEDIATION_DEFINITION test stops at the constant itself.

**Impact**: If `${FINDING_REMEDIATION_DEFINITION}` is accidentally removed from any prompt, no existing test catches it. Reviewers would silently stop asking for the remediation contract, reverting the core benefit of this change.

**Evidence**: The OBSERVATION_DEFINITION pattern at line 236 (`5 judge prompts contain OBSERVATION_DEFINITION`) was the model for TC-T04-03. TC-T04-03 in test-cases.md explicitly lists CODE_REVIEW, SPEC_REVIEW, CONFORMANCE, REGRESSION_GATE, and `buildCustomReviewerSystemPrompt` as the expected assertion targets.

**Fix**: Add a `describe` block in `fragment-coverage.test.ts` (after the TC-T04-04 block at line 263) with five `it` assertions:

```typescript
describe("5 judge prompts contain FINDING_REMEDIATION_DEFINITION (TC-T04-03)", () => {
  it("CODE_REVIEW_SYSTEM_PROMPT contains FINDING_REMEDIATION_DEFINITION", () => {
    expect(CODE_REVIEW_SYSTEM_PROMPT).toContain(FINDING_REMEDIATION_DEFINITION);
  });
  it("SPEC_REVIEW_SYSTEM_PROMPT contains FINDING_REMEDIATION_DEFINITION", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain(FINDING_REMEDIATION_DEFINITION);
  });
  it("CONFORMANCE_SYSTEM_PROMPT contains FINDING_REMEDIATION_DEFINITION", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain(FINDING_REMEDIATION_DEFINITION);
  });
  it("REGRESSION_GATE_SYSTEM_PROMPT contains FINDING_REMEDIATION_DEFINITION", () => {
    expect(REGRESSION_GATE_SYSTEM_PROMPT).toContain(FINDING_REMEDIATION_DEFINITION);
  });
  it("buildCustomReviewerSystemPrompt contains FINDING_REMEDIATION_DEFINITION", () => {
    expect(buildCustomReviewerSystemPrompt(makeMinimalReviewerSnapshot()))
      .toContain(FINDING_REMEDIATION_DEFINITION);
  });
});
```

---

### [MEDIUM] TC-T09-01 and TC-T09-02 regression guards absent

**File**: `src/core/step/__tests__/regression-gate-step.test.ts`  
**Resolution**: fixable

Two `must` test cases from test-cases.md are not implemented:

**TC-T09-01**: No test asserts that `buildMessage` output (i.e. `buildLedgerBlock`'s intro) contains  
`"Sites がある entry は列挙された全 site で不変条件が成立しているかを確認する"`.  
The implementation at `regression-gate.ts:87–89` includes this text via the `sitesNote` conditional, but it is unpinned.

**TC-T09-02**: No test asserts that `REGRESSION_GATE_SYSTEM_PROMPT` contains:
1. The phrase about verifying all sites and reporting regressions when any site violates the invariant (Method step 3, line 48).
2. The phrase about inheriting `invariant` / `sites` from the ledger entry into the regression finding's `remediation` (Method step 3, line 48).

**Impact**: Future edits to `buildLedgerBlock` or `REGRESSION_GATE_SYSTEM_PROMPT` that drop the all-site wording would go undetected until the regression-gate silently stops verifying secondary sites.

**Fix**: In `regression-gate-step.test.ts`, add a `describe` block that:
1. Calls `step.buildMessage(state, deps)` with a state containing a finding that has `remediation.sites` (2+ sites) and asserts the message contains `"Sites がある entry"` / `"全 site"`.
2. Asserts `REGRESSION_GATE_SYSTEM_PROMPT` contains the site-inheritance phrase (e.g. `"全 site を確認し"` and `"invariant"` and `"sites"`).

---

## Non-blocking Observations

### Redundant primary-file check in `isFindingWithinFixerWriteScope`

**File**: `src/core/step/canon-escalation.ts`  
**Severity**: low

When `finding.remediation` is present, the parse layer normalizes self-site into `finding.remediation.sites`. As a result, `isFindingWithinFixerWriteScope` checks `finding.file` via the first `!isFileWritableByFixer(finding.file, ...)` call *and* again implicitly via the loop over `finding.remediation.sites`. This is harmless (both checks must pass anyway), but slightly redundant. No action required.

---

## 検証した項目

| Area | Status |
|------|--------|
| `FindingRemediation` / `RemediationSite` types (`kernel/report-result.ts`) | ✅ correct |
| `parseRemediation` (null normalization, empty-string rejection, sites ≥ 1) | ✅ correct |
| `parseFindings` strict/requireRemediation modes — 3 callers correct | ✅ correct |
| `parseJudgeReportInput` calls `parseFindings(raw, true, true)` | ✅ correct |
| `parseRequestReviewReportInput` calls `parseFindings(raw, true, false)` (no remediation) | ✅ correct |
| Self-site normalization D4 (prepend when absent, dedup by file|line) | ✅ correct |
| Fail-closed drift guard test (`fail-closed-drift-guard.test.ts`) | ✅ present |
| `buildFindingsBlock` — invariant / sites / approach / all-site directive | ✅ correct |
| `renderEvidenceReference` — empty → `""`, 1+ paths → formatted block | ✅ correct |
| Code-fixer: evidence reference in ALL structured-findings branches | ✅ correct |
| Spec-fixer: evidence reference already present | ✅ confirmed |
| `dedupeFindings` remediation merge (`mergeRemediation`) | ✅ correct |
| `computeLedgerRef` — fingerprint unchanged (identity invariance) | ✅ correct |
| `buildLedgerEntry` — Sites expansion when remediation present | ✅ correct |
| `buildLedgerBlock` — `sitesNote` conditional for all-site note | ✅ correct |
| `REGRESSION_GATE_SYSTEM_PROMPT` — site inheritance instruction at Method step 3 | ✅ present |
| `FINDING_REMEDIATION_DEFINITION` — no "report_result" / "end_turn" (TC-T04-01) | ✅ covered by T-07 tests |
| All 5 judge prompts import and inject `FINDING_REMEDIATION_DEFINITION` (implementation) | ✅ verified by code read |
| `CODE_FIXER_SYSTEM_PROMPT` "最小限の機械的修正" standalone removed (TC-T08-01) | ✅ absent |
| `CODE_FIXER_SYSTEM_PROMPT` "新機能の追加は禁止" maintained (TC-T08-02) | ✅ present |
| `SPEC_FIXER_SYSTEM_PROMPT` "全 site で不変条件を成立させる最小の変更" (TC-T08-03) | ✅ present |
| `isFindingWithinFixerWriteScope` checks primary + all remediation.sites | ✅ correct |
| `remediation-parse.test.ts` (600 lines, TC-T10 fixture, self-site normalization) | ✅ comprehensive |
| Ledger dedup / merge tests in `findings-ledger.test.ts` | ✅ present |
| `VALID_FIX_TARGETS` excludes `test-case-gen` (consistent with ConformanceFixTarget) | ✅ intentional |

## 検証できなかった項目

None
