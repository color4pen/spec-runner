# Tasks: inbox-start-recheck

## T-01: Add `isIssueLinked` effect to `InboxEffects` and implement default

File: `src/core/inbox/run-inbox.ts`

- [x] Add `isIssueLinked(issueNumber: number): Promise<boolean>` to the `InboxEffects` interface (after `notifyEscalation`)
- [x] Implement the default in `buildEffects`: call `JobStateStore.list(repoRoot)` and return `true` if any state has `state.issueNumber === issueNumber`
- [x] Wire the default into the merged effects object at the bottom of `buildEffects`

**Acceptance Criteria**:
- `InboxEffects` interface has the new method
- Default implementation resolves `true` when any job state's `issueNumber` matches, `false` otherwise
- `opts.effects?.isIssueLinked` override is respected (falls back to default when absent)

---

## T-02: Re-check linkage in the start execution loop

File: `src/core/inbox/run-inbox.ts`

- [x] In the `for (const action of plan.starts)` loop (around line 182), before calling `executeStart`, call `await effects.isIssueLinked(action.issue.number)`
- [x] If `true`, log `[inbox] skip: issue#${action.issue.number} already linked — skipping start` via `stderrWrite` and `continue` (do not push to `summary.started`, do not push to `summary.errors`)
- [x] The `executeStart` call and the existing `try/catch` block remain unchanged for the non-skip path

**Acceptance Criteria**:
- When `isIssueLinked` returns `true` for an issue, the loop skips that start, nothing is added to `summary.started` or `summary.errors`, and a warning is written to stderr
- When `isIssueLinked` returns `false`, the existing `executeStart` + error-handling path executes as before

---

## T-03: Add unit tests

File: `src/core/inbox/__tests__/run-inbox.test.ts` (new file)

- [x] Test: "skips start when isIssueLinked returns true" — stub `isIssueLinked` to resolve `true`; assert `summary.started` is empty and `startJob` was not called
- [x] Test: "proceeds with start when isIssueLinked returns false" — stub `isIssueLinked` to resolve `false`; assert `summary.started` contains the issue and `startJob` was called once
- [x] Test: "skips second start that became linked after first completed" — plan has two starts; `isIssueLinked` returns `false` for the first and `true` for the second; assert only the first is in `summary.started`

Use minimal stubs for all other effects (no real I/O). Keep `dryRun: false`.

**Acceptance Criteria**:
- All three test cases pass
- `bun run typecheck && bun run test` exits 0
