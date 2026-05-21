# Test Cases: codex-auth-chain-delegation

## Overview

This change removes `OPENAI_API_KEY` mandatory checks from the Codex adapter layer and delegates authentication entirely to the Codex CLI auth chain. All code changes are already implemented; tests verify the current state is correct.

---

## TC-01: CodexAgentRunner — no OPENAI_API_KEY reference in source

- **Category**: Static Analysis
- **Priority**: must
- **Source**: T1, T2 / request 要件 1-3

**GIVEN** the source directory `src/`  
**WHEN** `grep -rn 'OPENAI_API_KEY' src/` is executed  
**THEN** zero matches are returned

---

## TC-02: CodexAgentRunner — `new Codex()` is constructed with no options

- **Category**: Unit / Code Structure
- **Priority**: must
- **Source**: T2 / request 要件 4-5 / design D1

**GIVEN** `src/adapter/codex/agent-runner.ts`  
**WHEN** the `codexFactory` default is inspected  
**THEN** the factory calls `new Codex()` with no arguments (no `apiKey`, no `OPENAI_API_KEY` passthrough)

---

## TC-03: CodexAgentRunner — injectable factory accepts no env-var args

- **Category**: Unit
- **Priority**: must
- **Source**: T2 / design D1 / request 要件 4-5

**GIVEN** a `CodexAgentRunner` instantiated with a custom `_codexFactory` that returns a mock `CodexInstance`  
**WHEN** `run()` is called with a valid context  
**THEN** the factory is invoked without any API key argument, and the runner completes without error

---

## TC-04: DispatchingAgentRunner — no env-var guard before CodexAgentRunner instantiation

- **Category**: Unit / Code Structure
- **Priority**: must
- **Source**: T3 / request 要件 2-3 / design D2

**GIVEN** `src/adapter/dispatching/agent-runner.ts`  
**WHEN** the `openai` provider branch is inspected  
**THEN** `new CodexAgentRunner()` is called with no arguments and no `MISSING_OPENAI_API_KEY` throw path exists

---

## TC-05: DispatchingAgentRunner — routes openai provider to CodexAgentRunner without env check

- **Category**: Unit
- **Priority**: must
- **Source**: T3 / request 要件 2-3 / design D2

**GIVEN** a `DispatchingAgentRunner` with `OPENAI_API_KEY` unset in the environment  
**WHEN** `run()` is called with a context whose model provider is `"openai"`  
**THEN** execution is delegated to a `CodexAgentRunner` instance without throwing `MISSING_OPENAI_API_KEY`

---

## TC-06: DispatchingAgentRunner — lazy CodexAgentRunner instantiation is idempotent

- **Category**: Unit
- **Priority**: should
- **Source**: T3 / design D2

**GIVEN** a `DispatchingAgentRunner`  
**WHEN** `run()` is called twice with the `openai` provider  
**THEN** the same `CodexAgentRunner` instance is reused (created only once)

---

## TC-07: Doctor codex check — binary present and authenticated → pass

- **Category**: Unit
- **Priority**: must
- **Source**: T4 / request 要件 8 / design D3

**GIVEN** `codex --version` exits 0  
**AND** `codex auth whoami` exits 0  
**WHEN** the codex-cli doctor check is executed  
**THEN** verdict is `pass`

---

## TC-08: Doctor codex check — binary present but not authenticated → warn

- **Category**: Unit
- **Priority**: must
- **Source**: T4 / request 要件 8 / design D3

**GIVEN** `codex --version` exits 0  
**AND** `codex auth whoami` exits non-zero (authentication failure)  
**WHEN** the codex-cli doctor check is executed  
**THEN** verdict is `warn`  
**AND** the message hints at `codex login` or `CODEX_API_KEY`

---

## TC-09: Doctor codex check — binary absent → fail

- **Category**: Unit
- **Priority**: must
- **Source**: T4 / request 要件 8 / design D3

**GIVEN** `codex` binary is not found (`codex --version` fails with command-not-found)  
**WHEN** the codex-cli doctor check is executed  
**THEN** verdict is `fail`

---

## TC-10: Doctor codex check — auth check does not inspect auth source

- **Category**: Unit
- **Priority**: should
- **Source**: T4 / design D3

**GIVEN** `codex auth whoami` exits 0 regardless of which auth source resolved (API key, OAuth, JWT)  
**WHEN** the codex-cli doctor check is executed  
**THEN** verdict is `pass` in all cases (auth source enumeration is not performed)

