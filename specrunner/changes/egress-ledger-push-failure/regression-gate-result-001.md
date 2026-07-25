# Regression Gate Result — Iteration 1

## Summary

Verified 2 findings from the ledger. Both fixes are present and correct in the current code.

---

## T-04: commitFinalState の persistBeforePush 失敗時の警告ログフォーマット

**File**: `src/core/step/commit-push.ts`, lines 738–741

**Verification**: The `catch` block for `persistBeforePush` failure now emits:

```typescript
stderrWrite(
  `Warning: ${messageLabel} persistBeforePush failed for ${slug}: ${err instanceof Error ? err.message : String(err)}. Continuing with push.`,
);
```

This matches the existing `Warning: <messageLabel> ...` pattern used throughout `commitFinalState` (e.g., line 725: `Warning: ${messageLabel} commit failed for ${slug}.`). **Fix confirmed.**

---

## T-07: commitFinalState の push 失敗 stderr 警告の追記フォーマット

**File**: `src/core/step/commit-push.ts`, lines 772–777

**Verification**: The push failure warning now captures `push2.stderr` and appends it as a suffix:

```typescript
const push2Stderr = (push2.stderr ?? "").trim();
stderrWrite(
  `Warning: failed to push ${messageLabel} commit for ${slug} to origin/${branch}. ` +
    `Push manually to ensure state is on the branch.` +
    (push2Stderr ? ` git stderr: ${push2Stderr}` : ""),
);
```

The stderr is appended to the end of the existing warning message (`Push manually to ensure state is on the branch. git stderr: <stderr>`). This is tail concatenation on the same log line, consistent with the format used in `pushFailedError` (lines 879–881). **Fix confirmed.**

---

## Verdict inputs

| Finding | Status |
|---------|--------|
| T-04 persistBeforePush warning format | Fixed ✅ |
| T-07 push failure stderr append format | Fixed ✅ |

No regressions detected.
