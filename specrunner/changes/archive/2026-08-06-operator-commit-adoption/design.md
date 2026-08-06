# Design: operator-commit-adoption

## Context

The pipeline runs an egress backstop before every push. `verifyEgressLedger`
(`src/core/step/commit-push.ts:342-374`) enumerates the publish range
(`git rev-list HEAD --not --remotes=origin`) and throws `EGRESS_UNKNOWN_COMMIT`
for any OID absent from the `synthesizedCommits` ledger, refusing to push
(fail-closed). This stops an agent from smuggling a non-pipeline commit to
origin.

When an operator hand-fixes an escalation and resumes, this backstop collides
with legitimate operator work. Two operator repair shapes exist:

1. **Uncommitted canon edit** — the operator edits a protected canon file but
   does not commit. `resume --apply-canon` already handles this: the apply-canon
   gate (`src/core/command/resume.ts:290-344`) detects dirty canon paths via
   `git status`, commits them as an `operator-apply` commit, and records the OID
   in the ledger before the step runs.

2. **Committed operator work** — the operator commits the fix themselves. The
   worktree is now **clean**, so the `git status`-based apply-canon gate
   (`src/core/resume/apply-canon.ts:42-89`) detects nothing and resume proceeds.
   The unknown OID sits in the publish range. The first resumed step pays its
   full execution cost, reaches `commitAndPush`, and only then halts with
   `EGRESS_UNKNOWN_COMMIT`.

Shape 2 is the gap this change closes. The only working recipe today is the
tribal-knowledge convention "commit your fix, then hand-push it" — documented
solely in a code comment (`src/core/step/commit-push.ts:383-389`) with no
mechanical enforcement, warning, or actionable error. The
`egressUnknownCommitError` message (`src/errors.ts:474-480`) says "Investigate
and resolve before retrying" without naming any resolution.

The apply-canon gate is worktree/`git status`-based; extending it to committed
commits is not possible because `git status` reports a clean worktree once the
operator has committed. A separate, commit-level check is required.

### Relevant source files

| File | Role |
|---|---|
| `src/core/step/commit-push.ts:342-374` | `verifyEgressLedger` — publish range vs ledger, in-pipeline |
| `src/core/step/commit-push.ts:383-389` | publish-range design comment naming the hand-push convention |
| `src/errors.ts:474-480` | `egressUnknownCommitError` — message names no resolution today |
| `src/core/command/resume.ts:288-344` | apply-canon gate (worktree-gated, after "running" transition) |
| `src/core/command/resume.ts:307-315` | apply-canon commit → `appendSynthesizedCommit` → `runStore.persist` |
| `src/core/command/resume.ts:316-334` | apply-canon split-brain guard (`git reset --mixed HEAD~1`) |
| `src/core/resume/apply-canon.ts:42-89` | `detectCanonDirtyPaths` — `git status --porcelain` based (misses committed work) |
| `src/state/schema/operations.ts:35-39` | `appendSynthesizedCommit` — pure, idempotent OID append |
| `src/cli/command-registry.ts:679-768` | resume subcommand flags + handler |
| `src/cli/resume.ts` / `src/core/command/resume.ts` | `ResumeOptions` interfaces + `ResumeCommand.prepare()` |

## Goals / Non-Goals

**Goals**:

- At resume entry, before any step runs, reconcile the publish range against the
  `synthesizedCommits` ledger. Runs unconditionally (no flag), after the
  apply-canon gate, before the pipeline launches.
- When an unknown OID exists and adoption is not requested, halt without running
  a step, and print an escalation that names each unknown commit (short SHA,
  subject, author, changed paths) and the three resolution options.
- Add `resume --adopt-commits`: append the unknown publish-range OIDs to the
  ledger, persist, and only then launch the pipeline. Persist failure → do not
  launch (fail-closed).
- Extend the `egressUnknownCommitError` message with the same three resolution
  options, so the in-pipeline halt (any path that still reaches it) is
  self-explanatory.

**Non-Goals**:

- Preventing a non-empty publish range in the first place (pipeline pushes per
  step; a non-empty range means operator intervention or a push failure — the
  latter is handled by existing push retry / escalation).
- Verifying the *content* of an adopted commit. `--adopt-commits` trusts operator
  intent; diff review is the PR reviewer's job.
- Auto-committing non-canon dirty files. The apply-canon behavior (canon paths
  only; non-canon dirty left untouched) is unchanged.
- The `job archive` non-fast-forward failure (a "pushed but local behind" path).
  This change handles the "committed but not pushed" path; the failure conditions
  differ.

## Decisions

### D1: Commit-level detection lives in a new `src/core/resume/adopt-commits.ts`

