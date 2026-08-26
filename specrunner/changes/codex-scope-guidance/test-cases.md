# Test Cases: Codex provider scope discipline guidance

## Summary

- **Total**: 19 cases
- **Automated** (unit/integration): 15
- **Manual**: 0
- **Priority**: must: 14, should: 5, could: 0

---

### TC-001: Guidance Appears in Codex Reviewer Step Prompt

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Codex adapter injects scope discipline guidance into every main work turn prompt > Scenario: guidance appears in a Codex reviewer step prompt

### TC-002: Guidance Appears in Codex Producer Step Prompt

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Codex adapter injects scope discipline guidance into every main work turn prompt > Scenario: guidance appears in a Codex producer step prompt

### TC-003: Guidance Appears When Step Has No Report Tool

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Codex adapter injects scope discipline guidance into every main work turn prompt > Scenario: guidance appears when the step has no report tool

### TC-004: Guidance Appears When Session Is Resumed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Codex adapter injects scope discipline guidance into every main work turn prompt > Scenario: guidance appears when the session is resumed

### TC-005: Ordering — Guidance After Project Rules, Before Completion Instruction

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Guidance is positioned after project rules and before the completion report instruction > Scenario: ordering with project rules and a report tool

### TC-006: Guidance Is Tail of Prompt When No Report Tool or Project Rules

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Guidance is positioned after project rules and before the completion report instruction > Scenario: guidance is the tail of the prompt when no report tool is configured

### TC-007: Completion Retry Prompt Carries No Guidance

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Follow-up turns do not repeat the guidance > Scenario: completion retry prompt carries no guidance

### TC-008: Guidance Not Referenced Outside the Codex Adapter

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Non-Codex providers are unaffected by the guidance > Scenario: guidance is not referenced outside the Codex adapter

### TC-009: Shared Prompt Builder Output Is Unchanged

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Non-Codex providers are unaffected by the guidance > Scenario: shared prompt builder output is unchanged

### TC-010: Tests Assert Against Exported Constant, Not Re-Stated Literal

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: The guidance is a single-source adapter-local constant > Scenario: tests assert against the exported constant

### TC-011: No Pipeline or Reviewer Files Change

**Category**: gate
**Priority**: must
**Source**: spec.md > Requirement: The guidance is a single-source adapter-local constant > Scenario: no pipeline or reviewer files change

Verification: `git diff --name-only main...HEAD` — confirm no file under `src/core/pipeline/` and no file under `specrunner/reviewers/` appears in the diff (T-06 gate check).

---

### TC-012: scope-guidance.ts Is a Pure Constant Module with No Imports

**Category**: unit
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-01

**GIVEN** `src/adapter/codex/scope-guidance.ts` exists in the repository

**WHEN** the file is statically examined for import/require statements and exported symbols

**THEN** the file contains no import declarations and exports exactly one symbol (`CODEX_SCOPE_GUIDANCE`), conforming to the "small prompt constant module" pattern of `completion-report-prompt.ts`

---

### TC-013: CODEX_SCOPE_GUIDANCE Constant Value Matches Specification Exactly

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `CODEX_SCOPE_GUIDANCE` is imported from `src/adapter/codex/scope-guidance.ts`

**WHEN** the string value is compared character-for-character to the canonical text in spec.md (header line `SpecRunner execution guidance:`, one blank line, then the six bullet lines)

**THEN** the values are identical — no leading or trailing blank lines, no paraphrasing, no omission of any bullet item

---

### TC-014: Guidance Present When reportTool Is Configured but promptRules Is Absent

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria / design.md > D2

**GIVEN** a Codex run context that has a `reportTool` in its policy but no `promptRules`

**WHEN** the runner issues the main work turn

**THEN** the prompt contains both `CODEX_SCOPE_GUIDANCE` and the completion report instruction, and `CODEX_SCOPE_GUIDANCE` appears before the completion report instruction (i.e., `indexOf(CODEX_SCOPE_GUIDANCE) < indexOf(buildMainTurnCompletionInstruction())`)

---

### TC-015: Existing Byte-Identity Baselines Updated to Include Guidance

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria / design.md > D5

**GIVEN** the two codebase tests that previously asserted byte-identical prompt construction without guidance:
- `src/adapter/codex/__tests__/resume-prompt-injection.test.ts` (the "leaves the main turn prompt byte-identical when resumePrompt is unset" assertion)
- `src/adapter/codex/__tests__/artifact-bundle-injection.test.ts` (the "prompt equals baseMessage + additionalInstructions when change folder is absent" assertion)

**WHEN** those assertions are inspected after this change

**THEN** both use `toBe` strict equality (not relaxed to `toContain`), and their expected strings are constructed by importing `CODEX_SCOPE_GUIDANCE` from `../scope-guidance.js` and concatenating it — the guidance constant is not re-stated as an inline literal in the test files

---

### TC-016: Core Policy Type Has No New Provider-Related Fields

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 Acceptance Criteria / design.md > D1, D6

**GIVEN** the source file `src/core/port/agent-runner.ts`

**WHEN** the file is scanned for the strings `scope-guidance`, `providerGuidance`, `CODEX_SCOPE_GUIDANCE`, and `SpecRunner execution guidance`

**THEN** none of those strings appear, confirming that no new provider config protocol or policy field was introduced in the core port layer

---

### TC-017: All Tooling (typecheck / test / lint) Passes

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria

Verification: `bun run typecheck`, `bun run test`, `bun run lint` — all exit with status 0.

---

### TC-018: Changed Files Are Within the Allowed Set

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria

Verification: `git diff --name-only main...HEAD` — output is a subset of:
- `src/adapter/codex/scope-guidance.ts`
- `src/adapter/codex/agent-runner.ts`
- `src/adapter/codex/__tests__/scope-guidance-injection.test.ts`
- `src/adapter/codex/__tests__/resume-prompt-injection.test.ts`
- `src/adapter/codex/__tests__/artifact-bundle-injection.test.ts`
- `tests/adapter/codex/scope-guidance-provider-isolation.test.ts`
- `specrunner/changes/codex-scope-guidance/**`

No file outside this set appears in the diff.

---

### TC-019: Prohibited File Areas Have No Diff

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria

Verification: `git diff --name-only main...HEAD` — confirm zero entries matching any of:
- `src/core/pipeline/` (including `pipeline.ts`, `convergence-budget.ts`)
- `specrunner/reviewers/`
- `.specrunner/config.json`
- `src/adapter/shared/`
- `src/adapter/claude-code/`
- `src/adapter/managed-agent/`
- `src/prompts/`
- `src/core/`

---

## Result

```yaml
result: completed
total: 19
automated: 15
manual: 0
must: 14
should: 5
could: 0
blocked_reasons: []
```
