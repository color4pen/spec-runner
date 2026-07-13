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

### Requirement: Public API preservation

`JobStateStore` SHALL expose the same constructor signature, instance methods, static methods, and return types after the split as before. No caller outside `src/store/` SHALL require modification.

#### Scenario: existing callers compile unchanged

**Given** the five internal components have been extracted and `JobStateStore` delegates to them
**When** `bun run typecheck` is run over the full source tree
**Then** zero TypeScript errors are reported and no file outside `src/store/` has been modified

---

### Requirement: Behavioral equivalence of job listing

`JobStateStore.list()` and `JobStateStore.listWithSourceDirs()` (now delegating to `JobCatalog`) SHALL return results with identical content and deduplication semantics as before the split.

#### Scenario: list returns same states

**Given** a repo root with active, archived, worktree, sidecar, and managed-marker job states
**When** `JobStateStore.listWithSourceDirs(repoRoot, { includeArchived: true })` is called after the split
**Then** it returns the same set of `ListedJobEntry` values (by `jobId` and `sourceChangeDir`) as the original implementation

---

### Requirement: Behavioral equivalence of journal persistence

`JobStateStore.persist()` (now delegating to `JobJournal`) SHALL produce identical `events.jsonl` delta records and `state.json` content as before the split, including fresh-write, fast-path, fold-based crash-recovery, and counter-reversal rejection.

#### Scenario: fresh write produces identical output

**Given** no prior `state.json` or `events.jsonl` exists for a job
**When** `persist(state)` is called after the split
**Then** `events.jsonl` and `state.json` are written with the same structure and content as the original implementation

---

### Requirement: Behavioral equivalence of legacy migration

`composeSplitLayout` (now delegating to `LegacyStateMigrator`) SHALL produce the same `NormalizedJobState.steps` for pre-split-layout state files as the original inline logic.

#### Scenario: legacy state files are read correctly

**Given** a `state.json` with no `_journal` field and inline `steps` entries, and no `events.jsonl`
**When** `load()` is called on a `JobStateStore` pointing at that path
**Then** the returned `NormalizedJobState.steps` contains the same data as the legacy inline steps

