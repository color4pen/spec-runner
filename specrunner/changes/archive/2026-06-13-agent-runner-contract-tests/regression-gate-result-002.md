# Regression Gate Result — Iteration 002

- **verdict**: approved

## Findings Verification

### [LOW] makeCapturingPrompt reused for logPath contract

- **Status**: fixed
- **Evidence**: Line 499 — `const runner = fixture.makeMinimalRunner({ tempDir, sleepFn });`. The logPath test uses the dedicated `makeMinimalRunner` factory, not `makeCapturingPrompt`. Isolation is correct.

### [LOW] TC-012 managed-agent exclusion has no explicit assertion

- **Status**: fixed
- **Evidence**: Lines 439–441 — `it("managed-agent is not present in REGISTERED_LOCAL_RUNNERS", () => { expect(Object.keys(REGISTERED_LOCAL_RUNNERS)).not.toContain("managed-agent"); });`. Explicit assertion is present.

## Summary

Both findings from the ledger are confirmed fixed. No regressions detected.
