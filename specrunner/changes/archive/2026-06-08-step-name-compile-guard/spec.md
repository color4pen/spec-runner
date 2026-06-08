# Spec: AgentStepName ↔ AGENT_STEP_NAMES compile-time sync guard

## Requirements

### Requirement: The build SHALL fail when AGENT_STEP_NAMES and the AgentStepName literal union diverge

The type-check build (`bun run typecheck`) SHALL fail whenever the `AGENT_STEP_NAMES`
array (`src/kernel/step-names.ts`) and the `AgentStepName` literal union
(`src/kernel/agent-definition.ts`) are not value-for-value identical, in **either**
direction. The two MUST be guaranteed consistent by a compile-time guard rather than by
manual comment-based synchronization.

#### Scenario: a value exists in the array but not in the type

**Given** `AGENT_STEP_NAMES` contains a value (e.g. `"new-step"`) that is absent from the
`AgentStepName` literal union
**When** `bun run typecheck` runs
**Then** type-checking fails with a type error originating from the sync guard

#### Scenario: a value exists in the type but not in the array

**Given** the `AgentStepName` literal union contains a member (e.g. `"new-step"`) that is
absent from `AGENT_STEP_NAMES`
**When** `bun run typecheck` runs
**Then** type-checking fails with a type error originating from the sync guard

#### Scenario: the array and the type are in sync

**Given** `AGENT_STEP_NAMES` and the `AgentStepName` literal union contain exactly the same
set of values
**When** `bun run typecheck` runs
**Then** type-checking succeeds with no guard-related error

### Requirement: The guard MUST preserve the kernel zero-import principle

The change MUST NOT introduce any `import` into any file under `src/kernel/`. The
`AgentStepName` literal union MUST remain defined in `src/kernel/agent-definition.ts`, and
the sync guard MUST be hosted in a layer that is permitted to import the kernel
(shared-kernel), not in the kernel itself.

#### Scenario: kernel files contain no imports after the change

**Given** the change has been applied
**When** the architecture invariant test "`src/kernel/` は import ゼロ（leaf 相当）" runs
**Then** it finds zero `import` statements in `src/kernel/` and passes

#### Scenario: existing AgentStepName consumers compile unchanged

**Given** modules that import `AgentStepName` from `src/state/schema.ts` (e.g.
`config/store.ts`, `config/getAgentId.ts`, `cli/managed.ts`)
**When** `bun run typecheck` runs after the change
**Then** those modules compile without modification

### Requirement: The sync guard mechanism SHALL be regression-protected by an automated test

An automated test SHALL prove that the guard technique detects divergence in both
directions, so that future edits cannot silently weaken the guard to a single direction.

#### Scenario: meta-test asserts both drift directions are caught

**Given** a test that mirrors the guard technique against deliberately divergent fixtures
**When** `bun run typecheck` runs (the test file is within the type-check scope)
**Then** the `@ts-expect-error` annotations confirm the guard rejects both the
array→type and type→array drift cases, and the in-sync case is accepted
