# Regression Gate Evidence — Iteration 001

## Ledger Finding Verified

### [LOW→HIGH] staged-new removal kind に実 git テストカバレッジなし

**Finding ID**: staged-new-git-coverage  
**Source file**: tests/resume-worktree-reconciliation-e2e.test.ts  
**Implementation location**: src/core/resume/reconcile-worktree.ts L238-251

#### Verification Steps

1. Checked `tests/resume-worktree-reconciliation-e2e.test.ts` — TC-013 (lines 471-535) covers two removal kinds:
   - (a) untracked residue → removed via `git clean -f`
   - (b) tracked-modified artifact → restored via `git checkout HEAD`

   TC-013 does **not** cover staged-new (X='A' entries — a file that was `git add`-ed for a new path but not yet committed, as would occur if `commit-push.ts` were killed between `git add` and `git commit`).

2. Checked `src/core/resume/__tests__/reconcile-worktree.test.ts` — TC-006 through TC-012 use mocked SpawnFn only; no real git repo test exercises the staged-new removal path.

3. `grep -n "staged"` in both test files returned no matches.

4. `git diff main...HEAD -- tests/resume-worktree-reconciliation-e2e.test.ts | grep "staged"` returned no output.

#### Conclusion

The staged-new removal path at reconcile-worktree.ts L238-251 (`git rm --cached` → `git clean -f`) remains uncovered by any real git test. The fix was **not applied**. Finding is present in the current code.

**Status**: REGRESSION (finding not fixed)
