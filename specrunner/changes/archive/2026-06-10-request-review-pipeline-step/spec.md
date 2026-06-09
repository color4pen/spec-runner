# Spec: request-review pipeline step

## Requirements

### Requirement: request-review SHALL be the first pipeline step

The standard pipeline SHALL execute `request-review` as its first step. Both
`STANDARD_DESCRIPTOR.startStep` and `PipelineRunCommand.prepare()`'s `startStep`
MUST be `request-review`, and `request-review` MUST precede `design` in the step list.

#### Scenario: run starts at request-review

**Given** a request.md exists at `specrunner/drafts/<slug>/request.md`
**When** `specrunner run <slug>` is executed
**Then** the pipeline executes the `request-review` step before any other step

#### Scenario: request-review is registered as an agent step

**Given** the step name whitelists
**When** the build compiles
**Then** `"request-review"` is present in both `AGENT_STEP_NAMES` and the `AgentStepName` union, and the bidirectional sync guard in `state/schema.ts` passes

### Requirement: request-review SHALL report a typed verdict via report_result

The request-review step SHALL obtain its verdict from the `report_result` tool's
typed result (`REQUEST_REVIEW_REPORT_TOOL`), not from prose parsing of the result file.
The verdict MUST be one of `approve`, `needs-discussion`, or `reject`. When the agent
completes without calling the tool (null toolResult), the executor MUST treat the
outcome as `needs-discussion`.

#### Scenario: verdict derived from tool result

**Given** the request-review agent calls `report_result` with `{ ok: true, verdict: "approve" }`
**When** `StepExecutor.finalizeStep()` derives the outcome
**Then** the recorded step verdict is `approve`

#### Scenario: missing tool call falls back to needs-discussion

**Given** the request-review agent ends its turn without calling `report_result`
**When** `StepExecutor.finalizeStep()` derives the outcome
**Then** the recorded step verdict is `needs-discussion`

### Requirement: The Verdict type SHALL NOT be extended

The request-review verdict values SHALL be handled as transition-table `on: string`
matches. The `Verdict` union in `state/schema.ts` MUST NOT gain `approve`,
`needs-discussion`, or `reject` members.

#### Scenario: verdict matched as string in transition table

**Given** request-review produced verdict `approve`
**When** the pipeline looks up the next step
**Then** the transition `{ step: "request-review", on: "approve", to: "design" }` matches via string equality, without `Verdict` being extended

### Requirement: approve SHALL route to design

When request-review's verdict is `approve`, the pipeline SHALL transition to the `design` step.

#### Scenario: approve proceeds to design

**Given** request-review completed with verdict `approve`
**When** the transition table is consulted
**Then** the next step is `design`

### Requirement: needs-discussion SHALL halt the pipeline

When request-review's verdict is `needs-discussion`, the pipeline SHALL escalate
(transition to `escalate`), leaving the job in `awaiting-resume`.

#### Scenario: needs-discussion escalates

**Given** request-review completed with verdict `needs-discussion`
**When** the transition table is consulted
**Then** the pipeline terminates via `escalate` and the job status becomes `awaiting-resume`

### Requirement: reject SHALL halt the pipeline

When request-review's verdict is `reject`, the pipeline SHALL escalate
(transition to `escalate`), leaving the job in `awaiting-resume`.

#### Scenario: reject escalates

**Given** request-review completed with verdict `reject`
**When** the transition table is consulted
**Then** the pipeline terminates via `escalate` and the job status becomes `awaiting-resume`

### Requirement: request-review SHALL write a result file

The request-review step SHALL write its findings to
`specrunner/changes/<slug>/request-review-result-{n}.md`, where `{n}` is the
3-digit zero-padded iteration number, following the same A-group template mechanism
as other reviewer steps.

#### Scenario: result file produced on first iteration

**Given** request-review runs for the first time for a slug
**When** the step completes
**Then** `specrunner/changes/<slug>/request-review-result-001.md` exists in the change folder

### Requirement: request-review SHALL remain read-only

The request-review step SHALL NOT modify `request.md` or any source file. Quality
improvement of the request is the responsibility of `request generate`.

#### Scenario: request.md unchanged after review

**Given** request-review runs against a request.md
**When** the step completes
**Then** the content of `specrunner/changes/<slug>/request.md` is unchanged by the review (only the result file is added)

### Requirement: run SHALL preserve the draft

The `run` (job start) workspace setup SHALL copy the draft into the change folder
WITHOUT deleting the draft. The draft `specrunner/drafts/<slug>/request.md` MUST
remain in the main working tree after run, in both local and managed runtimes.

#### Scenario: draft persists after run

**Given** a draft at `specrunner/drafts/<slug>/request.md`
**When** `specrunner run <slug>` sets up the workspace
**Then** `specrunner/drafts/<slug>/request.md` still exists after setup and a copy exists at the change folder

### Requirement: resume SHALL re-copy the draft into the worktree

On every resume, the workspace setup SHALL re-copy `specrunner/drafts/<slug>/request.md`
into the worktree's change folder when the draft exists, and SHALL skip silently when
the draft is absent. The re-copy MUST occur before the pipeline executes so the agent
reads the current draft content.

#### Scenario: edited draft is reviewed after resume

**Given** a job halted at request-review with verdict `needs-discussion`
**And** the user edits `specrunner/drafts/<slug>/request.md`
**When** `specrunner resume <slug>` runs
**Then** the worktree's `specrunner/changes/<slug>/request.md` reflects the edited draft content before request-review re-runs

#### Scenario: absent draft is skipped

**Given** a job to resume whose draft directory does not exist
**When** the workspace is set up for resume
**Then** the re-copy is skipped without error

### Requirement: archive SHALL delete the draft directory

The archive command SHALL delete `specrunner/drafts/<slug>/` when it exists, and
SHALL skip silently when it is absent. When the draft was git-tracked, the deletion
SHALL be staged so it is included in the archive commit.

#### Scenario: draft removed on archive

**Given** an archivable job whose draft directory `specrunner/drafts/<slug>/` exists
**When** `specrunner job archive <slug>` runs
**Then** `specrunner/drafts/<slug>/` no longer exists after archive

### Requirement: the `request review` command SHALL be removed

The `request review` subcommand SHALL be removed from the CLI. Invoking
`specrunner request review <slug>` MUST fail as an unknown subcommand (exit code 2).

#### Scenario: removed command rejected

**Given** the CLI command registry
**When** `specrunner request review <slug>` is invoked
**Then** the CLI prints "Unknown request subcommand: review" and exits with code 2

### Requirement: managed runtime SHALL register the request-review agent

The managed setup SHALL include `RequestReviewStep` in
`AgentRegistry.fromSteps()` so that re-running `runtime setup` registers the
request-review agent.

#### Scenario: request-review agent registered on setup

**Given** managed runtime configuration
**When** `AgentRegistry.fromSteps([...])` is built during `runtime setup`
**Then** the registry includes an agent for role `request-review`

### Requirement: request-review model SHALL follow the config resolution chain

The request-review step's model SHALL resolve through the standard step-config
resolution chain, with a hardcoded step-definition default of `claude-sonnet-4-6`.

#### Scenario: default model is sonnet

**Given** no `steps.request-review` model override in config
**When** the request-review step model is resolved
**Then** the resolved model is `claude-sonnet-4-6`

#### Scenario: config override applies

**Given** `steps.request-review.model` is set in project config
**When** the request-review step model is resolved (local runtime)
**Then** the configured model is used instead of the default
