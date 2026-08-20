# Spec: --from の検証正本を core に一本化し CLI 静的 enum を撤去する

## Requirements

### Requirement: CLI parser shall accept any string for the --from flag

The CLI `from` flag for `job resume` and `job reopen` SHALL accept any string value without parser-level validation. The flag SHALL NOT have a `values:` enum constraint. All step-name validation SHALL occur in core (`buildAllowedStepSet` → `resolveResumeStep`) after job state is loaded.

#### Scenario: --from regression-gate accepted by CLI parser for resume

**Given** a `job resume <slug> --from regression-gate` invocation
**When** the CLI flag-parser processes the `--from` argument
**Then** no FlagParseError is thrown and the value `"regression-gate"` is passed to the resume handler

#### Scenario: --from custom-reviewers accepted by CLI parser for resume

**Given** a `job resume <slug> --from custom-reviewers` invocation
**When** the CLI flag-parser processes the `--from` argument
**Then** no FlagParseError is thrown and the value `"custom-reviewers"` is passed to the resume handler

#### Scenario: --from <member-name> accepted by CLI parser for resume

**Given** a `job resume <slug> --from alice` invocation where `alice` is not in the static step list
**When** the CLI flag-parser processes the `--from` argument
**Then** no FlagParseError is thrown and the value `"alice"` is passed to the resume handler

#### Scenario: --from regression-gate accepted by CLI parser for reopen

**Given** a `job reopen <slug> --from regression-gate --reason "x"` invocation
**When** the CLI flag-parser processes the `--from` argument
**Then** no FlagParseError is thrown and the value `"regression-gate"` is passed to the reopen handler

---

### Requirement: Core shall accept dynamic --from values for jobs with custom reviewers

When a job has custom reviewers, `resolveResumeStep` SHALL accept `regression-gate`, `custom-reviewers`, and each reviewer member name as valid `--from` values. Member names SHALL be mapped to the `custom-reviewers` coordinator step.

#### Scenario: --from regression-gate succeeds for job with custom reviewers

**Given** a job that has at least one custom reviewer in `state.reviewers`
**When** `job resume <slug> --from regression-gate` is invoked
**Then** the pipeline resumes from the `regression-gate` step (exit code 0)

#### Scenario: --from custom-reviewers succeeds for job with custom reviewers

**Given** a job that has at least one custom reviewer in `state.reviewers`
**When** `job resume <slug> --from custom-reviewers` is invoked
**Then** the pipeline resumes from the `custom-reviewers` coordinator step (exit code 0)

#### Scenario: --from <member-name> maps to coordinator for job with custom reviewers

**Given** a job with a custom reviewer named `"security"` in `state.reviewers`
**When** `job resume <slug> --from security` is invoked
**Then** `resolveResumeStep` maps `"security"` to `"custom-reviewers"` and the pipeline resumes from the coordinator step

---

### Requirement: Invalid --from values shall exit with code 2

When `--from` is explicitly specified and `resolveResumeStep` rejects the value, the process SHALL exit with code 2 (ARG_ERROR). This applies to both `job resume` and `job reopen`.

#### Scenario: --from with nonexistent step exits 2 for resume

**Given** a halted job
**When** `job resume <slug> --from nonexistent-step` is invoked
**Then** the process exits with code 2 and the error message lists available step names

#### Scenario: --from regression-gate exits 2 for job without custom reviewers (resume)

**Given** a job that has NO custom reviewers (`state.reviewers` is empty or absent)
**When** `job resume <slug> --from regression-gate` is invoked
**Then** `resolveResumeStep` rejects the value and the process exits with code 2

#### Scenario: --from with nonexistent step exits 2 for reopen

**Given** an awaiting-archive job with an OPEN PR
**When** `job reopen <slug> --from nonexistent-step --reason "x"` is invoked
**Then** the process exits with code 2 and the error message lists available step names

#### Scenario: --from regression-gate exits 2 for job without custom reviewers (reopen)

**Given** an awaiting-archive job with an OPEN PR and NO custom reviewers
**When** `job reopen <slug> --from regression-gate --reason "x"` is invoked
**Then** the process exits with code 2

---

### Requirement: Resume without --from shall exit with code 1 when no resume position can be determined

When `--from` is NOT specified and no resume position can be determined (no `resumePoint`, `state.step` absent or not a pipeline step), the process SHALL exit with code 1.

#### Scenario: No --from, no resume position → exit 1

**Given** a job with `state.step = "init"`, no `resumePoint`, and no `--from` flag
**When** `job resume <slug>` is invoked
**Then** `resolveResumeStep` throws and the process exits with code 1

---

### Requirement: Resume usage text shall accurately describe --from target steps

The resume usage text (`--help` output) SHALL NOT contain the phrase "composite steps ... are not valid --from targets". It SHALL state that jobs with custom reviewers also accept `regression-gate`, `custom-reviewers`, and reviewer member names as `--from` values. The `bite-evidence` internal step note SHALL be preserved.

#### Scenario: --help does not contain misleading composite-steps note

**Given** the user runs `job resume --help`
**When** the usage text is printed
**Then** the output does NOT contain "composite steps" and "are not valid --from targets"
**And** the output contains a reference to "custom reviewers" and dynamic step names
**And** the output contains the "bite-evidence" internal step note

---

### Requirement: Reopen usage text shall mention dynamic step support

The reopen usage text SHALL include a note that jobs with custom reviewers also accept `regression-gate`, `custom-reviewers`, and reviewer member names as `--from` values.

#### Scenario: --help mentions custom reviewers for reopen

**Given** the user runs `job reopen --help`
**When** the usage text is printed
**Then** the output contains a reference to "custom reviewers" and dynamic `--from` targets
