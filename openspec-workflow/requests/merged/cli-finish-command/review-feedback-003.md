## Code Review Result

**Verdict**: approved
**Score**: 7.85 / 10.0 (pass threshold: 7.0)
**Iteration**: 1/2 (fixup cycle, post-merge review of iter3 code-fixer changes)
**Trend**: improving (+0.25 from iter2 baseline 7.60)

### Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 8 | 0.30 | 2.40 |
| security | 8 | 0.25 | 2.00 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 7 | 0.10 | 0.70 |
| testing | 7.5 | 0.10 | 0.75 |
| **Total** | | | **7.85** |

### Verification Summary

| Phase | Result |
|-------|--------|
| Build | PASS (`tsc --noEmit` clean) |
| Type Check | PASS |
| Lint | SKIP (no lint script in package.json) |
| Tests | PASS (686/686 in 2.37s, 91 files; +1 vs iter2) |
| Security | PASS (no LLM imports, no shell-string construction; spawn-only with array args) |

### Fixup Scope (per pipeline-context.md)

- src/core/finish/archive-openspec.ts
- src/core/finish/archive-pr.ts
- src/core/finish/idempotency.ts
- src/core/finish/move-requests-dir.ts
- src/core/finish/orchestrator.ts
- tests/finish-archive-openspec.test.ts
- tests/finish-move-requests-dir.test.ts
- tests/finish-orchestrator.test.ts

### Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | correctness | src/core/finish/orchestrator.ts:239 | The final `git checkout main` is invoked with the spawn return value discarded — failure is silent. If the local `main` branch is missing, has uncommitted changes from prior steps, or the working tree is dirty for any reason, the user is silently left on the (now remote-deleted) archive branch with no warning. The fixer's own decision log claims "leave the branch intact on failure so the user can debug," but the failure being ignored is the *checkout itself*, not an upstream failure — there is no signal at all to the user. | Capture the result and emit a stderr warning on non-zero exit: `if (checkoutResult.exitCode !== 0) stderrWrite(\`Warning: failed to return to main branch (\${checkoutResult.stderr.trim()}). You are on chore/archive-${target.slug}, whose remote was deleted. Run \`git checkout main\` manually.\`);`. Do not escalate (the archive itself succeeded), but make the failure visible. |
| 2 | LOW | testing | tests/finish-orchestrator.test.ts:174 | The `idxCheckout` filter at line 174 uses `!k.includes("main\n") && !k.includes("checkout main")` to exclude the final `git checkout main` from matching the archive-branch checkout. The `"main\n"` clause never matches anything (cmdKeys are joined with spaces, no newlines). Only `!k.includes("checkout main")` actually filters. The test still works because `git checkout -b chore/archive-test-slug origin/main` doesn't contain the substring `"checkout main"`, but the dead clause is misleading. | Drop the `!k.includes("main\n")` clause; the `!k.includes("checkout main")` predicate alone is sufficient. Or rewrite as `findIndex((k) => k.startsWith("git checkout -b"))` to match the intent precisely. |
| 3 | LOW | testing | tests/finish-orchestrator.test.ts:144-150 | The new order-assertion test's `exists` mock uses substring matching (`p.includes("awaiting-merge")` / `p.includes("merged")`) and falls through to `return Promise.resolve(true)` for everything else. This is fragile: if a future code path probes a path containing neither substring (e.g. `openspec/changes/archive/`), the test will silently treat it as existing. | Replace with explicit allow-list: only return `true` for `openspec/changes/<slug>` and `openspec-workflow/requests/awaiting-merge/<slug>`; default to `false`. Rely on the test failing loudly if the orchestrator queries an unexpected path. |
| 4 | MEDIUM | maintainability | src/core/pr-create/runner.ts:201, src/core/gh/error.ts:10 | **Carry-over from iter1 F#5 / iter2 #1** — `buildGhFailureMessage` is exported from `src/core/gh/error.ts` but `src/core/pr-create/runner.ts` retains its private copy at line 201. Pipeline-context lists this file as out-of-scope for the fixup, so this remains a follow-up. | Schedule a cleanup PR: in `pr-create/runner.ts` import from `../gh/error.js` and delete the local function. (Out of fixup scope; not blocking approval.) |
| 5 | MEDIUM | correctness | src/core/finish/archive-pr.ts:21-35, 184 | **Carry-over from iter2 #3** — `isAutoMergeUnavailable` greps gh stderr for English substrings ("auto-merge", "branch protection", "not enabled", "not supported"). Locale/version-fragile. | Detect proactively via `gh repo view --json autoMergeAllowed` or fall back unconditionally on any non-zero exit from `gh pr merge --auto`. Alternatively pin gh version range and document the matched strings. (Carry-over; not blocking approval.) |
| 6 | LOW | maintainability | src/core/finish/archive-pr.ts:95-116 | **Carry-over from iter2 #5** — the `-b` then `-B` retry is a redundant 2-spawn dance; `git checkout -B branchName origin/main` alone handles both create-new and force-reset atomically. | Replace lines 95-116 with a single `git checkout -B chore/archive-<slug> origin/main` and drop the second-attempt block. (Carry-over; not blocking approval.) |
| 7 | LOW | maintainability | src/core/finish/resolve-target.ts:170-176 | **Carry-over from iter2 #6** — auto-detect-then-recurse path yields generic `--slug` error on state-not-found. | Branch the recursive call to surface a custom message. (Carry-over; not blocking approval.) |

