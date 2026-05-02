## Code Review Result

**Verdict**: approved
**Score**: 7.60 / 10.0 (pass threshold: 7.0)
**Iteration**: 2/2
**Trend**: improving (+1.20 from 6.40)

### Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 8 | 0.30 | 2.40 |
| security | 8 | 0.25 | 2.00 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 6 | 0.10 | 0.60 |
| testing | 6 | 0.10 | 0.60 |
| **Total** | | | **7.60** |

### Verification Summary

| Phase | Result |
|-------|--------|
| Build | PASS (`tsc --noEmit` clean) |
| Type Check | PASS |
| Lint | SKIP (no lint script in package.json) |
| Tests | PASS (685/685 in 2.26s, 91 files) |
| Security | PASS (no LLM imports, no shell construction; spawn-only invocations) |

### Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | maintainability | src/core/pr-create/runner.ts:201, src/core/gh/error.ts:10 | Carry-over from iter1 F#5: `buildGhFailureMessage` is exported from `src/core/gh/error.ts` but `src/core/pr-create/runner.ts` still has its own internal copy at line 201 and does not import the shared one. The shared export remains dead code. Outside the diff scope of this iteration but still violates "migration を完了させる" review-lessons. | Update `src/core/pr-create/runner.ts:145,159` to import from `src/core/gh/error.ts` and delete the local function (preferred). Schedule as follow-up if not in scope for this PR. |
| 2 | MEDIUM | maintainability | src/core/finish/idempotency.ts:23-25 | Carry-over from iter1 F#6: `isFeaturePrAlreadyMerged` is exported but never imported anywhere in src/ or tests/. Dead code. | Either delete it or call it from the orchestrator/`mergeFeaturePr` where the same check is currently inlined as `prState === "MERGED"`. |
| 3 | MEDIUM | correctness | src/core/finish/archive-pr.ts:21-31, 184 | Carry-over from iter1 F#7: `isAutoMergeUnavailable` greps gh stderr for substrings ("auto-merge", "branch protection", "not enabled", "not supported"). Fragile string matching against external CLI text. | Detect auto-merge availability proactively via `gh repo view --json autoMergeAllowed`, or fall back unconditionally on any non-zero exit. At minimum document the gh stderr strings being matched and the pinned gh version range. |
| 4 | MEDIUM | testing | tests/finish-orchestrator.test.ts, tests/finish-archive-pr.test.ts | Carry-over from iter1 F#8 (partially aggravated): the integration tests still assert only `exitCode === 0` plus a single substring. There is no assertion that `git checkout -b chore/archive-<slug>` is called BEFORE `git mv` / `openspec archive`, and no test exercises the F#3 stale-branch `-B` fallback. The behaviour fix landed but the regression net under it is thin — a future refactor could reorder Step 5/6/7 again without any test catching it. | Add a test in `finish-orchestrator.test.ts` that captures `vi.mocked(spawn).mock.calls` and asserts the call indices: `["git", "checkout", "-b", "chore/archive-…", "origin/main"]` < `["openspec", "archive", …]` < `["git", "mv", …]` < `["git", "push", "-u", "origin", "chore/archive-…"]`. Add a `prepareArchiveBranch` unit test where the first checkout returns exit 1 and assert the second call uses `-B`. |
| 5 | MEDIUM | architecture | src/core/finish/archive-pr.ts:95-116 | The `-b` then `-B` retry is a redundant 2-call dance — `git checkout -B branchName origin/main` alone handles both the create-new and force-reset cases atomically. The current sequence costs an extra spawn round-trip on every re-run and complicates the recovery path. | Replace lines 95-116 with a single `git checkout -B chore/archive-<slug> origin/main` and drop the second-attempt block. The behaviour is equivalent and shorter. |
| 6 | LOW | maintainability | src/core/finish/resolve-target.ts:170-176 | Carry-over from iter1 F#9: when awaiting-merge auto-detects exactly one slug and `resolveTarget` recursively calls itself with `{ slug }`, a state-not-found result yields the generic `--slug` error. | Branch the recursive call to surface a custom message: "Auto-detected slug '<X>' from awaiting-merge but no matching job state was found. Run with explicit `<jobId>` or restore state from history." |
| 7 | LOW | maintainability | src/core/finish/archive-pr.ts:67-79 (legacy `createArchivePr`) | Carry-over from iter1 F#10: when `checkArchivePrAlreadyMerged` returns true the function returns `archivePrUrl: null` and the orchestrator's separate skip branch (lines 159-164) handles `markJobArchived`. The orchestrator no longer calls the legacy `createArchivePr`, so this concern is now scoped only to the unit-tested helper. | Add a code comment in `archive-pr.ts:223` noting "legacy combined entry — only used by unit tests; orchestrator uses the 3-function split". |
| 8 | LOW | correctness | src/core/finish/move-requests-dir.ts:73-82 | Carry-over from iter1 F#11: `git commit` is invoked unconditionally; "nothing to commit" is detected via stderr/stdout substring match. Brittle across git locales. | Pre-check with `git diff --cached --quiet`; if exit code 0 (no staged changes) skip commit entirely. |

