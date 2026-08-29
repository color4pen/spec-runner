# Spec: Remove the bite-evidence feature

## Requirements

### Requirement: The implementer step shall route directly to verification

The STANDARD pipeline SHALL transition from `implementer` on a successful outcome directly to
`verification` in every case. The transition MUST NOT depend on request type, on whether verification
previously failed, or on any intermediate gate. `implementer` on `error` SHALL continue to escalate.

#### Scenario: normal implementation success

**Given** a STANDARD pipeline job of request type `new-feature` whose `implementer` step completes with outcome `success`
**When** the transition table resolves the next step
**Then** the next step is `verification`

#### Scenario: test-gen exempt type

**Given** a STANDARD pipeline job whose request type is test-gen exempt and whose `implementer` step completes with outcome `success`
**When** the transition table resolves the next step
**Then** the next step is `verification`

#### Scenario: re-entry after a verification failure

**Given** a STANDARD pipeline job whose last `verification` attempt failed and whose `implementer` step has since completed with outcome `success`
**When** the transition table resolves the next step
**Then** the next step is `verification`

#### Scenario: implementer error still escalates

**Given** a STANDARD pipeline job whose `implementer` step completes with outcome `error`
**When** the transition table resolves the next step
**Then** the pipeline escalates

### Requirement: bite-evidence shall not be a registered pipeline step

The system SHALL NOT expose `bite-evidence` as an executable step. The STANDARD pipeline descriptor MUST
NOT list it in its steps or roles, the CLI step-name set MUST NOT contain it, and the prompt pipeline map
rendered into agent instructions MUST NOT mention it. No transition row MUST reference it as a source or
a destination.

#### Scenario: descriptor no longer contains the step

**Given** the STANDARD pipeline descriptor
**When** its registered step names are enumerated
**Then** `bite-evidence` is absent and `implementer` is immediately followed by `verification`

#### Scenario: prompt pipeline map matches the descriptor

**Given** the prompt pipeline map used to render agent instructions
**When** its entries are compared with the STANDARD descriptor's step list
**Then** the two agree and neither mentions `bite-evidence`

### Requirement: legacy bite-evidence resume targets shall resolve to verification

The resume resolver SHALL treat the step name `bite-evidence` as a legacy alias for `verification`. This
MUST apply to an explicit `--from bite-evidence` request, to a persisted `resumePoint.step` of
`bite-evidence`, and to a halted `state.step` of `bite-evidence`. Attaching to a checkpoint recorded at
`bite-evidence` MUST likewise resolve to `verification`.

#### Scenario: explicit --from flag

**Given** an existing job on disk
**When** resume is requested with `--from bite-evidence`
**Then** the resolved step is `verification` and no error is raised

#### Scenario: persisted resume point

**Given** a job whose saved `resumePoint.step` is `bite-evidence` and no explicit `--from` is given
**When** the resume step is resolved
**Then** the resolved step is `verification`

#### Scenario: halted state step

**Given** a job whose `state.step` is `bite-evidence` with no resume point and no explicit `--from`
**When** the resume step is resolved
**Then** the resolved step is `verification`

### Requirement: legacy bite-evidence state and journal data shall remain readable

The system SHALL continue to parse persisted job state that contains a `biteEvidence` record array and
journal entries whose step name is `bite-evidence` or whose verdict is `strategy-deferred`. Folding such a
journal MUST succeed and PR attestation generation MUST include those historical step attempts. The system
MUST NOT write any new `biteEvidence` record.

#### Scenario: legacy state parses

**Given** a persisted `state.json` containing a non-empty `biteEvidence` record array
**When** the state is loaded and validated
**Then** validation succeeds and the records are preserved

#### Scenario: legacy journal folds

**Given** an `events.jsonl` containing step-attempt entries for the step `bite-evidence`, including one with verdict `strategy-deferred`
**When** the journal is folded into job state
**Then** the fold succeeds and the attestation built from it renders those attempts

#### Scenario: no new records are produced

**Given** a job that runs to completion under the current pipeline
**When** the resulting job state is inspected
**Then** no `biteEvidence` record was written by any step

### Requirement: declaring the removed assurance dimension shall be a configuration error

