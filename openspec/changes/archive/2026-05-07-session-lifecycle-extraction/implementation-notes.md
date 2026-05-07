# Implementation Notes: session-lifecycle-extraction

## Status

- **result**: completed
- **tasks_completed**: 22/22
- **timestamp**: 2026-05-07 23:22

## Files Modified

| File | Action | Description |
|------|--------|-------------|
| `src/core/runtime/strategy.ts` | Created | RuntimeStrategy interface + supporting types (QueryOptions, WorkspaceOptions, WorkspaceContext, CleanupHandle) |
| `src/core/runtime/local.ts` | Created | LocalRuntime: worktree lifecycle, ClaudeCodeRunner, signal-handler cleanup |
| `src/core/runtime/managed.ts` | Created | ManagedRuntime: SessionClient, ManagedAgentRunner, no-op workspace/cleanup |
| `src/core/runtime/factory.ts` | Created | createRuntime() factory — single location for config.runtime branching |
| `src/core/runtime/index.ts` | Created | Barrel export for runtime module |
| `src/core/command/runner.ts` | Created | CommandRunner abstract class (Template Method) + output helpers |
| `src/core/command/pipeline-run.ts` | Created | PipelineRunCommand: prepare() for run command |
| `src/core/command/resume.ts` | Created | ResumeCommand: prepare() for resume command with PrepareError for exit code 2 |
| `src/core/command/index.ts` | Created | Barrel export for command module |
| `src/core/types.ts` | Modified | Added `runner?: AgentRunner` to PipelineDeps |
| `src/core/pipeline/run.ts` | Modified | Removed config.runtime branches; uses deps.runner directly |
| `src/cli/run.ts` | Modified | Slimmed to 46 lines: preflight + createRuntime + PipelineRunCommand |
| `src/cli/resume.ts` | Modified | Slimmed to 47 lines: loadConfig + createRuntime + ResumeCommand |
| `tests/pipeline.test.ts` | Modified | Added runner field (ManagedAgentRunner) to PipelineDeps in all runProposePipeline calls |
| `tests/pipeline-integration.test.ts` | Modified | Added runner field to PipelineDeps in all runPipeline calls |
| `tests/unit/config/runtime-config.test.ts` | Modified | TC-036: updated to check factory.ts instead of run.ts |
| `tests/unit/core/runtime/local.test.ts` | Created | TC-LR-001 to TC-LR-007: LocalRuntime unit tests |
| `tests/unit/core/runtime/managed.test.ts` | Created | TC-MR-001 to TC-MR-004: ManagedRuntime unit tests |
| `tests/unit/core/runtime/factory.test.ts` | Created | TC-RT-001 to TC-RT-003: createRuntime factory tests |
| `tests/unit/core/command/runner.test.ts` | Created | TC-CR-001 to TC-CR-005: CommandRunner template method tests |

## Blocked Tasks

None. All 22 tasks completed.

## Deviations from Spec

1. **spec-review finding #1 (MEDIUM)**: `prepare()` in `PipelineRunCommand` does NOT call `runPreflight()`. Preflight is done in `run.ts` before constructing `PipelineRunCommand`, and the result is passed to the constructor. This matches the finding's recommended fix: `constructor(runtime, preflightResult, options)`.

2. **spec-review finding #4 (MEDIUM)**: `query()` return type uses `AsyncGenerator<unknown>` (not `AsyncGenerator<Message>`) since `Message` type is not yet defined. Comment in strategy.ts notes this is intentional pending dialog implementation.

3. **resume.ts config loading**: `resume.ts` loads config once (to create runtime) and `ResumeCommand.prepare()` loads it again. This double-load exists because `createRuntime()` for `ManagedRuntime` needs `repo` at construction time, and `repo` comes from job state which is also loaded in `runResumeCore`. Avoiding this would require restructuring the RuntimeStrategy interface. Noted as future cleanup.

4. **PrepareResult**: `verbose` included (not `events` as in design.md). `EventBus` is created inside `execute()` per request.md requirement 14. This matches the spec-review finding #2 recommendation.

5. **`runProposePipeline` dead code check**: Confirmed NOT dead code — used in 8 tests in pipeline.test.ts. Internal runtime branch resolved via deps.runner.

## Module Analysis Adoption

対象なし（module-analysis.md は本 request に含まれない）

## Fix History

(初回実装 — 修正なし)
