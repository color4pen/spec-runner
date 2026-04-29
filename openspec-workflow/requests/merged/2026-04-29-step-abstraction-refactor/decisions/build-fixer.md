# Build Fixer Decisions

## Date
2026-04-29

## Errors Fixed: 48 → 0

### 1. CustomToolDefinition.description made required
**Reason**: Anthropic SDK requires `description` as non-optional string. The register_branch tool always provides it, so making it required is correct.

### 2. Added toLegacyStepResult() helper in src/state/helpers.ts
**Reason**: StepRun | StepResult union narrowing needed at ~30 access sites. A single helper centralizes the conversion logic. Projects StepRun → StepResult shape for backward compatibility with tests that destructure old fields (.iteration, .verdict, .findingsPath, .session, .completedAt, .error).

### 3. Cast union type arrays in getLatestStepResult and pushStepResult
**Reason**: `[...existing, result]` returns mixed array type. Explicitly type as `StepResult[] | StepRun[]` to satisfy the JobState.steps record.

### 4. Cast union type array in Pipeline.handleExhausted
**Reason**: Spreading and modifying union members requires type assertion. Cast result to `StepResult[] | StepRun[]`.

### 5. Test file imports and type casts
**Reason**: Tests destructure step results from state.steps (union type). Import toLegacyStepResult at top of each test file that accesses step properties. Use helper for narrowing.

**Affected files**:
- tests/core/pipeline/pipeline.test.ts
- tests/cli-stdout-snapshot.test.ts
- tests/core/steps/spec-review.test.ts
- tests/pipeline-integration.test.ts
- tests/spec-review-step.test.ts
- tests/schema.test.ts
- tests/state/helpers.test.ts
- tests/state/io.test.ts
- tests/error-codes.test.ts (fixed type cast: InstanceType<typeof StepExecutor>)
- tests/core/step/step-interface.test.ts (fixed cast through unknown first)
- tests/register-branch-schema.test.ts (fixed unknown property access)

### 6. Type imports added
**Reason**: Tests cast arrays to union types. Added `StepRun, StepResult` imports to test files that create spec-review state objects.

## Verification
- `bunx tsc --noEmit -p tsconfig.json`: 0 errors
- `bun test`: 207 pass / 1 fail / 1 error (cli.test.ts out of scope)

## No Behavior Changes
All fixes are type-only. No logic modified. Tests pass as before.
