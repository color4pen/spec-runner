# Regression Gate Result — evidence-authorship-enforcement — iter 001

- **verdict**: needs-fix
- **run-at**: 2026-07-19
- **tests**: 7454 passed (547 files)
- **typecheck**: FAIL (4 errors in resume-authenticity.test.ts)

---

## Ledger Verification (10 findings)

All 10 original findings from the review are confirmed fixed in the current code.

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | CRITICAL | per-node 検証・journal commit の配線がない（executor.ts） | ✅ Fixed |
| 2 | CRITICAL | resume に verifyResumeJournalAuthenticity の配線がない（resume.ts） | ✅ Fixed |
| 3 | CRITICAL | round journal sweep が未実装（parallel-review-round.ts） | ✅ Fixed |
| 4 | CRITICAL | JobStateStore が anchorHolder を受け取らず（job-state-store.ts） | ✅ Fixed |
| 5 | CRITICAL | createRuntime が JournalAnchorHolder を生成・注入せず（factory.ts） | ✅ Fixed |
| 6 | HIGH | TC-022〜TC-025 は executor wiring を通らず（per-node-authorship-verification.test.ts） | ✅ Fixed |
| 7 | HIGH | TC-022-exec: `expect.any(String) \|\| null` が test fail（per-node-authorship-verification.test.ts:605） | ✅ Fixed |
| 8 | MEDIUM | committed-tree 歯が unavailable 時に fail-open（local.ts:889） | ✅ Fixed |
| 9 | MEDIUM | restoreResumeJournal: worktreeケースで git show パス誤算（verify-journal-authenticity.ts） | ✅ Fixed |
| 10 | MEDIUM | restoreResumeJournal: worktreeケースで git show パス誤算（iter 003 F-1 未修正） | ✅ Fixed |

### Detail: Finding 1 (executor.ts)

`src/core/step/executor.ts` lines 480–498 implement the wiring: `verifyNodeJournalAuthorship` is called for sequential steps (`!roundOwnsGitEffects`), tamper triggers `restoreJournalToAnchor` + `makeJournalTamperHalt`, and `ok` triggers `commitJournalArtifacts`. Confirmed present.

### Detail: Finding 2 (resume.ts)

`src/core/command/resume.ts` imports `changeFolderPath` and contains a new block (lines ~122–195) that calls `this.runtime.verifyResumeJournalAuthenticity?.(...)` with `slug`, branch, and `sourceChangeDir`; on `tamper` calls `restoreResumeJournal` then throws `PrepareError`; on `unavailable` throws `PrepareError`. Confirmed present.

### Detail: Finding 3 (parallel-review-round.ts)

`src/core/pipeline/parallel-review-round.ts` calls `deps.runtimeStrategy.commitJournalArtifacts(...)` after `commitRound` completes. Confirmed present.

### Detail: Finding 4 (job-state-store.ts)

`JobStateStore` constructor accepts `opts?.anchorHolder?: JournalAnchorHolder` and passes it to `new JobJournal(this._location, opts?.anchorHolder)`. Confirmed present.

### Detail: Finding 5 (factory.ts)

`createRuntime` creates `const journalAnchor = new JournalAnchorHolder()` and passes it to `new LocalRuntime({ ..., journalAnchor })`. Confirmed present.

### Detail: Findings 6 & 7 (per-node-authorship-verification.test.ts)

TC-022-exec test at line 539 exercises the full executor path. `verifyNodeJournalAuthorship` mock returns `{ kind: "tamper" }`, the test asserts that the executor rejects and that `verifyNodeJournalAuthorship` and `restoreJournalToAnchor` were called through the executor wiring. The `expect.any(String) || null` issue is absent; `headBeforeStep: null` is used directly (line 607). Confirmed.

### Detail: Finding 8 (local.ts)

`src/core/runtime/local.ts` around line 887: `diffResult.kind === "unavailable"` now returns `{ kind: "tamper", detail: "committed-tree diff unavailable ... fail-closed halt ..." }` (fail-closed). Confirmed present.

### Detail: Findings 9 & 10 (verify-journal-authenticity.ts)

`restoreResumeJournal` derives the git show path via `changeFolderPath(slug)` (line 145), not by stripping `cwd` from `sourceChangeDir`. Comment explicitly explains the worktree case fix. `slug` parameter added to the function signature and callers updated in `local.ts`, `managed.ts`, `resume.ts`. TC-030-worktree regression test added. Confirmed present.

---

## New Regression Found

### [HIGH] TypeScript typecheck failure in resume-authenticity.test.ts — T8 broken

- **File**: `src/core/resume/__tests__/resume-authenticity.test.ts`
- **Lines**: 249, 250, 253, 254
- **Introduced by**: commit `c28cd0b3c` (code-fixer, after verification iter 4)
- **Resolution**: fixable

**Detail**: The TC-030 test accesses `fn.mock.calls` where `fn` is typed as `SpawnFn` (cast via `as unknown as SpawnFn`). Vitest mock properties (`.mock.calls`) are not on the `SpawnFn` type, so `tsc --noEmit` reports 4 errors:

```
src/core/resume/__tests__/resume-authenticity.test.ts(249,31): error TS2339: Property 'mock' does not exist on type 'SpawnFn'.
src/core/resume/__tests__/resume-authenticity.test.ts(250,35): error TS2339: Property 'some' does not exist on type '{}'.
src/core/resume/__tests__/resume-authenticity.test.ts(253,17): error TS2339: Property 'mock' does not exist on type 'SpawnFn'.
src/core/resume/__tests__/resume-authenticity.test.ts(254,17): error TS2339: Property 'mock' does not exist on type 'SpawnFn'.
```

Tests still pass (vitest does not type-check at runtime), but `typecheck && test` is not both green. T8 requires `typecheck && test` green.

**Fix**: Replace `fn.mock.calls[N]![1]` with the `calls` array already returned from `makeSpawnFn` (same data, type-safe). Lines 249–254 should read:

```typescript
const gitShowCalls = calls.filter(([_cmd, args]) => args.some((a: string) => a.startsWith("show")));
expect(gitShowCalls).toHaveLength(2);
expect(calls[0]![1]).toContain(`origin/${BRANCH}:specrunner/changes/${SLUG}/events.jsonl`);
expect(calls[1]![1]).toContain(`origin/${BRANCH}:specrunner/changes/${SLUG}/state.json`);
```

---

## Summary

All 10 original ledger findings are confirmed fixed. One new regression was introduced post-verification: `tsc --noEmit` fails on `resume-authenticity.test.ts` due to `fn.mock.calls` type error. The fix is a one-line-equivalent change to use the existing `calls` array from `makeSpawnFn`. Verdict: **needs-fix**.
