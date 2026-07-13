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

### Requirement: Transient BLOCKED grace period after checks succeed

When `rollup.state === "success"` and `mergeStateStatus === "BLOCKED"`, the merge-wait loop SHALL NOT immediately escalate. It MUST instead start a set-once grace timer (`blockedGraceStart`) and continue polling until either (a) `isBlocked` becomes false and merge proceeds, or (b) `BLOCKED_CHECK_GRACE_MS` elapses and the escalation fires.

#### Scenario: checks succeed, transient BLOCKED clears within grace

**Given** a PR whose CI checks have just reached `success`
**When** the first poll observes `mergeStateStatus === "BLOCKED"` and a subsequent poll within `BLOCKED_CHECK_GRACE_MS` observes `mergeStateStatus === "CLEAN"`
**Then** the merge proceeds and `exitCode` is 0; no branch-protection escalation is raised

#### Scenario: checks succeed, BLOCKED persists beyond grace

**Given** a PR whose CI checks have reached `success` and `mergeStateStatus` remains `"BLOCKED"` for longer than `BLOCKED_CHECK_GRACE_MS`
**When** the grace timer expires
**Then** `blockedAfterChecksEscalation` is returned with `exitCode: 1` and the escalation message references `"merge gate (branch protection)"`; `mergePullRequest` is not called

### Requirement: Grace timer is set-once and never reset

The `blockedGraceStart` variable MUST be set exactly once — on the first observation of `success && BLOCKED` — and SHALL NOT be reset on subsequent loop iterations regardless of intermediate state changes.

#### Scenario: set-once on first BLOCKED observation

**Given** the loop has observed `success && BLOCKED` for the first time
**When** `blockedGraceStart` is assigned
**Then** subsequent iterations with `success && BLOCKED` do not reassign `blockedGraceStart`

### Requirement: Existing escalation paths are unaffected

The conflict escalation (DIRTY / CONFLICTING), check-failure escalation, and overall timeout escalation SHALL remain behaviorally identical to before this change. The none-check grace path MUST also be unaffected.

#### Scenario: conflict escalation is unchanged

**Given** `mergeStateStatus === "DIRTY"`
**When** the loop evaluates merge state
**Then** `exitCode: 1` with escalation referencing `"merge gate (conflict)"` is returned; `mergePullRequest` is not called

#### Scenario: check failure escalation is unchanged

**Given** `mergeStateStatus === "CLEAN"` and `rollup.state === "failure"`
**When** the loop evaluates check status
**Then** `exitCode: 1` with escalation referencing `"check status (failed checks)"` is returned

### Requirement: The system shall place spec.md before the design step

The system SHALL place a spec.md scaffold in the change folder before the design
agent runs, so the agent has a pre-structured output destination.

#### Scenario: spec.md exists before design agent starts

**Given** the pipeline is about to execute the design step
**When** the executor calls writeOutputTemplates for the design step
**Then** spec.md exists in the change folder at specrunner/changes/<slug>/spec.md

-->

## Requirements

### Requirement: Transient BLOCKED grace period after checks succeed

When `rollup.state === "success"` and `mergeStateStatus === "BLOCKED"`, the merge-wait loop SHALL NOT immediately escalate. It MUST instead start a set-once grace timer (`blockedGraceStart`) and continue polling until either (a) `isBlocked` becomes false and merge proceeds, or (b) `BLOCKED_CHECK_GRACE_MS` elapses and the escalation fires.

#### Scenario: checks succeed, transient BLOCKED clears within grace

**Given** a PR whose CI checks have just reached `success`
**When** the first poll observes `mergeStateStatus === "BLOCKED"` and a subsequent poll within `BLOCKED_CHECK_GRACE_MS` observes `mergeStateStatus === "CLEAN"`
**Then** the merge proceeds and `exitCode` is 0; no branch-protection escalation is raised

#### Scenario: checks succeed, BLOCKED persists beyond grace

**Given** a PR whose CI checks have reached `success` and `mergeStateStatus` remains `"BLOCKED"` for longer than `BLOCKED_CHECK_GRACE_MS`
**When** the grace timer expires
**Then** `blockedAfterChecksEscalation` is returned with `exitCode: 1` and the escalation message references `"merge gate (branch protection)"`; `mergePullRequest` is not called

### Requirement: Grace timer is set-once and never reset

The `blockedGraceStart` variable MUST be set exactly once — on the first observation of `success && BLOCKED` — and SHALL NOT be reset on subsequent loop iterations regardless of intermediate state changes.

#### Scenario: set-once on first BLOCKED observation

**Given** the loop has observed `success && BLOCKED` for the first time
**When** `blockedGraceStart` is assigned
**Then** subsequent iterations with `success && BLOCKED` do not reassign `blockedGraceStart`

### Requirement: Existing escalation paths are unaffected

The conflict escalation (DIRTY / CONFLICTING), check-failure escalation, and overall timeout escalation SHALL remain behaviorally identical to before this change. The none-check grace path MUST also be unaffected.

#### Scenario: conflict escalation is unchanged

**Given** `mergeStateStatus === "DIRTY"`
**When** the loop evaluates merge state
**Then** `exitCode: 1` with escalation referencing `"merge gate (conflict)"` is returned; `mergePullRequest` is not called

#### Scenario: check failure escalation is unchanged

**Given** `mergeStateStatus === "CLEAN"` and `rollup.state === "failure"`
**When** the loop evaluates check status
**Then** `exitCode: 1` with escalation referencing `"check status (failed checks)"` is returned

