# Tasks: finish-phase0-local-conflict-check

## Task 1: [x] Create `src/core/finish/local-conflict-check.ts`

New module exporting `runLocalConflictCheck`.

```typescript
export interface LocalConflictCheckInput {
  baseBranch: string;
  cwd: string;
  spawn: SpawnFn;
}

export type LocalConflictCheckResult =
  | { ok: true }
  | { ok: false; conflictPaths: string[] };
```

Implementation:
1. `git fetch origin <baseBranch>` — non-zero exit → throw (caller catches and escalates)
2. `git merge-tree --write-tree HEAD origin/<baseBranch>` — run with `{ cwd }`
3. exit code === 0 → `{ ok: true }`
4. exit code !== 0 → parse stdout for lines containing `CONFLICT` to extract file paths → `{ ok: false, conflictPaths }`
5. If path extraction yields empty array (parse failure), still return `{ ok: false, conflictPaths: [] }` — exit code is authoritative

SpawnFn import from `../../util/spawn.js`. No new type aliases introduced.

**Files**: `src/core/finish/local-conflict-check.ts`

## Task 2: [x] Integrate into orchestrator

Edit `src/core/finish/orchestrator.ts`:

1. Import `runLocalConflictCheck` from `./local-conflict-check.js`
2. After line 112 (`if (!preflightResult.ok) return ...`) and after `const { prViewData } = preflightResult;` (line 113), before the `--dry-run` check (line 116):
   - Insert local conflict check call
   - Only run if `!flags.dryRun` (dry-run skips destructive checks) and PR is not already merged
   - Determine operationCwd for the check: use `target.worktreePath ?? cwd` as the working directory for git commands

Insert block:

```typescript
// Phase 0 (continued): local conflict check
if (!flags.dryRun && prViewData.state !== "MERGED") {
  stdoutWrite("Phase 0: local conflict check...");
  const localCheckCwd = target.worktreePath ?? cwd;
  const conflictResult = await runLocalConflictCheck({
    baseBranch,
    cwd: localCheckCwd,
    spawn,
  });
  if (!conflictResult.ok) {
    const pathList = conflictResult.conflictPaths.length > 0
      ? conflictResult.conflictPaths.map(p => `  - ${p}`).join("\n")
      : "  (paths could not be determined)";
    return {
      exitCode: 1,
      escalation: formatEscalation({
        failedStep: "Phase 0 local conflict check",
        detectedState: `${target.slug} conflicts with origin/${baseBranch}`,
        recommendedAction: `Resolve conflicts:\n${pathList}\n\n  1. git rebase origin/${baseBranch}\n  2. Re-run: specrunner finish ${target.slug}`,
        resumeCommand: `specrunner finish ${target.slug}`,
      }),
    };
  }
}
```

3. Handle fetch failure: `runLocalConflictCheck` throws on fetch failure. Wrap call in try/catch:

```typescript
try {
  const conflictResult = await runLocalConflictCheck(...);
  // ... handle result
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    exitCode: 1,
    escalation: formatEscalation({
      failedStep: "Phase 0 git fetch",
      detectedState: `git fetch origin ${baseBranch} failed`,
      recommendedAction: `Check network/auth: ${message}. Then re-run: specrunner finish ${target.slug}`,
      resumeCommand: `specrunner finish ${target.slug}`,
    }),
  };
}
```

**Files**: `src/core/finish/orchestrator.ts`

## Task 3: [x] Unit tests for `local-conflict-check.ts`

Create `tests/unit/core/finish/local-conflict-check.test.ts`:

- **TC-LCC-1**: `git fetch` success + `merge-tree` exit 0 → `{ ok: true }`
- **TC-LCC-2**: `git fetch` success + `merge-tree` exit 1 with CONFLICT lines in stdout → `{ ok: false, conflictPaths: ["file1.ts", "file2.ts"] }`
- **TC-LCC-3**: `git fetch` non-zero exit → throws Error
- **TC-LCC-4**: `git fetch` success + `merge-tree` exit 1 with no parseable paths → `{ ok: false, conflictPaths: [] }`
- **TC-LCC-5**: Multiple conflict paths extracted correctly from multi-line output

Use vi.fn() mock for SpawnFn, asserting correct args passed to each command.

**Files**: `tests/unit/core/finish/local-conflict-check.test.ts`

## Task 4: [x] Integration tests for orchestrator

Add to `tests/finish-orchestrator.test.ts`:

- **TC-LCC-ORCH-1**: Phase 0 local conflict check fail → Phase 1 archive NOT called, `{ exitCode: 1, escalation }` returned, job state unchanged
- **TC-LCC-ORCH-2**: Phase 0 local conflict check pass → Phase 1+ proceeds normally
- **TC-LCC-ORCH-3**: `git fetch` failure in local check → `{ exitCode: 1, escalation }` returned, job state unchanged
- **TC-LCC-ORCH-4**: Escalation message contains recovery instructions (`git rebase origin/<base>` + `specrunner finish <slug>`)
- **TC-LCC-ORCH-5**: After conflict escalation, re-running `specrunner finish` works (not blocked by assertJobFinishable)
- **TC-LCC-ORCH-6**: Existing Phase 0/1/2/3 tests still pass (regression-free)

Mock pattern: stub spawn to return merge-tree exit 1 for conflict scenarios, exit 0 for pass scenarios. Verify no `git mv` / `git commit` spawn calls follow a conflict detection.

**Files**: `tests/finish-orchestrator.test.ts`

## Task 5: [x] Delta spec for `cli-finish-command`

Create `specrunner/changes/finish-phase0-local-conflict-check/specs/cli-finish-command/spec.md` with MODIFIED requirement updating Phase 0 pre-flight to include check #8 (local conflict check via `git merge-tree`).

Content: Add check #8 row to the table in the existing requirement, plus scenarios for conflict detection and fetch failure.

**Files**: `specrunner/changes/finish-phase0-local-conflict-check/specs/cli-finish-command/spec.md`

## Task 6: [x] Verify

Run `bun run typecheck && bun run test` to confirm:
- No type errors
- All new tests pass
- All existing tests pass (no regression)

**Files**: (none — verification only)

## Dependency Order

```
Task 1 → Task 2 → Task 3 (can parallel with Task 2)
                → Task 4 (after Task 2)
Task 5 (independent, can parallel with Tasks 1-4)
Task 6 (after all)
```
