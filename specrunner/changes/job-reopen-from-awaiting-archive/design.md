# Design: job-reopen-from-awaiting-archive

## Context

Human review of an open PR frequently surfaces changes that must be made
*before* merge. This is a normal, recurring case — not an exception. The current
FSM does not model it: a job in `awaiting-archive` may only move to `archived`
or `canceled`.

Concretely:

| Existing mechanism | Why it does not serve post-review fix-forward |
|--------------------|-----------------------------------------------|
| `job resume --from <step>` | `canTransition("awaiting-archive", "running")` is `false` (`src/state/lifecycle.ts:39`), so resume aborts before any pipeline runs. |
| `job cancel` | Deletes the remote branch (`src/core/cancel/runner.ts` via `cancelSingleJob`), destroying the PR and its review history. Cannot fix-forward. |

`awaiting-archive` means "the evidence set (spec-review / test-case-gen /
verification / code-review / conformance) is complete **for the revision that
was final when the pipeline finished**." Re-opening it is therefore an
operator's explicit, audited judgment — not a state the pipeline may re-enter on
its own. Past incidents required break-glass recovery (hand-editing `state.json`
status + a manual PR comment) because no first-class path existed.

Two revision-binding mechanisms are already in place and are the load-bearing
pieces this change relies on:

- **Reviewer approvals** (`src/core/pipeline/reviewer-status.ts:95`,
  `selectPendingMembers`): an approved member is skipped on re-entry only when
  its `approvedAtCommit` equals the current baseline HEAD. The baseline is the
  raw `captureHeadSha(cwd)` computed at coordinator entry
  (`src/core/pipeline/parallel-review-round.ts:114`). Mismatch → the member
  reverts to `pending` and re-runs (fail-closed on absent commit).
- **Conformance approval** (`src/core/pipeline/reverification.ts:108`,
  `conformanceApprovedForVerifiedRevision`): the verification→adr-gen /
  verification→pr-create short-circuit fires only when the latest conformance
  run's `commitOid` equals the latest verification run's `commitOid`
  (fail-closed on mismatch or absence). Wired in `src/core/pipeline/types.ts:250,307`.