Configuration validation SHALL reject any configuration in which the key
`archive.minimumAssurance.biteEvidence` is present, regardless of its value, including `null`. The error
MUST carry the code `CONFIG_INVALID` and its message MUST name the key and instruct the operator to remove
it. A configuration that omits the key MUST validate successfully.

#### Scenario: key present with a level value

**Given** a configuration where `archive.minimumAssurance.biteEvidence` is set to `"required"`
**When** the configuration is validated
**Then** validation fails with an error whose code is `CONFIG_INVALID` and whose message names `archive.minimumAssurance.biteEvidence`

#### Scenario: key present with a relaxed value

**Given** a configuration where `archive.minimumAssurance.biteEvidence` is set to `"optional"`
**When** the configuration is validated
**Then** validation fails with an error whose code is `CONFIG_INVALID`

#### Scenario: key absent

**Given** a configuration whose `archive.minimumAssurance` declares only `testDerivation` and `specReview`
**When** the configuration is validated
**Then** validation succeeds

### Requirement: the archive floor shall evaluate only testDerivation and specReview

Achieved-assurance derivation at archive time SHALL produce results only for `testDerivation` and
`specReview`, and MUST NOT execute any test as part of that derivation. The standard profile's declared
assurance MUST contain only those two dimensions, and floor satisfaction MUST be evaluated over them
alone while remaining fail-closed for each.

#### Scenario: derivation runs no tests

**Given** an archive operation with a runtime that provides only file-reading capability
**When** achieved assurance is derived at the final HEAD
**Then** derivation completes, reports `testDerivation` and `specReview`, and invokes no test execution

#### Scenario: standard profile assurance

**Given** the standard profile
**When** its declared assurance dimensions are enumerated
**Then** exactly `testDerivation` and `specReview` are present

#### Scenario: fail-closed retained for remaining dimensions

**Given** a floor requiring `specReview` and an achieved assurance in which `specReview` could not be established
**When** floor satisfaction is evaluated
**Then** the floor is not satisfied and archiving is blocked

### Requirement: bite-evidence-only configuration and runtime surface shall be removed

The configuration schema SHALL NOT define `verification.scopedTestCommand` or
`verification.scopedTestPatterns`, and a configuration that still contains them MUST validate
successfully with those keys having no effect. The runtime port MUST NOT declare
`listChangedFilesBetweenCommits`, `runTestsAtCommit` or `runTestsOnSynthesizedTree`, while
`listCommitChangedFiles` and `readFileAtCommit` MUST remain available.

#### Scenario: leftover scoped-test keys are ignored

**Given** a configuration that still sets `verification.scopedTestCommand` and `verification.scopedTestPatterns`
**When** the configuration is validated
**Then** validation succeeds and neither key affects any behavior

#### Scenario: retained runtime capability

**Given** the local runtime implementation
**When** its available methods are inspected
**Then** `listCommitChangedFiles` and `readFileAtCommit` are present and the three bite-evidence-only primitives are absent

### Requirement: the pipeline shall not manage a bite-evidence result artifact

The system SHALL NOT write a `bite-evidence-result.md` artifact, MUST NOT include its path in the set of
pipeline-managed paths, and MUST NOT reference the artifact in operator-facing message text.

#### Scenario: managed paths exclude the artifact

**Given** the set of pipeline-managed paths for a round
**When** the set is enumerated
**Then** no entry refers to `bite-evidence-result.md`

### Requirement: current-state documentation shall match the pipeline

Documentation that describes the pipeline's current behavior — the README pipeline listing, the
configuration reference and the project overview — SHALL NOT present `bite-evidence` as a step that runs.
The configuration reference MUST document that `archive.minimumAssurance.biteEvidence` is rejected and
that the scoped-test keys are ignored. Historical ADRs MUST remain unmodified.

#### Scenario: README pipeline list

**Given** the README pipeline step listing
**When** it is read
**Then** it does not list `bite-evidence` and its step numbering is contiguous

#### Scenario: configuration reference documents the removal

**Given** the configuration reference document
**When** it is read
**Then** it no longer documents the scoped-test keys and it states that `archive.minimumAssurance.biteEvidence` is now rejected
