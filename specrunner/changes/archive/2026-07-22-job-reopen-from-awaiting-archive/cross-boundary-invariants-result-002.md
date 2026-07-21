# Cross-Boundary Invariants Review: job-reopen-from-awaiting-archive

**Reviewer**: cross-boundary-invariants
**Iteration**: 002

---

## Scope

Iteration 2 focuses on whether the two decisions recorded in the resume-context
(issue #876 comment) have been implemented in the current worktree state.

**resume-context decisions**:
1. **null store → fail-closed (Option B)**: When `resolveStateStoreByJobId`
   returns `null`, `prepare()` must throw `PrepareError` rather than silently
   skipping the operator event append and persist.
2. **`allowReopen` static invariant test**: Add a grep-based arch test (same
   pattern as the existing ratchets in `core-invariants.test.ts`) to
   mechanically enforce that `{ allowReopen: true }` is only called from
   `ReopenCommand.prepare()`.

Files examined for this iteration:

| File | Role |
|------|------|
| `src/core/command/reopen.ts` | null-store code path (lines 229–265) |
| `tests/unit/architecture/core-invariants.test.ts` | allowReopen static invariant (end of file) |
| `tests/unit/architecture/arch-allowlist.ts` | allowReopen allowlist entries |
| `src/state/lifecycle.ts` | transitionJob callers — verified still clean |
| `src/core/command/__tests__/reopen-command.test.ts` | null-store rejection test coverage |

---

## Decision verification

### Decision (1): null store → fail-closed

**Expected**: after `store = await resolveStateStoreByJobId(...)`, when `store`
is `null`, `prepare()` throws `PrepareError(1)` with a sidecar-recovery hint
and returns non-zero. The operator event cannot be written, so reopen must not
proceed.

**Actual code** (`src/core/command/reopen.ts`, lines 229–265):
```typescript
let store: JobStateStore | null;
if (this.options.noWorktree) {
  store = new JobStateStore(state.jobId, cwd, { slug, stateRoot: cwd });
} else {
  store = await resolveStateStoreByJobId(cwd, state.jobId);
}

const operatorEventTs = new Date().toISOString();
if (store) {               // ← silently skipped when null
  await store.appendOperatorEvent({ ... });
}
// ...
if (store) {               // ← silently skipped when null
  await store.persist(transitioned);
}
updatedState = transitioned;  // in-memory "running" with no disk write
```

**Status: NOT implemented.** The `if (store)` pattern is unchanged from the
code that produced WARN-1 in iteration 1. The fail-closed check does not exist.

**Test coverage**: No test in `reopen-command.test.ts` exercises the null-store
path. `resolveStateStoreByJobId` is always mocked to return `MOCK_STORE` (a
non-null object) in all existing test cases.

---

### Decision (2): `allowReopen` static invariant test

**Expected**: a grep-based test in `tests/unit/architecture/core-invariants.test.ts`
(or a new peer file) that finds every `allowReopen: true` occurrence in `src/`
and asserts the only match is `src/core/command/reopen.ts`.

**Actual**: no such test exists.

Confirmed by exhaustive search:
```
grep -rn "allowReopen" tests/unit/architecture/  → (empty)
```

The search across `tests/` returned zero matches for any `allowReopen`-related
arch invariant. The static invariant test was not added.

**Status: NOT implemented.**

---

## Verified invariants (unchanged from iteration 1)

| Invariant | Mechanism | Status |
|-----------|-----------|--------|
| `canTransition("awaiting-archive", "running")` = `false` | `VALID_TRANSITIONS` unchanged | ✅ holds |
| `job resume` rejects `awaiting-archive` | `ResumeCommand.prepare()` uses `canTransition` (no allowReopen) | ✅ holds |
| `job archive` rejects a running job | `assertJobFinishable` uses `canTransition(s, "archived")` | ✅ holds |
| Evidence non-destructive on re-run | `steps`/`reviewerStatuses` not in transition patch | ✅ holds |
| `events.jsonl` append-only | `appendOperatorEvent` uses `fs.appendFile` only | ✅ holds |
| `FoldResult.operatorEvents` set in ENOENT branch | `job-journal.ts:148` literal includes `operatorEvents: []` | ✅ holds |
| No current production caller adds `allowReopen: true` except ReopenCommand | Confirmed by exhaustive grep of `src/` | ✅ holds |

---

## Findings

### [HIGH] Decision (1) null-store fail-closed not implemented

**Origin**: WARN-1 from iteration 001; decision resolved as Option B (fail-closed).

**Invariant violated**: D6 — "The operator event is appended before the status
transition is persisted, so the record is durable even if the subsequent
pipeline run fails or is interrupted."

**Concrete path**:
1. `resolveStateStoreByJobId` returns `null` (sidecar absent).
2. `store.appendOperatorEvent(...)` skipped → no record in `events.jsonl`.
3. `store.persist(transitioned)` skipped → disk state stays `awaiting-archive`.
4. `prepare()` returns successfully with in-memory `status: "running"`.
5. `CommandRunner.execute()` registers exit guard for `jobId`.
6. If process exits before `setupWorkspace` persists:
   - Exit guard reads disk → `awaiting-archive` → no transition → job stuck.
7. If `setupWorkspace` does persist: pipeline runs with no audit trail of the
   reopen operation (operator event missing from journal).

**Required fix** (`src/core/command/reopen.ts`, after `resolveStateStoreByJobId`):
```typescript
if (!store) {
  logError(
    `Cannot locate state store for job '${this.slug}'. ` +
    `The sidecar may be missing. ` +
    `Hint: run 'specrunner sidecar recover ${this.slug}' to rebuild.`
  );
  throw new PrepareError(1, "State store unavailable — cannot record operator event");
}
```

Test coverage also needs a case: `resolveStateStoreByJobId` returns `null` →
`prepare()` rejects with exit code 1 and an appropriate message.

---

### [MEDIUM] Decision (2) allowReopen static invariant test not added

**Origin**: WARN-2 from iteration 001; decision resolved as Option A + arch test.

**Invariant at risk**: "awaiting-archive → running is permitted only through the
explicit `job reopen` command" — currently convention-only, not machine-fixed.

**Current state**: `allowReopen: true` is only used in `src/core/command/reopen.ts`
(verified by grep). No future regression protection exists in the test suite.
A future developer adding `{ allowReopen: true }` to, say, `resume.ts` or
`pipeline.ts` would not be caught by any automated test.

**Required fix**: add to `tests/unit/architecture/core-invariants.test.ts`:
```typescript
describe("REOPEN-OPT: allowReopen:true is confined to ReopenCommand.prepare()", () => {
  it("grep finds allowReopen:true only in src/core/command/reopen.ts", () => {
    const raw = grepE(`"allowReopen:\\s*true"`, "src");
    const matches = parseGrepOutput(raw).filter(
      (m) => !m.file.includes("__tests__/") && !m.file.includes(".test.ts"),
    );
    // Liveness: must find at least one (the legitimate caller)
    expect(matches.length).toBeGreaterThan(0);
    const violations = matches.filter(
      (m) => !m.file.endsWith("src/core/command/reopen.ts"),
    );
    expect(violationLines(violations)).toEqual([]);
  });
});
```
