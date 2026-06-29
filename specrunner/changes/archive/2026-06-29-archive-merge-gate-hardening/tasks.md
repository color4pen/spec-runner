# Tasks: archive-merge-gate-hardening

Production changes are confined to `src/core/archive/merge-then-archive.ts` and
`src/core/finish/pr-status.ts`. Test changes are confined to
`tests/unit/core/archive/merge-then-archive.test.ts` and
`tests/unit/core/finish/pr-status.test.ts`. No GitHub adapter or port changes.

---

## T-01: Make a transient BLOCKED defer to check polling (Step 4)

In `runMergeThenArchive`'s Step 4 wait loop (`src/core/archive/merge-then-archive.ts`),
stop escalating immediately on `mergeStateStatus === "BLOCKED"`. Defer the merge/escalation
decision to the existing check-status polling, and evaluate `BLOCKED` persistence only at the
points where the loop would otherwise break to merge.

- [x] Remove the early branch-protection escalation block that fires on
      `mergeStateStatus === "BLOCKED"` (currently the block immediately after the
      DIRTY/CONFLICTING conflict check, before the headSha / archiveSha-match guard).
- [x] In the same iteration, after computing `const mergeStateStatus = (prData.mergeStateStatus ?? "").toUpperCase()`,
      capture whether this poll is blocked: `const isBlocked = mergeStateStatus === "BLOCKED"`.
      Keep the DIRTY / `mergeable === "CONFLICTING"` conflict escalation exactly as-is and
      ordered before this (conflict still wins over BLOCKED).
- [x] Leave the headSha-missing guard and the `archiveSha !== headSha` wait/continue guard
      unchanged — a BLOCKED poll must still wait for the head to reflect the archive commit
      before its checks are trusted.
- [x] Leave the `rollup.state === "failure"` check-failure escalation unchanged — a BLOCKED
      PR whose checks failed must stop here (covers "BLOCKED because CI failed").
- [x] At the `rollup.state === "success"` break point: if `isBlocked`, return a
      branch-protection escalation instead of breaking to merge; otherwise break to merge as
      today.
- [x] At the `rollup.state === "none"` grace-exhausted break point (where the loop currently
      breaks to merge after `NONE_CHECK_GRACE_MS`): if `isBlocked`, return a branch-protection
      escalation instead of breaking; otherwise break to merge as today. The grace-still-running
      wait/continue path is unchanged.
- [x] Leave the `rollup.state === "pending"` deadline + wait/continue path unchanged — a BLOCKED
      poll with pending checks keeps waiting (no escalation).
- [x] Use the existing `formatEscalation` for the branch-protection escalation with
      `failedStep: "merge gate (branch protection)"`, a `detectedState` that explains checks
      resolved (success / no checks) but the PR is still `BLOCKED` (a non-check branch-protection
      requirement such as a required review is unmet), the existing recommended action
      ("Satisfy branch protection requirements, then re-run ..."), and the existing resume
      command `specrunner job archive --with-merge <slug>`. Optionally factor the escalation
      into a small local helper to avoid duplicating it at the two break points.

**Acceptance Criteria**:
- A poll with `mergeStateStatus === "BLOCKED"` and a `pending` check rollup does not escalate;
  the loop sleeps and re-polls (bounded by the existing deadline).
- After a BLOCKED + pending poll, a subsequent poll returning `CLEAN` + `success` proceeds to
  `mergePullRequest`.
- A `success` (or grace-exhausted `none`) check rollup combined with a still-`BLOCKED` poll
  returns exitCode 1 with a branch-protection escalation; `mergePullRequest` and post-merge
  cleanup are not called.
- The DIRTY / `mergeable === "CONFLICTING"` conflict escalation is unchanged.

---

## T-02: Remove the Step 5 pre-merge mergeable gate; merge directly (Step 5)

In `runMergeThenArchive`, drop the `checkMergeableForMerge` gate so a green-checks break goes
straight to `mergePullRequest`.

