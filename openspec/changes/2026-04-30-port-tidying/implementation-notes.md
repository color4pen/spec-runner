# Implementation Notes — 2026-04-30-port-tidying

## Status

- **result**: completed
- **tasks_completed**: 37/37
- **blocked_tasks**: none

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/core/port/github-client.ts` | MODIFIED | Added `verifyPath` as required method declaration with JSDoc |
| `src/core/step/spec-review.ts` | MODIFIED | Deleted `FetchSpecReviewResultParams` interface, `fetchSpecReviewResult` function, related `stderrWrite` import, and dead-code comment block |
| `src/core/step/executor.ts` | MODIFIED | Removed `& { verifyPath?: ... }` intersection type from `verifyChangeFolderViaPort`; removed fallback branch; now calls `verifyPath` directly |
| `tests/spec-review-fetch.test.ts` | DELETED | TC-012/013/014/015 migrated to `tests/unit/adapter/github/get-raw-file.test.ts` |
| `tests/unit/adapter/github/get-raw-file.test.ts` | CREATED | TC-012/013/014/015 as `GitHubApiClient.getRawFile` direct tests |
| `tests/spec-review-step.test.ts` | MODIFIED | Added `verifyPath` to `buildMockGithubClient`; updated TC-020 comment |
| `tests/pipeline.test.ts` | MODIFIED | Added `verifyPath` to `buildMockGithubClient`; moved folder-probe logic from `getRawFile` to `verifyPath` |
| `tests/pipeline-integration.test.ts` | MODIFIED | Added `verifyPath` to `buildMockGithubClient`; moved folder-probe logic from `getRawFile` to `verifyPath` |
| `tests/cli-stdout-snapshot.test.ts` | MODIFIED | Added `verifyPath` to `makeMinimalDeps` github client mock |
| `tests/error-codes.test.ts` | MODIFIED | Added `verifyPath` to inline github client mock |
| `tests/core/pipeline/pipeline.test.ts` | MODIFIED | Added `verifyPath` to `makeMinimalDeps` github client mock |
| `tests/core/step/step-interface.test.ts` | MODIFIED | Added `verifyPath` to `makeMinimalDeps` github client mock |
| `tests/core/steps/spec-review.test.ts` | MODIFIED | Added `verifyPath` to `buildDeps` github client mock |
| `tests/unit/step/executor.test.ts` | MODIFIED | Added `verifyPath` to both inline github client mocks (2 occurrences) |
| `openspec/specs/spec-review-session/spec.md` | MODIFIED | Applied MODIFIED delta: replaced `fetchSpecReviewResult` references with `deps.githubClient.getRawFile` |
| `openspec/specs/cli-commands/spec.md` | MODIFIED | Applied MODIFIED delta: updated Scenario `spec-review-result.md が見つからない` |
| `openspec/changes/2026-04-30-port-tidying/decisions/implementer.md` | CREATED | Implementer decision log |

## Grep Verification Results

### Baseline (before implementation)

```
src/core/step/spec-review.ts:109: FetchSpecReviewResultParams (interface)
src/core/step/spec-review.ts:123: fetchSpecReviewResult (function)
tests/spec-review-fetch.test.ts: 8 references (TC-012/013/014/015)
tests/spec-review-step.test.ts:235: comment
openspec/specs/spec-review-session/spec.md:63,87,91 (3 lines)
openspec/specs/cli-commands/spec.md:163 (1 line)
```

### Final (after implementation) — 0 hits

- `grep -rn "fetchSpecReviewResult" src/ tests/ openspec/specs/` → **0 hits**
- `grep -rn "FetchSpecReviewResultParams" src/ tests/ openspec/specs/` → **0 hits**
- `grep -n "verifyPath ?" src/core/step/executor.ts` → **0 hits**
- `grep -rn "& { verifyPath" src/` → **0 hits**
- `grep -n "verifyPath" src/core/port/github-client.ts` → **1 hit** (required declaration present)

## TC Assertion Mapping (old → new)

| Old TC | Old assertion | New TC | New assertion |
|--------|--------------|--------|---------------|
| TC-012 | `fetchSpecReviewResult` returns content on 200 first try; no retries; sleepFn not called | TC-012 | `GitHubApiClient.getRawFile` returns content on 200 first try; 1 fetch call; sleepFn not called |
| TC-013 | `fetchSpecReviewResult` retries on 404×2 then 200; sleepFn called twice with 1000ms | TC-013 | `GitHubApiClient.getRawFile` retries on 404×2 then 200; sleepFn called twice with 1000ms |
| TC-014 | `fetchSpecReviewResult` returns null after all 404; sleepFn called 3 times | TC-014 | `GitHubApiClient.getRawFile` returns null after all 404; sleepFn called 3 times; 4 total fetch calls |
| TC-015 | `fetchSpecReviewResult` throws `{ code: "GITHUB_TOKEN_EXPIRED" }` on 401 | TC-015 | `GitHubApiClient.getRawFile` throws `{ code: "GITHUB_TOKEN_EXPIRED" }` on 401 |

All 4 assertions are semantically equivalent. `GitHubApiClient.getRawFile` implements the same retry/401/404/200 semantics as the deleted `fetchSpecReviewResult`.

## Test Results

- **Final test count**: 298 (unchanged from baseline)
- **Test breakdown**: 290 pass, 8 fail (identical pre-existing failures in `tests/init.test.ts` due to `@anthropic-ai/sdk` missing — unrelated to this change)
- **CLI snapshot test**: `tests/cli-stdout-snapshot.test.ts` PASS without `--update-snapshot`
- **LOW #3 semantic drift**: `verifyChangeFolderViaPort` now calls `verifyPath` directly. CLI snapshot test confirmed no behavior diff in snapshot baseline.

## Adapter Note

As recorded in design.md D2:
> **Note（adapter 現状）**: `src/adapter/github/github-client.ts:97` の `return resp.status !== 404` は 5xx も true 扱いになっており、上記 port 契約（5xx → throw）と乖離がある。port spec のみ tighten し、adapter 修正は別 request のスコープ。

This behavior gap is intentional and out of scope for this request.
