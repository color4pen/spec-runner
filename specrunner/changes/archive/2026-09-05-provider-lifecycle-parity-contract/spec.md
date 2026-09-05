# Spec: Claude / Codex provider lifecycle parity contract

## Requirements

### Requirement: The system shall provide a stable-ID provider lifecycle contract table

The system SHALL provide a provider lifecycle contract table whose required case ID list is
fixed on the expectation side as a hand-written frozen literal, independent of the contract
case table itself. The ID set of the case table MUST match the required ID list exactly
(no missing IDs, no extra IDs), and case IDs MUST NOT be duplicated.

#### Scenario: case table matches the frozen required ID list

**Given** the frozen required case ID list and the lifecycle contract case table
**When** the contract ratchet compares the two ID sets
**Then** the two sets are equal and the ratchet passes

#### Scenario: deleting a case from the table fails the ratchet

**Given** a contract case whose ID is present in the frozen required case ID list
**When** that case is removed from the contract case table but the required ID list is unchanged
**Then** the contract ratchet fails with the missing case ID reported

#### Scenario: duplicate case ID fails the ratchet

**Given** the contract case table contains two cases with the same ID
**When** the contract ratchet checks for duplicates
**Then** the ratchet fails and names the duplicated ID

#### Scenario: every required case ID uses a known lifecycle area prefix

**Given** the frozen required case ID list
**When** the contract ratchet parses each ID as `<area>.<slug>`
**Then** every `<area>` is a member of the declared lifecycle area list

### Requirement: The system shall cover all required lifecycle areas in the contract table

The contract table SHALL contain at least one case for each of the lifecycle areas
`main-work`, `report`, `post-work`, `output-repair`, `transient`, `timeout`, `context`,
`metrics`, and `completion-error`, so that main work completion, completion-report settle and
retry, post-work prompts, output verification repair, transient-error retry, inactivity and
wall-clock timeout, context exhaustion and rollover, usage/context/invocation/rollover metrics,
and completion reason with typed error code are all pinned.

#### Scenario: every lifecycle area has at least one case

**Given** the lifecycle contract case table
**When** the contract ratchet groups cases by area
**Then** each declared lifecycle area maps to one or more cases

#### Scenario: report settle and follow-up budget are represented

**Given** the lifecycle contract case table
**When** the `report` area cases are listed
**Then** the list contains a first-turn report success case, a follow-up recovery case,
and a follow-up budget exhaustion case

### Requirement: The system shall drive both providers from one provider-neutral scenario

Each contract case SHALL declare exactly one provider-neutral semantic scenario, expressed as a
turn script, and the provider harnesses MUST translate that same scenario into Claude SDK
messages and Codex thread events respectively. The suite MUST NOT contact a real SDK or any
external API, and MUST NOT require raw SDK event shapes to match across providers.

#### Scenario: one scenario drives both provider harnesses

**Given** a contract case with a turn script of `complete-with-report`
**When** the driver runs the case for the Claude harness and for the Codex harness
**Then** both runs use the same case scenario object and each harness translates it into its own
provider fixture

#### Scenario: no real SDK is loaded

**Given** the contract suite executes every case for every provider
**When** the runners are constructed
**Then** the Claude runner receives an injected query function and the Codex runner receives an
injected Codex factory, so neither dynamic SDK loader is invoked

#### Scenario: timeout cases are driven without wall-clock waiting

**Given** a contract case in the `timeout` area
**When** the driver runs it
**Then** the case uses fake timers and an abort-aware stalling fixture, and the transient backoff
sleep function is injected as an immediately-resolving function

### Requirement: The system shall classify each case and provider pair and require a reason for non-shared entries

Every contract case SHALL carry a classification of `shared` or `provider-specific`, and every
per-provider expectation SHALL carry a support value of `supported` or `absent`. A reason string
MUST be present and non-trivial for every expectation belonging to a `provider-specific` case and
for every expectation whose support is `absent`.

#### Scenario: shared case requires expectations for both providers

**Given** a contract case classified as `shared`
**When** the contract ratchet inspects its expectations
**Then** both `claude-code` and `codex` have an expectation entry with support `supported`

#### Scenario: provider-specific case without a reason fails the ratchet

**Given** a contract case classified as `provider-specific`
**When** one of its provider expectations has an empty or missing reason
**Then** the contract ratchet fails and names the case ID and provider

#### Scenario: absent support is asserted rather than skipped

**Given** a contract case whose Codex expectation has support `absent`
**When** the driver runs the case for Codex
**Then** the case executes and asserts the documented absent behavior instead of being skipped

### Requirement: The system shall fix AgentRunResult field capability per provider and forbid synthesized metrics

The system SHALL maintain a result-field capability matrix that lists every field of
`AgentRunResult` with a per-provider capability of `supported` or `absent` plus a reason. The
matrix field-name set MUST equal the field-name set parsed from the `AgentRunResult` interface in
`src/core/port/agent-runner.ts`. For every case execution, any field marked `absent` for that
provider MUST be `undefined` in the returned result.

#### Scenario: matrix covers exactly the port's AgentRunResult fields

**Given** the result-field capability matrix and `src/core/port/agent-runner.ts`
**When** the ratchet parses the `AgentRunResult` interface members with the TypeScript syntax parser
**Then** the parsed field-name set equals the matrix field-name set

#### Scenario: adding a port field without updating the matrix fails the ratchet

**Given** a new optional field is added to `AgentRunResult`
**When** the result-field capability matrix is not updated
**Then** the ratchet fails and reports the uncovered field name

#### Scenario: absent capability fields stay undefined on every case

**Given** the Codex provider whose matrix entry for `contextMetrics` is `absent`
**When** the driver runs any contract case for Codex
**Then** the returned result's `contextMetrics` is `undefined`

