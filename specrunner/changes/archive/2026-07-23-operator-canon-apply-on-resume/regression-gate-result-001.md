# Regression Gate — operator-canon-apply-on-resume — Iteration 1

## Evidence Summary

Checked 4 ledger findings against current branch code (`git diff main...HEAD`).

---

## Finding 1 (MEDIUM): Exit-128 carve-out in prepare() bypasses fail-closed guarantee with no integration-level test

**Status: FIXED**

TC-019 was added at `src/core/command/__tests__/resume-apply-canon.test.ts:467-552` with three test cases:

1. **TC-019**: `prepare()` does NOT throw when `detectCanonDirtyPaths` throws with "exit 128" — treats worktree as clean and continues (line 498–512).
2. **TC-019**: `prepare()` DOES throw when error message does not contain "exit 128" — fail-closed for generic git errors (line 514–527).
3. **TC-019**: `commitOperatorCanon` is NOT called when the exit-128 carve-out treats the worktree as clean (line 529–551).

The carve-out in `resume.ts:275-281` matches the documented behavior. The integration-level invisibility identified in the review is now observable via TC-019.

---

## Finding 2 (LOW): TC-016 に applyCanon: true が欠落し warning メッセージパスが未テスト

**Status: REGRESSION**

`src/core/command/__tests__/resume-apply-canon.test.ts:417-434` (TC-016 first test):

```typescript
const cmd = new ResumeCommand(
  {} as never,
  {} as never,
  "test-slug",
  {
    cwd: "/repo",
    noWorktree: true,
    // Note: applyCanon: true will be added by T-02; use type assertion for RED tests
  } as Record<string, unknown> as never,
);
```

- `applyCanon: true` is still absent from the options.
- The stale comment `'will be added by T-02'` was not removed after T-02 completion.
- The test title claims to test `--no-worktree + --apply-canon` but only exercises `--no-worktree` alone.
- The production warning path (`else if (this.options.applyCanon) { stderrWrite("Warning: --apply-canon has no effect...") }` at `resume.ts:330-332`) is never reached by any TC-016 test case.
- TC-016 second test (line 436–459) also lacks `applyCanon: true`.

---

## Finding 3 (HIGH): `git add -A` が non-canon ファイルを index にステージ

**Status: FIXED**

`src/core/resume/apply-canon.ts:118-123`:

```typescript
const addResult = await runSubprocess(
  spawnFn,
  "git",
  ["add", "-A", "--", ...paths],
  { cwd: worktreePath },
);
```

The implementation uses `git add -A -- <paths>` (pathspec-limited), NOT bare `git add -A`. Only the specified canon paths are staged. A comment at lines 113–117 explicitly documents the intent and the risk of bare `-A`:

> "A bare `git add -A` would stage unrelated non-canon files into the index, where scoped steps leave them undetected and the first guarded step sweeps them into its own commit (index-pollution laundering — cross-boundary Finding 1)."

Step 2 also uses `git commit -m "operator-apply: <slug>" -- <paths>` (pathspec-limited commit), providing defence-in-depth.

---

## Finding 4 (MEDIUM): TC-013 の「non-canon file remains dirty」アサーションが staged 状態と worktree-dirty 状態を区別せず、Finding 1 の index 汚染を検出しない

**Status: REGRESSION**

`src/core/resume/__tests__/apply-canon.test.ts:325-341` (TC-013 "non-canon file remains dirty" test):

```typescript
// THEN: non-canon path is still dirty (in working tree)
const statusResult = spawnSync("git", ["status", "--porcelain", "-uall"], {
  cwd: tempDir, encoding: "utf8",
});
expect(statusResult.stdout).toContain(NON_CANON_PATH);
```

No `git diff --cached --name-only` assertion was added. The assertion still only checks that `NON_CANON_PATH` appears in `git status --porcelain` output, which is true for BOTH:
- `A  src/feature.ts` (staged — bugged implementation with bare `git add -A`) 
- `?? src/feature.ts` (untracked — fixed implementation with pathspec-limited add)

If the implementation regresses to bare `git add -A`, this test would continue to pass while the index is contaminated. The `git diff --cached --name-only` assertion mandated by the review ("修正: `git diff --cached --name-only` に non-canon パスが含まれないことをアサートして index 汚染を明示的に固定する") was not applied.

Note: the `git diff-tree --name-only` test at lines 302–323 verifies commit content exclusion, but does NOT verify index state (a selective commit can still leave non-canon files staged in the index without including them in the commit object).

---

## Checked Items

| # | Finding | Status |
|---|---------|--------|
| 1 | Exit-128 carve-out not tested at integration level | FIXED (TC-019 added) |
| 2 | TC-016 applyCanon: true missing, warning path untested | REGRESSION |
| 3 | `git add -A` stages non-canon files | FIXED (pathspec-limited) |
| 4 | TC-013 lacks `git diff --cached` assertion | REGRESSION |
