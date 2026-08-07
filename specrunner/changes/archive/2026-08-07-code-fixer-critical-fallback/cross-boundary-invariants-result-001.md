# Cross-Boundary-Invariants Review — code-fixer-critical-fallback — iter 1

## Reviewer

cross-boundary-invariants

## Scope

Changes reviewed:

| File | Change type |
|------|-------------|
| `src/core/step/code-fixer.ts` | 2 lines changed (fallback branch severity text) |
| `tests/unit/step/code-fixer.test.ts` | 194 lines added (new describe block, 5 tests) |

---

## Invariants Traced

### I-1: `buildMessage` ↔ `collectRoutedFixerFindings` routing sync

`code-fixer.ts` carries an explicit co-contract comment (line 19 and 121):
> routing precedence はこの 3 分岐が routed-findings.ts の collectRoutedFixerFindings と一致させること

The fix changes only the text inside the two fallback branches. The branching logic (which predicates are checked in which order, and which file paths are resolved) is untouched. `collectRoutedFixerFindings` returns `[]` for both fallback cases (no structured findings), and `buildMessage` points to the file-path equivalent. **The sync invariant is preserved.** ✓

### I-2: `reads()` ↔ `buildMessage` file-path consistency (fallback)

In both fallback branches, `buildMessage` tells the agent to read from `findingsPath`. That same path is what `reads()` declares. The fix changes the severity instruction in the prompt text, not the path resolution. **Consistency preserved.** ✓

### I-3: Continuation paths — `isFixerContinuation` guards run before fallback checks

`buildMessage` checks `isFixerContinuation(state, STEP_NAMES.CODE_FIXER)` early and routes to `buildContinuationMessage` before reaching any findings-embedded or fallback branch. This means continuation sessions never enter the fixed fallback branches. `buildContinuationMessage` was not changed and contains no severity instruction (it relies on session context carrying the initial-turn mandate). **No new interaction introduced.** ✓

### I-4: TC-BM-03 exact-match invariant

`TC-BM-03` asserts `CodeFixerStep.buildMessage(state, deps) === buildContinuationMessage({...})`. This test was not modified. Because `buildContinuationMessage` is unchanged, and because continuation paths still reach `buildContinuationMessage` before the fallback, the exact-match assertion still holds. **Invariant preserved.** ✓

### I-5: No test asserted the old (incorrect) text

Grep across `tests/` for `"Fix all HIGH severity findings"` (without `and CRITICAL`) returns zero hits. The old wording was not a test expectation, so the fix introduces no test breakage. ✓

### I-6: Out-of-scope fixers (`spec-fixer`, `build-fixer`) — not touched

`git diff main...HEAD` shows no changes to `spec-fixer.ts`, `build-fixer.ts`, or their test files. The scoped-out modules are unaffected. ✓

### I-7: Conformance initial-entry path wording asymmetry (pre-existing, not introduced)

The conformance branch says `Fix all HIGH and CRITICAL severity findings from the conformance review (mandatory)` (includes "from the conformance review"). All other initial-entry branches say `Fix all HIGH and CRITICAL severity findings (mandatory)`. This asymmetry pre-existed the change. The new tests use `.toContain("Fix all HIGH and CRITICAL severity findings")` which matches both forms (prefix-inclusion). **Not introduced by this change.** ✓

---

## Potential Gap Observed (not a broken invariant)

**Test title vs actual coverage scope**

The new describe block is titled `"prompt severity contract: all branches must include HIGH and CRITICAL (mandatory)"` and covers 5 initial-entry branches. The 3 continuation branches (conformance-continuation, coordinator-loop-continuation, standard-path-continuation) are systematically excluded because they route to `buildContinuationMessage`.

This is intentional by design — the continuation message does not repeat the severity mandate, relying on session context — and the spec's own requirements only name the 5 initial-entry branches. The test title is technically accurate within the spec's definition of "branches".

However, a future maintainer reading only the test title might conclude that ALL possible paths through `buildMessage` were verified, including continuations. This could lead to missed detection if `buildContinuationMessage` were changed to start a new session without injecting the mandate.

Severity: **low** (test title documentation gap, no runtime invariant broken, and the spec's definition of "branches" matches the test scope)

---

## Summary

No cross-boundary invariants are broken. The change is a targeted text substitution in two fallback branches. All routing logic, path resolution, continuation guards, and external sync contracts are unchanged. The fix is isolated to the severity instruction strings that agent-facing prompts carry.

**Checked**: 7 invariants  
**Skipped**: 0  
**Unverified**: 0
