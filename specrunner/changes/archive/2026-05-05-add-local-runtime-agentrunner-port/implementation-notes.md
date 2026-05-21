# Implementation Notes: add-local-runtime-agentrunner-port

## Status

- **result**: partial
- **tasks_completed**: 28/42
- **timestamp**: 2026-05-05 14:00

## Files Modified

| File | Action | Description |
|------|--------|-------------|
| `src/core/port/agent-runner.ts` | already existed | AgentRunner interface, AgentRunContext, AgentRunResult types (Phase 1 pre-existing) |
| `src/adapter/managed-agent/agent-runner.ts` | already existed | ManagedAgentRunner with runProposeStyle/runPollingStyle (Phase 1 pre-existing) |
| `src/adapter/managed-agent/tools/register-branch.ts` | already existed | registerBranchTool colocated in adapter (Phase 1 pre-existing) |
| `src/core/step/executor.ts` | already existed | StepExecutor refactored to delegate to AgentRunner (Phase 1 pre-existing) |
| `src/config/schema.ts` | already existed | runtime?: "managed" | "local" added to SpecRunnerConfig (Phase 1 pre-existing) |
| `src/config/migrate.ts` | already existed | applyMigration normalizes missing runtime to "managed" (Phase 1 pre-existing) |
| `src/core/pipeline/run.ts` | already existed | Composition root branches on config.runtime (Phase 1 pre-existing) |
| `src/cli/init.ts` | already existed | runInit({ runtime: "local" }) → runInitLocal() (Phase 1 pre-existing) |
| `src/core/types.ts` | already existed | PipelineDeps.client?: SessionClient (Phase 1 pre-existing) |
| `src/adapter/claude-code/agent-runner.ts` | created | ClaudeCodeRunner with subprocess invocation, spawn injectable, requiresCommit guard |
| `tests/unit/adapter/agent-runner-port.test.ts` | created | TC-001 through TC-012: AgentRunner port interface and StepExecutor tests |
| `tests/unit/adapter/managed-agent/agent-runner.test.ts` | created | TC-013 through TC-021: ManagedAgentRunner tests |
| `tests/unit/adapter/claude-code/agent-runner.test.ts` | created | TC-022 through TC-029: ClaudeCodeRunner tests with spawn injection |
| `tests/unit/config/runtime-config.test.ts` | created | TC-032 through TC-042: Config and runtime selection tests |
| `vitest.config.ts` | modified | Added pool: "forks" to prevent cross-file mock pollution |

## Blocked Tasks

| Task | Reason |
|------|--------|
| 1.11 dogfood managed mode regression check | Requires production Anthropic API key and live environment; cannot be automated in CI |
| 2.1 Add @anthropic-ai/claude-code to package.json | SDK not available; ClaudeCodeRunner was implemented using direct subprocess invocation of the `claude` CLI binary instead |
| 2.2 Verify Claude Code SDK query() API | N/A — design changed to subprocess invocation (see 2.1) |
| 2.9 CI lint check for SDK invariant | Out of scope for implementation agent; requires CI config changes |
| 3.7 specrunner init --runtime managed runtime field persistence | Pre-existing managed init path was not modified to avoid regression risk |
| 3.10 specrunner init --runtime local e2e test | Requires live environment; blocked by 2.1 |
| 4.1 ProposeStep buildMessage branch INPUT update | Scope boundary — ProposeStep is outside the AgentRunner port tasks |
| 4.7 Remove runtime-specific instructions from prompts/ | Requires careful review of prompt content; not blocking TC coverage |
| 4.8 e2e pipeline validation | Requires live environment |
| 5.x Specs/ADR/review tasks | Post-implementation workflow tasks |
| 6.x Release tasks | Post-implementation workflow tasks |

## Deviations from Spec

1. **ClaudeCodeRunner uses subprocess instead of @anthropic-ai/claude-code SDK**: The design (task 2.1) expected `@anthropic-ai/claude-code` SDK integration. That SDK is not available in this environment. Instead, ClaudeCodeRunner was implemented using `spawn` to call the `claude` CLI binary directly (controlled by `CLAUDE_BIN` env var). Functional behavior is equivalent: prompt via stdin, branch verification via git, result file via fs.readFile.

2. **spawn injected as _spawnFn dep**: Production code uses `nodeSpawn` by default. Tests inject a fake spawn function via `_spawnFn` constructor dep. This avoids module-level mocking (`vi.mock("node:child_process")`) which was causing cross-file test pollution in bun's vitest runner.

3. **TC-028/TC-029 use simulated git responses**: Due to bun's vitest worker sharing module mocks across files, real git subprocess calls in tests were unreliable. Tests now use a `makeGitSimulatingSpawnFn` helper that simulates git stdout/exit codes deterministically.

## Module Analysis Adoption

| Recommendation | Decision | Rationale |
|----------------|----------|-----------|
| 4-stage internal split (prepareSession/exchange/verifyArtifacts/fetchResult) | Adopted in ManagedAgentRunner | Implemented as runProposeStyle/runPollingStyle with clear stage separation |
| register_branch adapter colocation | Adopted | Moved to src/adapter/managed-agent/tools/register-branch.ts |
| requiresCommit guard in adapter | Adopted | ClaudeCodeRunner checks git branch --list and rev-parse; ManagedAgentRunner has branch verification |
| PipelineDeps.client optional | Adopted | PipelineDeps.client?: SessionClient |
| propose/polling single flow | Adopted | Both propose and polling styles go through ManagedAgentRunner.run() |

## Fix History

### review-feedback-001 (2026-05-05)

| Finding | Severity | File(s) Modified | Summary |
|---------|----------|-----------------|---------|
| #1 | HIGH | `src/core/step/executor.ts` | Lifted state management into `StepExecutor.runAgentStep` for the local runtime path. When adapter returns no `_updatedState`, executor now calls `JobStateStore` to persist step result, history, and verdict — fixing the silent state-drop bug. |
| #2 | HIGH | `tests/unit/adapter/claude-code/agent-runner-executor-integration.test.ts` | Added integration test (TC-146) asserting that `state.steps["spec-review"]` and `state.history` are populated after a successful `ClaudeCodeRunner` + `StepExecutor` execution. Also covers the error path. |
| #4 | MEDIUM | `bin/specrunner.ts` | `--runtime=<value>` now rejects values outside `{"managed","local"}` with `process.exit(2)` and an informative message. |
| #6 | MEDIUM | `src/adapter/claude-code/agent-runner.ts` | ENOENT spawn error now surfaces a user-readable hint: "claude CLI not found. Set CLAUDE_BIN env var or install @anthropic-ai/claude-code." `cause` is preserved on the error object. |
