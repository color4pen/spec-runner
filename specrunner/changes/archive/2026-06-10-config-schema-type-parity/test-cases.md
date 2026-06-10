# Test Cases: config schema ↔ interface type-parity assertions

## Summary

- **Total**: 13 cases
- **Automated** (unit/integration): 3
- **Manual**: 10
- **Priority**: must: 12, should: 1, could: 0

---

### TC-001: Schema-only field addition breaks typecheck

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: Schema/interface drift fails typecheck > Scenario: A field added only to the schema breaks typecheck

---

### TC-002: Interface-only field addition breaks typecheck

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: Schema/interface drift fails typecheck > Scenario: A field added only to the interface breaks typecheck

---

### TC-003: Unchanged codebase typechecks clean

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: Schema/interface drift fails typecheck > Scenario: The unchanged codebase typechecks clean

---

### TC-004: Step entry sub-schema field addition breaks typecheck

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: Sub-interfaces with a schema correspondent are covered > Scenario: A field added to a step entry sub-schema breaks typecheck

---

### TC-005: Agent-record sub-schema field addition breaks typecheck

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: Sub-interfaces with a schema correspondent are covered > Scenario: A field added to the agent-record sub-schema breaks typecheck

---

### TC-006: dist output is unchanged

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: The guard does not change runtime or build output > Scenario: dist output is unchanged

---

### TC-007: Assertion file contains only type-level declarations

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `tests/config/schema-type-parity.test-d.ts` exists on the branch
**WHEN** the file is inspected for JavaScript-emitting constructs (`const`, `let`, `var`, `export const`, function declarations, class declarations)
**THEN** none are found; the file contains only `import` / `import type` / `type` declarations, and emits no JavaScript

---

### TC-008: Lint passes with --max-warnings 0 after assertion file is added

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-01, T-03

**GIVEN** the assertion file is present with all `Expect<Equal<…>>` alias names prefixed with `_`
**WHEN** `bun run lint` is executed
**THEN** it exits 0 with 0 warnings (ESLint `varsIgnorePattern: "^_"` exempts the unused type aliases from `no-unused-vars`)

---

### TC-009: All 13 required sub-interface assertions are present in the file

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `tests/config/schema-type-parity.test-d.ts`
**WHEN** the file is inspected for `Expect<Equal<…>>` assertions
**THEN** dedicated assertions exist for each of the following 13 interfaces: `SpecRunnerConfig` (top-level), `StepExecutionConfig` (entry-level), `StepExecutionConfig` (byRequestType entry), `AgentRecord`, `ModelEntry`, `EnvironmentConfig`, `SpecReviewConfig`, `PipelineConfig`, `ProgressConfig`, `VerificationConfig`, `VerificationCommand`, `LogsConfig`, `ArchiveConfig`, `GitHubHostConfig`

---

### TC-010: Superseded guard symbols are removed from schema.ts

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `src/config/schema.ts` before this change contains `_InferredConfig`, `_SchemaAssertions`, and `_schemaAssert`
**WHEN** the change is applied and `src/config/schema.ts` is inspected
**THEN** none of those three symbols exist in the file, and `npx tsc --noEmit` still exits 0

---

### TC-011: No configSchema key and no interface member is added, removed, or changed

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** the diff between `main` and this branch for `src/config/schema.ts`
**WHEN** `git diff main...HEAD -- src/config/schema.ts` is inspected
**THEN** the only removed lines are the superseded guard block (`_InferredConfig` / `_SchemaAssertions` / `_schemaAssert` and its surrounding comment); no `configSchema` object key and no interface member is added, removed, or changed

---

### TC-012: Test suite passes on the unchanged branch state

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** the assertion module is present and the guard block is removed
**WHEN** `bun run test` is executed
**THEN** all tests pass and the command exits 0

---

### TC-013: Build succeeds and dist output is unchanged

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** the assertion module is present and the guard block is removed
**WHEN** `bun run build` is executed
**THEN** it exits 0, produces `dist/specrunner.js`, and the output is byte-identical to the build from `main`

---

## Result

```yaml
result: completed
total: 13
automated: 3
manual: 10
must: 12
should: 1
could: 0
blocked_reasons: []
```
