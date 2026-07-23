# Design: operator-canon-apply-on-resume

## Context

When a pipeline step produces a fixable finding on a protected canon path
(request.md, spec.md, design.md, tasks.md, test-cases.md,
factCheckAttestation.json) that no pipeline fixer can legally write,
`commit-orchestrator.ts` routes the job to `awaiting-resume` with error code
`CANON_FINDING_ESCALATION` and a hint telling the operator to "手動で修正し、
job resume で再開してください" — with no mention of `git commit` or `git push`.

The operator follows the hint, hand-edits the protected file in the job
worktree, and runs `job resume`. This fails in two distinct ways:

1. **Without commit**: The next step's `commitAndPush` (scoped mode) calls
   `getWorktreeChangedPaths(worktreeOnly=true)`, then
   `findScopedCommitViolations` + `findWriteScopeViolations`. Both detect the
   operator's edits as residual worktree changes outside the step's declared
   scope. The code quarantines them, restores HEAD (destroying the edits), and
   halts with `WRITE_SCOPE_VIOLATION`.

2. **With commit but without push**: The commit is local-only. The egress
   backstop (`runInlineEgressCheck`) finds the commit in
   `rev-list HEAD --not --remotes=origin` and checks it against
   `synthesizedCommits`. The OID is absent → halts with `EGRESS_UNKNOWN_COMMIT`.

The only currently working path is "edit → commit → **hand push** → resume",
but this requires tribal knowledge of the egress backstop design and is nowhere
documented. The hint actively misdirects the operator.

The write-scope and egress mechanisms are both correct and necessary (per
ADR-20260721, ADR-20260722). The gap is at the **resume entry point**, which
has no concept of operator-applied changes and starts the step with a dirty
worktree. This design adds an explicit operator mode at that entry point.

### Relevant source files

| File | Role |
|---|---|
| `src/core/step/commit-orchestrator.ts:369` | Sets `CANON_FINDING_ESCALATION` error with the misleading hint |
| `src/core/step/canon-escalation.ts:buildCanonEscalationReason` | Builds the escalation reason text |
| `src/core/step/commit-push.ts` (scoped mode) | Detects pre-step dirty canon + halts |
| `src/core/command/resume.ts:ResumeCommand.prepare()` | No worktree dirty check today |
| `src/cli/command-registry.ts:574-637` | No `--apply-canon` flag today |
| `src/state/schema/operations.ts:appendSynthesizedCommit` | Pure, idempotent OID append |
| `src/core/step/write-scope.ts:protectedCanonPaths` | Canonical list of protected paths |

## Goals / Non-Goals

**Goals**:
- `job resume <slug> --apply-canon`: detect protected-canon-path dirty changes
  in the job worktree, commit them as an `operator-apply` commit, record the
  OID in `state.synthesizedCommits`, then start the step with a clean worktree
- Fail-closed when protected canon is dirty and `--apply-canon` is absent:
  stop with actionable guidance instead of silently destroying operator work
- Update the `CANON_FINDING_ESCALATION` hint and `buildCanonEscalationReason`
  output to mention `--apply-canon` and drop the implied git-commit/push steps

**Non-Goals**:
- Changing write-scope enforcement or egress backstop semantics
- Applying operator edits outside protected canon paths (handled by existing
  operator hand-commit + hand-push workflow)
- Managed runtime parity (separate request series)
- Auto-detecting whether a dirty canon file is operator work vs. agent crash
  residue without an explicit flag

## Decisions

### D1: Explicit `--apply-canon` flag at resume entry

`job resume <slug> --apply-canon` is added as a new boolean flag. When
present, `ResumeCommand.prepare()` runs the canon-apply flow before starting
the step.

**Rationale**: Auto-committing any dirty canon file on every resume would allow
crash-residue agent edits (from a step that wrote to a canon path before
crashing) to be laundered into `synthesizedCommits` without operator awareness.
The ledger represents "pipeline-constructed history" (ADR-20260722 D4). Operator
attribution requires an explicit act; the flag makes intent unambiguous: "I, the
operator, intentionally applied these changes."

**Alternatives considered**:
- *Auto-commit on every resume*: rejected — attribution laundering risk; a
  crashed step may leave agent-written content in the canon path that would
  silently reach the ledger.
- *Detect "crash residue" vs. operator edit*: rejected — snapshot-based
  attribution is unreliable after crash/kill paths (D7 rationale in
  ADR-20260721); the gap it introduces is worse than the explicit-flag cost.

### D2: Fail-closed when dirty without `--apply-canon`

When `--apply-canon` is not given and protected canon paths are dirty in the
worktree, `prepare()` halts with exit code 1 and prints actionable guidance:
"use --apply-canon to adopt the changes as an operator commit, or discard them
first."

