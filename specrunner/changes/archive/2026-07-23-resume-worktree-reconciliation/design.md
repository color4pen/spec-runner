# Design: resume-worktree-reconciliation

## Context

A step-execution stop (write-scope violation halt / crash / process kill) can leave
uncommitted step artifacts in the job worktree. The current `resume` does not clean
up this residue, so the next step's write-set check misattributes it as an
out-of-declaration write by that step, reproducing store-fail → halt. The job cannot
advance autonomously until an operator manually deletes the residue.

Observed in a production run journal: an interrupted spec-review attempt left an
untracked `spec-review-result-002.md`. After resume, the re-run spec-review (declaring
iteration 003) hit its write-set check, saw `spec-review-result-002.md` as "Forbidden
paths changed", and halted.

Regardless of how execution stopped (clean halt / crash / kill), cleanup on the halt
side is not guaranteed to run. The recovery responsibility therefore belongs on the
resume side, and resume becomes the single recovery point whose contract is
"mechanically establish a consistent start state."

### Why the residue triggers a halt (current code)

- `src/core/command/resume.ts:268-328` — the resume dirty check is scoped to
  protected canon paths only (the apply-canon gate). Canon dirt is either committed as
  an operator-apply commit (`--apply-canon`) or fail-closes. **Non-canon dirty /
  untracked files pass unchecked** and proceed to step start.
- `src/core/resume/apply-canon.ts:50` — `detectCanonDirtyPaths` runs
  `git status --porcelain -z --no-renames -- <protectedCanonPaths>`, scoped to canon.
- `src/core/step/commit-push.ts:92-96` — the scoped residual check
  (`getWorktreeChangedPaths(worktreeOnly=true)`) excludes pre-staged-only files but
  **includes untracked (`Y='?'`) files**, which then feed `findScopedCommitViolations`
  and `findWriteScopeViolations` → `WRITE_SCOPE_VIOLATION` halt.
- `src/core/pipeline/round-git-scope.ts:109` — `pipelineManagedPaths(slug)` defines the
  change-folder paths the pipeline itself owns/commits at its seams:
  `[state.json, events.jsonl, usage.json, bite-evidence-result.md, pr-create-result.md]`.
  Residue like `spec-review-result-002.md` is **not** in this set, so the scoped commit
  path treats it as an undeclared write.

### Relevant source files

| File | Role |
|---|---|
| `src/core/command/resume.ts` (`ResumeCommand.prepare()`) | Resume entry; apply-canon gate lives here; reconcile is added here |
| `src/core/resume/apply-canon.ts` | Canon dirty detection + operator-apply commit (unchanged) |
| `src/core/step/write-scope.ts` (`protectedCanonPaths`) | Canonical protected-path set for a slug |
| `src/core/pipeline/round-git-scope.ts` (`pipelineManagedPaths`) | Pipeline-managed change-folder path set |
| `src/core/step/commit-push.ts` | Scoped/guarded write-set check that misattributes residue today |
| `src/util/paths.ts` (`changeFolderPath`, `localSidecarDir`) | Change-folder root + machine-local quarantine dir |
| `src/util/git-exec.ts` (`runSubprocess`, `gitExec`, `gitExecResult`, `SpawnFn`) | git subprocess seam |

## Goals / Non-Goals

**Goals**:
- Before starting the step, `resume` mechanically reconciles the worktree so the start
  state is consistent independent of the prior stop mode (clean halt / crash / kill).
- Reconcile classifies dirty/untracked paths into three classes and processes each per
  the recovery contract (below).
- Interrupted-attempt step-artifact residue is quarantined (evidence preserved) and
  removed so the next step's write-set check can no longer misattribute it.
- Reconcile runs consistently on every resume path (default / `--from` / `--apply-canon`).
- The recovery contract (classification × processing × timing) is documented on one page.

**Non-Goals**:
- Changing write-set check logic (excluding residue there is a fail-open relaxation — not adopted).
- Adding halt-side cleanup (not guaranteed to run under crash / kill).
- Changing the handling of non-managed path dirt (src/ etc.) — current behavior is kept
  and documented as the contract for that class.
- Changing the existing apply-canon gate behavior for protected canon paths.
- Handling step output-contract dissatisfaction (e.g. test-materialize) halts.

## Recovery contract (classification × processing × timing)

A worktree path that is dirty or untracked at resume time is classified and processed as:

| Class | Classification predicate | Processing | Timing |
|---|---|---|---|
| **protected canon** | `path ∈ protectedCanonPaths(slug)` | **Unchanged apply-canon gate**: `--apply-canon` → operator-apply commit; no flag → fail-closed stop | resume `prepare()`, **before** reconcile |
| **pipeline-managed artifact** (step artifacts / result files) | `path` under `changeFolderPath(slug)` AND `path ∉ protectedCanonPaths(slug)` AND `path ∉ pipelineManagedPaths(slug)` | **Quarantine to `.specrunner/local/<slug>/` then remove**; start step from HEAD's clean state. Quarantine failure → fail-closed (do not remove) | resume `prepare()`, **after** the apply-canon gate, before step start |
| **non-managed path** (src/ etc., and the pipeline state journal itself) | any path not in the two classes above (outside the change folder, **or** in `pipelineManagedPaths(slug)`) | **No processing** (current behavior preserved) | — |

