# Cross-Boundary Invariants Review — archive-on-branch-first — iter 1

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
-->

- **verdict**: needs-fix

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | state-consistency | `src/core/cancel/runner.ts:evacuateChangeFolder` | `archive-recorded` jobs have their change folder at `changes/archive/<date>-<slug>/` (after `archiveChangeFolder` runs), but `evacuateChangeFolder` only probes `changes/<slug>/` (active location). In no-worktree mode, the probe fails both in worktree path and canonical path, resulting in an empty tombstone. The actual `changes/archive/<date>-<slug>/` folder is orphaned with stale `archive-recorded` status. `ps --all` (`includeArchived: true`) will continue to show the job as `archive-recorded` even after cancel succeeds. In worktree mode, the orphaned folder is naturally removed as part of `cleanupJobResources` (worktree removal), so the impact is isolated to no-worktree mode. | Extend `evacuateChangeFolder` to also probe `resolveCanonicalStateDir(slug, repoRoot)` (which handles both active and archive locations) when neither worktree nor canonical active path is found. Move the resolved archive folder to the canceled tombstone directory. |
| 2 | MEDIUM | cwd-cleanliness | `src/core/archive/orchestrator.ts:cleanupAfterMerge` × `src/core/archive/orchestrator.ts:recordArchiveOnBranch` | After `job archive --with-merge` completes in no-worktree mode, `cleanupAfterMerge` writes `archived` status to `changes/archive/<date>-<slug>/state.json` as a local uncommitted edit in `cwd` (design decision [Q1]: dirty tree accepted). This leaves `cwd` on `baseBranch` with a dirty tracked file. If the user subsequently runs `job archive <other-slug>` in no-worktree mode, `recordArchiveOnBranch` detects the dirty file via `git status --porcelain` and returns escalation: "Uncommitted changes detected in working tree." The user is blocked from archiving any other no-worktree job until they manually discard or commit the dirty `state.json`, but the escalation message names "Checking out feature branch" as the risk—not identifying the real culprit. This interaction between the accepted dirty-tree tradeoff ([Q1]) and the clean-cwd guard was not addressed in the design. | Either: (a) after `markJobArchived` writes the local state, discard the file change with `git checkout HEAD -- specrunner/changes/archive/` so cwd returns to clean (the `archived` observation is still recorded to the in-process caller; caveat: the file reverts to `archive-recorded` on disk), or (b) narrow the `git status --porcelain` guard in `recordArchiveOnBranch` to fail only when dirty files are NOT limited to `specrunner/changes/archive/` (i.e., tolerate archive-state residue from prior cleanup), or (c) document the requirement to run `git checkout specrunner/changes/archive/ ` after each `--with-merge` no-worktree operation and surface it in the `cleanupAfterMerge` output. |
| 3 | LOW | ux | `src/cli/ps.ts:formatJobRow` | When a job has `archive-recorded` status and its PR is found to be merged, `formatJobRow` displays `"awaiting-archive (PR merged, run archive)"`. This is misleading in two ways: (1) the displayed status says "awaiting-archive" while the actual status is "archive-recorded", and (2) "run archive" implies `job archive` (no-merge) which would be a no-op for `archive-recorded` jobs (all steps are idempotent)—cleanup (worktree/branch removal) requires `job archive --with-merge`. | Add a distinct message branch for `archive-recorded`: e.g., `"archive-recorded (PR merged, run archive --with-merge)"`. |
| 4 | LOW | dead-code | `src/state/reconcile.ts:reconcilePrState` | `reconcilePrState` was correctly extended to accept `archive-recorded` status, but the function is not called anywhere in the production `src/` codebase. This was the pre-existing state before this change (both `reconcileStaleRunning` and `reconcilePrState` have no callers in `src/`). Not a regression introduced by this change, but the function's new `archive-recorded` branch has no runtime path exercising it—test-only coverage. | No immediate action required. If the function is intentionally a utility for future use (e.g., by a forthcoming reconciliation daemon), document it. If it is expected to be called today, identify and wire the call site. |

## Detailed Analysis

### Scope and method

Reviewed all files changed by the diff plus downstream consumers of the new `archive-recorded` status, focusing on code the diff did NOT change:
- `src/core/cancel/runner.ts` — evacuateChangeFolder, cancelSingleJob
- `src/cli/ps.ts` — formatJobRow, prMergedMap logic
- `src/state/reconcile.ts` — reconcilePrState
- `src/store/job-state-store.ts` — list(), scan paths, deduplication
- `src/core/lifecycle/exit-guard.ts` — beforeExit handler
- `src/core/notify/issue-notifier.ts` — notifyJobTerminal
- `src/core/command/run-result.ts` — buildRunResult status mapping
- `src/core/runtime/local.ts` — worktree cleanup gate on non-archive finalStatus