A new leaf module provides the publish-range reconciliation, mirroring how
`apply-canon.ts` encapsulates the `git status` reconciliation. It exports:

- `detectUnadoptedCommits(gitDir, ledger, spawnFn)` — enumerate
  `git rev-list HEAD --not --remotes=origin` in `gitDir`, filter to OIDs not in
  `ledger`, and for each gather metadata (short SHA, subject, author, changed
  paths). Returns `UnadoptedCommit[]` (empty when the range is clean).
- `buildAdoptEscalationMessage(slug, commits)` — render the escalation text: a
  per-commit block plus the three resolution options.

**Rationale**: The apply-canon reconciliation and this reconciliation answer
different questions on different inputs (`git status` worktree state vs.
`git rev-list` commit history) but sit at the same resume choke point. A sibling
module keeps `resume.ts` readable and makes the detection independently testable
against a real tmp git repo. Importing `SpawnFn` from `util/git-exec.js` and the
shared resolution-option text from `errors.js` are architecture-compliant
(core → util, core → errors).

**Alternatives considered**:
- *Extend `apply-canon.ts` / the apply-canon gate to also cover committed work*:
  rejected — see D4; `--apply-canon` is defined as "canon paths only, via
  `git status`". Committed operator work can touch any path and is invisible to
  `git status`. Merging the two collapses a guarantee (`apply-canon.ts:11-12`
  "commits ONLY the specified paths").
- *Inline the detection in `prepare()`*: rejected — obscures `prepare()` and
  couples git plumbing to the command layer.

### D2: Detection is unconditional; adoption requires `--adopt-commits`

The gate always runs the publish-range/ledger reconciliation. When it finds an
unknown OID:

- Without `--adopt-commits`: build the escalation message and throw
  `PrepareError(1)`. No ledger mutation. This only *reports*; it does not widen
  the backstop.
- With `--adopt-commits`: append each unknown OID to `state.synthesizedCommits`
  via `appendSynthesizedCommit`, persist, then continue. This widens the
  backstop, so it demands the explicit flag.

**Rationale**: (architect-approved) Detection adds information and never relaxes
the backstop, so it is safe to run always. Adoption opens the hole the backstop
guards, so it must be an explicit, auditable act. Auto-adopting on resume is
rejected because an agent can also invoke `specrunner job resume`; "a human ran
the CLI" is not a trust boundary. Message-only improvement is rejected because it
leaves the step-execution cost and the halt-then-resume dance in place — moving
detection to the resume entry is the substance; the message change is its
by-product.

**Provenance note**: The status-quo workaround (operator hand-pushes) sends the
commit to origin with **no** ledger entry. `--adopt-commits` performs the same
egress *with* a ledger record, so provenance strictly improves. This change adds
a record to an already-open path; it does not open a new one.

### D3: Placement — worktree-gated, after apply-canon, before the pipeline

The gate runs inside the existing `if (resolvedWorktreePath !== null &&
resolvedSlug !== null)` block in `prepare()`, immediately after the apply-canon
sub-block (and before `reconcileWorktreeArtifacts`). It reads the ledger from
`updatedState.synthesizedCommits` **after** any apply-canon append, so an
`operator-apply` commit created earlier in the same resume is already in the
ledger and is not re-flagged. `gitDir` is `resolvedWorktreePath`.

Because this sits after the transition to `running` (`resume.ts:229-247`), a
flag-less halt leaves the job in `running` with a dead process — recovered by
the existing stale-detection path on the next resume. This is identical to the
apply-canon fail-closed halt (`resume.ts:338-343`), so no new lifecycle behavior
is introduced.

git failure handling mirrors the apply-canon gate's exit-128 carve-out: a
`rev-list` error whose message contains `exit 128` (path is not a git
repository — test/dev environments) is treated as an empty range and resume
continues; any other git failure is fail-closed (`PrepareError(1)`), because an
unverifiable publish range must not launch a pipeline that would itself fail the
egress check.

**Rationale**: The request specifies "after the apply-canon gate, before the
pipeline launches." Reading the post-apply-canon ledger prevents the two gates
from fighting. Ordering relative to `reconcileWorktreeArtifacts` is immaterial
(reconcile touches untracked/uncommitted residue, not commits); placing the
adopt gate first keeps all commit-level logic adjacent.

**Alternatives considered**:
- *Run before the "running" transition so a halt keeps `awaiting-resume`*:
  rejected — diverges from the apply-canon gate's placement and lifecycle for no
  functional gain; stale-detection already recovers the `running`-with-dead-pid
  state.

### D4: `--apply-canon` semantics are unchanged

