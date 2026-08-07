# Spec:

<!-- SPEC WRITING GUIDANCE

This file is the self-contained spec for this change.
Write Layer-1 behaviors — choices the structure/types/FSM do not enforce automatically.

════════════════════════════════════════════════════════
REQUIREMENT FORMAT
════════════════════════════════════════════════════════

### Requirement: <name>

Each requirement describes a behavior this change introduces or modifies.
The body MUST contain a normative keyword: SHALL or MUST (English).

At least one Scenario per Requirement (Given/When/Then format):

#### Scenario: <name>

**Given** <preconditions>
**When** <action>
**Then** <expected result>

════════════════════════════════════════════════════════
EXAMPLE
════════════════════════════════════════════════════════

## Requirements

### Requirement: The system shall place spec.md before the design step

The system SHALL place a spec.md scaffold in the change folder before the design
agent runs, so the agent has a pre-structured output destination.

#### Scenario: spec.md exists before design agent starts

**Given** the pipeline is about to execute the design step
**When** the executor calls writeOutputTemplates for the design step
**Then** spec.md exists in the change folder at specrunner/changes/<slug>/spec.md

-->

## Requirements

### Requirement: Dead symbols MUST be absent from the codebase after deletion

All symbols identified as dead code in this change (production callers = 0) SHALL be fully removed from `src/`, `bin/`, and `tests/`. No reference — import, call site, type annotation, string literal, or comment — to a deleted symbol SHALL remain after the change is applied.

#### Scenario: Deleted symbol has no remaining references

**Given** a symbol confirmed as dead code (e.g., `assertBreakAfterCompletion`, `deleteSession`, `REPORT_TOOL`, etc.)
**When** the change is applied
**Then** `grep -r "<symbol>" src/ bin/ tests/` returns 0 matches

### Requirement: Shim importers MUST be repointed before shim deletion

When a re-export shim (`transient-error.ts`, `session-log-writer.ts`, `git-exec.ts`) is deleted, every importer SHALL be updated to reference the canonical implementation path directly. The shim SHALL NOT be deleted while any importer still references it.

#### Scenario: agent-runner.ts imports repointed before shim removed

**Given** `src/adapter/claude-code/agent-runner.ts` imports from `./transient-error.js` (a shim)
**When** the shim is deleted
**Then** `agent-runner.ts` imports `isTransientAgentError` directly from `../shared/transient-error.js`

### Requirement: Shared tests MUST preserve all non-deleted assertions

When a deletion target has assertions in a shared test file, only the assertions for the deleted symbol SHALL be removed. All other assertions in that file MUST remain unchanged.

#### Scenario: Shared test file trimmed without collateral damage

**Given** `tests/completion.test.ts` contains both live tests and an `assertBreakAfterCompletion` assertion
**When** the `assertBreakAfterCompletion` assertion is removed
**Then** all other `it(...)` blocks in the file remain present and pass without modification