### Iteration Comparison

#### Improvements (resolved from iter2)

| Iter2 # | Severity | What changed |
|---------|----------|--------------|
| New CRITICAL (post-iter2 finding) | CRITICAL → resolved | `archive-openspec.ts` now spawns `git add openspec/changes/` after a successful `openspec archive`. Both the deletion of `openspec/changes/<slug>/` and the new `openspec/changes/archive/<date>-<slug>/` are now staged so `move-requests-dir` can commit them. Without this fix, `git diff --cached` would have been empty and the archive PR would have shipped with no openspec content — silent data-correctness bug. |
| New HIGH (post-iter2 finding) | HIGH → resolved | Final `git checkout main` added after `markJobArchived` so the user is not stranded on the (remote-deleted) archive branch. Failure handling could be tighter (Finding #1) but the success path is correct. |
| iter2 #4 | MEDIUM → resolved | `tests/finish-orchestrator.test.ts` TC-045 now contains a spawn-call-order assertion validating fetch < checkout < openspec < git-add < mv < diff < commit < push < pr-create < pr-merge-auto < checkout-main. The reorder regression net is now real, not symbolic. |
| iter2 #8 | MEDIUM → resolved | `move-requests-dir.ts` no longer greps `commitResult.stderr/stdout` for `"nothing to commit"`. Pre-checks with `git diff --cached --quiet`; exit 0 means skip commit, exit 1 means proceed. Locale-independent. Tests updated to reflect the 3-call sequence. |
| iter2 #2 | MEDIUM → resolved | `isFeaturePrAlreadyMerged` deleted from `idempotency.ts`. Verified zero imports across `src/` and `tests/`. |
| iter2 #7 | LOW → resolved | `createArchivePr` now has an explicit "Legacy combined entry" docstring noting orchestrator uses the 3-function split. |

#### Regressions

None. Test count grew 685 → 686 (the new spawn-call-order test). All previously-passing tests remain green.

#### Unchanged Issues (carried into iter3)

- iter2 #1 (Finding #4 above) — `buildGhFailureMessage` duplication. Out of fixup scope.
- iter2 #3 (Finding #5 above) — `isAutoMergeUnavailable` stderr scraping. Out of fixup scope.
- iter2 #5 (Finding #6 above) — `-b` then `-B` 2-call dance. Within fixup scope but not addressed; LOW.
- iter2 #6 (Finding #7 above) — auto-detect-recurse error message. Out of fixup scope.

### Summary

- **総合**: 7.60 → 7.85 (+0.25, improving)。CRITICAL = 0, HIGH = 0, pass threshold (7.0) を超過。verdict は **approved**。
- **iter3 で解消された主要点**:
  1. **CRITICAL (post-iter2)**: `archiveOpenspec` の git add 抜けを修正。`openspec archive` 後に `git add openspec/changes/` を spawn することで、削除と新規 archive ディレクトリの両方が staging される。これがないと archive PR が中身ゼロの commit になる silent data-correctness bug。
  2. **HIGH (post-iter2)**: 成功パス末尾に `git checkout main` を追加。`--delete-branch` で remote が消えた archive ブランチに user が取り残されるのを防ぐ。
  3. **MEDIUM (iter2 #8)**: `nothing to commit` substring match を `git diff --cached --quiet` に置換。locale-independent。
  4. **MEDIUM (iter2 #4)**: TC-045 に spawn 呼び出し順序の index assertion を追加。step reorder の回帰防止網が薄かった懸念に対応。
  5. **MEDIUM (iter2 #2)**: `isFeaturePrAlreadyMerged` dead export を削除。
- **残存事項 (approval を阻まない)**:
  1. Finding #1 (MEDIUM): orchestrator の `git checkout main` は spawn 結果を捨てているため失敗が silent。stderr warning の追加を推奨。
  2. Finding #2-3 (LOW): 新規追加されたテストの mock の filter 述語と allow-list 設計が脆い。次の touch で整理推奨。
  3. Finding #4-7: iter1/iter2 からの carry-over。fixup-scope 外または LOW のため follow-up PR で対応。
- **trend**: improving (+0.25)。CRITICAL/HIGH ともに iter3 で解消され、approval 条件を満たす。残存 MEDIUM/LOW はすべて非ブロッキング。
