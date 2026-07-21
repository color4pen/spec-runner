# Cross-Boundary Invariants Review: job-reopen-from-awaiting-archive

**Reviewer**: cross-boundary-invariants
**Iteration**: 001

---

## Scope

Reviewed the new execution paths introduced by this change and walked the neighboring,
**unchanged** code to verify that no implicit assumption is silently broken.

Files examined:

| File | Role |
|------|------|
| `src/state/lifecycle.ts` | `REOPEN_TRANSITIONS`, `transitionJob` opts extension |
| `src/core/command/reopen.ts` | `ReopenCommand.prepare()` — new state-transition path |
| `src/cli/reopen.ts` | CLI bootstrap, store = null handling |
| `src/cli/command-registry.ts` | `reopen` subcommand wiring, `guardedSubcommands` |
| `src/store/event-journal.ts` | `fold()` extended with `operatorEvents` collection |
| `src/store/job-journal.ts` | `appendOperatorEvent` seam, ENOENT literal |
| `src/store/job-state-store.ts` | `appendOperatorEvent` delegation |
| `src/store/job-state-projection.ts` | Default `FoldResult` literal |
| `src/core/lifecycle/exit-guard.ts` | Unchanged — verified against reopened job lifecycle |
| `src/core/command/resume.ts` | Unchanged — `canTransition` guard verified |
| `src/core/pipeline/reviewer-status.ts` | Unchanged — `selectPendingMembers` revision binding |
| `src/core/pipeline/reverification.ts` | Unchanged — `conformanceApprovedForVerifiedRevision` |
| `src/core/pipeline/parallel-review-round.ts` | Unchanged — `baselineCommit` resolution path |
| `src/core/finish/job-state-update.ts` | Unchanged — `assertJobFinishable` |

---

## New Paths Enumerated

### Path A: `job reopen` happy path (awaiting-archive, OPEN PR)

`ReopenCommand.prepare()` →
`resolveStateStoreByJobId` (non-null) →
`store.appendOperatorEvent` →
`transitionJob(..., { allowReopen: true })` →
`store.persist(running)` →
`CommandRunner.execute()` → exit guard registered → `runtime.setupWorkspace()` → pipeline

### Path B: `job reopen` with store = null (degraded)

`ReopenCommand.prepare()` →
`resolveStateStoreByJobId` returns null →
operator event **not** written →
`transitionJob(...)` succeeds in memory →
state **not** persisted to disk →
`prepare()` returns successfully →
`CommandRunner.execute()` → exit guard registered → `runtime.setupWorkspace()` persists running state → pipeline

### Path C: Exit guard fires on a reopened (running) job

Exit guard reads disk state (`status: "running"` after Path A or after `setupWorkspace` in Path B) →
`state.status !== "running"` check → `false` → transitions to `awaiting-resume` ✅

### Path D: `job resume` on an awaiting-archive job (must still reject)

`ResumeCommand.prepare()` → `canTransition("awaiting-archive", "running")` →
`VALID_TRANSITIONS.get("awaiting-archive")?.has("running")` = `false` → reject ✅

### Path E: `job archive --with-merge` on a running (reopened) job

`assertJobFinishable(state)` → `canTransition("running", "archived")` =
`VALID_TRANSITIONS.get("running") = {awaiting-resume, awaiting-archive, failed, terminated, canceled}` →
`has("archived")` = `false` → throws `JOB_NOT_FINISHABLE` ✅

### Path F: Approval invalidation — local runtime, head advanced

Reviewer coordinator runs: `captureHeadSha(cwd)` returns `newSha` →
`selectPendingMembers(statuses, members, newSha)` →
approved member with `approvedAtCommit = oldSha` → `oldSha ≠ newSha` → re-run ✅

### Path G: Approval invalidation — local runtime, head unchanged (same-revision reopen)

`captureHeadSha(cwd)` returns `sha` →
`selectPendingMembers(statuses, members, sha)` →
approved member with `approvedAtCommit = sha` → `sha = sha` → excluded (reused) ✅
(correct per design D5 "Risk" mitigation — same-revision approval is still valid)

### Path H: `conformanceApprovedForVerifiedRevision` after reopen on new revision

After reopen, new verification run produces new `commitOid = newVer` →
conformance run from pre-reopen has `commitOid = oldConf` →
`oldConf ≠ newVer` → returns `false` → re-verification routes correctly ✅

---

## Findings

### [WARN-1] Path B: D6 durability guarantee conditionally violated when `store = null`

**Invariant claimed in design D6**: "The operator event is appended **before** the status
transition is persisted, so the record is durable even if the subsequent pipeline run
fails or is interrupted."

**Reproducible sequence (Path B)**:

1. `await resolveStateStoreByJobId(cwd, state.jobId)` returns `null`
   — this can happen when both the sidecar entry and `resolveCanonicalStateDir` are
   absent (e.g., `.specrunner/local/` not indexed yet, and the change folder moved).
2. `if (store) { await store.appendOperatorEvent(...) }` → skipped. Operator event
   **never written** to `events.jsonl`.
3. `if (store) { await store.persist(transitioned) }` → skipped. Disk state remains
   `awaiting-archive`.
4. `prepare()` returns successfully with in-memory `updatedState.status = "running"`.
5. `CommandRunner.execute()` registers the exit guard for `jobId`.
6. Process exits before `runtime.setupWorkspace()` persists the running state.
7. Exit guard fires: reads disk state → `status: "awaiting-archive"` →
   `state.status !== "running"` → **guard skips awaiting-resume transition**.
8. Job stays in `awaiting-archive` on disk. The reopen attempt is unrecorded.

