# Design: codex-auth-chain-delegation

## Investigation Summary

`grep -rn 'OPENAI_API_KEY' src/` returns **zero matches**. All source code, tests, and baseline specs are already clean. The archived `codex-auth-fix` change (PR #231) and subsequent PRs have already completed the work described in the request.

This design documents the current (already-correct) state and defines verification tasks to confirm all acceptance criteria hold.

## Current State (already implemented)

### D1: `CodexAgentRunner` — option-less `new Codex()`

`src/adapter/codex/agent-runner.ts` line 79:

```ts
this.codexFactory = deps._codexFactory ?? (() => new Codex() as unknown as CodexInstance);
```

No `apiKey` parameter. `process.env` is inherited by the Codex CLI subprocess as-is.

### D2: `DispatchingAgentRunner` — no OPENAI_API_KEY guard

`src/adapter/dispatching/agent-runner.ts` lines 32-35:

```ts
if (provider === "openai") {
  if (!this.codexRunner) {
    this.codexRunner = new CodexAgentRunner();
  }
  return this.codexRunner.run(ctx);
}
```

Lazy instantiation with no env-var check. The `MISSING_OPENAI_API_KEY` error path (from the original codex change) has been removed.

### D3: `codex-cli` doctor check — `codex auth whoami`

`src/core/doctor/checks/runtime/codex-cli.ts` lines 58-72:

1. `codex --version` — binary presence (fail if absent)
2. `codex auth whoami` — auth status (warn if not authenticated, hint: `codex login` or `CODEX_API_KEY`)

The check does not inspect which auth source is in use — that is Codex CLI's responsibility.

### D4: Error propagation — unmodified stderr

`CodexAgentRunner.run()` catches SDK errors and returns them with `code: "CODEX_SDK_ERROR"`, preserving the original `cause.message` (which contains CLI stderr). No message rewriting.

### D5: Tests — no OPENAI_API_KEY mocks

- `tests/adapter/codex/agent-runner.test.ts` — uses injectable `_codexFactory`, no env-var manipulation
- `tests/adapter/dispatching/agent-runner.test.ts` — routes by model provider, no env-var manipulation
- `tests/core/doctor/checks/runtime/codex-cli.test.ts` — covers pass/warn/fail verdicts for `codex auth whoami`

## Delta Spec

Not required. Baseline specs (`specrunner/specs/`) contain no `OPENAI_API_KEY` references. The old `dispatching-agent-runner` delta-spec requirements #5 and #6 (OPENAI_API_KEY lazy check / MISSING_OPENAI_API_KEY throw) were in the archived `codex` change and have already been superseded.

## Files Changed

None. All acceptance criteria are already satisfied in the current codebase.

## Risk Assessment

**Low**. This is a verification-only pass. No code changes are proposed.
