# Test Cases: finish-phase0-local-conflict-check

Generated from: request.md, design.md, tasks.md

---

## Category: Unit / LocalConflictCheck

### TC-LCC-1 — Clean merge returns `{ ok: true }`
- **Priority**: must
- **Source**: tasks.md TC-LCC-1, req §1

**GIVEN** spawn is configured to:
  - return exit 0 for `git fetch origin main`
  - return exit 0 with a tree hash only in stdout for `git merge-tree --write-tree HEAD origin/main`

**WHEN** `runLocalConflictCheck({ baseBranch: "main", cwd: "/workspace", spawn })` is called

**THEN** the result is `{ ok: true }`

---

### TC-LCC-2 — Conflict markers in merge-tree output → `{ ok: false, conflictPaths }`
- **Priority**: must
- **Source**: tasks.md TC-LCC-2, req §1, design §6

**GIVEN** spawn is configured to:
  - return exit 0 for `git fetch origin main`
  - return exit 1 with stdout containing (real git merge-tree output):
    ```
    CONFLICT (content): Merge conflict in src/foo.ts
    CONFLICT (modify/delete): src/bar.ts deleted in branch-del and modified in HEAD.  Version HEAD of src/bar.ts left in tree.
    ```
    for `git merge-tree --write-tree HEAD origin/main`

**WHEN** `runLocalConflictCheck({ baseBranch: "main", cwd: "/workspace", spawn })` is called

**THEN** the result is `{ ok: false, conflictPaths: ["src/foo.ts", "src/bar.ts"] }`
  - `src/foo.ts` is extracted by Pattern 1 ("Merge conflict in")
  - `src/bar.ts` is extracted by Pattern 2 ("deleted in") for modify/delete conflicts

---

### TC-LCC-3 — `git fetch` failure → Promise rejects
- **Priority**: must
- **Source**: tasks.md TC-LCC-3, req §4

**GIVEN** spawn is configured to return non-zero exit for `git fetch origin main`

**WHEN** `runLocalConflictCheck({ baseBranch: "main", cwd: "/workspace", spawn })` is called

**THEN** the returned Promise rejects with an Error (does not return `{ ok: ... }`)

---

### TC-LCC-4 — exit 1 but no parseable CONFLICT lines → `{ ok: false, conflictPaths: [] }`
- **Priority**: should
- **Source**: tasks.md TC-LCC-4, design §6

**GIVEN** spawn is configured to:
  - return exit 0 for `git fetch origin main`
  - return exit 1 with stdout containing no `CONFLICT`-prefixed lines for `git merge-tree --write-tree HEAD origin/main`

**WHEN** `runLocalConflictCheck({ baseBranch: "main", cwd: "/workspace", spawn })` is called

**THEN** the result is `{ ok: false, conflictPaths: [] }` (exit code is authoritative; empty path list is acceptable)

---

### TC-LCC-5 — Multiple conflict paths all extracted
- **Priority**: must
- **Source**: tasks.md TC-LCC-5, req §1

**GIVEN** spawn returns exit 1 for `git merge-tree --write-tree HEAD origin/main` with stdout (real git format):
  ```
  CONFLICT (content): Merge conflict in a.ts
  CONFLICT (content): Merge conflict in b.ts
  CONFLICT (modify/delete): c/d.ts deleted in branch-del and modified in HEAD.  Version HEAD of c/d.ts left in tree.
  ```

**WHEN** `runLocalConflictCheck({ baseBranch: "main", cwd: "/workspace", spawn })` is called

**THEN** the result is `{ ok: false, conflictPaths: ["a.ts", "b.ts", "c/d.ts"] }` with all three paths present
  - `a.ts` and `b.ts` extracted by Pattern 1 ("Merge conflict in")
  - `c/d.ts` extracted by Pattern 2 ("deleted in") for modify/delete conflicts

---

### TC-LCC-6 — Correct git commands and args are passed to spawn
- **Priority**: should
- **Source**: req §1, design §1

**GIVEN** a spy/mock spawn that records all calls
AND `baseBranch` is `"main"`

**WHEN** `runLocalConflictCheck({ baseBranch: "main", cwd: "/workspace", spawn })` is called and returns `{ ok: true }`

**THEN** spawn was first called with args `["git", "fetch", "origin", "main"]`
AND then called with args `["git", "merge-tree", "--write-tree", "HEAD", "origin/main"]`
AND called in that order

---

### TC-LCC-7 — Non-default base branch name flows through correctly
- **Priority**: should
- **Source**: req §7, design §1

**GIVEN** `baseBranch` is `"develop"`

**WHEN** `runLocalConflictCheck({ baseBranch: "develop", cwd: "/workspace", spawn })` is called

**THEN** `git fetch origin develop` is executed (not `origin/main`)
AND `git merge-tree --write-tree HEAD origin/develop` is executed

---

## Category: Integration / Orchestrator

### TC-LCC-ORCH-1 — Conflict detected → Phase 1 blocked, exitCode 1, state unchanged
- **Priority**: must
- **Source**: tasks.md TC-LCC-ORCH-1, req §2, §3

**GIVEN** preflight (GitHub mergeStateStatus check) passes with MERGEABLE
AND `runLocalConflictCheck` returns `{ ok: false, conflictPaths: ["src/foo.ts"] }`

**WHEN** orchestrator `run()` is called

**THEN** no `git mv` or `git commit` spawn calls are made (Phase 1 archive did NOT execute)
AND the return value is `{ exitCode: 1, escalation: <non-empty string> }`
AND `transitionJob` was not called (job state is unchanged)
AND `markJobArchived` was not called

---

### TC-LCC-ORCH-2 — No conflict → Phase 1 proceeds normally
- **Priority**: must
- **Source**: tasks.md TC-LCC-ORCH-2, req §5

