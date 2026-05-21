# Tasks: codex-auth-chain-delegation

All source code changes are already implemented. Tasks below are **verification-only**.

## T1: [x] Verify zero `OPENAI_API_KEY` references in `src/`

- **ref**: request 要件 1-3, design D1-D2
- **verify**: `grep -rn 'OPENAI_API_KEY' src/` returns zero matches
- **action**: If any match is found, delete the reference and its associated logic

## T2: [x] Verify `new Codex()` is option-less

- **ref**: request 要件 4-5, design D1
- **file**: `src/adapter/codex/agent-runner.ts`
- **verify**: Constructor calls `new Codex()` with no `apiKey` parameter
- **verify**: No `process.env["OPENAI_API_KEY"]` or `process.env["CODEX_API_KEY"]` reads exist in the file

## T3: [x] Verify `DispatchingAgentRunner` has no env-var guard

- **ref**: request 要件 2-3, design D2
- **file**: `src/adapter/dispatching/agent-runner.ts`
- **verify**: `new CodexAgentRunner()` is called with no arguments
- **verify**: No `MISSING_OPENAI_API_KEY` error path exists

## T4: [x] Verify doctor `codex auth whoami` check

- **ref**: request 要件 8, design D3
- **file**: `src/core/doctor/checks/runtime/codex-cli.ts`
- **verify**: Binary presence check (`codex --version`) followed by auth check (`codex auth whoami`)
- **verify**: pass if authenticated, warn if not (with hint mentioning `codex login` and `CODEX_API_KEY`)
- **verify**: fail if binary not found

## T5: [x] Verify error propagation preserves stderr

- **ref**: request 要件 6-7, design D4
- **file**: `src/adapter/codex/agent-runner.ts`
- **verify**: SDK errors are wrapped with `code: "CODEX_SDK_ERROR"` and original `cause` is preserved
- **verify**: No message rewriting or string interpolation on the error message

## T6: [x] Verify tests have no `OPENAI_API_KEY` mocks

- **ref**: request 要件 9-11, design D5
- **files**:
  - `tests/adapter/codex/agent-runner.test.ts`
  - `tests/adapter/dispatching/agent-runner.test.ts`
  - `tests/core/doctor/checks/runtime/codex-cli.test.ts`
- **verify**: No `process.env["OPENAI_API_KEY"]` manipulation in any test
- **verify**: No `MISSING_OPENAI_API_KEY` assertion in any test
- **verify**: Doctor test covers pass/warn/fail verdicts for `codex auth whoami`

## T7: [x] Run `bun run typecheck && bun run test`

- **ref**: 受け入れ基準
- **action**: Execute and confirm green
