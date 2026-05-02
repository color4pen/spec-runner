## Code Review Result

**Verdict**: needs-fix
**Score**: 6.40 / 10.0 (pass threshold: 7.0)
**Iteration**: 1/2
**Trend**: — (initial)

### Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 5 | 0.30 | 1.50 |
| security | 8 | 0.25 | 2.00 |
| architecture | 6 | 0.15 | 0.90 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 6 | 0.10 | 0.60 |
| testing | 6 | 0.10 | 0.60 |
| **Total** | | | **6.40** |

### Verification Summary

| Phase | Result |
|-------|--------|
| Build | PASS (tsc emit not exercised, but typecheck passes) |
| Type Check | PASS (`tsc --noEmit`) |
| Lint | SKIP (no lint script in package.json) |
| Tests | PASS (685/685 in 2.15s) |
| Security | PASS (no LLM imports, tempfile with randomUUID, body via --body-file) |

### Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | CRITICAL | correctness | src/core/finish/orchestrator.ts:141-185 | Step ordering breaks design Decision 1 ("local main 直 commit / 直 push しない"). The orchestrator runs `archiveOpenspec` (Step 5) and `moveRequestsDir` + `git commit` (Step 6) BEFORE `createArchivePr` (Step 7) creates the `chore/archive-<slug>` branch. `openspec archive` mutates the working tree and `git mv` + `git commit` land on whatever branch is currently checked out — typically `main`. Then Step 7 does `git checkout -b chore/archive-<slug> origin/main`, branching from `origin/main` (not from the local commit), so the archive PR is empty (no diff) and the user's local `main` carries dangling commits. request.md §5 is explicit: "main worktree 内で以下を実行: git fetch origin main; git checkout -b chore/archive-<slug> origin/main" should occur BEFORE the openspec/git mv operations. The integration test (TC-045) only asserts `exitCode === 0` and uses stubbed spawns — it never verifies that the commit/mv operations occur on the archive branch, so the bug is not caught. | Move the `git fetch origin main` + `git checkout -b chore/archive-<slug> origin/main` block out of `createArchivePr` and into a new step that runs BEFORE `archiveOpenspec` (e.g., reorder to: fetch+checkout-archive-branch → archiveOpenspec → moveRequestsDir → push+pr-create+merge). Alternative: make `createArchivePr` two functions (`prepareArchiveBranch` + `pushAndCreateArchivePr`) and call them around the openspec/mv steps. Add a test that asserts the spawn call sequence: `git checkout -b chore/archive-<slug>` MUST be invoked before any `openspec archive` / `git mv` / `git commit`. |
| 2 | HIGH | correctness | src/core/finish/archive-pr.ts:36-56, 67-79 | `checkArchivePrAlreadyMerged` (idempotency skip) executes only inside `createArchivePr`, AFTER `archiveOpenspec` and `moveRequestsDir` already ran (and committed locally). On a re-run where the archive PR is already merged, the user has just had `openspec archive` re-mutate the tree (potentially failing because the change was already archived in a previous run) and `git mv` re-attempted (idempotent skip is fine), producing inconsistent state on re-run. Idempotency should be checked centrally before any local mutation. | Lift the archive-already-merged probe into the orchestrator BEFORE Step 5 (archiveOpenspec). If the archive PR is already merged, mark the job archived and exit 0. Optionally also check whether `openspec/changes/<slug>/` was already moved to `archive/` in a prior run, and skip Step 5 in that case. |
| 3 | HIGH | correctness | src/core/finish/archive-pr.ts:93-115 | Branch reuse fallback risks stale state. When `git checkout -b <branchName> origin/main` fails (branch exists locally), the code falls back to `git checkout <branchName>` WITHOUT resetting it to `origin/main`. If a previous failed run left the branch with stale or partial commits, those commits are reused silently and pushed in Step 3, polluting the archive PR. | Either (a) on failure, run `git branch -D <branchName>` then retry the create, or (b) `git checkout -B <branchName> origin/main` (force re-point to origin/main). Add a test that exercises the "branch already exists locally with stale commits" path. |
| 4 | HIGH | correctness | src/core/finish/orchestrator.ts:69-77 | `JOB_NOT_FINISHABLE` (running job) is returned as `exitCode: 1, escalation: err.message`. The escalation field is the raw error message, NOT a `formatEscalation(...)` block — so the user sees a single-line "Cannot finish job ... status is 'running'" without the standardized 4-field block (failedStep / detectedState / recommendedAction / resumeCommand). request.md §8 mandates the 4-field format for ALL escalations, and TC-023 asserts the 4 fields are present "for each pattern". This pattern is missed. | Wrap `JOB_NOT_FINISHABLE` with `formatEscalation({ failedStep: "job-state-gate", detectedState: "JOB_NOT_FINISHABLE (status=running)", recommendedAction: "Wait for the running job to complete, or check its progress with `specrunner ps`.", resumeCommand: \`specrunner finish ${target.jobId}\` })`. Same applies to the `pr-state-detection` and `CLOSED` paths in lines 84-122 — they DO use the 4-field format already, so just align this one path. |
| 5 | MEDIUM | maintainability | src/core/pr-create/runner.ts:200-207, src/core/gh/error.ts | Incomplete refactor: `src/core/gh/error.ts:buildGhFailureMessage` was extracted as a "shared helper" but `src/core/pr-create/runner.ts` still has its own internal copy (line 201) and never imports the shared one. The new export is dead code. implementation-notes.md §Notes acknowledges this as intentional but it violates the "migration を完了させる" lesson (review-lessons.md / Refactoring/Migration). | Either (a) update `src/core/pr-create/runner.ts:145,159` to import from `src/core/gh/error.ts` and delete the local function (preferred, completes the refactor), or (b) delete `src/core/gh/error.ts` if the shared form is not actually needed. Don't leave both. |
| 6 | MEDIUM | maintainability | src/core/finish/idempotency.ts:23-25 | `isFeaturePrAlreadyMerged` is exported but never imported anywhere in src/ or tests/. Dead code. | Either delete the function or use it in the orchestrator/`mergeFeaturePr` (where the same check is currently inlined as `if (prState === "MERGED")`). |
| 7 | MEDIUM | correctness | src/core/finish/archive-pr.ts:21-31, 164-189 | `isAutoMergeUnavailable` greps gh stderr for substrings ("auto-merge", "branch protection", "not enabled", "not supported"). This is fragile string matching against an external CLI's error messages — gh CLI text changes silently break the fallback path. review-lessons.md ("外部 CLI の出力解析が `--json` / `--format json` のような構造化形式で行われているか。stderr 文言依存ロジックが残っていないか") explicitly flags this anti-pattern. | Prefer detecting auto-merge availability proactively (e.g., `gh repo view --json autoMergeAllowed`) before attempting `--auto`, or fall back unconditionally on any non-zero exit (the immediate `gh pr merge` will itself fail loudly if branch protection blocks it). At minimum, add a comment documenting the gh stderr strings being matched and the pinned gh version range. |
| 8 | MEDIUM | testing | tests/finish-orchestrator.test.ts:108-129, 131-154, 156-178 | The orchestrator integration tests assert only `exitCode === 0` and (sometimes) a single message substring. They do NOT verify command sequence or argument ordering, which means the Finding #1 ordering bug, Finding #3 stale-branch bug, and Finding #2 idempotency-positioning bug all pass tests. Per review-lessons.md ("test-cases.md の must テストが 80% 以上実装されているか" + "spy/mock を使った unit test での「呼び出し関係」担保"), TC-045 / TC-046 should validate the spawn call sequence. | Add an assertion that `spawn` was called with `["git", "checkout", "-b", "chore/archive-<slug>", "origin/main"]` BEFORE any `["git", "mv", ...]` or `["openspec", "archive", ...]`. Use `vi.mocked(spawn).mock.calls` to inspect order. Add an explicit test for "archive PR already merged on remote → entire archive flow skipped" that currently the implementation cannot satisfy due to Finding #2. |
| 9 | LOW | maintainability | src/core/finish/resolve-target.ts:170-176 | When awaiting-merge auto-detects exactly one slug, `resolveTarget` recursively calls itself with `{ slug }`. If no state file matches that slug (state lost / pre-state-file job), the user sees the generic `--slug` error ("No job found with slug '<X>'. Run 'specrunner ps'...") instead of a more specific hint that the awaiting-merge dir exists but the state was not found. | Branch the recursive call to surface a custom message when the auto-detected slug fails to resolve to a state, e.g., "Auto-detected slug '<X>' from awaiting-merge but no matching job state was found. Run with explicit `<jobId>` or restore state from history." |
| 10 | LOW | maintainability | src/core/finish/archive-pr.ts:71-79 | When `checkArchivePrAlreadyMerged` returns true, the function returns `archivePrUrl: null` and the orchestrator emits a benign skip message but never marks the job as archived (it falls through to Step 8: `markJobArchived`). That happens to be correct, but the relationship is implicit — a future refactor that returns early before `markJobArchived` would silently leave state inconsistent. | Add a comment in `archive-pr.ts` noting "skipped path still relies on orchestrator Step 8 to update state" or assert via a test that the state IS transitioned to archived in this case. |
| 11 | LOW | correctness | src/core/finish/move-requests-dir.ts:73-77 | `git commit` is invoked unconditionally after the awaitingExists branch (whether or not anything was added). Relying on stderr/stdout substring `"nothing to commit"` is brittle (varies by git locale). | Pre-check with `git diff --cached --quiet`; if exit code 0 (no staged changes) skip commit entirely. Removes the locale-fragile string match. |