`--apply-canon` continues to mean exactly "commit dirty **protected canon paths**
as an operator-apply commit, via `git status` detection." It does **not** adopt
committed operator commits. When only `--apply-canon` is given and the operator
has already committed (clean worktree, unknown OID in the range), the apply-canon
sub-block does nothing and the D2/D3 adopt gate halts (no adopt flag) — proving
the semantics did not widen.

The two flags are orthogonal and composable: `--apply-canon --adopt-commits`
first commits dirty canon (recording its OID), then adopts any remaining unknown
publish-range OIDs.

**Rationale**: (architect-approved) `apply-canon.ts:11-12` guarantees "commits
ONLY the specified paths." A committed operator commit may contain any path;
loading it onto `--apply-canon` would falsify that guarantee. Different target
sets → different flags.

### D5: `--adopt-commits` persist is fail-closed; no git rollback needed

On adoption, after appending OIDs and calling `runStore.persist(updatedState)`:

- persist success → continue to launch the pipeline.
- persist failure (throw, or no available `runStore`) → throw `PrepareError(1)`;
  the pipeline is not launched.

Unlike the apply-canon split-brain guard (`resume.ts:316-334`), no `git reset` is
required: adoption only appends to the in-memory/on-disk ledger and never creates
or moves a commit. "Do not launch" is the consistent state — the operator's
commits are untouched in git history, and a retried `resume --adopt-commits`
re-detects and re-adopts idempotently (`appendSynthesizedCommit` dedups).

**Rationale**: (architect-approved) Mirrors the apply-canon policy "persist fails
→ do not start the pipeline," adapted to the fact that adoption performs no git
mutation. Requirement 3 mandates fail-closed on persist failure.

### D6: Three resolution options are a single shared source in `errors.ts`

A new helper `egressResolutionOptions(slugLabel)` in `src/errors.ts` returns the
three options as formatted text:

1. **Adopt** — `specrunner job resume <slug> --adopt-commits` records the
   commit(s) in the ledger and allows the push.
2. **Push** — push the commit(s) to origin yourself so they leave the publish
   range.
3. **Drop** — remove the commit(s) from the branch (e.g. `git reset` /
   `git revert`) so they are no longer in the publish range.

`egressUnknownCommitError` embeds this in its hint (Requirement 5).
`buildAdoptEscalationMessage` appends it after the per-commit details
(Requirement 2), substituting the real slug for `<slug>`.

**Rationale**: A single source keeps the resume-entry escalation and the
in-pipeline halt message in lockstep. `errors.ts` is a leaf already imported by
both `commit-push.ts` and `core/resume/*`, so it is the correct home; the
`adopt-commits.ts` module imports the helper (core → errors), never the reverse.

### D7: `--adopt-commits` wiring through the CLI and command layers

- `src/cli/command-registry.ts`: add `"adopt-commits": { type: "boolean" }` to
  the resume flags; pass `adoptCommits: !!parsed.flags["adopt-commits"]` into
  `runResume`.
- `src/cli/resume.ts`: add `adoptCommits?: boolean` to `ResumeOptions`; forward
  it into `ResumeCommand`.
- `src/core/command/resume.ts`: add `adoptCommits?: boolean` to `ResumeOptions`;
  consume it in the gate.
- Top-level `USAGE` gains a one-line description of `--adopt-commits`.

**Rationale**: Identical shape to the existing `--apply-canon` plumbing
(`applyCanon`), so the flag surface stays uniform.

## Risks / Trade-offs

- [Risk] The gate runs a real `git rev-list` on every resume that has a worktree.
  Mitigation: identical cost profile to the existing apply-canon `git status`
  call; on a clean, pushed branch the range is empty and the gate is a no-op.
  Existing prepare()-level tests use fake worktree paths → `exit 128` carve-out →
  continue, so no test regresses.
- [Risk] A flag-less halt leaves the job `running` with a dead process.
  Mitigation: pre-existing behavior shared with the apply-canon fail-closed halt;
  stale-detection recovers it on the next resume.
- [Risk] `--adopt-commits` records operator commits without inspecting their
  diff. Mitigation: explicit operator flag + PR review (declared Non-Goal). The
  ledger record makes the egress auditable — strictly more provenance than the
  hand-push status quo.
- [Risk] Adopting in a `--no-worktree` resume is not covered (the gate is
  worktree-gated, matching apply-canon). Mitigation: the operator-intervention
  scenario is worktree-based; a `--no-worktree` resume that still carries an
  unknown OID hits the in-pipeline egress check, which now carries the improved
  three-option message (D6). Documented as a scoped limitation, not a silent gap.

## Open Questions

None. All forks are resolved by the architect-approved decisions in request.md.
