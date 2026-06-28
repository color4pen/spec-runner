# Regression Gate Result — archive-on-branch-first / Iteration 1

- **verdict**: needs-fix
- **date**: 2026-06-28
- **branch**: change/archive-on-branch-first-666635be

---

## Summary

Finding 1 (no-worktree uncommitted changes guard) is verified fixed. Findings 2, 3, 5 are regressions — the expected fixes are absent. Finding 4 is a design contradiction: the guard introduced to fix Finding 1 creates the blocking scenario described in Finding 4, and neither of the two resolution options (a/b) was implemented.

---

## Finding 1 — VERIFIED FIXED ✓

**[MEDIUM] no-worktree mode: uncommitted changes ガード未実装**

- **File**: `src/core/archive/orchestrator.ts`
- **Status**: verified fixed

`recordArchiveOnBranch` lines 161–198 implement the `git status --porcelain` guard for no-worktree mode. When `noWorktree === true`, the function runs `git status --porcelain` in `workdir` before checkout, and returns an escalation if any uncommitted changes are detected.

---

## Finding 2 — REGRESSION

**[LOW] TC-MTA-STATUS-PRE-MERGE がヘッダー宣言のみで実装なし**

- **File**: `tests/unit/core/archive/merge-then-archive.test.ts:24`
- **severity**: high
- **resolution**: fixable

TC-MTA-STATUS-PRE-MERGE appears only in the header comment (line 24). No corresponding `describe` block was added. TC-MTA-CLEANUP-MERGE covers "cleanupAfterMerge is not called on merge failure," but it does not assert that `status !== "archived"` before merge completes. The invariant "archived = merge 後のみ" is unguarded by an explicit test.

---

## Finding 3 — REGRESSION

**[MEDIUM] evacuateChangeFolder が archive-recorded ジョブのフォルダを見逃す**

- **File**: `src/core/cancel/runner.ts:228`
- **severity**: high
- **resolution**: fixable

The only change in `runner.ts` was adding `archive-recorded` to the `--force` guard (line 335):

```ts
if ((state.status === "awaiting-archive" || state.status === "archive-recorded") && !force) {
```

The `evacuateChangeFolder` function itself (lines 228–288) is unchanged. It still probes only:
1. `<worktreePath>/specrunner/changes/<slug>/state.json`
2. `<repoRoot>/specrunner/changes/<slug>/state.json`

After `recordArchiveOnBranch` runs `archiveChangeFolder` (git mv), the folder is at `specrunner/changes/archive/<date>-<slug>/`. Neither probe finds it. If a user cancels with `--force`, `evacuateChangeFolder` creates an empty tombstone at `changes/canceled/<slug>-<jobId8>/`, and the original archive folder remains as an orphan. The `--force` requirement reduces the surface, but the root cause — not probing the archive path — is unaddressed.

**Required fix**: add a third probe to `evacuateChangeFolder` that scans `specrunner/changes/archive/` for a directory whose `parseArchiveDirName(name).slug === slug` and contains `state.json`.

---

## Finding 4 — CONTRADICTION

**[MEDIUM] cleanupAfterMerge が残す dirty state.json が後続の no-worktree job archive をブロックする**

- **File**: `src/core/archive/orchestrator.ts:319`
- **severity**: high
- **resolution**: decision-needed

Fixing Finding 1 (adding the `git status --porcelain` guard in `recordArchiveOnBranch`) directly causes Finding 4's scenario to trigger:

1. `job archive --with-merge slug1` completes: `cleanupAfterMerge` calls `markJobArchived(slug1, cwd)`, which writes `status: "archived"` to `specrunner/changes/archive/<date>-slug1/state.json` in the base branch working tree. This file is tracked by git (committed via the squash merge), so the write creates an uncommitted modification.
2. `job archive slug2` (no-worktree, different slug): `recordArchiveOnBranch` runs `git status --porcelain` in `cwd`, detects the modified `state.json`, and returns an escalation: "Uncommitted changes detected."

`cleanupAfterMerge` has no `git checkout HEAD -- specrunner/changes/archive/` step after `markJobArchived`. The guard in `recordArchiveOnBranch` has no exception for archive `state.json` modifications. Neither resolution option from the review was implemented:

- Option (a): `git checkout HEAD -- specrunner/changes/archive/` after `markJobArchived` in `cleanupAfterMerge`
- Option (b): allow archive `state.json`-only dirty tree in the guard

A design decision is needed to pick one option and implement it before this contradiction is resolvable.

---

## Finding 5 — REGRESSION

**[LOW] archive-recorded + PR merged の ps 表示が誤解を招く**

- **File**: `src/cli/ps.ts:61`
- **severity**: high
- **resolution**: fixable

The diff extended the PR-check loop in `runPs` to include `archive-recorded` jobs:

```ts
if (job.status === "awaiting-archive" || job.status === "archive-recorded") {
```

However, `formatJobRow` (lines 60–67) is unchanged:

```ts
if (prMerged) {
  status = "awaiting-archive (PR merged, run archive)";
}
```

For `archive-recorded` + `prMerged === true`, the displayed status is still `"awaiting-archive (PR merged, run archive)"`. Both problems from the original finding persist:
1. Displayed status is `awaiting-archive` while actual status is `archive-recorded`.
2. Recommended command is `job archive`, but `archive-recorded` + merged requires `job archive --with-merge` for cleanup.

**Required fix**: branch on `job.status` inside `formatJobRow` when `prMerged` is true:

```ts
if (prMerged) {
  if (job.status === "archive-recorded") {
    status = "archive-recorded (PR merged, run archive --with-merge)";
  } else {
    status = "awaiting-archive (PR merged, run archive --with-merge)";
  }
}
```