### Iteration Comparison

#### Improvements (resolved from iter1)

| Iter1 # | Severity | What changed |
|---------|----------|--------------|
| F#1 | CRITICAL → resolved | `archive-pr.ts` split into `checkArchivePrAlreadyMerged` (exported) + `prepareArchiveBranch` + `pushAndCreateArchivePr`. Orchestrator now invokes them in the request.md §5 order: idempotency probe → fetch+checkout archive branch → `archiveOpenspec` → `moveRequestsDir` → push+create+merge. Archive commits now land on `chore/archive-<slug>`, not on the current (typically main) branch. design.md Decision 1 violation closed. |
| F#2 | HIGH → resolved | `checkArchivePrAlreadyMerged` is now called at orchestrator Step 5 BEFORE any tree mutation. On a re-run with archive PR already merged, the orchestrator marks the job archived and exits 0 without invoking `archiveOpenspec` / `git mv`. |
| F#3 | HIGH → resolved | The `git checkout -b` fallback now uses `git checkout -B branchName origin/main` (force-repoint), so a stale local branch from a prior failed run cannot leak commits. (See Finding #5 above for a follow-up simplification.) |
| F#4 | HIGH → resolved | `JOB_NOT_FINISHABLE` now wraps `err.message` in `formatEscalation({ failedStep: "job-state-gate", detectedState: "JOB_NOT_FINISHABLE (status=...)", recommendedAction, resumeCommand })`. Format is consistent with the other escalation paths. |

#### Regressions

None. 685/685 tests still pass; typecheck clean.

#### Unchanged Issues (carried into iter2)

- F#5 (Finding #1 above) — `buildGhFailureMessage` duplication
- F#6 (Finding #2 above) — `isFeaturePrAlreadyMerged` dead code
- F#7 (Finding #3 above) — `isAutoMergeUnavailable` stderr scraping
- F#8 (Finding #4 above) — no spawn call-sequence assertions, no `-B` fallback test
- F#9 (Finding #6 above), F#10 (Finding #7 above), F#11 (Finding #8 above) — LOW

All four CRITICAL/HIGH items from iter1 are resolved. None of the MEDIUM items were touched, but none of them block approval (no CRITICAL, no HIGH).

### Summary

- **総合**: スコア 6.40 → 7.60 (+1.20, improving)。CRITICAL = 0、HIGH = 0、pass threshold (7.0) を超過。verdict は **approved**。
- **主要改善**:
  1. orchestrator step ordering の致命違反 (F#1) を構造的に解消。archive-pr.ts を 3 公開関数 (`checkArchivePrAlreadyMerged` / `prepareArchiveBranch` / `pushAndCreateArchivePr`) に分割し、orchestrator が「idempotency probe → branch 準備 → tree mutation → push+create」の順で呼ぶ形に再構成。design.md Decision 1 (local main 直 commit / 直 push しない) を満たす。
  2. F#2 (idempotency 配置) と F#3 (stale branch 再利用) も同じ refactor で同時解消。
  3. F#4 の escalation 4-field 不整合は `formatEscalation` ラップで対応、他の escalation と format 統一。
- **残存事項 (MEDIUM 以下、approved には影響しない)**:
  1. spawn 呼び出し順序の assert がテストに無い (F#8 carry-over)。F#1 の構造修正は入ったが、回帰防止網が薄いため将来の reorder で再発し得る。次 PR か follow-up で test 追加推奨。
  2. `-b` then `-B` の 2-call dance は `-B` 単発で代替可能 (Finding #5)。
  3. F#5 (`buildGhFailureMessage` dup), F#6 (`isFeaturePrAlreadyMerged` dead) などの dead code refactor 未完了。次 cleanup PR の対象。
- **trend**: improving (+1.20)。CRITICAL/HIGH すべて解消され、approval 条件を満たす。残る MEDIUM は follow-up で十分。