Both are `commitOid`-driven: when the branch HEAD advances (a human pushes a fix
before reopen, or the re-run's implementer/build-fixer/code-fixer commits), the
stale approvals no longer match the new revision and are automatically excluded
from routing.

Supporting facts confirmed in the current tree:

- Evidence is stored per-iteration: `*-result-NNN.md` and `review-feedback-NNN.md`
  (`src/util/paths.ts`), plus the append-only `events.jsonl`
  (`src/store/event-journal.ts`, `appendEventRecord` uses `fs.appendFile` only).
  Re-execution therefore *adds* iterations; it never overwrites.
- `pr-create` is idempotent: an existing **OPEN** PR on the branch returns
  `existing-open` and is reused; a **MERGED** or **CLOSED** PR returns an error
  (`src/core/pr-create/runner.ts`, D2). So a terminal re-run through pr-create
  preserves the PR rather than duplicating it.
- `job resume` and `job cancel`/`job archive` are guarded operations that reject
  invocation from inside a specrunner worktree (`ResumeCommand.prepare()`).
- The journal seam already exposes side-channel appends that do not touch
  `state.json` projection: `JobJournal.appendInterruption` / `appendLineage`
  (`src/store/job-journal.ts:218,228`), surfaced through `JobStateStore`.

## Goals / Non-Goals

**Goals**:

- Add an explicit `job reopen <slug> --from <step> --reason <text>` command
  (both flags required) that transitions `awaiting-archive → running` and
  re-runs the pipeline from the given step.
- Permit the `awaiting-archive → running` edge **only through the reopen
  operation**; `job resume` continues to reject it.
- Reject reopen when the job's PR is merged, or when the job is `archived` /
  `canceled` (or any non-`awaiting-archive` status), with a clear non-zero-exit
  error.
- Preserve all prior evidence (review / verification / attestation / journal /
  `events.jsonl`); re-execution appends new iterations.
- Ensure approvals and revision bindings at or after the reopened step are not
  reused on the new revision, integrated with the existing `commitOid` binding.
- Preserve the remote branch and PR (no cancel-style cleanup).
- Record the reopen operation itself as an operator event in the journal
  (`reason`, from-step, timestamp).
- Identical contract for local and managed runtimes; independent of any
  `minimumAssurance` floor configuration.

**Non-Goals**:

- Re-entry from `archived` / `canceled` (reopen is `awaiting-archive`-only).
- Revert / follow-up flow for already-merged PRs.
- inbox / issue-triggered automatic reopen.
- Deleting or rewriting approval records. Records are immutable; invalidation is
  a judgment-side (routing) behavior, never a record mutation.
- Widening `VALID_TRANSITIONS` to make `awaiting-archive → running` generally
  legal.

## Decisions

### D1: An explicit `job reopen` command modeled on `ResumeCommand`

Add `ReopenCommand` (`src/core/command/reopen.ts`) as a `CommandRunner`
subclass, exactly as `ResumeCommand` is. Only `prepare()` is overridden; the
Template Method (`src/core/command/runner.ts`) runs the pipeline from the
resolved `startStep`. A thin CLI entry (`src/cli/reopen.ts`) bootstraps the
runtime and delegates, mirroring `src/cli/resume.ts`.

`--from` and `--reason` are both mandatory. `--from` is validated and resolved
with the *existing* resume helpers so dynamic reviewer step names work
unchanged: `buildAllowedStepSet(state.reviewers)`, `resolveResumeStep`, and
`mapMemberToCoordinator` (`src/core/resume/resolve-step.ts`).

**Rationale**: Re-opening a completed evidence set is an operator judgment that
must be recorded (`--reason`) and audited (journal). A dedicated command makes
the operation explicit and lets it own its own precondition gates, rather than
overloading resume with a status-specific branch.

**Alternatives considered**:

- *Relax the resume guard* (allow `awaiting-archive → running` in resume):
  rejected by the architect — an unconditional re-open can destroy a completed
  evidence set with no operator record.
- *`job cancel` + re-run*: rejected — destroys the remote branch and PR review
  context.

### D2: Operator-scoped FSM edge via a separate transition table, not by widening `VALID_TRANSITIONS`

Keep `VALID_TRANSITIONS` unchanged (`awaiting-archive → {archived, canceled}`).
Add a dedicated, minimal table consulted **only** when the caller opts in:

- `REOPEN_TRANSITIONS: ReadonlyMap<JobStatus, ReadonlySet<JobStatus>>` =
  `{ "awaiting-archive" → {"running"} }`.
- Extend `transitionJob` with an optional 4th argument
  (e.g. `opts?: { allowReopen?: boolean }`). Validation becomes
  `VALID_TRANSITIONS.get(from)?.has(to) || (opts?.allowReopen && REOPEN_TRANSITIONS.get(from)?.has(to))`.
  Default (`allowReopen` absent/false) preserves every existing caller's
  behavior byte-for-byte.
- `canTransition` is **not** changed. `ResumeCommand.prepare()` calls
  `canTransition(state.status, "running")` (`src/core/command/resume.ts:155`),
  which stays `false` for `awaiting-archive` — resume keeps rejecting.

`ReopenCommand` is the only caller that passes `{ allowReopen: true }`.

**Rationale**: The requirement is "permit the edge through reopen only, never
generally." A table-driven, opt-in override localizes the new edge to exactly
one call site while leaving the general guard (and its many consumers:
resume, `assertJobFinishable`, exit-guard) untouched. This matches the existing
transition-table-driven design pattern.

**Alternatives considered**:

- *Add `running` to `VALID_TRANSITIONS["awaiting-archive"]` + special-case
  `if status === "awaiting-archive"` in resume*: rejected — spreads the new edge
  into every `canTransition` consumer and forces a fragile status-string guard
  in resume.
- *A fully separate `transitionJobForReopen` function*: rejected — would
  duplicate the history-append + patch-merge + status-set machinery of
  `transitionJob`.

### D3: Fail-closed precondition gates (status + PR state)

`prepare()` rejects (non-zero exit, distinct messages) when:

1. Status is not `awaiting-archive`. `archived` / `canceled` are named
   explicitly in the message; other statuses (`running`, `awaiting-resume`,
   `failed`, `terminated`) are also rejected (reopen is `awaiting-archive`-only).
2. The job has no recorded PR (`state.pullRequest?.number` absent) — nothing to
   fix-forward against.
3. The PR is not OPEN. The PR state is fetched via `GitHubClient.getPullRequest`
   (`owner`/`repo` from `state.repository`, number from `state.pullRequest`).
   `MERGED` is rejected per requirement 2; `CLOSED` (unmerged) is also rejected
   because reopen re-runs through pr-create, whose contract only reuses an OPEN
   PR (D2 of `pr-create`). Each case yields its own message.
4. The PR state cannot be determined (no token / API error). Reopen fails
   closed — it does **not** proceed on an indeterminate PR state — with a
   message pointing at `specrunner login`.

Like resume, reopen also rejects invocation from inside a specrunner worktree
(agent-edited worktree config must not influence the guard).

**Rationale**: Requirement 2 mandates rejecting merged PRs with a clear error.
Determining "not merged" requires a live PR query; when that query cannot be
answered, proceeding would risk re-opening on top of a merged PR, so the gate is
fail-closed. Rejecting CLOSED as well keeps reopen aligned with the only PR
state its terminal pr-create re-run can honor.

**Alternatives considered**: *Trust `state.pullRequest` without a live query* —
rejected; the PR may have been merged out-of-band since `awaiting-archive`, which
is exactly the condition requirement 2 guards against.

### D4: Evidence is preserved structurally; re-execution appends

Reopen performs **no** deletion or truncation. The transition patch clears only
run-control fields — `pid` (set to the reopen process), `error` (→ null),
`resumePoint` (→ null), `mainCheckoutDrift` (→ null) — mirroring resume's patch
(`src/core/command/resume.ts:206`). It never touches `steps`, `reviewerStatuses`,
`decisions`, `biteEvidence`, or any artifact file.

Because per-step evidence lives in iteration-numbered files and the append-only
`events.jsonl`, re-running a step naturally produces iteration N+1. No new
preservation mechanism is required.

**Rationale**: The append-only journal and iteration paths already guarantee
non-destructive re-execution. Requirement 4 is satisfied by *not* adding any
overwrite path, not by adding machinery.

### D5: Approval invalidation through the existing `commitOid` binding — no record rewrite

Reopen does not rewrite `reviewerStatuses` or conformance records. Invalidation
is emergent from re-execution on a new revision:

- After reopen, when the reviewer coordinator runs, `baselineCommit` is the
  current HEAD. In a fix-forward the HEAD has advanced (a fix commit exists —
  pushed by the operator before reopen, and/or produced by the re-run's
  implementer/build-fixer/code-fixer). `selectPendingMembers` then sees
  `approvedAtCommit !== baselineCommit` and reverts stale members to `pending`.
- Conformance approval bound to the *old* verification `commitOid` no longer
  equals the *new* verification `commitOid`, so
  `conformanceApprovedForVerifiedRevision` returns `false` and re-verification
  routes correctly.

The implementer MUST *verify by walking the real routing path* (not by assuming)
that after reopen + re-run onto a new revision, both functions exclude the stale
approvals, and pin this with a test. **Only if** the investigation finds a reuse
path that `commitOid` comparison does not cover is an explicit invalidation added
— and only for that path.

**Rationale**: The architect adopted "invalidation = consistency with the
revision binding." The `commitOid` machinery already exists and is fail-closed;
duplicating it as a record rewrite would violate the immutable-record principle.

**Alternatives considered**: *Reopen proactively resets approved→pending for
steps ≥ `--from`* — rejected as record mutation (out of scope) and redundant
with the `commitOid` binding, which already fails closed.

### D6: Reopen is recorded as an operator event in the append-only journal

Add an `OperatorEventRecord` to the `EventRecord` union
(`src/store/event-journal.ts`): `{ type: "operator-event", action: "reopen",
reason, fromStep, ts }`. Append it through a new journal-only seam
`JobJournal.appendOperatorEvent` surfaced as `JobStateStore.appendOperatorEvent`,
mirroring `appendLineage`/`appendInterruption` (write via `appendEventRecord`,
no `state.json` mutation). Extend `fold()` to collect these into a new
`operatorEvents: OperatorEventRecord[]` field on `FoldResult`, exactly as
`lineage` is collected (unknown types are already ignored, so this is
backward-compatible).

The operator event is appended **before** the status transition is persisted, so
the record is durable even if the subsequent pipeline run fails or is
interrupted.

**Rationale**: Requirement 7 needs an audit record carrying `reason` + from-step
+ time. A dedicated record type is queryable and testable via `fold`, and the
append-only journal is the natural home. The lifecycle transition also writes its
own history entry (`awaiting-archive → running: <reason>`), but that is not a
first-class operator-audit record on its own.

### D7: Branch and PR preservation

Reopen never calls cancel/cleanup code. It does not delete the remote branch or
close the PR. The terminal re-run reaches pr-create, which returns
`existing-open` for the OPEN PR (D3 gate guarantees OPEN at reopen time),
preserving the PR and its review thread.

**Rationale**: Requirement 6. The preservation is achieved by *not invoking*
teardown and by relying on pr-create idempotency.

### D8: Runtime and minimumAssurance independence

Reopen resolves state from the slug-canonical store and appends to the journal
through the same seam for both local and managed runtimes. The PR-state gate uses
`GitHubClient`, available to both. No code path consults `minimumAssurance`;
that floor is only evaluated at `job archive --with-merge` time and is untouched.

**Rationale**: Requirements 8 and 9. The command operates on shared branch-borne
state and the GitHub API, neither of which is runtime- or floor-specific.

## Risks / Trade-offs

- **[Risk] Reopen from a late step with no code change reuses same-revision
  approvals.** If an operator reopens from, say, `code-review` and neither a
  human fix nor a re-run mutator advances HEAD, `baselineCommit` equals the old
  `approvedAtCommit` and the member is skipped. → **Mitigation**: this is
  correct, not a defect — an approval bound to a revision remains valid for that
  same revision. The fix-forward use case (the motivating case) always advances
  HEAD. D5's investigation task confirms no *stale* (old-revision) approval
  survives on a *new* revision.

- **[Risk] `transitionJob` signature change ripples to all callers.** →
  **Mitigation**: the new argument is optional and defaults to the current
  behavior; no existing call site changes. Covered by the full existing
  lifecycle test suite plus a new opt-in test.

- **[Risk] `FoldResult` gains a field.** → **Mitigation**: consumers construct
  `FoldResult` by object return and read named fields; adding `operatorEvents`
  (default `[]`, like `lineage`) is additive. The one hand-built `FoldResult`
  literal in the ENOENT branch (`src/store/job-journal.ts:148`) must include the
  new field — enumerated as a task so it is not missed.

- **[Risk] PR-state gate hard-depends on a GitHub token.** A token-less
  environment cannot reopen. → **Mitigation**: intended (fail-closed per D3);
  the error message directs the operator to `specrunner login`.

## Open Questions

- **CLOSED-but-unmerged PR**: D3 rejects it (aligned with pr-create's OPEN-only
  reuse). If spec-review judges that a closed PR should instead be re-opened on
  GitHub as part of reopen, that is a larger scope and should be a separate
  change. Flagged for spec-review confirmation.