- [x] Delete the `checkMergeableForMerge({ ... })` call and its `if (!mergeableResult.ok)`
      escalation (the Step 5 block between the wait loop's break and the `mergePullRequest`
      call).
- [x] Remove the `import { checkMergeableForMerge } from "../finish/pr-status.js";` import.
- [x] Keep the `mergePullRequest` call, its surrounding `try/catch` (thrown-error escalation),
      and the `!mergeResult.merged` handling (modified in T-03).
- [x] Update the file's top-of-module flow docstring: replace the Step 5
      "checkMergeableForMerge + squash merge" and the Step 4 "BLOCKED → branch protection
      escalation" descriptions to match the new behavior (BLOCKED waits for checks; merge goes
      directly after green checks; final mergeability is decided by the merge endpoint).

**Acceptance Criteria**:
- After the wait loop breaks on green checks, `runMergeThenArchive` calls `mergePullRequest`
  with no intervening mergeable-gate `getPullRequest` poll.
- A PR whose `mergeable` is `UNKNOWN` (with `mergeStateStatus` CLEAN and a `success` rollup)
  reaches `mergePullRequest` without any mergeable-gate escalation.
- `merge-then-archive.ts` no longer imports `checkMergeableForMerge`.

---

## T-03: Distinguish merge-endpoint failure escalations by cause (Step 5)

When `mergePullRequest` returns `{ merged: false }`, escalate with a cause-distinguished
message.

- [x] Add a local (module-private) classifier in `merge-then-archive.ts`, e.g.
      `classifyMergeFailure(message: string): "conflict" | "checks-failed" | "other"`:
  - lowercase the message;
  - `"conflict"` substring → `"conflict"`;
  - else `"required status check"` AND `"has failed"` substrings → `"checks-failed"`;
  - else → `"other"`.
- [x] In the `if (!mergeResult.merged)` block, switch on the classifier:
  - `conflict` → `formatEscalation` with `failedStep: "squash merge (conflict)"`, a
    detectedState noting the merge endpoint reported a conflict, and a recommended action that
    mirrors the wait-loop conflict guidance (rebase onto `resolvedBaseBranch`,
    `git push --force-with-lease`, then re-run).
  - `checks-failed` → `failedStep: "squash merge (required checks failed)"`, detectedState
    noting a required status check has failed, recommended action "Fix failing checks, then
    re-run ...".
  - `other` → keep the existing generic branch-protection escalation wording.
  - All three keep `resumeCommand: specrunner job archive --with-merge <slug>` and include
    `mergeResult.message` in the detectedState.
- [x] Leave the `try/catch` thrown-error escalation around `mergePullRequest` unchanged.
- [x] Do not call post-merge cleanup on any `!merged` path (unchanged).

**Acceptance Criteria**:
- `{ merged: false }` with a conflict message → exitCode 1, conflict escalation, cleanup not called.
- `{ merged: false }` with a "required status check ... has failed" message → exitCode 1,
  checks-failed escalation.
- `{ merged: false }` with any other message → exitCode 1, generic branch-protection escalation
  with a resume command.

---

## T-04: Delete the now-unreferenced checkMergeableForMerge from pr-status.ts

After T-02, `checkMergeableForMerge` has no production caller. Remove it and its dedicated
exports without touching `fetchPrViewWithRetry`.

- [x] Delete the `checkMergeableForMerge` function from `src/core/finish/pr-status.ts`.
- [x] Delete the `MERGEABLE_RETRY_COUNT` and `MERGEABLE_RETRY_DELAY_MS` exports and the
      `CheckMergeableResult` type (used only by `checkMergeableForMerge`).
- [x] Keep `fetchPrViewWithRetry`, its `UNKNOWN_RETRY_COUNT` / `UNKNOWN_RETRY_DELAY_MS`
      constants, the `PrViewData` / `PrViewFetchResult` types, and the `sleep` helper
      (still used by `fetchPrViewWithRetry`).
- [x] Update the module's top docstring to drop the `checkMergeableForMerge` responsibility line.
- [x] Confirm via grep that no production code (`src/`) references `checkMergeableForMerge`,
      `MERGEABLE_RETRY_COUNT`, `MERGEABLE_RETRY_DELAY_MS`, or `CheckMergeableResult` after removal.

