# Regression Gate Result — iteration 001

- **verdict**: needs-fix
- **iteration**: 001

## Ledger Verification

### Finding 1 — TC-003 iteration-exhaustion シナリオの専用テストが存在しない

- **Original severity**: LOW
- **File**: tests/unit/core/job-list/operations-view.test.ts
- **Status**: NOT FIXED

**Evidence**:

The code-fixer commit (`ee4d2def2`) touched only state/usage/events files:
- `specrunner/changes/job-view-accuracy/events.jsonl`
- `specrunner/changes/job-view-accuracy/state.json`
- `specrunner/changes/job-view-accuracy/usage.json`

The test file `tests/unit/core/job-list/operations-view.test.ts` was not modified by the code-fixer. Searching for `exhausti`, `TC-003`, `iterationsExhausted.*[1-9]`, and `reason.*exhaust` in the file returns no matches.

The file's describe-block header (lines 1–30) lists TC-031, TC-032, TC-033, TC-034 but does not list TC-003. TC-032 tests `reason: "timeout"` with `iterationsExhausted: 0` — the required test for `reason: "exhausted"` / `iterationsExhausted: 1` with an old escalation in history asserting `null` return value is absent.

**Required fix** (per review-feedback-001.md):

Add a test alongside TC-032 in `tests/unit/core/job-list/operations-view.test.ts`:

```typescript
describe("TC-003: resumePoint present with iteration-exhaustion, history has old escalation → returns null", () => {
  it("returns null when resumePoint step ran with null verdict due to iterations exhausted", () => {
    const state = makeJobState({
      status: "awaiting-resume",
      resumePoint: { step: "code-review", reason: "exhausted", iterationsExhausted: 1 },
      steps: {
        "spec-review": [makeStepRun({ verdict: "escalation" })],
        "code-review": [makeStepRun({ verdict: null })],
      },
    });
    expect(deriveEscalationSourceStep(state)).toBeNull();
  });
});
```

## Findings

| # | Severity | Resolution | Description |
|---|----------|------------|-------------|
| 1 | high | fixable | TC-003 iteration-exhaustion test was not added by code-fixer; the fix is absent from the test file |
