# Regression Gate Result — iteration 1

- **verdict**: needs-fix

## Findings

### [HIGH] makeCapturingPrompt reused for logPath contract — regression
- **File**: tests/unit/contract/agent-runner-contracts.test.ts:475
- **Resolution**: fixable
- **Detail**: Line 475 still calls `fixture.makeCapturingPrompt({ tempDir, sleepFn })` in the logPath test. No dedicated minimal runner was introduced. The fix declared in the ledger is not present.

### [HIGH] TC-012 managed-agent exclusion has no explicit assertion — regression
- **File**: tests/unit/contract/agent-runner-contracts.test.ts:404
- **Resolution**: fixable
- **Detail**: The registration completeness test relies solely on `NON_LOCAL_DIRS` structural exclusion. No `expect(Object.keys(REGISTERED_LOCAL_RUNNERS)).not.toContain('managed-agent')` assertion exists. The fix declared in the ledger is not present.
