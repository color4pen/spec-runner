# build-fixer Decision Log: 2026-04-29-d4-d6-agent-migration

## Summary
Fixed 29 TypeScript build errors caused by test files referencing the old agent schema.
Post-fix build status: **0 errors**, all 71 fixed tests passing.

## Decision Log

### Config Schema: Old Shape → New Shape
- Old: `config.agent: { id, definitionHash, lastSyncedAt }` (singular)
- New: `config.agents: Record<StepName, AgentRecord>` where `AgentRecord = { agentId, definitionHash, lastSyncedAt }`
- Decision: Update all test fixtures to use new canonical shape :: Required for type compatibility with SpecRunnerConfig interface

### Step.agent: Old Shape → AgentDefinition
- Old: `agent: { agentId: string }` (minimal mock)
- New: `agent: AgentDefinition` with `name, role, model, system, tools` fields
- Decision: Replace old agent mocks with complete AgentDefinition objects :: AgentDefinition is the required type per Step interface (D1 design)

### vi.fn Type Arguments
- Old: `vi.fn<[T1, T2], ReturnType>()`
- New: `vi.fn()` without type args
- Decision: Remove vitest type arguments from vi.fn calls :: vitest 4.1.5 does not support this syntax for vi.fn, only use vi.fn() and let TypeScript infer

### Cast Through `unknown` Intermediary
- Applied to: `SpecRunnerConfig as Record<string, unknown>` and similar
- Fix: `SpecRunnerConfig as unknown as Record<string, unknown>`
- Decision: Add `as unknown` intermediary cast :: Allows casting between incompatible types (e.g., types without index signature to Record<string, unknown>)

## Files Modified

### Test Files
- `tests/error-codes.test.ts`: Updated config shape and Step.agent shape in 2 test cases
- `tests/spec-review-fetch.test.ts`: Updated config shape in buildDeps helper
- `tests/state-store.test.ts`: Added agents field to partial config
- `tests/core/pipeline/pipeline.test.ts`: Updated config shape in makeMinimalDeps; updated 2 Step.agent mocks
- `tests/unit/agent/syncer.test.ts`: Removed type args from vi.fn declarations (4 places)
- `tests/unit/agent/syncer-rollback.test.ts`: Removed type args from vi.fn declarations (3 places total)
- `tests/unit/step/agent-definition.test.ts`: Added `as unknown` intermediary cast for AgentDefinition cast

### Source Files
- `src/config/migrate.ts`: Added `as unknown` intermediary cast on line 112
- `src/adapter/anthropic/anthropic-client.ts`: Added `as unknown` intermediary cast in createAgent and updateAgent (2 places)
- `src/cli/login.ts`: Added agents field to fallback config initialization

## Build Result
- **Before**: 29 TypeScript errors
- **After**: 0 errors
- Test files fixed: 71 passing (7 files)
- Overall test suite: 548 passing, 6 failing (pre-existing file path issues unrelated to schema migration)

## Design Integrity Maintained
All changes are minimal schema adaptations only. No runtime semantics changed. The implementer's design (D1-D4) remains untouched.
