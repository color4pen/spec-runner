# Test Cases:

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>

Category determination:
  unit        — pure logic, validation, helper functions (automated)
  integration — DB operations, API endpoints, multi-module interaction (automated)
  manual      — UI/UX confirmation, visual verification, build artifact check (not automated)

Priority determination:
  must   — core functionality; if broken, the feature does not work
  should — important but core still works; edge cases, error handling
  could  — nice to have; performance, UX details

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  result determination:
    completed — all testable behaviors are documented
    partial   — some cases could not be derived due to design ambiguity
    failed    — spec is absent AND design.md / tasks.md are also missing
-->

## Summary

- **Total**: 12 cases
- **Automated** (unit/integration): 12
- **Manual**: 0
- **Priority**: must: 9, should: 3, could: 0

### TC-001: project defaults are visible for inherited values

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: The CLI shall display effective step execution config with source attribution > Scenario: project defaults are visible for inherited values

### TC-002: user global step request-type setting beats project defaults

- **Category**: integration
- **Priority**: must
- **Source**: spec.md > Requirement: The CLI shall display effective step execution config with source attribution > Scenario: user global step request-type setting beats project defaults

### TC-003: request type changes byRequestType result

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: Request type shall affect displayed resolution > Scenario: request type changes byRequestType result

### TC-004: omitted request type skips byRequestType

- **Category**: integration
- **Priority**: must
- **Source**: spec.md > Requirement: Request type shall affect displayed resolution > Scenario: omitted request type skips byRequestType

### TC-005: unconfigured step uses hardcoded model

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: Fallbacks shall be displayed as explicit sources > Scenario: unconfigured step uses hardcoded model

### TC-006: unconfigured nullable field uses SDK default

- **Category**: unit
- **Priority**: should
- **Source**: spec.md > Requirement: Fallbacks shall be displayed as explicit sources > Scenario: unconfigured nullable field uses SDK default

### TC-007: traced values match existing resolver values

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: The command shall not change execution semantics > Scenario: traced values match existing resolver values

### TC-008: JSON contains field-level source records

- **Category**: integration
- **Priority**: must
- **Source**: spec.md > Requirement: JSON output shall be stable for tests and tooling > Scenario: JSON contains field-level source records

### TC-009: source-aware config loading keeps merge semantics and provenance

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-01: Add source-aware config loading support

**GIVEN** user global config exists and defines a full config
**AND** project local config exists as a partial overlay that only overrides a subset of paths
**WHEN** the source-aware loader reads both configs
**THEN** the merged config is validated once as the effective full config
**AND** the raw project overlay is preserved so provenance can tell whether a winning path was explicitly supplied by project local config
**AND** loading a missing user global file or missing project local file follows the same success/error behavior as `loadConfig`

### TC-010: config effective command resolves requestType none and excludes CLI-only steps

- **Category**: integration
- **Priority**: must
- **Source**: design.md > Decisions > D1. Add `specrunner config effective` as the command surface; design.md > Decisions > D4. Use the canonical agent step list and existing step definitions; tasks.md > T-03: Add the `specrunner config effective` CLI command

**GIVEN** the repository has standard agent steps and a valid config fixture
**AND** the pipeline also contains deterministic CLI-only steps such as `verification` and `pr-create`
**WHEN** the user runs `specrunner config effective`
**THEN** the command reports `requestType: none`
**AND** the output resolves without `byRequestType` candidates
**AND** the output lists only standard agent-backed steps in `AGENT_STEP_NAMES` order
**AND** the CLI-only deterministic steps are not included

### TC-011: human and JSON formatter expose concise and stable source metadata

- **Category**: unit
- **Priority**: should
- **Source**: design.md > Decisions > D5. Provide human table output and JSON output; tasks.md > T-04: Format human and JSON output

**GIVEN** traced step records include values and source metadata for `model`, `maxTurns`, and `timeoutMs`
**WHEN** the human formatter renders the table view
**THEN** each cell combines the effective value with a concise source label
**AND** the source label remains readable in a typical terminal
**WHEN** the JSON formatter renders the same trace
**THEN** the output uses stable object keys suitable for tests
**AND** config-derived sources include concrete paths such as `steps.design.byRequestType.bug-fix.model`
**AND** the JSON preserves full `layer`, `level`, and `path` metadata even if the human view abbreviates it

### TC-012: help text and invalid usage surface the new command

- **Category**: integration
- **Priority**: should
- **Source**: tasks.md > T-06: Update command help and documentation touchpoints

**GIVEN** the CLI has top-level usage text and subcommand usage text
**WHEN** the user runs `specrunner --help`
**THEN** the new `config effective` command is listed
**WHEN** the user runs `specrunner config effective --help`
**THEN** the usage text shows `--type` and `--json`
**AND** invalid usage reports actionable help rather than an opaque failure

## Result
```yaml
result: completed
total: 12
automated: 12
manual: 0
must: 9
should: 3
could: 0
blocked_reasons: []
```
