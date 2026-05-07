# Module Analysis: step-config-externalization

## 1. Existing Code Patterns

**Step definition structure (7 agent steps)**: All 7 step files follow identical pattern:
1. `const *_AGENT_MODEL = "..."` at module top
2. `AgentDefinition` object literal
3. Exported `AgentStep` with `kind: "agent"`, `name`, `agent`, `maxTurns`, `buildMessage()`, `resultFilePath()`, `parseResult()`

maxTurns hardcoded per step: propose=20, spec-review=15, spec-fixer=25, implementer=60, build-fixer=35, code-review=20, code-fixer=30.
model hardcoded in `AgentDefinition.model`: opus for propose/spec-review/code-review, sonnet for others.

**Config resolution pattern**: `getMaxRetries()` in `src/config/getAgentId.ts` is a pure `(config) => value` function. This is the precedent for the new `getStepExecutionConfig()`.

**ClaudeCodeRunner call site** (`agent-runner.ts:124`): `maxTurns: step.maxTurns ?? 30` and `model: step.agent.model` read directly from step object.

**Init pattern**: `runInitLocal()` spreads `existingConfig` and conditionally defaults fields via `??`.

## 2. Division Recommendations

| # | Recommendation | Axis | Evidence |
|---|---------------|------|----------|
| 1 | Create `src/config/step-config.ts` with `ResolvedStepConfig` type and `getStepExecutionConfig()` pure function | SRP | Resolution logic is distinct from schema validation and agent ID lookup |
| 2 | Keep `StepExecutionConfig`, `StepConfigMap` types in `src/config/schema.ts` alongside `SpecRunnerConfig` | cohesion | `SpecRunnerConfig` must reference `StepConfigMap` via `steps?` field |
| 3 | Add `steps?` validation to `validateConfig()` in `schema.ts` | cohesion | All config validation lives in `validateConfig()` |
| 4 | Do not modify `migrate.ts` | coupling | Spread `{...rawConfig}` passes through unknown fields |
| 5 | Do not modify `store.ts` (`saveConfig`) | coupling | Legacy-field stripping doesn't affect new `steps` field |
| 6 | Keep `ClaudeCodeRunner.run()` modification inline (~5 lines) | readability | Single call site, below helper extraction threshold |
| 7 | `runInitLocal()`: add `steps` via existing `??` pattern | readability | Matches `anthropic: existingConfig.anthropic ?? {...}` pattern |
| 8 | New test file `tests/config/step-config.test.ts` | testability | Pure function, no mocks needed, distinct concern from schema validation |

## 3. Existing Helpers

| Helper | File | Relevance |
|--------|------|-----------|
| `getMaxRetries(cfg)` | `src/config/getAgentId.ts` | Same `(config) => value` pattern |
| `validateConfig(raw)` | `src/config/schema.ts` | Add `steps` validation here |
| `applyMigration(raw)` | `src/config/migrate.ts` | No changes needed (spread passthrough) |
| `makeMinimalRawConfig()` | `tests/config/schema.test.ts` | Test helper to extend |

## Notes

- `src/core/step/executor.ts` passes `deps.config` into `AgentRunContext.config` (confirmed config available at runner level)
- `migrate.ts` spread at line 119 preserves unknown fields — no migration logic needed
- `store.ts` legacy stripping is irrelevant to new `steps` field
