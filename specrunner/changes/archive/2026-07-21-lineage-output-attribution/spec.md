# Spec: lineage-output-attribution

## Requirements

### Requirement: lineage.outputs must reference files produced by the current attempt

The system SHALL evaluate `step.writes(state, deps)` against the job state **before** the attempt's `StepRun` is appended, so that `nextIteration` returns the iteration index matching the file actually written.

#### Scenario: first attempt of an iteration-dependent step

**Given** a step with `writes()` that calls `nextIteration(state, stepName)`, and no prior runs of that step
**When** the step completes successfully and CommitOrchestrator persists the result
**Then** `lineage.outputs[0].path` ends with `-001.<ext>` (the file just written, not `-002`)

#### Scenario: second attempt of the same step

**Given** the same step has been run once (one entry in `state.steps[stepName]`)
**When** the step completes successfully for the second time
**Then** `lineage.outputs[0].path` ends with `-002.<ext>` (the file just written, not `-003`)

---

### Requirement: lineage.outputs and inputs hash must be non-null for files that exist

The system SHALL compute sha256 content hashes for all artifact paths that resolve to existing files on the local filesystem, and record them as `"sha256:<hex>"` in `lineage.outputs` and `lineage.inputs`.

#### Scenario: output file exists at the correct (fixed) path

**Given** the step's output file was written to the correct iteration path
**When** CommitOrchestrator records the lineage event
**Then** `lineage.outputs[0].hash` matches `"sha256:" + sha256(fileContent)` and is not null

#### Scenario: optional input file does not exist

**Given** a step declares an optional read (`required: false`) for a file that does not exist
**When** CommitOrchestrator records the lineage event
**Then** `lineage.inputs[i].hash` is null (file not found; best-effort, no error)

---

### Requirement: parallel round path has the same attribution fix

The system SHALL also evaluate `writes(state, deps)` for each parallel round member against the state **before** that member's result is folded in, applying the same timing fix as the sequential path.

#### Scenario: parallel reviewer with iteration-dependent writes

**Given** a custom reviewer step uses `nextIteration(state, stepName)` in `writes()`
**When** `commitRound` folds the member result and then records lineage
**Then** the lineage path corresponds to the actual iteration, not `iteration + N` (where N is the total number of members whose results were folded before evaluation)
