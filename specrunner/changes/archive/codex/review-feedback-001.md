# Code Review: Codex Provider Support — Iteration 1

- **date**: 2026-05-14
- **reviewer**: code-reviewer (automated)
- **verdict**: needs-fix

---

## Summary

Production code is correct and complete. All 16 requirements from request.md are implemented. Design decisions (D1–D7) are faithfully translated to code. Backward compatibility is maintained — existing Claude-only configs are unaffected. The full test suite (1797 tests) passes with no regressions.

The blocking issue is **missing must-level test cases** from test-cases.md. Three must scenarios have no test at all; two more are partially covered.

---

## Findings

### [blocker] TC-01 not tested: resultFilePath defined → reads file content

**File**: `tests/adapter/codex/agent-runner.test.ts`

The happy path where `resultFilePath` returns a non-null path and the file **exists on disk** is completely untested. The only result-path tests cover:
- `resultFilePath: null` → uses `turn.finalResponse` (covered)
- `resultFilePath` pointing to a **non-existent** file → `RESULT_FILE_NOT_FOUND` error (covered)

TC-01 (must) requires verifying that `resultContent` equals the file's contents (not `turn.finalResponse`). This is the primary result-reading path in `CodexAgentRunner` and represents critical behavior unique to Codex (vs. Claude's SDK-message-based result extraction).

**Fix**: Add a test that writes a temp file, sets `resultFilePath` to its path, and asserts `result.resultContent` equals the file content and is not equal to `turn.finalResponse`.

---

### [blocker] TC-03 not tested: timeout handling

**File**: `tests/adapter/codex/agent-runner.test.ts`

No test exercises the AbortController timeout path (`completionReason: "timeout"`, `error.code: "STEP_TIMEOUT"`). This is a must scenario.

**Fix**: Add a test where `thread.run()` waits for `AbortSignal` abortion, config sets a short `timeoutMs`, and the result is `{ completionReason: "timeout", error.code: "STEP_TIMEOUT" }`. Use `vi.useFakeTimers()` to avoid wall-clock delay.

---

### [blocker] TC-08 not tested: enrichContext called when defined on step

**File**: `tests/adapter/codex/agent-runner.test.ts`

There is no test verifying that `step.enrichContext()` is called before `step.buildMessage()` and that the enriched `dynamicContext` is passed through. This is a must scenario per test-cases.md and is explicitly required by Req-3 (spec-review baseline diff injection).

**Fix**: Add a test with a step that has `enrichContext: vi.fn().mockResolvedValue(enrichedCtx)` and assert it was called once, and that `buildMessage` received the enriched context.

---

### [minor] TC-09 partially covered: projectContext missing from prompt assertion

**File**: `tests/adapter/codex/agent-runner.test.ts` — test "includes branch and slug in prompt via additionalInstructions"

The test checks that `branch` and `slug` appear in the prompt but does not verify `projectContext` is included. TC-09 (must) requires all three. Given `buildAdditionalInstructions` wraps projectContext in `<project-context>` tags, this is a distinct code path worth asserting.

**Fix**: Add `projectContext: "<project context text>"` to the `makeCtx()` call and assert the prompt contains `"<project context text>"` or `"<project-context>"`.

---

### [minor] TC-11 partially covered: startThread options incomplete

**File**: `tests/adapter/codex/agent-runner.test.ts`

Separate tests verify `workingDirectory` and `sandboxMode` in `startThread` args, but `skipGitRepoCheck: true` and `model` (resolved from config) are not asserted. TC-11 (must) lists all four fields.

**Fix**: In the existing `startThread` option tests (or a combined TC-11 test), add:
```typescript
expect(mockStartThread).toHaveBeenCalledWith(
  expect.objectContaining({
    skipGitRepoCheck: true,
    model: expect.any(String),
  }),
);
```

---

## What is correct

- **CodexAgentRunner** (T4): All production logic correct — prompt building, sandboxMode, skipGitRepoCheck, AbortController, file reading, usage mapping, file-change logging.
- **DispatchingAgentRunner** (T5): Lazy Codex init, OPENAI_API_KEY guard, provider routing — all correct.
- **LocalRuntime** (T6): `createAgentRunner()` returns `DispatchingAgentRunner` wrapping `ClaudeCodeRunner`. `_queryFn` injection preserved. ✅
- **model-registry.ts** (T2): BUILTIN_MODEL_REGISTRY, mergeModelRegistry, resolveProvider all correct and well-tested.
- **schema.ts** (T3): Both guards (unknown model, managed+OpenAI) implemented correctly. Edge case: `runtime === undefined` treated as "managed" (line 334) is correct. `init.test.ts` updated from `claude-haiku-3` → `claude-haiku-4-5` to match the new validation — correct fix.
- **codex-cli.ts** (T7): hasOpenAiSteps merges user-defined models with BUILTIN. Required: true is intentional per D7. ✅
- **Doctor checks index** (T8): codexCliCheck added after gitVersionCheck, exported. ✅
- **Shared prompt builder** (T1): Extracted correctly; ClaudeCodeRunner updated to import from shared. ✅
- **Backward compat**: Default configs (no `models`, no `steps.*.model`) route to ClaudeCodeRunner unchanged. ✅
- **Verification**: `bun run typecheck && bun run test` green (1797 tests pass). ✅

---

## Required fixes

1. Add TC-01 test: `resultFilePath` defined, file exists → `resultContent` equals file content
2. Add TC-03 test: timeout via AbortController → `completionReason: "timeout"`, `code: "STEP_TIMEOUT"`
3. Add TC-08 test: `enrichContext` called once, enriched context passed to `buildMessage`
4. (minor) TC-09: add `projectContext` assertion to existing prompt test
5. (minor) TC-11: add `skipGitRepoCheck: true` and `model` assertions to existing startThread tests
