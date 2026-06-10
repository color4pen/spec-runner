# Spec: config schema ↔ interface type-parity assertions

## Requirements

### Requirement: Schema/interface drift fails typecheck

The parity assertion module MUST cause `tsc --noEmit` to fail whenever the type inferred from
`configSchema` and the hand-written `SpecRunnerConfig` diverge in their schema-derived parts, in
either direction. The check SHALL detect both required-field and optional-field additions; it MUST
NOT be weakened to field-by-field partial matching.

#### Scenario: A field added only to the schema breaks typecheck

**Given** the parity assertion module is present and `tsc --noEmit` is green
**When** a developer adds a field (required or `optional`) to `configSchema` without adding the
corresponding member to `SpecRunnerConfig`
**Then** `tsc --noEmit` fails because a parity assertion resolves to a non-`true` type

#### Scenario: A field added only to the interface breaks typecheck

**Given** the parity assertion module is present and `tsc --noEmit` is green
**When** a developer adds a member to `SpecRunnerConfig` without adding the corresponding field to
`configSchema`
**Then** `tsc --noEmit` fails because a parity assertion resolves to a non-`true` type

#### Scenario: The unchanged codebase typechecks clean

**Given** the current schema and interfaces are in parity
**When** `tsc --noEmit` runs with the parity assertion module present
**Then** it exits 0 (every assertion resolves to `true`)

### Requirement: Sub-interfaces with a schema correspondent are covered

The parity assertion module MUST assert equivalence for the sub-interfaces that have a schema
correspondent — including `StepExecutionConfig` and `AgentRecord` — so drift inside a nested config
object is detected with a localized failure rather than only an opaque top-level one. Where the
schema and interface representations diverge by design (the recursive `StepExecutionConfig.byRequestType`
versus the schema's flattened entry), the schema-derived part SHALL still be asserted at full
granularity.

#### Scenario: A field added to a step entry sub-schema breaks typecheck

**Given** the parity assertion module is present and `tsc --noEmit` is green
**When** a developer adds a field to the step-entry schema without adding it to `StepExecutionConfig`
**Then** `tsc --noEmit` fails on the `StepExecutionConfig` parity assertion

#### Scenario: A field added to the agent-record sub-schema breaks typecheck

**Given** the parity assertion module is present and `tsc --noEmit` is green
**When** a developer adds a field to the agent-record schema without adding it to `AgentRecord`
**Then** `tsc --noEmit` fails on the `AgentRecord` parity assertion

### Requirement: The guard does not change runtime or build output

Introducing the parity guard MUST NOT alter any runtime behavior or bundled output. The change SHALL
be type-level only, and the produced `dist/` MUST be identical before and after the change.

#### Scenario: dist output is unchanged

**Given** `dist/` built from the base branch
**When** `dist/` is rebuilt from this change and compared
**Then** the bundled output is byte-identical (no runtime statement was added; the assertion module
is not bundled)
