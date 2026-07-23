# Regression Gate Result — Iteration 1

**Change**: runner-state-reload-after-setup  
**Date**: 2026-07-23

## Findings Ledger Verification

### [MEDIUM] TC-013 step 8: verifyEgressLedger assertion passes trivially — comment is factually wrong

**Status: FIXED**

**Evidence**:

The finding identified two problems:
1. Step 7 pushed `E2E_BRANCH` to origin before calling `verifyEgressLedger`, making `git rev-list HEAD --not --remotes=origin` return an empty list and the assertion vacuous.
2. The comment "only the bootstrap commit remains in the unpushed set" was factually wrong.

The fix applied was the restructure approach (not a comment correction).

In the current code at `tests/unit/core/runtime/runner-reload-egress-e2e.test.ts`:

- **Step 7 (lines 238-249)**: Now commits a step file WITHOUT pushing. The comment explicitly explains why: *"egress verification runs BEFORE the first push, while both the bootstrap commit and the step commit are still in the unpushed publish range. (Pushing first would empty `rev-list HEAD --not --remotes=origin` and make the egress assertion vacuous — the mado-os incident would not be sealed.)"*. No push occurs in step 7.

- **Step 8a (lines 253-264)**: Negative direction — a ledger containing only the step OID (missing the bootstrap OID) is asserted to throw `EGRESS_UNKNOWN_COMMIT`. This directly reproduces the mado-os failure pattern and confirms the seal is real: if `reloadJobState` were disabled, step 6 would fail (synthesizedCommits would be empty) and this negative path confirms the mechanism is operative.

- **Step 8b (lines 266-275)**: Positive direction — the reloaded ledger (bootstrap OID from `reloadedState.synthesizedCommits`) plus the step OID covers the entire unpushed range, and `verifyEgressLedger` resolves without error.

The wrong comment is absent. The verifyEgressLedger calls are no longer vacuous: because no push has occurred, both the bootstrap commit and the step commit are in the unpushed range, and the negative test confirms the `EGRESS_UNKNOWN_COMMIT` property is sealed.

## Summary

| # | Finding | Status |
|---|---------|--------|
| 1 | TC-013 step 8 verifyEgressLedger trivially passes / wrong comment | FIXED |

**Regressions**: 0  
**Contradictions**: 0
