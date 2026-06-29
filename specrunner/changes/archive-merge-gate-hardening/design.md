# Design: archive-merge-gate-hardening

## Context

`job archive --with-merge` records the archive commit on the feature branch, pushes it
(moving the PR head), waits for CI, then squash-merges the PR. The orchestrator lives in
`src/core/archive/merge-then-archive.ts`. Its current Step 4 (CI wait loop) and Step 5
(pre-merge gate) contain two gates that treat GitHub's **asynchronously-computed merge
state** as a permanent failure and escalate immediately:

1. **Step 5 pre-merge mergeable gate** (`merge-then-archive.ts:466-480` → `checkMergeableForMerge`
   in `src/core/finish/pr-status.ts:114-192`). GitHub computes the `mergeable` field
   asynchronously; while computing it is `null`, which the REST adapter maps to `UNKNOWN`
   (`github-client.ts:767 mapMergeable`). Because archive's own push moves the head
   immediately before this gate runs, `mergeable` is almost always `UNKNOWN` on arrival.
   The gate retries only 3×5 s (`MERGEABLE_RETRY_COUNT = 3`, `MERGEABLE_RETRY_DELAY_MS = 5000`,
   hardcoded), so it escalates on nearly every run, forcing a manual `gh pr merge`.

2. **Step 4 BLOCKED immediate escalation** (`merge-then-archive.ts:332-342`). Right after the
   archive commit is pushed, the new commit's required checks have not yet passed, so branch
   protection reports `mergeStateStatus = BLOCKED`. The wait loop treats this as permanent and
   escalates *before* the headSha-match wait (`:361`) and the check-status poll (`:387`),
   i.e. without waiting for CI. In PR #724 the escalation fired and CI passed moments later
   (state became `CLEAN`/`MERGEABLE`) — proving the `BLOCKED` was transient.

