# Review Feedback — agent-step-name-whitelist iter 2

- **verdict**: approved
- **date**: 2026-05-17
- **iteration**: 2

## Summary

All core requirements implemented correctly. `AGENT_STEP_NAMES` / `CLI_STEP_NAMES` whitelists are in place, `AgentStepName` and `CliStepName` are derived from them, `config.agents` key type is tightened to `Partial<Record<AgentStepName, AgentRecord>>`, downstream types narrowed consistently. All 4 runtime tests + type-level assertions pass. `bun run typecheck` 0 errors, `bun run test` 2036 passed. One MINOR observation about `store.ts` / port interface not narrowed, which is out of scope per design.md.

## Findings

### [MINOR] ConfigStore port interface still uses `StepName` for `getAgentId` / `upsertAgent`

File: `src/core/port/config-store.ts:26,32` and `src/config/store.ts:110,118,133,145`

Description: `ConfigStore.getAgentId(role: StepName)` and `upsertAgent(role: StepName)` accept any StepName (including CliStep names). The `FileConfigStore` implementation casts `role as AgentStepName` internally. This means a caller could pass `"verification"` without a compile-time error at the port boundary.

Required action: None — `store.ts` and `port/config-store.ts` are explicitly excluded from this change's scope per design.md's Files Changed list. The cast is safe given actual call sites. Narrowing these to `AgentStepName` would be a follow-up.

### [INFO] Stale `propose` references remain in older spec.md Requirements

File: `specrunner/specs/pipeline-orchestrator/spec.md:140,196,231,236,284,289`

Description: Pre-existing requirements from earlier PRs still mention `"propose"`. tasks.md Task 6 specified updating only the AgentStepName Scenario (around L291-306), which is correctly updated to use `"design"`. The remaining stale references are in immutable historical requirement text.

Required action: None for this change. Consider a dedicated cleanup PR for spec.md historical requirement text.

## Test Coverage

| Test Case | Status | Notes |
|-----------|--------|-------|
| TC-RT-01: AGENT_STEP_NAMES ∩ CLI_STEP_NAMES = ∅ | PASS | `step-names.test.ts:49-54` |
| TC-RT-02: union equals STEP_NAMES values | PASS | `step-names.test.ts:57-61` |
| TC-RT-03: all AgentStep.name ∈ AGENT_STEP_NAMES | PASS | `step-names.test.ts:64-69` (uses ALL_STEPS class array) |
| TC-RT-04: all CliStep.name ∈ CLI_STEP_NAMES | PASS | `step-names.test.ts:72-77` |
| TC-TYPE-01: AgentStepName accepts all agent names | PASS | `@ts-expect-error` guards verify rejection; `_ok: AgentStepName = "design"` compiles |
| TC-TYPE-02: AgentStepName rejects "verification" | PASS | `@ts-expect-error` L82 |
| TC-TYPE-03: AgentStepName rejects "pr-create" | PASS | `@ts-expect-error` L85 |
| TC-TYPE-04: AgentStepName rejects "delta-spec-validation" | PASS | `@ts-expect-error` L88 |
| TC-TYPE-05: Extract<AgentStepName, CliStepName> = never | PASS | `step-names.test.ts:28-30` compile-time assertion |
| TC-CFG-01: config.agents accepts AgentStepName keys | PASS | typecheck passes |
| TC-CFG-02: config.agents rejects "delta-spec-validation" | PASS | `step-names.test.ts:99` `@ts-expect-error` |
| TC-CFG-03: config.agents rejects "verification" | PASS | `step-names.test.ts:101` `@ts-expect-error` |
| TC-COMPAT-01: STEP_NAMES.<KEY> references intact | PASS | typecheck 0 errors across all callers |
| TC-COMPAT-02: STEP_NAMES not Object.fromEntries | PASS | explicit `as const` object literal confirmed |
| TC-COMPAT-03: bun run typecheck 0 errors | PASS | confirmed |
| TC-BUILD-01: bun run typecheck 0 errors | PASS | confirmed |
| TC-BUILD-02: bun run test green | PASS | 2036 tests passed |
| TC-EXPORT-01: AGENT_STEP_NAMES / CLI_STEP_NAMES exported | PASS | `step-names.ts:11,27` |
| TC-EXPORT-02: CliStepName exported from schema.ts | PASS | `schema.ts:28` |
| TC-SPEC-01: spec.md uses whitelist description | PASS | `spec.md:291-310` |
| TC-SPEC-02: spec.md includes delta-spec-fixer/test-case-gen/delta-spec-validation | PASS | `spec.md:296-320` |
| TC-SPEC-03: AgentStepName Scenario uses "design" not "propose" | PASS | `spec.md:320` uses "design" |
| TC-SPEC-04: Scenario for test failure on missing classification | PASS | `spec.md:322-327` |

## Acceptance Criteria Checklist

- [x] `AGENT_STEP_NAMES` / `CLI_STEP_NAMES` が `src/core/step/step-names.ts` から export
- [x] `STEP_NAMES` object 形は維持、既存参照が無傷
- [x] `AgentStepName` が `typeof AGENT_STEP_NAMES[number]` で定義
- [x] `CliStepName` が export
- [x] `config.agents` キー型が `Partial<Record<AgentStepName, AgentRecord>>`
- [x] CliStep 名を config.agents に書くと型エラー (`@ts-expect-error` test 保証)
- [x] test 4 本 + type-level assertion が pass
- [x] 全 `AgentStepName` 参照箇所がコンパイル整合
- [x] spec authority に新定義が反映
- [x] `bun run typecheck && bun run test` green