---

## TC-11: Error propagation — SDK error message is not rewritten

- **Category**: Unit
- **Priority**: must
- **Source**: T5 / request 要件 6-7 / design D4

**GIVEN** the injected `_codexFactory` throws an `Error` with a specific message simulating CLI stderr  
**WHEN** `CodexAgentRunner.run()` is called  
**THEN** the returned result has `code: "CODEX_SDK_ERROR"`  
**AND** `cause.message` equals the original error message (no string interpolation or rewrite)

---

## TC-12: Error propagation — stderr content is preserved in error cause

- **Category**: Unit
- **Priority**: must
- **Source**: T5 / request 要件 6-7 / design D4

**GIVEN** the Codex CLI subprocess exits non-zero with stderr `"authentication required: run codex login"`  
**AND** the SDK wraps this into an Error with that stderr as the message  
**WHEN** `CodexAgentRunner.run()` processes the SDK error  
**THEN** the resulting error's `cause` retains the unmodified stderr string

---

## TC-13: Test code — no OPENAI_API_KEY manipulation in agent-runner tests

- **Category**: Static Analysis / Test Quality
- **Priority**: must
- **Source**: T6 / request 要件 9 / design D5

**GIVEN** `tests/adapter/codex/agent-runner.test.ts`  
**AND** `tests/adapter/dispatching/agent-runner.test.ts`  
**WHEN** both files are inspected for `OPENAI_API_KEY` or `MISSING_OPENAI_API_KEY`  
**THEN** zero matches are found

---

## TC-14: Test code — doctor tests cover all three verdicts

- **Category**: Unit / Test Coverage
- **Priority**: must
- **Source**: T6 / request 要件 11 / design D5

**GIVEN** `tests/core/doctor/checks/runtime/codex-cli.test.ts`  
**WHEN** the test file is inspected  
**THEN** test cases exist for:
- `codex auth whoami` exits 0 → `pass`
- `codex auth whoami` exits non-zero → `warn`
- binary absent → `fail`

---

## TC-15: Claude / managed runtime unaffected

- **Category**: Regression
- **Priority**: must
- **Source**: request 受け入れ基準 / design scope

**GIVEN** a `DispatchingAgentRunner` routing to the `claude` provider  
**AND** `OPENAI_API_KEY` is unset  
**WHEN** `run()` is called  
**THEN** the claude adapter handles the request normally with no error related to `OPENAI_API_KEY`

---

## TC-16: Full build and test suite green

- **Category**: Integration / CI
- **Priority**: must
- **Source**: T7 / request 受け入れ基準

**GIVEN** the current codebase on branch `fix/codex-auth-chain-delegation-7f8a8e00`  
**WHEN** `bun run typecheck && bun run test` is executed  
**THEN** both commands exit 0 with no failures

---

## TC-17: codex login user can run Codex steps without any API key env var

- **Category**: Integration (manual)
- **Priority**: must
- **Source**: request 受け入れ基準 (first bullet)

**GIVEN** `OPENAI_API_KEY` and `CODEX_API_KEY` are both unset  
**AND** `codex login` has been completed (OAuth token in `~/.codex/auth.json`)  
**WHEN** a spec-runner pipeline step with `provider: "openai"` is executed  
**THEN** the step runs successfully using the stored OAuth token

---

## TC-18: CODEX_API_KEY env var is picked up by Codex CLI via process.env inheritance

- **Category**: Integration (manual)
- **Priority**: should
- **Source**: request 受け入れ基準 (second bullet)

**GIVEN** `CODEX_API_KEY` is set in the environment  
**AND** `OPENAI_API_KEY` is unset  
**WHEN** a spec-runner pipeline step with `provider: "openai"` is executed  
**THEN** the Codex CLI subprocess inherits `CODEX_API_KEY` via `process.env` and authenticates successfully

---

## TC-19: OPENAI_API_KEY has no required references remaining in any source file

- **Category**: Static Analysis
- **Priority**: must
- **Source**: T1 / request 要件 3

**GIVEN** the entire `src/` directory tree  
**WHEN** `grep -rn 'OPENAI_API_KEY' src/` is executed  
**THEN** the command returns exit code 1 (no matches) — confirming no lazy-instantiation guard or required check survives