**GIVEN** preflight passes
AND `runLocalConflictCheck` returns `{ ok: true }`

**WHEN** orchestrator `run()` is called

**THEN** Phase 1 archive executes (git mv / git commit spawn calls are made)
AND Phase 2/3 execute as before

---

### TC-LCC-ORCH-3 — `git fetch` failure → exitCode 1, state unchanged
- **Priority**: must
- **Source**: tasks.md TC-LCC-ORCH-3, req §4

**GIVEN** preflight passes
AND `git fetch origin main` throws an Error inside `runLocalConflictCheck`

**WHEN** orchestrator `run()` is called

**THEN** the return value is `{ exitCode: 1, escalation: <non-empty string> }`
AND job state is NOT changed
AND Phase 1 archive does NOT execute

---

### TC-LCC-ORCH-4 — Conflict escalation message contains recovery instructions
- **Priority**: must
- **Source**: tasks.md TC-LCC-ORCH-4, req §2

**GIVEN** preflight passes
AND `runLocalConflictCheck` returns `{ ok: false, conflictPaths: ["src/foo.ts"] }`
AND baseBranch is `"main"` and slug is `"my-change"`

**WHEN** orchestrator `run()` is called

**THEN** the escalation message contains `git rebase origin/main`
AND the escalation message contains `specrunner finish my-change`
AND the escalation message contains `src/foo.ts`

---

### TC-LCC-ORCH-5 — After conflict escalation, re-running finish is not blocked
- **Priority**: must
- **Source**: tasks.md TC-LCC-ORCH-5, req §3

**GIVEN** a previous orchestrator run returned `{ exitCode: 1, escalation }` due to local conflict check failure
AND job state was not changed by that run (remains original status, e.g. `"active"`)

**WHEN** `assertJobFinishable` is called for the same job slug

**THEN** it does NOT throw / block
AND a subsequent `specrunner finish <slug>` invocation proceeds to Phase 0 again

---

### TC-LCC-ORCH-6 — preflight failure still prevents Phase 1 (existing behavior preserved)
- **Priority**: must
- **Source**: tasks.md TC-LCC-ORCH-6, req §5

**GIVEN** preflight returns an escalation (e.g. mergeStateStatus is CONFLICTING after retries)

**WHEN** orchestrator `run()` is called

**THEN** `runLocalConflictCheck` is NOT invoked (execution stops at preflight)
AND Phase 1 archive does NOT execute

---

### TC-LCC-ORCH-7 — dry-run flag skips local conflict check
- **Priority**: should
- **Source**: tasks.md Task 2 (`!flags.dryRun` condition)

**GIVEN** orchestrator is called with `flags.dryRun = true`
AND spawn would return a conflict if `git merge-tree` were called

**WHEN** orchestrator `run()` is called

**THEN** `runLocalConflictCheck` is NOT invoked
AND the orchestrator exits with normal dry-run behavior

---

### TC-LCC-ORCH-8 — Already-merged PR skips local conflict check
- **Priority**: should
- **Source**: tasks.md Task 2 (`prViewData.state !== "MERGED"` condition)

**GIVEN** preflight reports PR state as `"MERGED"`

**WHEN** orchestrator `run()` is called

**THEN** `runLocalConflictCheck` is NOT invoked
AND orchestrator proceeds with merged-state handling (Phase 1/2/3 with merged path)

---

### TC-LCC-ORCH-9 — Fetch failure escalation message contains error details
- **Priority**: should
- **Source**: req §4

**GIVEN** preflight passes
AND `git fetch origin main` fails with stderr `"fatal: repository not found"`

**WHEN** orchestrator `run()` is called

**THEN** escalation message references the fetch failure context (e.g. contains `"git fetch"` or `"origin/main"`)
AND escalation message includes the error detail from stderr

---

### TC-LCC-ORCH-10 — Worktree path is used as cwd when available
- **Priority**: should
- **Source**: tasks.md Task 2 (`target.worktreePath ?? cwd` logic)

**GIVEN** `target.worktreePath` is set to `"/worktrees/my-change"`
AND preflight passes

**WHEN** orchestrator calls `runLocalConflictCheck`

**THEN** `runLocalConflictCheck` is called with `cwd = "/worktrees/my-change"` (not the process cwd)

---

## Category: Regression

### TC-REG-1 — End-to-end finish with no conflict is unaffected
- **Priority**: must
- **Source**: tasks.md TC-LCC-ORCH-6, req §5

**GIVEN** no conflict exists and preflight passes and `runLocalConflictCheck` returns `{ ok: true }`

**WHEN** finish orchestrator runs end-to-end

**THEN** Phase 1 archive, Phase 2 push, Phase 3 merge proceed identically to pre-change behavior
AND all pre-existing Phase 0/1/2/3 tests pass

---

### TC-REG-2 — mergeStateStatus CONFLICTING escalation path still works
- **Priority**: must
- **Source**: req §5 (existing runPreflight behavior unchanged)

**GIVEN** GitHub returns mergeStateStatus `CONFLICTING` after all retries

**WHEN** orchestrator `run()` is called

**THEN** the escalation from `runPreflight` is returned
AND `runLocalConflictCheck` is never reached
AND Phase 1 archive does NOT execute

---

### TC-REG-3 — No redundant `git fetch` calls introduced
- **Priority**: could
- **Source**: design §1 (fetch usage discipline)

**GIVEN** a normal finish flow with no conflict and preflight passes

**WHEN** orchestrator runs Phase 0 through Phase 3

**THEN** the `git fetch` invocation inside local-conflict-check fires exactly once
AND no additional `git fetch origin <base>` calls are introduced beyond what existed before this change
