# Review Feedback: 2026-04-30-port-tidying — Iteration 1

## Scores

> **Weight override** (pipeline-context.md): architecture 0.25 / maintainability 0.15 / testing 0.05.
> **security excluded** (skipped via `enabled-absent(security-reviewer)`); remaining weights re-normalized over 0.85 sum.

| Category | Score (1-10) | Raw Weight | Re-normalized Weight | Weighted |
|----------|-------------|------------|----------------------|----------|
| correctness | 8 | 0.30 | 0.353 | 2.824 |
| security | — (skipped) | 0.25 | — | — |
| architecture | 9 | 0.25 | 0.294 | 2.646 |
| performance | 8 | 0.10 | 0.118 | 0.944 |
| maintainability | 8 | 0.15 | 0.176 | 1.408 |
| testing | 8 | 0.05 | 0.059 | 0.472 |
| **Total** | | | | **8.29** |

### スコアリング基準

| Score | 意味 |
|-------|------|
| 1-3 | 重大な問題あり。本番に出せない |
| 4-5 | 動くが品質不足。レビューで必ず指摘される |
| 6 | 最低限の品質。改善余地が多い |
| 7 | 良好。プロダクション品質（承認閾値） |
| 8 | 優良。丁寧な実装 |
| 9-10 | 卓越。模範的なコード |

## Verdict

- **verdict**: approved
- **pass_threshold**: 7.0
- **blocking_findings**: CRITICAL: 0, HIGH: 0

## Verification Summary

| Phase | Result |
|-------|--------|
| Build | PASS (`tsc --noEmit false --outDir dist` exit 0) |
| Type Check | PASS (`tsc --noEmit` exit 0) |
| Lint | N/A (no lint script in package.json) |
| Tests | PASS (298/298 via `bun run test` — vitest) |
| CLI Snapshot | PASS (no `--update-snapshot` needed) |
| Security Scan | skipped (security-reviewer not enabled) |

Note: First `bun test` (raw bun runner, not the npm script) failed because the build step had emitted `dist/`, and `bun test` walked `dist/tests/` where fixture relative paths break. The canonical command is `bun run test` (which dispatches to `vitest run`); on a clean tree (no `dist/`), all 298 tests pass. Recommend the implementer remove `dist/` after build verification, or switch the build script to a separate `tsbuildinfo` directory, to avoid this trap on future runs. (Captured here as observation, not a finding — pre-existing toolchain shape.)

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | consistency | src/adapter/github/github-client.ts:98 | Port JSDoc declares `5xx / network error → throws GitHubApiError`, but `GitHubApiClient.verifyPath` returns `resp.status !== 404`, so 5xx silently becomes `true` (false-positive folder existence). Implementation-notes acknowledges this gap and defers it explicitly. | Tighten `verifyPath` adapter in a follow-up request: throw on 5xx (or wrap in `GitHubApiError`) so adapter behavior matches the port contract. Track as a follow-up; not blocking this request since spec-review approved the port-only tightening scope. |
| 2 | LOW | maintainability | src/core/step/spec-review.ts:97 | Trailing blank line after final `};` (the dead-code helper section was deleted but a stray blank line remains at EOF). | Remove the trailing blank line so the file ends with a single newline. Cosmetic only — auto-fixable. |
| 3 | LOW | testing | tests/pipeline.test.ts:120-129 | The new `verifyPath` mock throws when `tokenExpired` is true, but the sibling `getRawFile` mock unconditionally returns `null` — it no longer respects the `tokenExpired` flag (in the old version, `getRawFile` carried the folder-probe responsibility). If a future test asserts the GITHUB_TOKEN_EXPIRED path through `getRawFile`, it would silently pass instead of surfacing the error. | Mirror the `tokenExpired` throw inside the `getRawFile` mock, even if currently unused, so the mock's contract is self-consistent. Optional. |

No CRITICAL, no HIGH, no MEDIUM. Verdict: **approved**.

## Strengths

- **port purity discipline followed exactly**: `verifyPath` declared as required on `GitHubClient`, intersection type `& { verifyPath?: ... }` removed from `verifyChangeFolderViaPort`, fallback branch deleted. Matches the learned-patterns lesson "port が宣言する method のみ呼び出す（optional probe は禁止）" cited in request.md.
- **dead-code removal with TC migration table**: `fetchSpecReviewResult` (~70 LOC src) and `tests/spec-review-fetch.test.ts` (96 LOC) deleted; TC-012/013/014/015 rewritten as direct `GitHubApiClient.getRawFile` tests with an explicit 1:1 assertion mapping in implementation-notes.md. Follows the 4-step migration discipline (全置換 / 旧 export 削除 / テスト書き換え / grep 残存ゼロ).
- **mechanical mock updates across 9 test files**: every `GitHubClient` mock (`tests/spec-review-step.test.ts`, `tests/pipeline.test.ts`, `tests/pipeline-integration.test.ts`, `tests/cli-stdout-snapshot.test.ts`, `tests/error-codes.test.ts`, `tests/core/pipeline/pipeline.test.ts`, `tests/core/step/step-interface.test.ts`, `tests/core/steps/spec-review.test.ts`, `tests/unit/step/executor.test.ts`) consistently updated to declare `verifyPath`. No build-error leakage.
- **semantic drift fix (LOW #3 from PR #31)**: `verifyChangeFolderViaPort` now calls `verifyPath` directly instead of probing `getRawFile(..., changeFolderPath + "/proposal.md")`, eliminating the false-negative on transient states (folder exists but proposal.md not yet pushed). CLI snapshot test confirms no externally-observable behavior change.
- **grep evidence captured**: implementation-notes.md tabulates baseline vs final grep counts (0 hits in src/, tests/, openspec/specs/ for both `fetchSpecReviewResult` and `FetchSpecReviewResultParams`).
- **delta spec quality**: `openspec/changes/2026-04-30-port-tidying/specs/spec-review-session/spec.md` MODIFIED both Requirements coherently with `deps.githubClient.getRawFile` phrasing; canonical specs left untouched (pending archive) — correctly avoids the rename-as-MODIFIED anti-pattern from the prior PR.

## Iteration Comparison

N/A — iteration 1.

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-------------|---------|-------------|
| 1 | 8.29 | approved | port `verifyPath` 必須化、`fetchSpecReviewResult` 削除、structural typing leak 除去、9 mock 追従、298/298 PASS |

## Convergence

- **trend**: — (iteration 1)
- **recommendation**: approved — proceed to PR creation (Step 7b → 9). Findings #1–#3 are LOW and non-blocking; #1 is already documented as a follow-up scope in implementation-notes.md.

## Summary

Surgical refactor on a deferred-finding ticket. The 3 PR #31 findings (MEDIUM #1 dead `fetchSpecReviewResult`, LOW #2 structural typing leak, LOW #3 fallback semantic drift) are all closed in a single coherent change; the port↔adapter 5xx behavior gap is the only remaining loose end and is explicitly deferred. Build / typecheck / 298 tests / CLI snapshot all green. Implementation-notes provides clear evidence (grep counts, TC mapping) for the receipts the request demanded. No blocking findings; **approved** at score 8.29.