Meanwhile, the actual merge — `mergePullRequest` (`github-client.ts:551-607`) — calls the
GitHub merge endpoint, which decides mergeability **synchronously**. Its
`isMergeTransientFailure` classifier (`github-client.ts:731-750`) already retries the
compute-lag / CI-pending-race cases (405 "not mergeable", "required status check ... is
expected", "base/head branch was modified", locked) and treats conflict (409) and CI-failed
(405 "required status check ... has failed") as permanent.

This change removes the two premature gates so the merge decision waits for checks to resolve
and then defers the final verdict to the merge endpoint.

## Goals / Non-Goals

**Goals**:
- Stop escalating on a transient `BLOCKED` while the archive commit's checks are still pending;
  keep waiting and let check polling drive the decision (Step 4).
- Remove the Step 5 pre-merge `mergeable` gate; merge directly after green checks and let the
  merge endpoint + `isMergeTransientFailure` be the final arbiter.
- Delete the now-unreferenced `checkMergeableForMerge` (and its `MERGEABLE_RETRY_*` constants /
  `CheckMergeableResult` type) from production code and adjust its tests.
- Distinguish merge-failure escalations (conflict / CI-failed / other) with actionable messages.
- Preserve conflict fail-closed behavior at both the wait loop and the merge endpoint.

**Non-Goals**:
- Making the Step 4 `none` (no-CI-registered) 60 s grace configurable — the merge endpoint's
  "required status check ... is expected" transient retry backstops the protected-branch case.
- Changing retry defaults such as `mergeMaxAttempts`.
- Adding a new GitHub API/port to query branch-protection required checks.
- Changing the behavior of `fetchPrViewWithRetry` (the finish-path `mergeStateStatus`
  UNKNOWN retry).

## Decisions

### D1: Treat BLOCKED as transient — defer to check polling, escalate only after checks resolve

**Decision**: Remove the early "if `mergeStateStatus === BLOCKED` → escalate" block from the
Step 4 loop. Capture the per-iteration `BLOCKED` state and fall through to the existing
check-status polling. Evaluate the persistence of `BLOCKED` **only at the terminal check
decision points** (where the loop would otherwise break to merge):

- check `pending` → keep waiting (existing deadline-bounded wait). No escalation.
- check `failure` → existing check-failure escalation (covers BLOCKED-because-CI-failed).
- check `success`, or `none` after the grace period is exhausted → if the same poll still
  reports `BLOCKED`, raise a branch-protection escalation; otherwise break to merge.

**Rationale**: The PR #724 bug is the loop escalating on `BLOCKED` while CI is *pending*.
Moving the `BLOCKED` evaluation to the terminal decision point means we only escalate after
the checks have actually resolved. At that point a persistent `BLOCKED` indicates a
non-check branch-protection requirement (e.g. a missing required review), which is genuinely
not mergeable by re-running and is the correct case to escalate.

**Alternative rejected — keep the pre-gate but extend BLOCKED/UNKNOWN retries**: still depends
on a flaky async field and just spends time waiting for a state that the merge endpoint can
decide synchronously. Not a root fix.

**Alternative rejected — ignore BLOCKED entirely (never escalate)**: would swallow genuine
non-check requirements (missing review), making the runner wait forever on an unmergeable PR.
Escalating only when `BLOCKED` persists after checks resolve keeps the safe side.

### D2: Remove the Step 5 pre-merge mergeable gate; merge directly after green checks

**Decision**: Delete the `checkMergeableForMerge` call at `merge-then-archive.ts:466-480` and
its import. After the Step 4 loop breaks on green checks, call `mergePullRequest` directly.

**Rationale**: The `mergeable` field is asynchronously computed and reliably `UNKNOWN`
immediately after archive's push, so the gate escalates spuriously. The merge endpoint judges
mergeability synchronously and `isMergeTransientFailure` already handles the compute-lag race
by retry. The pre-gate adds a flaky failure mode with no safety benefit the merge endpoint
does not already provide.

**Consequence**: `mergeable === UNKNOWN` no longer blocks the path. The wait loop still reads
`mergeable` for the `CONFLICTING` conflict check (D5), so conflict detection is unaffected.

### D3: Delete the now-unreferenced `checkMergeableForMerge`

**Decision**: After D2, `checkMergeableForMerge` has no production caller. Remove it, along
with the `MERGEABLE_RETRY_COUNT` / `MERGEABLE_RETRY_DELAY_MS` exports and the
`CheckMergeableResult` type, from `src/core/finish/pr-status.ts`. Keep `fetchPrViewWithRetry`,
the `sleep` helper, and `PrViewData`/`PrViewFetchResult` (out of scope / still used).

**Rationale**: Dead code that depends on the same flaky field should not linger. Scope the
deletion narrowly so the finish-path UNKNOWN retry (`fetchPrViewWithRetry`) is untouched.

**Alternative rejected — keep it as an exported utility**: leaves a misleading,
asynchronous-field-dependent helper that a future caller might reintroduce the bug with.

### D4: Distinguish merge-endpoint failure escalations by cause

**Decision**: When `mergePullRequest` returns `{ merged: false }` (transient retries
exhausted), classify `result.message` (lowercased) into:

- conflict — message contains `"conflict"` → conflict escalation (recommend rebase onto base).
- checks-failed — message contains `"required status check"` and `"has failed"` →
  required-checks-failed escalation (recommend fixing the failing checks).
- other — anything else → generic branch-protection escalation (existing wording).

All three escalations keep a resume command that re-runs `specrunner job archive --with-merge`.
The existing `try/catch` around `mergePullRequest` (thrown errors, e.g. network) keeps its
current generic escalation.

**Rationale**: A single generic message hides whether the operator must rebase, fix CI, or
satisfy branch protection. Classification by the merge endpoint's own message is the most
reliable signal available at that point (the endpoint is the synchronous authority).

**Alternative rejected — surface the raw merge message only**: less actionable; the operator
must interpret GitHub's wording themselves.

### D5: Preserve conflict fail-closed at both layers

**Decision**: Keep the Step 4 `mergeStateStatus === "DIRTY"` / `mergeable === "CONFLICTING"`
conflict escalation (`merge-then-archive.ts:318-329`) unchanged, and keep the merge endpoint's
409 → permanent `{ merged: false }` → escalation (via D4's conflict bucket).

**Rationale**: Conflicts are caught twice — pre-merge by the wait loop and at merge time by
the 409 path. Relaxing the premature gates does not reduce conflict safety because neither
removed gate was the conflict guard.

## Risks / Trade-offs

- **[Risk] Residual transient BLOCKED at the success decision point**: GitHub could report all
  checks `success` while still computing `mergeStateStatus` for one extra poll, causing a
  branch-protection escalation that a single re-run would clear.
  **Mitigation**: `BLOCKED` is evaluated only at the terminal check decision point, never
  during pending (which is the wide window the PR #724 bug hit). The remaining window —
  checks fully green but merge-state still `BLOCKED` in the *same* fetch — is narrow, and the
  escalation's resume command makes recovery a one-line re-run. Adding a bounded re-poll here
  was considered but left out to keep scope tight; it can be a follow-up if it proves flaky.

- **[Risk] Protected branch whose required check never registers within the 60 s `none` grace**:
  with the pre-gate gone, a persistent `none` + `BLOCKED` escalates as branch protection rather
  than being backstopped by the merge endpoint's "is expected" transient retry.
  **Mitigation**: this is a narrow corner (a required check that takes >60 s to even *appear*).
  The escalation is recoverable by re-running once the check registers. Broadening the grace is
  explicitly out of scope.

- **[Risk] `mergeable` UNKNOWN now reaches the merge endpoint**: a genuinely unmergeable PR is
  decided by the merge endpoint instead of the pre-gate.
  **Mitigation**: the endpoint is synchronous and authoritative; 409 conflicts and CI-failed
  states are classified permanent and escalated (D4), and DIRTY/CONFLICTING are still caught
  pre-merge (D5).

## Open Questions

None. The premature-gate-removal direction, the BLOCKED-persistence escalation condition, and
the scope boundaries were evaluated and confirmed in the request.
