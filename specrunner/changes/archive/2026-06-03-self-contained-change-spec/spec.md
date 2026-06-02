# Spec: self-contained-change-spec

## Requirements

### Requirement: Design step SHALL produce a single spec.md in the change folder

The design step SHALL place a self-contained `spec.md` at `specrunner/changes/<slug>/spec.md` as an A-group template. The agent overwrites this file with the spec content. The file is permanent and not deleted after the step completes.

#### Scenario: spec.md placed as A-group template before design runs

**Given** the pipeline is about to execute the design step
**When** the executor invokes writeOutputTemplates for the design step
**Then** `specrunner/changes/<slug>/spec.md` exists in the change folder as an A-group template (cleanup: false)
**And** `delta-spec-template.md` is NOT placed

#### Scenario: design agent writes spec content to spec.md

**Given** the design step is running for a spec-change or new-feature request
**When** the design agent completes its work
**Then** `specrunner/changes/<slug>/spec.md` contains the Layer-1 behavioral specification for the change
**And** no files exist under `specrunner/changes/<slug>/specs/` (capability-split is abolished)

### Requirement: Pipeline SHALL NOT include delta-spec-validation or delta-spec-fixer steps

The pipeline MUST NOT contain `delta-spec-validation` or `delta-spec-fixer` as pipeline steps. Rule-based spec validation is abolished.

#### Scenario: design step transitions directly to spec-review

**Given** the design step completes successfully
**When** the pipeline resolves the next step from the transition table
**Then** the next step is `spec-review` (not `delta-spec-validation`)

#### Scenario: spec-fixer transitions directly to spec-review

**Given** the spec-fixer step completes successfully
**When** the pipeline resolves the next step from the transition table
**Then** the next step is `spec-review` (not `delta-spec-validation`)

#### Scenario: code-review approved transitions directly to adr-gen

**Given** the code-review step produces an `approved` verdict with no fixable findings
**When** the pipeline resolves the next step from the transition table
**Then** the next step is `adr-gen` (not `delta-spec-validation`)

### Requirement: Rules registry and validator SHALL be removed from src

The `src/core/spec/rules/` directory and `src/core/spec/delta-spec-validator.ts` MUST NOT exist. No code in `src/` SHALL import from these modules.

#### Scenario: no references to rules or validator remain

**Given** the implementation is complete
**When** searching for imports of `src/core/spec/rules/` or `src/core/spec/delta-spec-validator` in `src/`
**Then** zero matches are found

### Requirement: Step names SHALL NOT include delta-prefixed entries

`AGENT_STEP_NAMES`, `CLI_STEP_NAMES`, and `STEP_NAMES` MUST NOT contain `delta-spec-validation` or `delta-spec-fixer`.

#### Scenario: step name constants exclude delta entries

**Given** the implementation is complete
**When** reading `src/kernel/step-names.ts`
**Then** neither `"delta-spec-validation"` nor `"delta-spec-fixer"` appears in any exported array or object

### Requirement: spec-review SHALL review spec.md semantically without baseline reference

The spec-review agent MUST review the `spec.md` file's definition segments (Requirements, Scenarios) for correctness and completeness. It SHALL NOT reference baseline specs for header-matching or consistency checks.

#### Scenario: spec-review evaluates spec.md segments

**Given** a spec-review session is started
**When** the agent reviews the change folder
**Then** the agent reads `specrunner/changes/<slug>/spec.md` and evaluates each Requirement and Scenario for correctness and sufficiency
**And** the agent does NOT read `specrunner/specs/<capability>/spec.md` for header-matching purposes

### Requirement: test-case-gen SHALL read spec.md from the change folder root

The test-case-gen agent MUST read the spec from `specrunner/changes/<slug>/spec.md` (not from `specs/<capability>/spec.md` under the change folder).

#### Scenario: test-case-gen reads the new spec path

**Given** the test-case-gen step is running
**When** the agent reads the spec for test case derivation
**Then** the agent reads `specrunner/changes/<slug>/spec.md`

### Requirement: No "delta" naming SHALL remain in step names, template names, path helpers, or prompt text

All references to "delta" in the context of spec naming (step names, template names, path helper function names, and prompt text) MUST be removed or renamed.

#### Scenario: grep for delta-spec references in src

**Given** the implementation is complete
**When** running `grep -r "delta-spec" src/`
**Then** zero matches are found (excluding git diff context or unrelated usage)

#### Scenario: grep for "delta spec" in prompt text

**Given** the implementation is complete
**When** running `grep -r "delta spec" src/prompts/`
**Then** zero matches are found
