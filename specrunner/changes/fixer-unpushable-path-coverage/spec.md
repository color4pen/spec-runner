# Spec: fixer-unpushable-path-coverage

## Requirements

### Requirement: code-fixer SHALL inject the push capability notice in its prompt

`CodeFixerStep.buildMessage` MUST append the text produced by `renderPushCapabilityNotice`
to every message variant when `deps.pushCapability` declares one or more patterns. When
`pushCapability` is null or has no patterns, the notice MUST NOT appear.

#### Scenario: code-fixer initial message with active pushCapability

**Given** `deps.pushCapability` is set with `patterns: [".github/workflows/**"]`
**And** the step has no prior session (first execution)
**When** `CodeFixerStep.buildMessage` is called
**Then** the returned string contains the text `"Push Capability Notice"`
**And** the returned string contains the pattern `.github/workflows/**`

#### Scenario: code-fixer continuation message with active pushCapability

**Given** `deps.pushCapability` is set with non-empty patterns
**And** the step has a prior session recorded in state (isFixerContinuation is true)
**When** `CodeFixerStep.buildMessage` is called
**Then** the returned string contains the text `"Push Capability Notice"`

#### Scenario: code-fixer message with no pushCapability

**Given** `deps.pushCapability` is null
**When** `CodeFixerStep.buildMessage` is called (any path)
**Then** the returned string does NOT contain `"Push Capability Notice"`

---

### Requirement: code-fixer SHALL declare the unpushable-path output contract when pushCapability is set

`CodeFixerStep.outputContracts` MUST return a contract with `kind: "unpushable-path"`,
`policy: "follow-up"`, and `patterns` equal to `deps.pushCapability.patterns` when
`deps.pushCapability` has one or more patterns.
`CodeFixerStep.outputContracts` MUST return an empty array when `deps.pushCapability` is null
or has no patterns.

#### Scenario: code-fixer outputContracts with active pushCapability

**Given** `deps.pushCapability.patterns` is `[".github/workflows/**"]`
**When** `CodeFixerStep.outputContracts` is called
**Then** the returned array contains exactly one contract
**And** that contract has `kind: "unpushable-path"`, `policy: "follow-up"`, and `patterns: [".github/workflows/**"]`

#### Scenario: code-fixer outputContracts without pushCapability

**Given** `deps.pushCapability` is null
**When** `CodeFixerStep.outputContracts` is called
**Then** the returned array is empty

---

### Requirement: spec-fixer SHALL inject the push capability notice in its prompt

`SpecFixerStep.buildMessage` MUST append the text produced by `renderPushCapabilityNotice`
to every message variant when `deps.pushCapability` declares one or more patterns. When
`pushCapability` is null or has no patterns, the notice MUST NOT appear.

#### Scenario: spec-fixer initial message with findings and active pushCapability

**Given** `deps.pushCapability` is set with non-empty patterns
**And** structured findings are available from the latest spec-review run
**When** `SpecFixerStep.buildMessage` is called (initial entry)
**Then** the returned string contains `"Push Capability Notice"`

#### Scenario: spec-fixer fallback message with active pushCapability

**Given** `deps.pushCapability` is set with non-empty patterns
**And** no structured findings are available (fallback to findingsPath path)
**When** `SpecFixerStep.buildMessage` is called
**Then** the returned string contains `"Push Capability Notice"`

#### Scenario: spec-fixer continuation message with active pushCapability

**Given** `deps.pushCapability` is set with non-empty patterns
**And** the step has a prior session recorded in state
**When** `SpecFixerStep.buildMessage` is called
**Then** the returned string contains `"Push Capability Notice"`

#### Scenario: spec-fixer message with no pushCapability

**Given** `deps.pushCapability` is null
**When** `SpecFixerStep.buildMessage` is called (any path)
**Then** the returned string does NOT contain `"Push Capability Notice"`

---

### Requirement: spec-fixer SHALL declare the unpushable-path output contract when pushCapability is set

`SpecFixerStep.outputContracts` MUST return a contract with `kind: "unpushable-path"`,
`policy: "follow-up"`, and `patterns` equal to `deps.pushCapability.patterns` when
`deps.pushCapability` has one or more patterns.
`SpecFixerStep.outputContracts` MUST return an empty array when `deps.pushCapability` is null
or has no patterns.

#### Scenario: spec-fixer outputContracts with active pushCapability

**Given** `deps.pushCapability.patterns` is `[".github/workflows/**"]`
**When** `SpecFixerStep.outputContracts` is called
**Then** the returned array contains exactly one contract
**And** that contract has `kind: "unpushable-path"`, `policy: "follow-up"`, and `patterns: [".github/workflows/**"]`

#### Scenario: spec-fixer outputContracts without pushCapability

**Given** `deps.pushCapability` is null
**When** `SpecFixerStep.outputContracts` is called
**Then** the returned array is empty

---

### Requirement: `buildUnpushablePathContracts` in `fixer-helpers.ts` SHALL return an empty array when no patterns are declared

The helper function `buildUnpushablePathContracts(deps: StepDeps): OutputContract[]` MUST
return `[]` when `deps.pushCapability` is null, undefined, or has an empty `patterns` array.

#### Scenario: null pushCapability

**Given** `deps.pushCapability` is null
**When** `buildUnpushablePathContracts(deps)` is called
**Then** the return value is `[]`

#### Scenario: empty patterns array

**Given** `deps.pushCapability.patterns` is `[]`
**When** `buildUnpushablePathContracts(deps)` is called
**Then** the return value is `[]`

#### Scenario: non-empty patterns array

**Given** `deps.pushCapability.patterns` is `[".github/workflows/**"]`
**When** `buildUnpushablePathContracts(deps)` is called
**Then** the return value has length 1
**And** the sole element has `kind: "unpushable-path"` and `patterns: [".github/workflows/**"]`

---

### Requirement: fixer steps SHALL rely on existing Layer 2 backstop when a follow-up cannot resolve the unpushable-path violation

When a fixer step's one-follow-up repair prompt does not result in the agent removing the
violating path change, the existing Layer 2 backstop MUST halt the job via
`UNPUSHABLE_PATH_BLOCKED` and record an escalation marker. No additional fixer-specific
halt logic is introduced.

#### Scenario: code-fixer follow-up does not resolve the violation

**Given** `CodeFixerStep.outputContracts` has declared the unpushable-path contract
**And** the runtime sent the follow-up repair prompt (attempt 1)
**And** the agent's response still touches the unpushable path
**When** the CLI attempts to commit and push the changes
**Then** `commitScopedPaths` (Layer 2) throws `UNPUSHABLE_PATH_BLOCKED`
**And** the job transitions to `awaiting-resume` halt
**And** no infinite review ⇄ fixer loop occurs (the one-follow-up invariant prevents a second unpushable-path repair prompt)
