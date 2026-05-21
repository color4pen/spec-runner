# Code Review: agent-step-name-whitelist — Iteration 1

## Summary

The whitelist refactoring is structurally sound and all tests pass (2035/2035). Two type-level assertions required by the acceptance criteria are missing from the test file: `Extract<AgentStepName, CliStepName>` never-assertion (TC-TYPE-05) and `config.agents` CliStep key rejection (TC-CFG-02/03).

## Findings

### [MAJOR] TC-TYPE-05 not implemented — Extract<AgentStepName, CliStepName> never-assertion absent

- **file**: `tests/unit/core/step/step-names.test.ts`
- **issue**: `test-cases.md` TC-TYPE-05 requires a type-level assertion that `Extract<AgentStepName, CliStepName>` is `never`. This assertion is absent from the test file. The disjoint property is only checked at runtime (TC-1); the compile-time guarantee that the two types are mutually exclusive is not expressed.
- **suggestion**: Add inside the describe block:
  ```typescript
  import type { CliStepName } from "../../../../src/state/schema.js";
  type _AssertDisjoint = Extract<AgentStepName, CliStepName> extends never ? true : false;
  const _disjointCheck: _AssertDisjoint = true;
  ```

### [MAJOR] TC-CFG-02/03 not implemented — config.agents CliStep key rejection not asserted

- **file**: `tests/unit/core/step/step-names.test.ts`
- **issue**: The acceptance criteria state: "`config.agents.delta-spec-validation` (or other CliStep name) typed write causes a type error — guaranteed by `@ts-expect-error` test." TC-CFG-02 and TC-CFG-03 in `test-cases.md` both require `@ts-expect-error` assertions against `SpecrunnerConfig["agents"]`. These are entirely absent. The `config.agents` narrowing to `Partial<Record<AgentStepName, AgentRecord>>` is implemented in `src/config/schema.ts:93` but the compile-time gate is not regression-tested.
- **suggestion**: Add a test or standalone `.ts` assertion file:
  ```typescript
  import type { SpecRunnerConfig } from "../../../../src/config/schema.js";
  import type { AgentRecord } from "../../../../src/config/schema.js";
  // @ts-expect-error - "delta-spec-validation" is a CliStep, not allowed in config.agents
  const _cfgBad1: SpecRunnerConfig["agents"] = { "delta-spec-validation": {} as AgentRecord };
  // @ts-expect-error - "verification" is a CliStep, not allowed in config.agents
  const _cfgBad2: SpecRunnerConfig["agents"] = { "verification": {} as AgentRecord };
  ```

### [MINOR] store.ts FileConfigStore uses StepName + cast instead of AgentStepName

- **file**: `src/config/store.ts:110,118,133,147`
- **issue**: `FileConfigStore.getAgentId(role: StepName)` and `upsertAgent(role: StepName)` use `StepName` for their parameter, then cast `role as AgentStepName` internally (line 118) and use a computed property key `[role]` (line 147) that bypasses the type gate. The port interface `src/core/port/config-store.ts:26,32` also declares `StepName`. This means a CliStep name passed as `role` compiles without error through the port boundary.
- **suggestion**: This is likely out of scope for this PR (design.md scope exclusions list `STEP_NAMES` reference replacements but don't mention the port interface). Flag as a follow-up issue: narrow `ConfigStore.getAgentId` / `upsertAgent` to `AgentStepName` in a subsequent change.

### [INFO] TC-SPEC-03 — propose stale references remain in older spec Requirements

- **file**: `specrunner/specs/pipeline-orchestrator/spec.md:140,196,231,236,284,289`
- **issue**: Lines outside the modified Requirement section still contain `"propose"` (historical record from pre-rename Requirements). The newly added Requirement at line 320 correctly uses `"design"`. The stale references are in pre-existing Requirements that are outside the scope of this change, which is acceptable.

## Test Coverage

Checked against `test-cases.md` must-priority scenarios:

| Test Case | Status |
|-----------|--------|
| TC-RT-01: disjoint runtime check | Implemented (TC-1 in test file) |
| TC-RT-02: union exhaustiveness | Implemented (TC-2 in test file) |
| TC-RT-03: AgentStep names in AGENT_STEP_NAMES | Implemented (TC-3 in test file) |
| TC-RT-04: CliStep names in CLI_STEP_NAMES | Implemented (TC-4 in test file) |
| TC-TYPE-01: AgentStepName accepts agent names | Implicitly covered by `_ok: AgentStepName = "design"` |
| TC-TYPE-02: AgentStepName rejects "verification" | Implemented (`@ts-expect-error`) |
| TC-TYPE-03: AgentStepName rejects "pr-create" | Implemented (`@ts-expect-error`) |
| TC-TYPE-04: AgentStepName rejects "delta-spec-validation" | Implemented (`@ts-expect-error`) |
| TC-TYPE-05: Extract<AgentStepName, CliStepName> = never | **Missing** |
| TC-CFG-01: config.agents accepts AgentStepName keys | Not tested (runtime test absent; type is correct) |
| TC-CFG-02: config.agents rejects "delta-spec-validation" | **Missing** |
| TC-CFG-03: config.agents rejects "verification" | **Missing** |
| TC-COMPAT-01/02/03: STEP_NAMES backward compat | Covered by passing typecheck + TC-2 |
| TC-BUILD-01/02: typecheck + test green | Confirmed (verification-result.md: 2035 passed, 0 type errors) |
| TC-EXPORT-01/02: named exports present | Confirmed via implementation review |

## Verdict

- **verdict**: needs-fix

Two MAJOR findings: TC-TYPE-05 and TC-CFG-02/03 are acceptance-criteria-required `@ts-expect-error` assertions that are absent. The core implementation is correct and tests pass; only the type-level regression tests are missing.
