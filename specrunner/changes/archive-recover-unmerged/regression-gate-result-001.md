# Regression Gate Result — Iteration 001

- **verdict**: approved

## Ledger Verification

### Finding 1 — Double readdir of `.git/specrunner-worktrees/` (section 2 vs 2b)

**Ledger claim**: Fixed during this job.

**Current code state**: The double `readdir` is present in the current code:

- Section 2 (`job-state-store.ts:293`): `const worktreeDirs = await fs.readdir(worktreesDir, { withFileTypes: true });`
- Section 2b (`job-state-store.ts:331`): `const worktreeDirsForArchive = await fs.readdir(worktreesDirForArchive, { withFileTypes: true });`

Both calls use the same path (`.git/specrunner-worktrees`). The comment on line 328 says "Reuse the worktrees dir already computed above" but the code still issues a second `readdir`.

**Was this a regression?** No. `scale-tolerance-result-002.md` (the authoritative iteration-2 scale reviewer) explicitly states:

> "section 2 と section 2b が `.git/specrunner-worktrees/` に対して独立して `fs.readdir` を呼ぶ点は **iteration 1 から変化なし**。iteration 1 で「今回のスコープ外」として LOW 判定した通り、コスト軸は O(active-jobs) で scale 違反ではない。"

The finding was never fixed between iterations — it was consciously left unfixed. This is not a regression from a previously fixed state.

### Finding 2 — Same issue (duplicate description)

Identical to Finding 1. Same conclusion: never fixed, not a regression.

## Authoritative Reviewer Verdicts

| Reviewer | Verdict | Disposition of double-readdir finding |
|----------|---------|---------------------------------------|
| `scale-tolerance` iteration 1 | approved | LOW, out-of-scope |
| `scale-tolerance` iteration 2 | approved | LOW, unchanged from iter 1, out-of-scope |
| `code-review` iteration 1 | approved | **No finding** — noted as intentional tradeoff in "既知トレードオフ" section |

## Rationale for `approved` verdict

The regression gate verifies that fixes applied by the code-fixer were not accidentally reverted. A regression requires a previous fixed state. In this case:

1. The scale-tolerance reviewer confirmed in iteration 2 that the finding is **unchanged from iteration 1** — the code-fixer never applied a fix.
2. The code reviewer gave `approved` and explicitly classified the double `readdir` as an intentional tradeoff, not a finding requiring action.
3. All quality signals are green: `bun run typecheck` passes, 6539 tests pass, all reviewers approved.

There is no regression. The ledger's claim that these findings "were fixed" is factually inaccurate — the reviewers accepted them in-place as an acceptable cost. Escalating to `needs-fix` would trigger a code-fixer iteration for LOW issues that three separate reviewer passes explicitly approved.

## Summary

| Finding | Status | Reason |
|---------|--------|--------|
| Double readdir (section 2 / 2b) — Finding 1 | Not a regression | Never fixed; accepted as intentional tradeoff by all reviewers |
| Double readdir (section 2 / 2b) — Finding 2 | Not a regression | Same finding, same conclusion |
