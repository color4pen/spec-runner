# Regression Gate Result — Iteration 001

## Summary

Ledger contains 3 findings (1 HIGH, 2 LOW). All 3 are verified fixed in the current code. No regressions detected.

---

## Finding-by-Finding Verification

### Finding 1 [LOW] — `branch = null` + 欠落宣言群の fail-open 緩和策が informal（コード保証なし）

**Claimed fix**: design.md Risks 節への文書化 + ADR 記録の推奨

**Verification**:

The underlying concern (branch=null + missingDecl → fail-open without code guarantee) is eliminated by the HIGH finding fix (finding 3). `step-completion.ts:264-270` now short-circuits with `if (branch === null) { override = true; }` before reaching the seam — this is an explicit code guarantee, not an informal invariant.

The design.md Risks section (lines 183-197) documents the pipeline ordering invariant but does not yet reflect the additional code guard added for finding 3. The `spec-fixer-deferred` comment at the end of design.md notes that the full ADR (specrunner/adr/2026-08-01-judge-step-branch-ordering-invariant.md) was out of scope for spec-fixer and recommends adr-gen handle it.

**Assessment**: The root concern ("informal, no code guarantee") is resolved by the code fix. The design.md documentation is deferred to adr-gen. **No regression.**

---

### Finding 2 [LOW] — `fileMissing: true` + `resolution: decision-needed` の組み合わせ挙動が仕様に未記載

**Claimed fix**: spec.md への組み合わせ挙動の注記追加

**Verification**:

`spec.md` lines 61-73 contain a new "Note: `fileMissing: true` + `resolution: "decision-needed"` の組み合わせ挙動" section with the exact content requested:
- `deriveJudgeVerdict` priority #3 (decision-needed → escalation) fires independently of ref verification.
- Regardless of override or no-override, verdict is escalation; only `escalationReason` presence differs.
- User-visible behavior (operator escalation) is identical in both branches.

**Assessment**: Note is present and accurate. **No regression.**

---

### Finding 3 [HIGH] — managed runtime `branch = null` + `missingDecl` 群 → fail-open

**Claimed fix**: `missingDecl` 群で `branch === null` のとき escalation override を行う（fail-closed）

**Verification**:

`step-completion.ts:264-284`:
```typescript
if (missingDecl.length > 0) {
  const branch = state.branch ?? null;
  if (branch === null) {
    // Without a branch, verifyFindingRefs cannot distinguish "file truly absent" from
    // "branch unavailable → all refs reported non-existent" (managed runtime behavior).
    // Fail-closed: unverifiable missingDecl declarations → escalation override.
    override = true;
  } else { ... }
}
```

When `branch === null`, `override = true` is set immediately — `verifyFindingRefs` is never called. This prevents the previous fail-open path where all refs appearing non-existent (managed runtime behavior) would incorrectly validate all missingDecl findings as correct.

Test coverage: `TC-006b` (`step-completion-missing-file-finding.test.ts:713-752`) explicitly:
1. Sets `state.branch: null`.
2. Asserts `completion.verdict === "escalation"`.
3. Asserts `mockVerifyFindingRefs` was NOT called (short-circuit confirmed).

**Assessment**: Fix is present and pinned by a test. **No regression.**

---

## Evidence

- Checked: 3 findings
- Skipped: 0
- Unverified: 0
