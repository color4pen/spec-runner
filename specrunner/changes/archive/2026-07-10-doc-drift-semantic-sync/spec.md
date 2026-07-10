# Spec: doc-drift-semantic-sync

## Requirements

### Requirement: authority documents match the implementation

The three authority documents SHALL describe the implementation as it is. README.md MUST describe
custom reviewers as a parallel fan-out after `code-review` with commit/push serialized;
`src/core/pipeline/registry.ts` comments MUST state the real step count for each pipeline;
`architecture/domain-model.md` MUST describe `version` as `1 | 2` (new state written as 2, version 1
normalized to 2 on read). No descriptor, schema, or pipeline implementation code is modified.

#### Scenario: README custom-reviewer description reflects parallel execution

**Given** the reader consults README.md's "Extending the Review Chain" section
**When** they read the custom-reviewers bullet
**Then** it states the reviewers run as a parallel fan-out after `code-review` with only their
commit/push serialized, and no longer claims they "run serially"

#### Scenario: registry comments state the real step counts

**Given** `src/core/pipeline/registry.ts`
**When** the "N-step" annotations for standard / design-only / fast are read
**Then** they read 13-step / 1-step / 9-step respectively, matching each descriptor's `steps.length`

#### Scenario: domain-model version description matches the schema union

**Given** `architecture/domain-model.md`
**When** the `version` invariant is read
**Then** it describes `version` as `1 | 2` (new state 2; version 1 normalized to 2 on read), not
"常に 1"

### Requirement: registry step-count comments are drift-guarded against descriptor step counts

The doc-sync test suite SHALL fail when any "N-step" number in `registry.ts` comments diverges from
the corresponding descriptor's `steps.length`. The expected count MUST be derived from the imported
descriptor (`descriptor.steps.length`), not from a literal in the test.

#### Scenario: correct counts pass

**Given** `STANDARD_DESCRIPTOR.steps.length === 13`, `DESIGN_ONLY_DESCRIPTOR.steps.length === 1`,
`FAST_DESCRIPTOR.steps.length === 9`, and registry comments reading 13-step / 1-step / 9-step
**When** the guard runs
**Then** it passes

#### Scenario: a wrong "N-step" number fails the guard

**Given** the registry standard comment is edited back to "12-step" while
`STANDARD_DESCRIPTOR.steps.length === 13`
**When** the guard runs
**Then** it fails, reporting the standard pipeline count mismatch

#### Scenario: a missing annotation does not silently pass

**Given** the "N-step" annotation for a known pipeline is removed from the registry comments
**When** the guard runs
**Then** it fails because that pipeline has no matching labeled "N-step" mention

### Requirement: domain-model version description is drift-guarded against the schema version union

The doc-sync test suite SHALL fail when `architecture/domain-model.md`'s `version` description is
inconsistent with the `version` union declared in `src/state/schema.ts`. The allowed version set
MUST be parsed from the schema source, not hardcoded in the test.

#### Scenario: current description passes

**Given** `schema.ts` declares `version: 1 | 2` and domain-model.md describes `version` as `1 | 2`
**When** the guard runs
**Then** it passes

#### Scenario: reverting to "常に 1" fails the guard

**Given** the domain-model `version` clause is reverted to "`version` は常に 1"
**When** the guard runs
**Then** it fails because the clause omits version 2, which is present in the schema union
