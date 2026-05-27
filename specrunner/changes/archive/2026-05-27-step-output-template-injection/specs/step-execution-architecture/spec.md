# step-execution-architecture Delta Spec

## Requirements

### Requirement: StepExecutor Manages Lifecycle and Emits Events

`StepExecutor` SHALL coordinate the I/O lifecycle of a `Step` execution. The lifecycle SHALL branch on `step.kind`:

For `kind: "agent"` steps:

1. Emit `step:start`
2. Call `store.update(state, { step: step.name })` to record current step for `specrunner ps`
3. **For local runtime: call `writeOutputTemplates(cwd, slug, step.name, state)` to place output file templates in the change folder before agent execution**
4. Delegate to `AgentRunner.run(ctx)` which handles session creation, polling, and result fetching. The `AgentRunContext` SHALL include `requestType` from `deps.request.type` so that adapters can pass it to `getStepExecutionConfig()` for type-aware model resolution.
5. Receive `AgentRunResult` containing `completionReason`, `resultContent`, `sessionId?`, `agentBranch?`, `error?`
6. **For local runtime: call `cleanupOutputTemplates(cwd, slug, step.name, state)` to remove reference-only templates (B-group) before commit**
7. **For local runtime: call `commitAndPush(step, state, deps)` to stage, commit, and push agent-written files**
8. On success: parse verdict from `resultContent` via `step.parseResult` (or derive verdict from `step.completionVerdict` when `resultContent` is null; if `completionVerdict` is also undefined, fall back to `"escalation"`)
9. Emit `verdict:parsed`
10. Persist the `StepRun` via `JobStateStore.appendStepRun` (recording `sessionId` from result)
11. Set `state.branch` from `result.agentBranch` if present and `state.branch` is unset
12. Emit `step:complete` on success or `step:error` on failure

The template placement (step 3) and cleanup (step 6) SHALL only execute when the runtime configuration is `"local"`. For `"managed"` runtime, these steps SHALL be skipped.

The `commitAndPush` step (step 7) SHALL only execute when the runtime configuration is `"local"`. For `"managed"` runtime, step 7 SHALL be skipped. All other lifecycle steps remain unchanged.

`StepExecutor` SHALL accept an optional `SpawnFn` via constructor injection for git subprocess execution. This dependency is used exclusively by `commitAndPush` and SHALL NOT affect the existing `EventBus` and `AgentRunner` constructor parameters.

#### Scenario: Output templates are placed before agent execution (local runtime)

- **GIVEN** a design step that runs under local runtime
- **WHEN** `StepExecutor.runAgentStep(step, state, deps)` executes
- **THEN** `writeOutputTemplates(cwd, slug, "design", state)` is called before `runner.run(ctx)`
- **AND** template files exist in the change folder when the agent session starts

#### Scenario: Reference-only templates are cleaned up after agent execution (local runtime)

- **GIVEN** a design step that completes successfully under local runtime
- **WHEN** `StepExecutor.runAgentStep(step, state, deps)` completes the agent session
- **THEN** `cleanupOutputTemplates(cwd, slug, "design", state)` is called before `commitAndPush`
- **AND** `delta-spec-template.md` is removed from the change folder before git add

#### Scenario: Template placement is skipped under managed runtime

- **GIVEN** an agent step running under managed runtime
- **WHEN** `StepExecutor.runAgentStep(step, state, deps)` executes
- **THEN** `writeOutputTemplates` is NOT called
- **AND** `cleanupOutputTemplates` is NOT called

### Requirement: Output Template Placement Produces Correctly Named Files

`writeOutputTemplates()` SHALL place template files in the change folder at paths that match the output file paths expected by each step. The function MUST use the same path computation logic as the step's `resultFilePath()` and `buildMessage()` methods.

For steps with iteration-based output (spec-review, code-review), the template file name SHALL include the zero-padded 3-digit iteration number matching the upcoming iteration.

For the design step, templates for both design.md and tasks.md SHALL be placed. Additionally, a reference-only template (`delta-spec-template.md`) SHALL be placed with `cleanup: true` metadata.

Steps that do not produce structured output files (spec-fixer, implementer, build-fixer, code-fixer, adr-gen) SHALL return an empty template list.

#### Scenario: spec-review iteration 2 produces correctly named template

- **GIVEN** a job state where `state.steps["spec-review"]` has 1 existing entry
- **WHEN** `getOutputTemplates("spec-review", slug, state)` is called
- **THEN** the returned list contains one entry with path ending in `spec-review-result-002.md`

#### Scenario: design step returns three templates including cleanup marker

- **GIVEN** a job state with no prior design step runs
- **WHEN** `getOutputTemplates("design", slug, state)` is called
- **THEN** the returned list contains entries for `design.md`, `tasks.md`, and `delta-spec-template.md`
- **AND** only `delta-spec-template.md` has `cleanup: true`

#### Scenario: implementer step returns empty template list

- **GIVEN** any job state
- **WHEN** `getOutputTemplates("implementer", slug, state)` is called
- **THEN** the returned list is empty

### Requirement: Output Templates Contain Machine-Parsed Format as HTML Comments

Each output template SHALL contain the machine-parsed field format requirements as HTML comments (`<!-- ... -->`). The template body SHALL provide a skeleton structure that the agent fills in.

The HTML comments MUST specify:
- For verdict-bearing files: the exact verdict line format (`- **verdict**: <value>`)
- For files with tables: column definitions and required columns
- For files with structured sections: required section headers and their expected content format
- For files with YAML blocks: all required keys and valid values

#### Scenario: spec-review-result template contains verdict format

- **GIVEN** the `SPEC_REVIEW_RESULT_TEMPLATE` constant
- **WHEN** its content is inspected
- **THEN** it contains an HTML comment specifying the verdict line format `- **verdict**: <approved|needs-fix|escalation>`
- **AND** it contains an HTML comment specifying the Findings table with 6 columns

#### Scenario: test-cases template contains Result YAML keys

- **GIVEN** the `TEST_CASES_TEMPLATE` constant
- **WHEN** its content is inspected
- **THEN** it contains an HTML comment listing all required Result YAML keys: result, total, automated, manual, must, should, could, blocked_reasons
