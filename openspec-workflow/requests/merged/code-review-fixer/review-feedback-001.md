# Code Review Feedback — iteration 001

- **verdict**: needs-fix
- **iteration**: 001

## Code Review Result

**Verdict**: needs-fix
**Score**: 6.85 / 10.0 (pass threshold: 7.0)
**Iteration**: 1/2
**Trend**: — (initial)

### Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 5 | 0.30 | 1.50 |
| security | 8 | 0.25 | 2.00 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 7 | 0.10 | 0.70 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 6.5 | 0.10 | 0.65 |
| **Total** | | | **6.85** |

Pass threshold not met due to a HIGH-severity correctness defect (code-review feature not actually wired up in the executor's GitHub fetch path). All other categories are strong.

### Verification Summary

| Phase | Result |
|-------|--------|
| Build | (no `build` step) — typecheck stands in |
| Type Check | PASS (`tsc --noEmit`) |
| Lint | SKIP (no lint script defined in package.json) |
| Tests | PASS (432/432, 50 files) |
| Security | n/a (no security scan tool wired) |

Verification overall: READY (no build/test failure), but Scenario Coverage and end-to-end pipeline correctness are not actually exercised by tests — see findings F1.

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | correctness | src/core/step/executor.ts:686-692 | `runPollingStyleStep` ignores `step.resultFilePath()` (already computed at line 680 as `findingsPath`) when fetching from GitHub and instead calls `buildFindingsPath(slug, iteration)` from `spec-review.ts`. This always produces a `spec-review-result-NNN.md` path, regardless of which step is running. When `CodeReviewStep` runs, the executor records `findingsPath = review-feedback-001.md` in state but actually fetches `spec-review-result-000.md` from GitHub — so the agent's actual `review-feedback-NNN.md` is never read. Combined with the `iteration` off-by-one (uses `state.steps[name].length` which is 0 before push, but agents write iteration 1), the production path 404s on first run. Tests pass only because the integration mock matches the path on substring `spec-review-result` and the `code-review` mock currently shares the default `"approved"` verdict — pure coincidence. | Use `step.resultFilePath(state, deps)` (= `findingsPath` at line 680) directly as the GitHub fetch path. Drop the import and call to `buildFindingsPath` inside `executor.ts`. The fetch should be: `await deps.githubClient.getRawFile(..., findingsPath, ...)`. After fixing, tighten the integration test mock to require an exact path match for `review-feedback-001.md` and `spec-review-result-001.md` (substring matching hides bugs); add a regression test that asserts `getRawFile` was called with the path returned by `step.resultFilePath`. |
| 2 | MEDIUM | testing | tests/pipeline-integration.test.ts:178-191 | The mock `getRawFile` matches paths via `filePath.includes("spec-review-result")` / `filePath.includes("review-feedback")`. Because `buildFindingsPath` always returns a string containing `spec-review-result`, the code-review branch of the mock is currently dead — every fetch goes through the spec-review branch. No integration test actually exercises the code-review feedback path. This is what masked F1. | Change the mock to assert exact path equality (or at least `endsWith("review-feedback-001.md")`) and add positive assertions: when `code-review` runs, expect `getRawFile` to be called with `openspec/changes/test-slug/review-feedback-001.md`. Add a test scenario where `codeReviewVerdict !== specReviewVerdict` (e.g. spec-review approved, code-review needs-fix) so the two branches cannot collapse onto the same value. |
| 3 | MEDIUM | testing | tests/pipeline-integration.test.ts (whole file) | No integration test covers the new code-review needs-fix → code-fixer → code-review loop. tasks.md §9.5 claims this is verified, and the unit-level transition table test (TC-017) exists, but a `runPipeline` end-to-end test where code-review returns needs-fix once then approved is missing. The acceptance criteria "code-review が needs-fix を出した時、code-fixer → code-review の loop が max 3 iterations で escalation に遷移する" is only proven via the mocked `Pipeline` test, not via `runPipeline`. | Add a `runPipeline` integration test analogous to TC-011 (spec-review needs-fix → spec-fixer → approved) but for code-review: `codeReviewVerdicts: ["needs-fix", "approved"]`, expect `code-review` length = 2, `code-fixer` length = 1, final `step === "code-review"`, status `success`. Also add a max-iterations exhaustion test producing `CODE_REVIEW_RETRIES_EXHAUSTED`. |
| 4 | MEDIUM | maintainability | src/core/step/code-fixer.ts:67-73 | The `SpecRunnerError` constructor signature in `src/errors.ts` is `(code, hint, message)`, but the code passes arguments in the order `(CODE_FIXER_NO_REVIEW_RESULT, "Ensure code-review step produced openspec/changes/<slug>/review-feedback.md before invoking code-fixer.", "code-fixer requires code-review result but none found")`. So the *hint* contains the actionable instruction (good) and the *message* is a short summary (good) — this is correct usage, but the inline comment / structure is non-obvious because the hint reads like a message and vice versa. Additionally, the hint references `review-feedback.md` (no NNN), which is misleading — agents write `review-feedback-001.md` not `review-feedback.md`. | Either rename the SpecRunnerError ctor parameters in `errors.ts` to `(code, message, hint)` (matches the runtime ErrorInfo shape used elsewhere) and audit all call sites, OR add a code comment in code-fixer.ts explaining the argument order so future maintainers don't swap them. Update the hint string to `Ensure code-review step produced openspec/changes/<slug>/review-feedback-NNN.md` to match the actual artifact naming. |
| 5 | MEDIUM | architecture | src/core/step/executor.ts:17, src/core/step/spec-review.ts:39 | `executor.ts` imports `buildFindingsPath` from `./spec-review.js` and uses it as if it were the universal "result file path builder". This couples the generic executor to a single step's filename convention and is the proximate cause of F1. The executor should not know about any specific step's filename pattern — it should ask the step (`step.resultFilePath`). | Remove the `buildFindingsPath` import from `executor.ts`. The fetch already has `findingsPath = resultFilePath` on line 680 — use it directly. After removal, `buildFindingsPath` becomes a private helper used only inside `spec-review.ts` and can be un-exported, or kept exported only for tests (`tests/core/steps/spec-review.test.ts:193-199` checks the format). |
| 6 | LOW | maintainability | src/core/step/code-review.ts:104-111 | `parseResult` returns `findingsPath: null` with a comment "filled in by StepExecutor after fetch". This pattern is identical to spec-review.ts:91 — fine for symmetry, but the executor doesn't actually fill `findingsPath` from `parsed`; it uses the local `findingsPath` variable. The "// filled in by StepExecutor after fetch" comment is misleading: nothing fills it. | Delete the misleading comment (or replace with: "the executor records findingsPath separately from resultFilePath; this field is only used when parseResult is called outside the executor"). Same cleanup applies to spec-review.ts. |
| 7 | LOW | maintainability | src/prompts/code-review-system.ts:34, src/core/step/code-review.ts:57 | The system prompt instructs the agent to run `git diff main...HEAD` to understand the diff, but the buildMessage instructs the agent to run `git diff main...HEAD --stat` first. Slightly inconsistent — the system prompt should be the authoritative voice and the buildMessage repeats steps. The repetition risks divergence. | Move the step-by-step instructions out of `buildMessage` into the system prompt (system prompt is per-Agent and stable; buildMessage is per-iteration and should only inject iteration-specific context like findingsPath, slug, iteration number). Keep `buildMessage` minimal: just the slug, iteration, findingsPath, and original request. This matches what spec-review does. |
| 8 | LOW | testing | tests/unit/step/code-review.test.ts:144-160 | TC-005 only tests the verdict extraction with all three valid values via three separate `it` blocks. Combined with TC-022 (which already verifies `parseSpecReviewVerdict` delegates), these checks duplicate `tests/unit/parser/review-verdict.test.ts`. Marginal value. | Either keep one happy-path assertion per Step and rely on parser tests for full coverage, or assert that `CodeReviewStep.parseResult` does not contain its own regex (e.g. by snapshot of source text or by spying on `parseReviewVerdict`). Low priority — current coverage is fine, just redundant. |

## Summary

The new `CodeReviewStep` / `CodeFixerStep` are correctly defined as `AgentStep` instances with proper agent definitions, gitWrite capabilities, completionVerdict, transition table extensions, and LOOP_ERROR_CODES entries. The structural symmetry with `spec-review` / `spec-fixer` is excellent. Tests for Step interface compliance (TC-001..TC-010), parser sharing (TC-018..TC-022), and transition table rows (TC-011..TC-016) are thorough.

However, the **end-to-end production path is broken** (F1): the executor's hardcoded `buildFindingsPath` import means code-review's `review-feedback-NNN.md` is never actually fetched in production. The integration tests pass only because the path-substring matcher in the mock (F2) accepts the wrong path. This is a HIGH-severity correctness defect that blocks merge.

The fix is small (1-line change in `executor.ts:690` to use the already-computed `findingsPath`), but it requires adding a regression-style integration test that distinguishes spec-review and code-review verdicts (F3) and tightening the mock matcher (F2) so this class of bug cannot recur silently. After that, the request is approval-ready.

### Iteration Comparison

(initial iteration — no previous feedback)

### Convergence Trend

— (initial)

### Recommendation

`needs-fix` — pass to code-fixer with explicit instruction:

1. (HIGH) Replace `buildFindingsPath(slug, iteration)` on `src/core/step/executor.ts:690` with the already-computed `findingsPath` variable from line 680. Drop the `buildFindingsPath` import on line 17.
2. (MEDIUM) Tighten `tests/pipeline-integration.test.ts` mock matcher to require exact path equality so code-review and spec-review branches cannot collapse.
3. (MEDIUM) Add a `runPipeline` integration test for the code-review needs-fix → code-fixer → code-review loop (analog of TC-011) and an exhaustion test producing `CODE_REVIEW_RETRIES_EXHAUSTED`.
4. (MEDIUM) Update the `code-fixer` hint string to reference `review-feedback-NNN.md` (with the NNN placeholder) instead of the un-numbered `review-feedback.md`.