The **state journal** (`state.json` / `events.jsonl` / `usage.json`, i.e. the core of
`pipelineManagedPaths`) is intentionally in the non-managed class: resume itself has just
written `state.json` (the "running" transition), so it is legitimately dirty and must not
be removed. See D3.

## Decisions

### D1: Reconcile at the resume entry (single recovery point)

Reconcile is performed in `ResumeCommand.prepare()` — the single confluence of all stop
modes — rather than on the halt side.

**Rationale**: Under crash / kill, halt-side cleanup is not guaranteed to run. Resume is
the one point every stop mode passes through, so placing the reconcile there makes the
"consistent start state" a hard contract independent of stop mode. (Architect-approved in
`request.md`.)

**Alternatives considered**:
- *Halt-side cleanup*: rejected — not executed under crash / kill.
- *Exclude "already dirty at start" paths in the write-set check*: rejected — a fail-open
  relaxation, and it still lets residue ride along in the sole-committer synthesized commit.

### D2: New module `src/core/resume/reconcile-worktree.ts`

A new module provides a pure classifier and an I/O orchestrator:

- `isReconcilableArtifact(path: string, slug: string): boolean` — pure predicate
  implementing the middle row of the contract table. Uses `changeFolderPath`,
  `protectedCanonPaths(slug)`, `pipelineManagedPaths(slug)`.
- `reconcileWorktreeArtifacts(slug, worktreePath, spawnFn): Promise<ReconcileResult>` —
  enumerates dirty/untracked paths via `git status --porcelain -z --no-renames` (whole
  worktree, **not** canon-scoped), selects the reconcilable set, quarantines each, then
  removes them. Returns `{ reconciled: string[]; quarantineDir: string | null }`.

The module sits alongside `apply-canon.ts`, `resolve-step.ts`, `safety.ts` in
`src/core/resume/`. Importing `protectedCanonPaths` from `../step/write-scope.js` and
`pipelineManagedPaths` from `../pipeline/round-git-scope.js` are domain→domain imports
(same layer; `core/resume/resolve-step.ts` already imports `../pipeline/types.js`), so
they are architecture-compliant.

**Rationale**: Reusing `pipelineManagedPaths` as the "keep" set (rather than re-listing
paths) means the classifier automatically tracks any future addition to the managed set —
no drift. Encapsulation keeps `prepare()` readable and the classifier unit-testable.

**Alternatives considered**:
- *Inline in `prepare()`*: rejected — harder to read/test; the classifier deserves isolated
  unit coverage.
- *Enumerate a fixed list of removable filename patterns (`*-result-*.md`, etc.)*: rejected —
  drifts as new artifact kinds appear (e.g. `verification-result.md` is not a judge-artifact
  by name yet is residue). The "under change folder − canon − managed" set is complete.

### D3: The state journal is preserved, not reconciled

`state.json`, `events.jsonl`, `usage.json` are in `pipelineManagedPaths` and are therefore
**excluded** from the reconcilable set. At reconcile time `state.json` is dirty because
`prepare()` has just persisted the "running" transition; `usage.json` accumulates across
the run. Removing/restoring these would corrupt the job's own state and lose accounting.

**Rationale**: These are the running state journal, not interrupted-attempt step artifacts.
The reconcilable class is precisely "under the change folder, but neither canon nor
pipeline-managed" — which is exactly the step-output residue (`*-result-NNN.md`,
`review-feedback-NNN.md`, `verification-result.md`, custom-reviewer results, etc.).

**Alternatives considered**:
- *Reconcile everything under the change folder except canon*: rejected — would delete/roll
  back `state.json` (the just-written running transition) and destroy the job.

### D4: Quarantine-all-then-remove-all; quarantine failure is fail-closed

For the reconcilable set, reconcile first quarantines **every** path (writes complete
evidence — the current worktree content, plus `git diff HEAD -- <path>` when available — to
`<worktree>/.specrunner/local/<slug>/reconcile-<ts>/`, reusing the existing sidecar
convention). Only after all evidence is safely captured does it remove the paths. If any
quarantine write fails, reconcile **throws before removing anything** — nothing is removed,
evidence is not lost.

**Rationale**: "Removal must always be accompanied by preservation" (request R3). Capturing
all evidence first guarantees the invariant "if removal has started, all evidence was
already saved." The resume caller maps the throw to a fail-closed `PrepareError(1)`.

