# Design: AgentRunner Contract Tests

## Context

`AgentRunner` port is implemented by two local adapters (`ClaudeCodeRunner`, `CodexAgentRunner`) and one remote adapter (`ManagedAgentRunner`). Behavioral contracts shared across local adapters are currently enforced only in per-adapter unit test files. When a second adapter (codex) was introduced, three contract gaps appeared undetected in production (2026-06-12): transient retry, completion report injection, and resumePrompt injection.

Root cause: the port type (`run(ctx) → AgentRunResult`) does not encode behaviors like prompt mutation, event emission, or file I/O. Per-adapter tests only cover contracts the author knew to write; a shared suite would catch omissions mechanically.

Existing precedent: `tests/unit/contract/` already contains cross-cutting tests (`golden-cases.test.ts`, `invariants.test.ts`). This change adds a new file to that directory.

Current code state:
- All 5 target contracts are implemented in both `ClaudeCodeRunner` and `CodexAgentRunner`
- Both adapters share `SessionLogWriter` (logPath), `retryWithBackoff` (transient retry), and `buildResumeSection` (resumePrompt) from `src/adapter/shared/`
- No source files are modified by this change

## Goals / Non-Goals

**Goals**:
- Shared contract suite executing the same 5 behavioral assertions against both local adapters
- Registration completeness gate: new local adapters in `src/adapter/*/agent-runner.ts` are automatically detected if not registered
- managed-agent explicitly excluded with rationale recorded

**Non-Goals**:
- Adapter implementation changes (test failures trigger separate bug-fix requests per scope)
- Port interface type changes
- managed-agent coverage in this suite

## Decisions

**D1: Suite location** — New file `tests/unit/contract/agent-runner-contracts.test.ts`. Colocated with existing contract tests; consistent with project convention.

**D2: RunnerFixture interface** — Each adapter is represented by a `RunnerFixture` object providing four adapter-specific mock builders: `makeCapturingPrompt`, `makeWithReportToolSuccess`, `makeWithTransientError`, and `makeCountingInvocations`. A shared function `describeAgentRunnerContracts(fixture)` runs 5 contract `describe` blocks against each fixture.

Rationale: the assertion logic is shared (operates on `AgentRunResult` and emitted events); mock construction is adapter-specific (different injectable seams). Separating them avoids coupling assertions to adapter internals.

Alternative considered: single parameterized test using union types — rejected because each adapter's mock requires different injectable types (`_queryFn` vs `CodexInstance`), forcing type narrowing inside assertions.

**D3: Registration completeness via filesystem scan** — The completeness test reads `src/adapter/` with `fs.readdirSync`, filters for directories containing `agent-runner.ts`, excludes non-local dirs (`managed-agent`, `github`, `shared`, `dispatching`), and asserts each is present in `REGISTERED_LOCAL_RUNNERS`.

Rationale: when a new adapter directory is added, the scan fails automatically without requiring maintainers to update a separate hardcoded list. Only one update is required: adding the fixture to `REGISTERED_LOCAL_RUNNERS`.

Alternative considered: exported `LOCAL_ADAPTER_NAMES` constant from `src/adapter/` — rejected (production code for test-only purposes).

**D4: managed-agent excluded** — `ManagedAgentRunner` requires a live Managed Agents REST API. It has no `logPath` behavior (no local file I/O), no `config.transientRetry` (retry governed by HTTP client layer), and no `postWorkPrompts` execution (remote agent session is a single invocation). Running the local contract suite against it is structurally impossible without a running managed service. Managed adapter contract coverage belongs to a separate integration suite.

**D5: Mock strategies per contract**

| Contract | ClaudeCodeRunner mock | CodexAgentRunner mock |
|---|---|---|
| resumePrompt | `_queryFn` captures `params.prompt` on first call | `CodexThread.runStreamed` captures `prompt` arg on first call |
| reportTool | `_createMcpServerFn` captures handler; `_queryFn` calls handler with `{ok:true}` before yielding result (TC-019 pattern) | `runStreamed` yields `agent_message` item with `text: '{"ok":true}'` as `finalResponse` |
| transient retry | `_queryFn` throws `new Error("ECONNREFUSED")` on first call, succeeds on second | `runStreamed` throws `new Error("ECONNREFUSED")` on first call, succeeds on second |
| logPath | set `ctx.session.logPath`; `SessionLogWriter` creates file during run | same (shared `SessionLogWriter`) |
| postWorkPrompts | count `_queryFn` invocations; follow-up uses `resume` option but same function | count `runStreamed` invocations on mock thread |

**D6: reportTool mock for ClaudeCodeRunner** — Uses the `_createMcpServerFn` injectable (same as TC-019 in `tests/unit/adapter/claude-code/agent-runner.test.ts`). The mock captures the tool handler via closure; the mock `_queryFn` calls it before yielding the success result message. No new testing mechanism is introduced.

**D7: postWorkPrompts for ClaudeCodeRunner** — The follow-up turn uses `runFollowUpQueryWithRetry`, which calls `_queryFn` again with `resume: session_id` in options. The counting mock must yield `session_id: "test-session"` in its result so that `extractedSessionId` is set and `shouldRunFollowUp` allows the loop to execute.

## Risks / Trade-offs

[Risk] Filesystem scan exclusion list must be maintained when a new non-local directory is added to `src/adapter/`.
→ Mitigation: the exclusion list is co-located with `REGISTERED_LOCAL_RUNNERS` in the test file; the PR that adds a non-local directory is also the PR that updates the list.

[Risk] ClaudeCodeRunner postWorkPrompts count depends on `session_id` present in the mock result.
→ Mitigation: the mock success result yields `session_id: "test-session"` (matching the established pattern in existing claude-code unit tests), making the dependency explicit.

## Open Questions

None. All design decisions are resolved.
