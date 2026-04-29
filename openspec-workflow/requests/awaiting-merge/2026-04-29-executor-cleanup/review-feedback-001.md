# Review Feedback: 2026-04-29-executor-cleanup — Iteration 1

## Code Review Result

- **verdict**: approved
- **score**: 7.60 / 10.0 (pass threshold: 7.0)
- **iteration**: 1/2
- **trend**: — (initial iteration)
- **type**: refactoring (weight overlay applied)

## Scores

Refactoring weights per `skills/request-execute/references/type-config.md` (architecture +0.10, maintainability +0.05, correctness/security/testing reduced):

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| correctness | 8 | 0.25 | 2.00 |
| security | 8 | 0.20 | 1.60 |
| architecture | 7 | 0.25 | 1.75 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 7 | 0.15 | 1.05 |
| testing | 8 | 0.05 | 0.40 |
| **Total** | | | **7.60** |

## Verdict

- **verdict**: approved
- **pass_threshold**: 7.0
- **blocking_findings**: CRITICAL: 0, HIGH: 0

## Verification Summary

| Phase | Result | Details |
|-------|--------|---------|
| Build | PASS | tsc emit OK |
| Type Check | PASS | 0 errors |
| Lint | SKIP | no lint script |
| Tests | PASS | 296/296 (38 files) |
| Security | PASS | npm audit 0 vulns; 0 console.log; 0 hardcoded secrets |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | maintainability | src/core/step/executor-helpers.ts:29-90 | `createSessionWithHistory` is exported and documented as the cohesive session-create helper but never called. `runProposeStyleStep` (executor.ts:117-164) and `runPollingStyleStep` (executor.ts:476-535) still inline their own session-create + appendHistory + fail blocks. This contradicts module-analysis.md's stated decision and tasks.md §2.2.1 ("Adopted"). The helper also has no unit test in `tests/unit/step/executor-helpers.test.ts`. Either wire it into both call sites (original intent) or delete it to avoid dead exports. | Adopt the helper at the two inline session-create sites OR delete the export and update implementation-notes.md / tasks completion claim accordingly. If kept, add a unit test. |
| 2 | LOW | architecture | src/core/step/executor.ts:401 | `verifyChangeFolderViaPort` parameter uses an ad-hoc structural intersection `GitHubClient & { verifyPath?: ... }`. Optional methods smuggled through structural extension hide the port contract. With `verify*Legacy` deleted and `githubClient` now required everywhere, `verifyPath` should be a first-class member of the `GitHubClient` port. | Add `verifyPath` to the `GitHubClient` port interface (required or formally optional with default fallback documented). Remove the inline intersection. |
| 3 | LOW | maintainability | src/core/step/executor.ts:400-409 | `verifyChangeFolderViaPort` takes 8 positional parameters (githubClient, owner, repo, branch, changeFolderPath, slug, state, store). review-lessons #51 flags this anti-pattern: "位置引数の多い関数（5個以上）が options object パターンに移行されているか". | Migrate to options-object: `verifyChangeFolderViaPort({ githubClient, owner, repo, branch, changeFolderPath, slug, state, store })`. Apply the same to `verifyBranchViaPort` (6 args) for consistency. |
| 4 | LOW | maintainability | src/core/step/executor.ts:307-342 | Branch+folder verification block mixes `await ... .then(...).catch(...)` with awaited `try/catch`. The two patterns are functionally equivalent but stylistically split; readers must reconcile two error-handling shapes side by side. | Pick one form for both port calls (recommend awaited `try/catch` since the catch already does conditional rethrow on `GITHUB_TOKEN_EXPIRED`). |
| 5 | LOW | architecture | src/core/step/executor.ts:411-413 | `githubClient.verifyPath ? ... : getRawFile(...+ "/proposal.md")` — fallback heuristic (probe `proposal.md`) is implementation-specific and lives in the executor. If the change folder lacks `proposal.md` but exists otherwise, the fallback returns false. Acceptable for current adapters but should be documented or pushed into the port. | Either lift the fallback into a `GitHubClient.verifyPath` default implementation, or document the contract that "directory existence is probed via `<path>/proposal.md`" in the port JSDoc. |

## Iteration Comparison

(initial iteration — no prior feedback to compare against)

### Improvements
- n/a

### Regressions
- n/a

### Unchanged Issues
- n/a

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|------------|---------|-------------|
| 1 | 7.60 | approved | Initial review. 296/296 tests pass. executor.ts 900→675 LOC. pipeline.ts deleted. verify*Legacy removed. AGENT_TOOLSET_TYPE consolidated. canonicalJson handles undefined. step.name/role mismatch guard. @deprecated residual = 1 (justified RawConfig.agent). |

## Convergence

- **trend**: — (initial)
- **recommendation**: approved (proceed to ADR / awaiting-merge)

## Summary

The cleanup achieves its stated objectives squarely:

1. **LOC target met decisively** — executor.ts 900 → 675 (target was 750-800; 75 LOC below the lower bound). Reduction came from the right places: helper extraction (-72) plus `verify*Legacy` deletion (-153 via D5).
2. **Behavior invariance verified** — all 296 tests pass without snapshot updates (`tests/cli-stdout-snapshot.test.ts` clean per task 7.11).
3. **Directory-form migration complete** — `src/core/pipeline.ts` deleted; `runPipeline` / `runProposePipeline` relocated to `src/core/pipeline/run.ts` and re-exported from `index.ts`. The four operations were committed atomically (`22a56fd`), respecting the D7 single-commit discipline learned from prior PRs.
4. **@deprecated debt drained** — only `RawConfig.agent` remains, with a recorded rationale (migrate.ts:77 typed access; field never written back via `delete toSave["agent"]`). Decision tree in tasks §3.6 was followed.
5. **D4-D6 deferred LOWs all addressed** — `as StepName` removed, `step.name !== step.agent.role` guard added with test, `AGENT_TOOLSET_TYPE` consolidated (literal grep returns only the const declaration), `canonicalJson` skips undefined keys with regression test (`{a: undefined}` ≡ `{}`).
6. **Module-architect decisions concretely landed in tasks** — Section 1 reflects module-analysis Section 4.1 helper signatures and §6.1 boundary concerns. The lesson "decisions/module-architect.md に書くだけで終わっていないか" is satisfied.

The principal weakness is finding #1: the headline helper (`createSessionWithHistory`) named in the module analysis and listed as "Adopted" in implementation-notes.md is in fact unused. The helper exists, is exported, has its own JSDoc, and is even mentioned in the file's section header — but neither runStyleStep imports it. The other four helpers (`recordFailedStepResult`, `attachStateAndRethrow`, `throwWrappedError`, `failStepWithError`) are properly wired and tested. This is a MEDIUM rather than HIGH because (a) it does not affect runtime behavior, (b) the LOC target was met without it, and (c) the inline session-create blocks are still correct. But the discrepancy between documentation ("Adopted") and code (not called) should be reconciled before merge or in a small follow-up.

The remaining four findings are LOW maintainability/architecture polish items around the GitHubClient port surface and ergonomic call-site shape; none block approval and they are reasonable candidates for a future request that touches the port layer.

Verdict: **approved**. Total 7.60 ≥ 7.0; no CRITICAL or HIGH findings. Recommend addressing finding #1 (use OR delete the helper) inline before PR open, and deferring findings #2-#5 to a follow-up port-tidying request.
