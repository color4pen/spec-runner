# Regression Gate Result — Iteration 1

**Change**: cli-handler-exit-boundary  
**Date**: 2026-09-03

## Findings Ledger Verification

### [1] dfe3e948 — T-03 AC module count says 13 but body lists 11

**File**: `specrunner/changes/cli-handler-exit-boundary/tasks.md:88`

Checked line 88: the AC now reads _"上記 11 module の handler がすべて…"_ — the word "13" has been removed and replaced with "11", consistent with the body enumeration.

**Status**: FIXED — no regression.

---

### [2] 3f47e15a — False-positive tests: TC-004-registry-c and TC-012-b always pass regardless of contract

**File**: `src/cli/__tests__/command-registry-reopen.test.ts`

- **TC-004-registry-c** (line 91–104): Now uses `const result = await handler!(…)` and asserts `expect(result).toBe(2)`. No `expect.fail` or `msg.toMatch(/process\.exit\(2\)/)` pattern present.
- **TC-012-b** (line 132–147): Same pattern — direct `expect(result).toBe(2)`. No false-positive catch-based assertion.

**Status**: FIXED — no regression.

---

### [3] ad4ec671 — getReopenHandler() return type annotation still says Promise<void>

**File**: `src/cli/__tests__/command-registry-reopen.test.ts:49`

Line 49–55 now reads:
```ts
function getReopenHandler():
  | ((parsed: ParsedArgs, ctx?: Record<string, unknown>) => Promise<number>)
  | undefined {
```
Return type is `Promise<number>`, not `Promise<void>`.

**Status**: FIXED — no regression.

---

### [4] 98af4443 — configureMocks() async callback not awaited — latent timing race

**File**: `src/cli/__tests__/exit-contract-harness.ts:49,81`

- Signature (line 49): `configureMocks: () => void | Promise<void>` — now accepts async callbacks.
- Call site (line 81): `await configureMocks();` — now awaited.

**Status**: FIXED — no regression.

---

## Summary

All 4 ledger findings have been resolved in the current code. No regressions detected.
