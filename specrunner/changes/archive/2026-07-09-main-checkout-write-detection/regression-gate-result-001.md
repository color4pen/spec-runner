# Regression Gate Result — main-checkout-write-detection

- **verdict**: approved
- **iteration**: 001

## Ledger Verification

### Finding 1: TC-007（CLI drift 出力）に対応する自動テストが存在しない
- **File**: `src/core/command/runner.ts`
- **Expected state**: test covering `handleResult` drift branch (logError/logInfo output) present
- **Observed state**: no such test exists in the branch
- **Regression**: NO — this finding was never fixed during this job
  - code-review feedback-001 explicitly set `Fix: no` for this finding
  - code-fixer commit (`b0820bea3`) made zero source code changes
  - The finding was present since the initial implementer commit (`19cc614f4`) and remained unchanged through all subsequent commits
  - Not a regression; the finding was a deliberate carryover acknowledged by the code-reviewer

### Finding 2: drift escalation の recordFailedStepResult に completedAt が渡されない
- **File**: `src/core/step/executor.ts` line 487
- **Expected state**: `recordFailedStepResult(state, step.name, errorInfo, { startedAt, completedAt })` in drift detection path
- **Observed state**: `recordFailedStepResult(state, step.name, errorInfo, { startedAt })` — `completedAt` absent
- **Regression**: NO — this finding was never fixed during this job
  - This finding originated in `cross-boundary-invariants` result F-001, which carried an `approved` verdict (non-blocking)
  - Neither cross-boundary-invariants commit (`f3b998a50`) nor the code-fixer commit (`b0820bea3`) modified `executor.ts`
  - The drift path has had `{ startedAt }` only since the initial implementer commit
  - Not a regression; the cross-boundary reviewer assessed it as low-impact and approved without requiring a fix

## Summary

Neither finding in the ledger was fixed at any point during this job. Both were reviewed and left as intentional carryovers by their respective approving agents (code-review Fix=no; cross-boundary-invariants approved). No code that existed in a fixed state was subsequently reverted. There are no actual regressions.

**Note**: The ledger appears to have been compiled incorrectly — it lists findings that were never fixed as "fixed during this job." This is a ledger accuracy issue, not a code regression.
