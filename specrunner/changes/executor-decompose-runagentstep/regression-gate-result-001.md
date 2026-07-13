# Regression Gate Result — Iteration 1

- **verdict**: needs-fix

## Ledger Verification

### [LOW] OutputVerificationPolicy の inline type import

- **File**: src/core/step/step-context-builder.ts:106
- **Status**: REGRESSION (not fixed)
- **Severity**: high
- **Resolution**: fixable

**Evidence**:

Line 106 still contains the inline import form:

```typescript
let outputVerification: import("../port/output-contract.js").OutputVerificationPolicy | undefined;
```

The top-level imports (lines 14–29) include `import type { OutputContract } from "../port/output-contract.js"` but do **not** include `OutputVerificationPolicy`. The fix described in the finding (add top-level `import type { OutputVerificationPolicy } from "../port/output-contract.js"` and remove the inline import) has not been applied.

**Required fix**:

1. Add to top-level imports:
   ```typescript
   import type { OutputVerificationPolicy } from "../port/output-contract.js";
   ```
   (can be combined with the existing `OutputContract` import from the same module)

2. Replace line 106:
   ```typescript
   // before
   let outputVerification: import("../port/output-contract.js").OutputVerificationPolicy | undefined;
   // after
   let outputVerification: OutputVerificationPolicy | undefined;
   ```
