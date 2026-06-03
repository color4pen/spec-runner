# Code Review Feedback — iteration 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended. The verdict line is the authoritative decision.
-->

- **verdict**: needs-fix
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | HIGH | architecture | `src/core/pipeline/types.ts`, `src/core/pipeline/pipeline.ts` | `CONFORMANCE_RETRIES_EXHAUSTED` never fires. The conformance loop path is conformance → needs-fix → implementer → verification → code-review → conformance. `loopIters("verification")` increments each cycle alongside `loopIters("conformance")`. After conformance runs N times (N = maxIterations), the guard `nextLoopIter >= maxIterations` fires on `nextStep = "verification"` (not "conformance"), producing `VERIFICATION_RETRIES_EXHAUSTED` with a misleading hint. spec.md requires "the pipeline SHALL escalate with error code `CONFORMANCE_RETRIES_EXHAUSTED`". Acceptance criteria require conformance itself to exhaust. | Check conformance's own loop count immediately when conformance returns `needs-fix` — before handing off to implementer — and escalate then. Alternatively, route `conformance needs-fix → code-review` (skipping implementer/verification) to avoid the counter conflict; or reset verification/code-review counters on conformance-triggered retry entry. | yes |
| 2 | MEDIUM | testing | `tests/unit/core/step/conformance.test.ts` | TC-008 "conformance exceeds max iterations escalates" (must/unit) has no pipeline simulation. `LOOP_ERROR_CODES` structure and `STANDARD_LOOP_NAMES` membership are verified, but the actual loop exhaustion behavior is untested. Analogous pipeline mock tests exist for verification (TC-015) and code-review (TC-017) — the equivalent for conformance is absent. F1 would not be caught by the current test suite. | Add a pipeline mock test: create a `Pipeline` with conformance in `loopNames`, have conformance always return `needs-fix`, route back to conformance directly, and assert `result.error?.code === "CONFORMANCE_RETRIES_EXHAUSTED"` after `maxIterations` runs. | yes |
| 3 | LOW | maintainability | `src/prompts/rules.ts` | "Pipeline Structure" section still reads "9 step (うち 7 agent step + 2 CLI step)" and does not list the conformance step. The "責任範囲" table has no conformance row. Every new change folder will receive a stale `rules.md` that misrepresents the pipeline structure agents operate within. After this PR: 10 agent steps + 2 CLI steps = 12 total. | Add `10. conformance — 実装適合確認（code-review approved 後）` to the numbered list, update the step count description, and add a conformance row to the "責任範囲" table with `Touch 可能: conformance-result file のみ`, `禁止: source code (read-only review)`. | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 5 | 0.30 |
| security | 8 | 0.25 |
| architecture | 4 | 0.15 |
| performance | 8 | 0.10 |
| maintainability | 6 | 0.10 |
| testing | 5 | 0.10 |

- **total**: 6.00

## Summary

The overall implementation is solid: all tasks T-01 through T-08 are marked complete and verified. The transition table correctly removes direct code-review → adr-gen and code-fixer → adr-gen edges. STEP_NAMES, AGENT_STEP_NAMES, conformanceResultPath, ConformanceStep properties (kind, name, reportTool, maxTurns, needsProjectContext), LOOP_ERROR_CODES structure, and code-review-system.ts spec reference are all correct. `bun run typecheck && bun run test` is green (3078 tests pass).

The blocking issue is F1: `CONFORMANCE_RETRIES_EXHAUSTED` is architecturally unreachable. Because the conformance retry cycle passes through `verification` (a shared loop step) on every iteration, verification's counter hits `maxIterations` first and emits `VERIFICATION_RETRIES_EXHAUSTED`. The conformance guard (`nextStep === "conformance" && loopIters("conformance") >= maxIterations`) never fires because the pipeline escalates on `nextStep = "verification"` before reaching that check. This directly violates the spec requirement and the acceptance criteria for loop exhaustion semantics.
