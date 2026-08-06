# Regression Gate Result — operator-commit-adoption iteration 1

## Evidence Summary

Checked 7 ledger findings (checked=7, skipped=0, unverified=0).

### Finding 1 — [MEDIUM] composability test (TC-013): FIXED ✓

`src/core/command/__tests__/resume-adopt-commits.test.ts` lines 899–999 contain TC-013
with four assertions:
- `prepare()` resolves when both `--apply-canon` and `--adopt-commits` are given
- persisted state contains both the apply-canon OID and the adopted OID
- apply-canon OID appears exactly once (not re-adopted, D4 invariant)
- `detectUnadoptedCommits` was called with the post-apply-canon ledger (containing apply-canon OID)

The mock setup correctly has `mockCommitOperatorCanon` return `APPLY_CANON_OID`, then
`mockDetectUnadoptedCommits` return only the non-canon `OPERATOR_OID`, simulating the D4
composability path. FIXED.

### Finding 2 — [LOW] null runStore → PrepareError(1): FIXED ✓

`src/core/command/__tests__/resume-adopt-commits.test.ts` lines 775–826 contain TC-011
with two assertions:
- `prepare()` throws `PrepareError(exitCode=1)` when `resolveStateStoreByJobId` returns `null`
  and `adoptCommits: true`
- fail-closed: prepare() must throw (not silently adopt)

Implementation at `resume.ts:375-378`:
```typescript
if (!runStore) {
  logError("Cannot adopt commits: no state store available");
  throw new PrepareError(1, "Failed to adopt commits: no runStore");
}
```
Null runStore guard is present and tested. FIXED.

### Finding 3 — [LOW] TC-005 test 2 exercises wrong failure mode: NOT FIXED ✗

`src/core/command/__tests__/resume-adopt-commits.test.ts:648-668`, TC-005 test 2:
```typescript
vi.mocked(MOCK_STORE.persist).mockRejectedValue(new Error("persist failed"));
```
This rejects ALL persist calls. The initial state-transition persist at `resume.ts:248`
(`if (runStore) await runStore.persist(transitioned)`) fires first and throws, so
`PrepareError(1, "Failed to update state")` is raised at that point — not from the
adoption persist guard. The assertion `threw === true` passes for the wrong reason.

TC-005 test 1 (line 614-646) correctly uses `persistCallCount >= 2` to target the
adoption persist, and that test provides the real coverage. Test 2 remains misleadingly
labelled and would NOT detect removal of the adoption persist guard while the
state-transition guard remained.

### Finding 4 — [LOW] Escalation uses stderrWrite only (no logError): NOT FIXED ✗
### Finding 7 — [LOW] Adopt gate output asymmetric vs apply-canon gate: NOT FIXED ✗

Both findings point to the same code. `resume.ts:386-390`:
```typescript
} else {
  // fail-closed: escalate with per-commit details and three resolution options.
  const msg = buildAdoptEscalationMessage(resolvedSlug, unadoptedCommits);
  stderrWrite(msg);
  throw new PrepareError(1, "Unknown commits in publish range; use --adopt-commits");
}
```
Only `stderrWrite` is called. The apply-canon gate at `resume.ts:343-344` follows the
pattern `logError(summary) + stderrWrite(hint)`. The adopt gate escalation does not call
`logError`, diverging from both T-04 spec and the apply-canon pattern.

TC-003 tests check `[...logErrorCalls, ...stderrCalls].join("\n")` (union), so they pass
today regardless. A log-level filter on `stderrWrite` in future (or a log aggregator
filtering by `[ERROR]` prefix) would suppress the escalation. NOT FIXED.

### Finding 5 — [LOW] commit-push.ts comment contradicts --adopt-commits: NOT FIXED ✗

`src/core/step/commit-push.ts:388-389`:
```
 * Pre-existing legitimate commits are excluded because they are on origin
 * (pipeline pushes after every synthesis; operator hand-commits are hand-pushed).
```
The comment still asserts "operator hand-commits are hand-pushed" as the only path for
pre-existing operator commits to leave the publish range. `--adopt-commits` is a second
path: commits remain local but are registered in the ledger so egress verification passes.
The comment was not updated. A future developer reading this could incorrectly conclude
`--adopt-commits` is redundant and remove it. NOT FIXED.

### Finding 6 — [LOW] --adopt-commits silently ignored without worktree: NOT FIXED ✗

`resume.ts:411-413`:
```typescript
} else if (this.options.applyCanon) {
  // --apply-canon has no effect without a worktree — warn but continue.
  stderrWrite("Warning: --apply-canon has no effect without a worktree ...");
}
```
The `else-if` only warns for `--apply-canon`. No corresponding warning was added for
`--adopt-commits`. When `resolvedWorktreePath === null` and `adoptCommits: true`, the
adopt gate block is entirely skipped with no output. An operator who follows the three-option
message (EGRESS_UNKNOWN_COMMIT → option 1: `--adopt-commits`) and runs with
`--no-worktree --adopt-commits` will see silent no-op and then hit the same halt at the
next step. NOT FIXED.