### Iteration Comparison

(Initial iteration — no prior feedback to compare.)

### Summary

- **総合**: スコア 6.40。CRITICAL 1 + HIGH 3 により verdict は `needs-fix`。orchestrator の step 順序に致命的な設計違反があり、archive commit が `main` ブランチに残る挙動になっている。テストが happy-path の exit code しか検証していないため検知できていない。
- **主要指摘**:
  1. **F#1 (CRITICAL)** — `createArchivePr` 内の `git checkout -b chore/archive-<slug>` が `archiveOpenspec` / `moveRequestsDir` の **後** に実行されているため、commit が archive branch に乗らない。design.md Decision 1 と request.md §5 違反。
  2. **F#2 (HIGH)** — archive-already-merged の idempotency check が `createArchivePr` 内部にあり、その手前で `openspec archive` と `git mv` が走ってしまう。idempotency は orchestrator 上位で判定すべき。
  3. **F#3 (HIGH)** — local archive branch が前回失敗で残っている場合、`git checkout` でそのまま再利用される（`-B` でリセットしない）。stale commit 混入リスク。
  4. **F#4 (HIGH)** — `JOB_NOT_FINISHABLE` のとき escalation 4 フィールド形式になっておらず request.md §8 違反。
- **テスト品質**: 685 全 PASS だが、orchestrator integration test が exit code のみ検証で spawn call 順序を assert していない。F#1 / F#2 を catch する test が必要。
- **trend**: 初回イテレーション、収束判定なし。次イテレーションで F#1-#4 の修正と test 追加（spawn 呼び出し順序の assert）を期待する。