#### Scenario: supported capability fields are observed at least once

**Given** the Claude provider whose matrix entry for `invocationMetrics` is `supported`
**When** the full contract suite for Claude finishes
**Then** the execution ledger records at least one case where `invocationMetrics` was defined

### Requirement: The system shall pin existing retry, follow-up and turn accounting semantics

The contract table SHALL pin, per provider, the number of main SDK invocations, the number of
transient retries and their budget, the number of report follow-up attempts and their budget, the
number of post-work and output-repair turns, the relationship between `followUpAttempts` and
`addedTurns`, whether a retry continues the session or starts a fresh one, and the fact that no
additional retry is performed after a timeout or abort. Expected values MUST be taken from
current behavior and MUST NOT be idealized.

#### Scenario: transient retry budget is bounded

**Given** a scenario where every turn fails with a transient error and `transientRetry.maxRetries` is 1
**When** the driver runs the case for a provider
**Then** the recorded SDK invocation count equals `maxRetries + 1` and `completionReason` is `error`

#### Scenario: non-transient failure is not retried

**Given** a scenario whose first turn fails with a non-transient error
**When** the driver runs the case for a provider
**Then** the recorded SDK invocation count is 1 and `completionReason` is `error`

#### Scenario: abort does not trigger an additional retry

**Given** a scenario whose turn stalls until the inactivity watchdog aborts it, with transient retry enabled
**When** the driver runs the case for a provider
**Then** `completionReason` is `timeout`, the error code is `STEP_TIMEOUT`, and no additional SDK
invocation is recorded after the abort

#### Scenario: post-work turns are excluded from followUpAttempts

**Given** a scenario with one post-work prompt and a report delivered on the first turn
**When** the driver runs the case for a provider
**Then** the SDK invocation count is at least 2 and `followUpAttempts` is 0

#### Scenario: addedTurns invariant holds wherever addedTurns is present

**Given** any contract case execution whose result defines `addedTurns`
**When** the driver applies the universal invariants
**Then** `addedTurns.reportRetry + addedTurns.outputRepair` equals `followUpAttempts`

### Requirement: The system shall detect missing provider coverage and implicit skips

The system SHALL fail when a registered provider is missing from a shared case's expectations,
when the provider registry does not match the set of local adapter directories that contain
`agent-runner.ts`, when the contract suite source contains a skip or focus marker, or when the
set of executed `(case ID, provider)` pairs does not equal the full cross product of the required
case IDs and registered providers.

#### Scenario: adding a local adapter without registering it fails the ratchet

**Given** a new directory under `src/adapter/` containing `agent-runner.ts`
**When** the provider registry is not updated to include it
**Then** the contract ratchet fails and names the unregistered adapter directory

#### Scenario: skip and focus markers are rejected

**Given** the source files of the provider lifecycle contract suite
**When** the ratchet scans them for `it.skip`, `describe.skip`, `test.skip`, `it.todo`, and `.only`
**Then** no occurrence is found

#### Scenario: execution ledger equals the full case-by-provider cross product

**Given** the driver has executed every contract case for every registered provider
**When** the final ledger assertion runs in the driver file
**Then** the recorded `(case ID, provider)` pair set equals the cross product of the required case
ID list and the registered provider list

### Requirement: The system shall stop instead of normalizing unexplained provider differences

When a provider difference is found that cannot be explained by SDK capability or existing
specification, the contract SHALL record both providers' measured behavior as-is, mark the reason
with an `UNEXPLAINED:` prefix, and the ratchet MUST fail while any such reason exists, so the
difference is escalated instead of silently normalized toward one provider.

#### Scenario: unexplained difference blocks the suite

**Given** a per-provider expectation whose reason starts with `UNEXPLAINED:`
**When** the contract ratchet runs
**Then** the ratchet fails and reports the count and the affected case IDs

#### Scenario: no unexplained differences in the delivered contract

**Given** the delivered contract case table and result-field capability matrix
**When** the contract ratchet counts reasons prefixed with `UNEXPLAINED:`
**Then** the count is 0

### Requirement: The system shall keep provider production behavior and SDK type containment unchanged

The change SHALL NOT modify any file under `src/`, SHALL NOT change the `AgentRunner` or
`AgentRunResult` contract, and SHALL NOT delete or weaken existing provider-specific tests.
Provider SDK packages MUST only be imported from within `src/adapter/claude-code/` and
`src/adapter/codex/`, and the provider-neutral modules of the contract suite MUST NOT import
provider adapter modules or provider SDK packages.

#### Scenario: no production source is modified

**Given** the change branch at completion
**When** the diff against the base branch is restricted to `src/`
**Then** the diff is empty

#### Scenario: provider SDK imports stay inside the two provider adapter directories

**Given** the repository source tree under `src/`
**When** the ratchet lists files importing `@anthropic-ai/claude-agent-sdk` or `@openai/codex-sdk`
**Then** every such file is under `src/adapter/claude-code/` or `src/adapter/codex/`

#### Scenario: provider-neutral contract modules stay provider-free

**Given** the contract suite modules `case-ids.ts`, `scenario.ts`, `case-table.ts`,
`result-field-matrix.ts`, `harness/types.ts`, and the driver test
**When** the ratchet scans their import statements
**Then** none of them imports from `src/adapter/claude-code/`, `src/adapter/codex/`, or a provider
SDK package

#### Scenario: existing provider tests remain intact

**Given** the existing provider-specific test files under `src/adapter/claude-code/__tests__/`,
`src/adapter/codex/__tests__/`, `tests/unit/adapter/`, and `tests/adapter/`
**When** the change branch is compared to the base branch
**Then** none of those files is deleted or modified