**Alternatives considered**:
- *Best-effort quarantine that proceeds to remove on capture failure* (like
  `quarantineViolationEvidence`, which returns `null` and continues): rejected — that path
  is designed to never block a halt, whereas here evidence loss must block removal.

### D5: Removal split by tracked state

Removal mirrors the split already used by `restoreViolatedPaths` in `commit-push.ts`:

- **untracked** (`X='?' Y='?'`) → `git clean -f -- <path>` (not in HEAD; delete from worktree).
- **staged-new** (`X='A'`) → `git rm --cached -- <path>` then `git clean -f -- <path>`.
- **tracked / modified** (otherwise) → `git checkout HEAD -- <path>` (restore committed content).

All three yield "HEAD's clean state" for that path. A removal command failure throws
(fail-closed). The dominant real case (observed in the journal) is untracked residue.

**Rationale**: `git checkout HEAD` cannot restore an untracked or staged-new path; the split
keeps failure semantics unambiguous (same reasoning as the existing restore split).

### D6: Reconcile runs after the apply-canon gate, inside the same worktree guard

The reconcile call is added inside the existing
`if (resolvedWorktreePath !== null && resolvedSlug !== null)` block, **after** the
apply-canon gate and **before** `prepare()` returns. Every resume path that reaches the
step (default / `--from` / `--apply-canon`) therefore runs reconcile. The `--from` flag
only changes `startStep`; it does not bypass this block. When `--apply-canon` commits canon,
control falls through to reconcile. When the apply-canon gate fail-closes (dirty canon, no
flag), the job halts before reconcile — a legitimate stop, not a bypass.

**Rationale**: Ordering after the apply-canon gate means canon safety is already established,
and the apply-canon gate is left unchanged (satisfying the "existing apply-canon tests green"
criterion). `--no-worktree` mode (`resolvedWorktreePath === null`) skips reconcile just as it
skips the apply-canon gate — there is no worktree to reconcile.

**Alternatives considered**:
- *Reconcile before the apply-canon gate*: rejected — no functional difference (the two
  classes are disjoint), but placing it after keeps the canon gate's early-exit/fail-closed
  semantics as the outer guard and avoids touching the gate block.

### D7: Detection is best-effort no-op; only quarantine/removal is fail-closed

`reconcileWorktreeArtifacts` returns a no-op result `{ reconciled: [], quarantineDir: null }`
when it cannot read `git status` (spawn failure — e.g. a non-existent or non-git worktree in
test/dev — **or** a non-zero `git status` exit). It throws **only** when residue was detected
but could not be quarantined or removed.

**Rationale**: The request mandates fail-closed specifically on *evidence loss* (quarantine
failure), not on detection failure. Canon safety does not depend on reconcile's detection —
the apply-canon gate (D6) runs first and fail-closes on its own detection failure, so by the
time reconcile runs, canon is already handled. Reconcile's worst case on a detection failure
is a no-op, which is exactly the pre-feature behavior (the residue-halt), so there is no
regression. This asymmetry is deliberate: canon-detection failure protects operator work and
is fail-closed; residue-detection failure degrades to the existing safe residue-halt.

This also keeps the unchanged apply-canon gate tests green: those tests drive `prepare()`
with a fake worktree path where a real `git status` cannot run — reconcile no-ops there
instead of throwing.

**Alternatives considered**:
- *Fail-closed on any `git status` failure (mirror apply-canon exactly)*: rejected — it would
  require modifying the existing apply-canon gate tests to mock the reconcile module, and it
  makes a broken-git environment escalate where the pre-feature behavior was a benign
  residue-halt. Evidence loss (the real risk) is still fail-closed.

## Risks / Trade-offs

- [Risk] A resumed step legitimately needs a change-folder artifact that reconcile removed.
  Mitigation: reconcile only touches **dirty/untracked** paths. Artifacts from completed
  prior iterations are tracked+clean and are untouched; only uncommitted interrupted-attempt
  residue is reconciled, and every such artifact is re-produced by the step that re-runs.
  Evidence is preserved in quarantine.
- [Risk] `usage.json` / `state.json` dirt is misclassified and removed.
  Mitigation: D3 — `pipelineManagedPaths` is the keep set; these are never reconcilable.
  Covered by a classifier unit test and a real-repo preservation test.
- [Risk] Reconcile fail-open on `git status` failure hides residue in a broken environment.
  Mitigation: in production the worktree exists and is a git repo (`git status` exits 0). A
  status failure is a broken environment where the step's own git would also fail; no-op is
  no worse than pre-feature behavior (D7).
- [Risk] Removal partially succeeds then a later removal fails.
  Mitigation: all evidence is already quarantined (D4); the throw fail-closes; the next
  resume re-runs reconcile on the remaining residue (idempotent).

## Open Questions

None. All classification/processing decisions are architect-approved in `request.md`.
