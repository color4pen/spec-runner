# Implementation Notes: review-exit-contract

## Summary

- **result**: partial
- **tasks_completed**: 22/24 (tasks 8.3-8.4 blocked: E2E dogfooding requires real Anthropic API session)
- **test_cases_implemented**: TC-001, TC-002, TC-003, TC-004, TC-005, TC-006, TC-007, TC-008, TC-009, TC-010, TC-012, TC-016 = 12 must/should automated; TC-019 blocked (e2e); TC-021 manual (see Blocked Tasks)

---

## Files Modified

### Source Files

| Path | Operation | Summary |
|------|-----------|---------|
| `src/errors.ts` | modified | `specReviewResultNotFoundError` signature → `(slug, branch, iteration: number)`; new `codeReviewResultNotFoundError(slug, branch, iteration: number)`; new `CODE_REVIEW_RESULT_NOT_FOUND` error code |
| `src/core/step/executor.ts` | modified | Import `codeReviewResultNotFoundError`; pass computed `iteration` to error factories; dispatch `code-review` → `codeReviewResultNotFoundError`, others → `specReviewResultNotFoundError` |
| `src/core/step/code-review.ts` | modified | `capabilities: { gitWrite: true }`; updated comment explaining Managed Agents deviation; added `branch` param to `buildCodeReviewInitialMessage`; embeds `buildGitPushInstruction(branch)` in user message |
| `src/core/step/spec-review.ts` | modified | Added `capabilities: { gitWrite: true }` with comment; pass `branch: state.branch ?? undefined` to `buildSpecReviewInitialMessage` |
| `src/prompts/spec-review-system.ts` | modified | Added `import { buildGitPushInstruction }`; added `branch?: string` to `SpecReviewPromptInput`; added `{{GIT_PUSH_INSTRUCTION}}` placeholder in template; `buildSpecReviewInitialMessage` embeds `buildGitPushInstruction(branch)` when branch is provided; system prompt Delivery section with commit/push/end_turn instructions |
| `src/prompts/implementer-system.ts` | modified | Added "パイプライン上の位置づけ" section: stage 3 (implementer), 次工程 verification, その次 code-review, build/test/lint は次工程に渡す (positive framing, Japanese) |

### New Files

| Path | Operation | Summary |
|------|-----------|---------|
| `openspec-workflow/adr/ADR-20260430-review-exit-contract-managed-agents.md` | created | ADR documenting agent-driven push deviation from openspec-workflow's orchestrator-driven commit |

### Test Files

| Path | Operation | TC Coverage |
|------|-----------|------------|
| `tests/unit/step/review-exit-contract.test.ts` | created | TC-001, TC-002, TC-003, TC-004, TC-005, TC-006, TC-007, TC-008, TC-009, TC-010, TC-016 supplement |
| `tests/prompts/implementer-system.test.ts` | created | TC-012 (implementer prompt workflow context) |
| `tests/unit/step/code-review.test.ts` | modified | TC-003 updated: `gitWrite` expectation changed from falsy to `true`; buildMessage test updated to expect commit/push |

---

## Blocked Tasks

| Task | TC | Reason |
|------|----|--------|
| T-8.3 dogfooding E2E run | TC-021 (manual) | Requires real `bun bin/specrunner.ts run /tmp/dogfooding-001-request.md` with Anthropic API credentials and real GitHub repo. CI environment cannot execute this. **Manual verification step**: after merging, run `bun bin/specrunner.ts run /tmp/dogfooding-001-request.md`, inspect job state log to confirm spec-review agent pushed before end_turn. |
| T-8.4 session event log verification | TC-021 (manual) | Companion to T-8.3. |
| TC-019 | e2e / must | Requires real spec-review agent session and GitHub API push verification. Category "e2e" with must priority. The prompt and capability changes ensure the agent will push, but automated verification requires a live session. Mark for dogfooding validation. |

---

## Test Statistics

- **Total tests**: 529 passing (was 491 before this change; +38 new)
- **Typecheck**: clean (0 errors)
- **Must TCs implemented**: 12/13 (TC-019 blocked — e2e)
- **Build**: not run (no build script in lint position; `bun run typecheck` passes)