**Severity assessment**: This is a concrete sequence but relies on an edge precondition
(null store for an `awaiting-archive` job that reached pipeline completion — such jobs
always have a canonical state dir under `specrunner/changes/<slug>/`). The pattern is
identical to `ResumeCommand.prepare()` (line 214: `if (runStore) await runStore.persist(transitioned)`),
which was the template. No newly-introduced invariant in unchanged code is broken —
the exit guard's "check status=running on disk" invariant is respected; the gap is that
prepare does not guarantee the disk state is updated.

**Assessment**: Pre-existing pattern from ResumeCommand. Not a new violation in
unchanged code. However, D6's "durable even if interrupted" claim is overstated — it
holds only when store is non-null.

---

### [WARN-2] `allowReopen` opt-in is convention-enforced, not mechanism-enforced

**Invariant claimed**: "awaiting-archive → running is permitted only through the
explicit `job reopen` command."

**Observation**: `REOPEN_TRANSITIONS` and `TransitionOpts` (including `allowReopen`)
are both public exports from `lifecycle.ts`. Any module may call
`transitionJob(state, "running", ctx, { allowReopen: true })` on an `awaiting-archive`
state. The only protection is the doc comment: "Must only be passed by
ReopenCommand.prepare()."

The existing callers — `ResumeCommand` (`canTransition` guard), exit guard
(`transitionJob("awaiting-resume", ...)`), `assertJobFinishable` (`canTransition(s, "archived")`),
pipeline steps — all use the unchanged `VALID_TRANSITIONS`-only path and are
unaffected. No currently existing call site can accidentally trigger the reopen edge.

**Assessment**: No concrete breakage in existing code today. The risk is future
callers. Explicit design choice (D2) accepted this trade-off. Flagged for awareness —
not a blocking finding.

---

### [INFO-1] D8 approval invalidation claim is inaccurate for managed runtime

**Design D8** claims "identical contract for local and managed runtimes" for the
approval invalidation (D5).

**Actual behavior in managed runtime**:

In `parallel-review-round.ts`, `baselineCommit` is set via `await deps.runtimeStrategy.captureHeadSha(cwd)`.
In managed runtime this returns `null` → `baselineCommit = null`.
`selectPendingMembers(statuses, members, null)` disables the revision check
(documented behavior: "null → revision check disabled → exclude approved member regardless of commitOid").

**Concrete scenario** (managed runtime, reopen from `code-review` after HEAD advances):

1. Job in `awaiting-archive`, approved reviewer at `oldSha`.
2. Operator pushes fix → HEAD advances to `newSha`.
3. `job reopen --from code-review --reason "..."` succeeds.
4. Reviewer coordinator runs in managed runtime: `captureHeadSha` → `null`.
5. `selectPendingMembers(statuses, members, null)` → approved member `excluded` (revision check disabled).
6. Pre-reopen approval at `oldSha` is reused on revision `newSha`. **Stale approval survives.**

This contradicts D8's "identical contract" claim. However, this is a **pre-existing**
limitation of managed runtime for parallel reviewers (explicitly labeled
"NOTE: parallel custom reviewer managed support is a known limitation (Non-Goal)" in
`parallel-review-round.ts`). The change does not modify `parallel-review-round.ts`.
The same behavior exists for `job resume` after code changes in managed runtime.

**Assessment**: Pre-existing limitation. Not introduced by this change. D8 is
inaccurate but reflects the existing asymmetry in runtime capabilities. No action
required for this change.

---

### [INFO-2] `REOPEN_USAGE` hardcodes step names instead of referencing constants

`command-registry.ts` lines 293–295 list valid `--from` step values directly in the
usage string rather than using `AGENT_STEP_NAMES` and `CLI_STEP_NAMES` (which are
correctly used for flag validation). The help text could diverge from the actual
accepted values when new steps are added.

**Assessment**: Minor maintenance issue, no behavioral impact.

---

## Verified Invariants — No Violation Found

| Invariant | Mechanism | Status |
|-----------|-----------|--------|
| `canTransition("awaiting-archive", "running")` = `false` | `VALID_TRANSITIONS` unchanged | ✅ holds |
| `job resume` rejects `awaiting-archive` | `ResumeCommand.prepare()` uses `canTransition` | ✅ holds |
| `job archive` rejects a running job | `assertJobFinishable` uses `canTransition(s, "archived")` | ✅ holds |
| Exit guard transitions running jobs to `awaiting-resume` | Guard reads disk status = `running` after `setupWorkspace` | ✅ holds (Path A; Path B has narrow gap identical to resume) |
| Evidence non-destructive on re-run | `steps`/`reviewerStatuses` not cleared in transition patch | ✅ holds |
| `events.jsonl` append-only | `appendOperatorEvent` uses `fs.appendFile`; fold never rewrites | ✅ holds |
| Operator event before transition (D6) | Event appended before `store.persist` when store ≠ null | ✅ holds (store ≠ null path) |
| Same-revision approval reused correctly | `approvedAtCommit = baselineCommit` → excluded | ✅ holds |
| Cross-revision approval invalidated | `approvedAtCommit ≠ baselineCommit` → pending | ✅ holds (local runtime) |
| Conformance short-circuit blocked on new revision | `conformanceOid ≠ verificationOid` → false | ✅ holds |
| `FoldResult.operatorEvents` always set in production code | Both manual literals include `operatorEvents: []` | ✅ holds |
| `REOPEN_TRANSITIONS` not consulted by `canTransition` | `canTransition` reads only `VALID_TRANSITIONS` | ✅ holds |
| Sidecar orphan detection unaffected | `ACTIVE_STATUSES` in `sidecar/orphan.ts` includes `awaiting-archive` | ✅ holds |