**Acceptance Criteria**:
- `src/` has no dangling reference to `checkMergeableForMerge` or its removed constants/type.
- `fetchPrViewWithRetry` and its behavior are unchanged.
- `bun run typecheck` is green.

---

## T-05: Update and add tests to pin the new behavior

### T-05a: `tests/unit/core/archive/merge-then-archive.test.ts`

- [x] Add a test: BLOCKED + `pending` rollup on poll 1, then `CLEAN` + `success` on poll 2 →
      no escalation during pending, then `mergePullRequest` is called and post-merge cleanup
      runs (drive with injected `sleepFn` / `nowFn` and a sequenced `getPullRequest` /
      `getCheckStatus`).
- [x] Update/replace TC-MTA-008 so it pins the new semantics: persistent `mergeStateStatus
      === "BLOCKED"` with a `success` rollup → branch-protection escalation, `mergePullRequest`
      and cleanup not called. (The escalation now fires after check polling rather than
      immediately.)
- [x] Add a test: persistent `BLOCKED` with a `none` rollup until grace is exhausted →
      branch-protection escalation; `mergePullRequest` not called. (Use injected `nowFn` to
      cross `NONE_CHECK_GRACE_MS`.)
- [x] Add a test: `mergeable === "UNKNOWN"` with `mergeStateStatus` CLEAN and a `success`
      rollup → `mergePullRequest` is called (no mergeable-gate escalation).
- [x] Add a test: `mergePullRequest` returns `{ merged: false, message: <conflict> }` →
      exitCode 1 conflict escalation, cleanup not called.
- [x] Add a test: `mergePullRequest` returns `{ merged: false, message: 'required status
      check "ci/build" has failed' }` → exitCode 1 checks-failed escalation.
- [x] Add a test: `mergePullRequest` returns `{ merged: false, message: <other> }` → exitCode
      1 generic branch-protection escalation.
- [x] Confirm TC-MTA-006 (DIRTY) and TC-MTA-007 (mergeable CONFLICTING) remain green unchanged.
- [x] Fix the TC-MTA-ARCHIVE-SHA test: remove the now-stale 4th `getPullRequest`
      `.mockResolvedValueOnce` and its `// checkMergeableForMerge (Step 5)` comment (Step 5 is
      gone, so only 3 `getPullRequest` calls occur). The test's assertions
      (`mergePullRequest` called, cleanup called, `getCheckStatus` once, `sleep` once) stay.

### T-05b: `tests/unit/core/finish/pr-status.test.ts`

- [x] Remove the entire `describe("checkMergeableForMerge", ...)` block and the
      `checkMergeableForMerge` / `MERGEABLE_RETRY_COUNT` imports.
- [x] Keep the `fetchPrViewWithRetry` describe block and its tests unchanged.

### T-05c: GitHub adapter regression confirmation (no edits expected)

- [x] Confirm the existing `tests/unit/adapter/github/github-client-pr.test.ts` cases that pin
      transient retry → success (TC-PM-016 "not mergeable", TC-PM-018 / TC-PM-021 "is
      expected") and permanent → `{ merged: false }` (TC-PM-015 409 conflict, TC-PM-020
      "has failed") remain green without modification — they are the lower-level guarantee
      behind the archive merge path's delegation.

**Acceptance Criteria**:
- All new and updated tests in T-05a / T-05b pass.
- The `checkMergeableForMerge` tests are gone; `fetchPrViewWithRetry` tests are unchanged.
- The referenced `github-client-pr.test.ts` transient/permanent cases pass unchanged.

---

## T-06: Verification

- [x] `bun run typecheck` is green (no dangling `checkMergeableForMerge` references).
- [x] `bun test` is green (all unchanged tests pass alongside the new/updated ones).
- [x] `bun run build` succeeds.

**Acceptance Criteria**:
- `typecheck`, `test`, and `build` all succeed.