**Rationale**: The current behavior (step quietly restores/discards the edits)
is the worst outcome for an operator who spent time editing. Fail-closed makes
the situation visible and recoverable. The operator has two explicit choices.

**Alternatives considered**:
- *Warn but continue*: rejected — the step will deterministically fail at the
  write-scope residual check, turning a warning into a deferred halt with a
  harder-to-read error.

### D3: Canon-apply implemented in new `src/core/resume/apply-canon.ts`

A new module `src/core/resume/apply-canon.ts` provides two pure-ish functions:

- `detectCanonDirtyPaths(slug, worktreePath, spawnFn)` — runs
  `git status --porcelain -z --no-renames` in `worktreePath`, parses the NUL-
  delimited output (same format as `getWorktreeChangedPaths` in
  `commit-push.ts`), and returns paths that are both dirty in the worktree or
  index AND are in `protectedCanonPaths(slug)`.
- `commitOperatorCanon(slug, worktreePath, paths, spawnFn)` — stages the
  specified paths with `git add -- <paths>`, commits with message
  `operator-apply: <slug>`, and returns the new HEAD OID via `git rev-parse HEAD`.

`ResumeCommand.prepare()` calls these functions after resolving
`resolvedWorktreePath`, before returning `PrepareResult`.

**Rationale**: Encapsulating the logic in a dedicated module keeps `resume.ts`
readable and makes the canon-apply behavior independently testable. The module
sits naturally alongside `resolve-job.ts`, `resolve-step.ts`, `safety.ts` in
`src/core/resume/`. Importing `protectedCanonPaths` from `src/core/step/
write-scope.ts` is a domain→domain import, which is architecture-compliant.

**Alternatives considered**:
- *Inline in `prepare()`*: would make `prepare()` hard to read and test.
- *CLI layer module*: `apply-canon.ts` needs `protectedCanonPaths` from
  `core/step/` and git utilities from `util/`; `core/resume/` is the natural
  layer.

### D4: OID recorded in `synthesizedCommits` and state re-persisted before returning PrepareResult

After `commitOperatorCanon` returns an OID, `prepare()` calls
`appendSynthesizedCommit(updatedState, oid)` and re-persists the state using
the same `JobStateStore` reference captured during the "transition to running"
step. This happens before `PrepareResult` is returned, guaranteeing that the
egress backstop will recognize the operator commit when the step runs
`commitAndPush`.

**Rationale**: The synthesized-commits ledger must contain the OID before any
push attempt. Since `appendSynthesizedCommit` is pure and idempotent, re-runs
(e.g., after a crash at re-persist) are safe.

**Alternatives considered**:
- *Record OID at step completion*: rejected — the egress check runs during
  `commitAndPush`, which is inside the step. The OID must already be in the
  ledger at that point.

### D5: Commit message `operator-apply: <slug>`, explicit pathspec

The operator commit uses message `operator-apply: <slug>` and stages/commits
only the detected dirty protected canon paths (explicit pathspec). Non-canon
dirty paths are left untouched in the worktree.

**Rationale**: The commit message makes the commit's origin unambiguous in
`git log`. Explicit pathspec prevents non-canon dirty paths (other operator
work, test artifacts, crash residue) from being swept into the operator commit.

### D6: `--apply-canon` skipped when worktree path is unavailable

If `resolvedWorktreePath` is null (e.g., `--no-worktree` mode, or worktree
not found in sidecar), the dirty check is skipped and `--apply-canon` is
ignored with a warning.

**Rationale**: `--no-worktree` mode has no worktree state to inspect. The
existing behavior (step runs without worktree) is preserved.

### D7: Store reference retained across the "running" transition and the apply-canon persist

`prepare()` refactors to capture the `JobStateStore` (or `null`) reference
outside the try-block so it can be reused for the re-persist after appending
the OID. This avoids a second `resolveStateStoreByJobId` call.

## Risks / Trade-offs

- [Risk] If the operator's commit lands in the ledger but the step subsequently
  fails and halts, the commit is permanently in history.
  Mitigation: identical to normal pipeline commit behavior; the operator chose
  to commit.
- [Risk] If `commitOperatorCanon` fails (e.g., git user config not set in the
  worktree), `prepare()` throws `PrepareError(1)`. The job remains in "running"
  with no process; stale-detection recovers it on next resume.
  Mitigation: clear error message; stale-detection already handles orphaned
  "running" jobs.
- [Risk] `--apply-canon` does not verify whether the worktree changes relate
  to the `CANON_FINDING_ESCALATION` (the operator could run it on an
  unrelated dirty worktree).
  Mitigation: flag requires explicit operator intent; the explicit pathspec
  limits scope to protected canon files only; commit message records the
  attribution.

## Open Questions

None. All design decisions are architect-approved in `request.md`.
