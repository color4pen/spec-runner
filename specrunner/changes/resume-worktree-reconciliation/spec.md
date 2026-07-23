# Spec: resume-worktree-reconciliation

## Requirements

### Requirement: resume mechanically reconciles the worktree before starting the step

When `job resume <slug>` (or `job resume <slug> --from <step>` /
`job resume <slug> --apply-canon`) is invoked and a worktree is available, the system
SHALL, before starting the step, classify every dirty or untracked worktree path into
exactly one of three classes and process it per the recovery contract:

1. **protected canon** — a path in `protectedCanonPaths(slug)`: handled by the existing
   apply-canon gate (`--apply-canon` → operator-apply commit; no flag → fail-closed stop).
   This behavior SHALL NOT change.
2. **pipeline-managed artifact** — a path under `changeFolderPath(slug)` that is neither
   in `protectedCanonPaths(slug)` nor in `pipelineManagedPaths(slug)`: its content SHALL be
   quarantined under `.specrunner/local/<slug>/` and then removed from the worktree so the
   step starts from HEAD's clean state for that path.
3. **non-managed path** — any other path (outside the change folder, or in
   `pipelineManagedPaths(slug)`): the system SHALL NOT process it (current behavior preserved).

The reconcile SHALL run consistently on every resume path that reaches the step. No path
(default / `--from` / `--apply-canon`) SHALL skip reconcile.

#### Scenario: interrupted-attempt residue is quarantined, removed, and the next step completes

**Given** a job in `awaiting-resume` status whose worktree contains an untracked step-result
file left by an interrupted attempt (e.g. `specrunner/changes/<slug>/spec-review-result-002.md`)
**When** the operator runs `job resume <slug>`
**Then** the residue file's content is written under `.specrunner/local/<slug>/`
**And** the residue file is removed from the worktree
**And** the subsequent step's write-set check reports no `WRITE_SCOPE_VIOLATION` for that residue

#### Scenario: reconcile is a no-op on a worktree with no residue (idempotent)

**Given** a job in `awaiting-resume` status whose worktree has no reconcilable residue
**When** the operator runs `job resume <slug>`
**Then** no quarantine files are created
**And** no worktree paths are removed or restored
**And** the step starts normally (no regression from pre-existing behavior)

---

### Requirement: reconcile preserves the state journal and non-managed paths

When reconciling, the system SHALL leave untouched every path that is in
`pipelineManagedPaths(slug)` (the pipeline state journal — `state.json`, `events.jsonl`,
`usage.json`, and the pipeline-committed result files it manages) and every path outside
`changeFolderPath(slug)` (e.g. `src/`). These paths SHALL NOT be quarantined, removed, or
restored by reconcile.

#### Scenario: state.json and src/ dirt survive reconcile while residue is removed

**Given** a worktree that simultaneously has (a) an untracked residue file under the change
folder, (b) a dirty `specrunner/changes/<slug>/state.json`, and (c) a dirty `src/foo.ts`
**When** reconcile runs during `job resume <slug>`
**Then** only the residue file (a) is quarantined and removed
**And** `state.json` (b) remains dirty and unmodified by reconcile
**And** `src/foo.ts` (c) remains dirty and unmodified by reconcile

---

### Requirement: reconcile is fail-closed when evidence cannot be preserved

When reconcile identifies a reconcilable pipeline-managed artifact but cannot quarantine its
content, the system SHALL NOT remove that path and SHALL stop the resume (exit code 1)
without starting the step. Evidence SHALL NOT be lost.

#### Scenario: quarantine failure halts resume with the residue intact

**Given** a worktree with a reconcilable residue file
**And** the quarantine destination under `.specrunner/local/<slug>/` cannot be written
**When** the operator runs `job resume <slug>`
**Then** the resume stops with exit code 1
**And** the step is NOT started
**And** the residue file remains present in the worktree (not removed)

---

### Requirement: reconcile does not weaken the protected-canon apply-canon gate

The reconcile SHALL run after the apply-canon gate and SHALL NOT alter which paths the
apply-canon gate treats as protected canon, nor its `--apply-canon` / fail-closed behavior.
Reconcile SHALL NOT quarantine, remove, or restore any path in `protectedCanonPaths(slug)`.

#### Scenario: dirty canon still fail-closes before reconcile runs

**Given** a job in `awaiting-resume` status whose worktree has a dirty protected canon path
(e.g. `specrunner/changes/<slug>/tasks.md`)
**When** the operator runs `job resume <slug>` without `--apply-canon`
**Then** the resume stops (exit code 1) at the apply-canon gate
**And** reconcile is not reached
**And** the protected canon path is not quarantined or removed by reconcile
