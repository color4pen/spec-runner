# Code Review: codex-auth-chain-delegation — Iteration 1

## Summary

- **verdict**: approved
- **scope**: verification-only pass (implementation was already complete prior to this change)
- **files changed**: spec/planning files only (design.md, tasks.md, test-cases.md, spec-review-result-001.md, verification-result.md, request.md)
- **source changes**: 0 files

---

## Context

`design.md` states up front that `grep -rn 'OPENAI_API_KEY' src/` returns zero matches and all acceptance criteria were already satisfied before this change was proposed (via PR #231 and subsequent work). This branch adds spec artifacts only. Verified against actual codebase.

---

## Acceptance Criteria Verification

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | `OPENAI_API_KEY` / `CODEX_API_KEY` unset + `codex login` → Codex steps run | ✅ pass | `new Codex()` option-less; process.env inherited as-is |
| 2 | `CODEX_API_KEY` in env → CLI uses it | ✅ pass | No filtering of env vars; process.env passed through |
| 3 | `OPENAI_API_KEY` required refs deleted from adapters | ✅ pass | `grep src/` returns 0 matches |
| 4 | `specrunner doctor` checks `codex auth whoami` | ✅ pass | `codex-cli.ts` lines 58–72 |
| 5 | Auth error → CLI stderr displayed unmodified | ✅ pass | `new Error(cause.message)` + `{ cause }` — no rewrite |
| 6 | Claude / managed runtime unaffected | ✅ pass | `DispatchingAgentRunner` routes by provider; Claude path unchanged |
| 7 | `bun run typecheck && bun run test` green | ✅ pass | verification-result.md: 157 files, 1875 tests, all pass |

---

## Implementation Review

### D1 — `CodexAgentRunner` option-less `new Codex()`

`src/adapter/codex/agent-runner.ts` line 79:
```ts
this.codexFactory = deps._codexFactory ?? (() => new Codex() as unknown as CodexInstance);
```
No `apiKey` argument. ✅

### D2 — `DispatchingAgentRunner` no env guard

`src/adapter/dispatching/agent-runner.ts` lines 32–36:
```ts
if (provider === "openai") {
  if (!this.codexRunner) {
    this.codexRunner = new CodexAgentRunner();
  }
  return this.codexRunner.run(ctx);
}
```
No env-var check, no `MISSING_OPENAI_API_KEY` path. ✅

### D3 — Doctor check `codex auth whoami`

`src/core/doctor/checks/runtime/codex-cli.ts`:
- `codex --version` → binary presence (`fail` if absent) ✅
- `codex auth whoami` → authenticated → `pass`; unauthenticated → `warn` with `codex login` / `CODEX_API_KEY` hint ✅

### D4 — Error propagation

```ts
const cause = err as Error;
return {
  completionReason: "error",
  resultContent: null,
  error: Object.assign(
    new Error(cause.message),
    { code: "CODEX_SDK_ERROR", cause },
  ),
};
```
Message copied verbatim; `cause` preserved. No rewrite. ✅

---

## Test Coverage vs test-cases.md (must scenarios)

| TC | Priority | Coverage | Notes |
|----|----------|----------|-------|
| TC-01 | must | ✅ static verify | `grep src/` = 0 matches |
| TC-02 | must | ✅ code inspection | line 79 |
| TC-03 | must | ✅ unit test | injectable `_codexFactory`, no env-var args |
| TC-04 | must | ✅ code inspection | no env guard in dispatching runner |
| TC-05 | must | ⚠️ indirect | dispatching test routes openai model away from claudeRunner, but does not explicitly unset `OPENAI_API_KEY` in env — acceptable since source has no env check at all |
| TC-07 | must | ✅ unit test | codex-cli.test.ts: pass case |
| TC-08 | must | ✅ unit test | codex-cli.test.ts: warn case |
| TC-09 | must | ✅ unit test | codex-cli.test.ts: fail case |
| TC-11 | must | ✅ unit test | `error.message` contains original SDK error message |
| TC-12 | must | ⚠️ partial | Test asserts `result.error?.message` contains original; does NOT assert `result.error?.cause?.message`. The implementation sets `cause` correctly (code inspection confirms), but the test assertion stops at the outer error message. |
| TC-13 | must | ✅ static verify | 0 `OPENAI_API_KEY` refs in test files |
| TC-14 | must | ✅ unit test | pass/warn/fail all covered |
| TC-15 | must | ✅ unit test | anthropic routing test in dispatching suite |
| TC-16 | must | ✅ CI | verification-result.md green |
| TC-19 | must | ✅ static verify | `grep src/` exit 1 |

**Should-priority gaps (acceptable):**
- TC-06: lazy `codexRunner` idempotency (same instance on second call) — not tested
- TC-10: auth check source-agnosticism — not tested

---

## Findings

### F-01 — LOW — TC-12 cause-chain assertion missing

**Location**: `tests/adapter/codex/agent-runner.test.ts` — "returns error when Codex SDK throws"

**Issue**: TC-12 (must) requires asserting that `error.cause` retains the original stderr string. The current test checks `result.error?.message` (outer) but never checks `result.error?.cause?.message`. The implementation is correct—`Object.assign(..., { cause })` preserves the original Error—but the test could be strengthened:

```ts
// add to existing test:
expect((result.error as { cause?: Error })?.cause?.message).toBe("network failure");
```

**Severity**: Low — correctness is verifiable by code inspection; this is a test depth gap, not a bug.

### F-02 — LOW — TC-06 idempotency not tested

**Location**: `tests/adapter/dispatching/agent-runner.test.ts`

**Issue**: TC-06 (should) requires verifying that the same `CodexAgentRunner` instance is reused across two `run()` calls for the openai provider. The implementation uses a `private codexRunner: CodexAgentRunner | null = null` guard that clearly satisfies this, but no test validates it.

**Severity**: Low — implementation is trivially correct from code inspection; should-priority gap.

---

## Overall Assessment

The implementation is complete and correct. All acceptance criteria are satisfied. The 1875-test suite is green. The two findings are test coverage depth gaps (one at "must" TC level, one at "should"), not implementation defects. The core correctness of error propagation (D4) and auth delegation (D1–D3) can be directly verified in source.

- **verdict**: approved
