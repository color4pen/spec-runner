# Regression Gate Result — Iteration 1

- **verdict**: approved

## Ledger Verification

### [HIGH] `buildDetail` が `_tokenValue` を使用せず token scrubbing を実施していない

- **Status**: Fixed — confirmed
- **File**: src/adapter/claude-code/provider-readiness-probe.ts

**Verification**:

1. Parameter renamed from `_tokenValue` to `tokenValue` (actively used).
2. Scrubbing is applied before truncation:
   ```typescript
   if (tokenValue && msg.includes(tokenValue)) {
     msg = msg.replaceAll(tokenValue, "[REDACTED]");
   }
   ```
3. TC-015 extended with a third case: "token value embedded in the SDK error message is redacted from detail" (`tests/adapter/claude-code/provider-readiness-probe.test.ts:319-334`), verifying `detail` does not contain the token and does contain `[REDACTED]`.

No regressions found.