### Invariants confirmed intact

| Invariant | Verdict |
|-----------|---------|
| `TERMINAL_STATUSES.has("archive-recorded") === false` | ✓ Correct |
| `canTransition("archive-recorded", "archived") === true` | ✓ Correct |
| `canTransition("archive-recorded", "canceled") === true` | ✓ Correct |
| `assertJobFinishable` passes for `archive-recorded` | ✓ `canTransition(status, "archived")` covers both `awaiting-archive` and `archive-recorded` |
| Exit guard skips `archive-recorded` jobs (not `running`) | ✓ `handlePerJobExit` / `handleGlobalExit` only transition `running` → `awaiting-resume` |
| `notifyJobTerminal` does not send comment for `archive-recorded` | ✓ Only `awaiting-resume` / `awaiting-archive` trigger comments; `archive-recorded` is not a pipeline terminal status |
| `buildRunResult` does not receive `archive-recorded` | ✓ `archive-recorded` is only set by the archive CLI, never by the pipeline |
| `local.ts` worktree-cleanup gate (`finalStatus !== "awaiting-archive"`) | ✓ `archive-recorded` is not a pipeline final status; gate is unaffected |
| `cancel` guard (`awaiting-archive || archive-recorded) && !force`) | ✓ Updated correctly |
| `orphan-sidecars ACTIVE_STATUSES` | ✓ Updated to include `archive-recorded` |
| `reconcilePrState("archive-recorded", "MERGED")` returns TransitionResult | ✓ Implementation correct; see Finding 4 re: unused |
| `VALID_TRANSITIONS["archive-recorded"]` | ✓ `{ archived, canceled }` — correct |
| `cleanupAfterMerge` called only from merge-confirmed paths | ✓ No-merge `runArchiveOrchestrator` never calls `cleanupAfterMerge` |
| `markJobArchived` called only from merge-confirmed paths | ✓ Only called inside `cleanupAfterMerge` |
| `worktree / featureBranch preserved until merge` in no-merge path | ✓ `runArchiveOrchestrator` does not remove worktree or branch |
| `ACTIVE_STATUSES` (lifecycle.ts) excludes `archive-recorded` | ✓ `archive-recorded` is non-active (no session running); `ACTIVE_STATUSES = { running, awaiting-resume }` |

### Finding 1 — Detail

`evacuateChangeFolder` resolves the change folder source via two probes:
1. `worktreePath/specrunner/changes/<slug>/state.json`
2. `repoRoot/specrunner/changes/<slug>/state.json`

Both probes target the **active** location. After `recordArchiveOnBranch` runs `archiveChangeFolder` (which executes `git mv changes/<slug>/ changes/archive/<date>-<slug>/`), neither probe can find the folder.

In **worktree mode**: `cleanupJobResources` subsequently removes the worktree, which also removes `worktreePath/specrunner/changes/archive/<date>-<slug>/`. The state loss from the empty tombstone is cosmetic (audit trail truncated), but the cancel is functionally complete.

In **no-worktree mode**: `repoRoot/specrunner/changes/archive/<date>-<slug>/` is not under any worktree and is not removed by `cleanupJobResources`. It persists with `archive-recorded` status. `JobStateStore.list(repoRoot, { includeArchived: true })` (used by `ps --all`) finds it and shows `archive-recorded`—contradicting the successful cancel.

### Finding 2 — Detail

The design decision [Q1] (accepted tradeoff) writes `archived` to `changes/archive/<date>-<slug>/state.json` as a local edit in cwd after `git pull --ff-only` without committing or pushing. This is correct for the no-push invariant.

The guard in `recordArchiveOnBranch` (no-worktree mode) runs `git status --porcelain` and fails if the output is non-empty. The dirty `state.json` left by the prior `--with-merge` run satisfies this condition.

The two mechanisms did not interact in the old code because the old `runArchiveOrchestrator` committed the archive state to base (leaving cwd clean). The new design's acceptance of the dirty tree was evaluated in isolation ([Q1]) without assessing the `git status --porcelain` gate that now collides with it.

**Note**: This only affects users who run multiple sequential no-worktree archive operations—a configuration that, while supported, is uncommon in practice.
