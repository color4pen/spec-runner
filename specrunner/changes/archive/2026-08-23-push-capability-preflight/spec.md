# Spec: push capability preflight

## Requirements

### Requirement: The system shall detect an unpushable-path capability constraint from the runtime environment

The system SHALL derive a push capability declaration at run start without requiring any edit to
`.github/workflows/**`. The declaration MUST list `.github/workflows/**` as an unpushable path
pattern when, and only when, all of the following hold: the environment variable `GITHUB_ACTIONS`
equals `"true"`, `GH_TOKEN` is unset or empty, and the resolved GitHub token begins with the
GitHub App installation token prefix `ghs_`. In every other environment the declaration MUST be
empty (undeclared).

#### Scenario: Actions with an installation token declares the workflows pattern

**Given** `GITHUB_ACTIONS` is `"true"`, `GH_TOKEN` is unset, and the resolved token starts with `ghs_`
**When** the push capability is resolved for the run
**Then** the declaration contains the pattern `.github/workflows/**`

#### Scenario: Actions with an explicit PAT in GH_TOKEN declares nothing

**Given** `GITHUB_ACTIONS` is `"true"` and `GH_TOKEN` is set to a non-empty personal access token
**When** the push capability is resolved for the run
**Then** the declaration contains no patterns

#### Scenario: Local run declares nothing

**Given** `GITHUB_ACTIONS` is unset
**When** the push capability is resolved for the run
**Then** the declaration contains no patterns

#### Scenario: Actions with a non-installation token declares nothing

**Given** `GITHUB_ACTIONS` is `"true"`, `GH_TOKEN` is unset, and the resolved token starts with `ghp_`
**When** the push capability is resolved for the run
**Then** the declaration contains no patterns

### Requirement: The system shall notify the capability constraint into agent context without gating on predictions

When the push capability declares at least one unpushable path pattern, the system SHALL append a
capability notice to the request-review and implementer agent messages. When the request-review
predicted `touchedFiles` include a path matching a declared pattern, the notice MUST additionally
name those paths as an advance warning. A predicted match MUST NOT halt, fail, or otherwise
interrupt the pipeline. When the declaration is empty, no notice MUST be appended.

#### Scenario: Notice appended for the implementer under a declaring environment

**Given** the push capability declares `.github/workflows/**`
**When** the implementer step builds its agent message
**Then** the message contains the declared pattern and states that the environment cannot push it

#### Scenario: Predicted touchedFiles match produces a warning but no interruption

**Given** the push capability declares `.github/workflows/**`
**And** the predicted touchedFiles include `.github/workflows/ci.yml`
**When** the request-review step message is built and the step runs
**Then** the message names `.github/workflows/ci.yml` as an advance warning
**And** the step outcome is not a halt

#### Scenario: No notice under an undeclared environment

**Given** the push capability declares no patterns
**When** the implementer step builds its agent message
**Then** the message is byte-identical to the message built without a push capability

### Requirement: The system shall enumerate the paths a push would publish from the real repository state

The system SHALL compute the set of paths that an upcoming push would publish as the union of
(a) the worktree change paths including untracked files and (b) the paths touched by every commit
reachable from `HEAD` that is not yet present on any `origin` remote-tracking ref. A path
contributed by any single unpushed commit MUST be included even when a later commit reverts it.

#### Scenario: Worktree changes are included

**Given** `.github/workflows/ci.yml` is modified in the worktree and not committed
**When** the publishable path set is computed
**Then** the set contains `.github/workflows/ci.yml`

#### Scenario: A path touched by an unpushed commit and reverted later is still included

**Given** an unpushed commit adds `.github/workflows/ci.yml`
**And** a later unpushed commit deletes it, leaving a clean worktree
**When** the publishable path set is computed
**Then** the set contains `.github/workflows/ci.yml`

#### Scenario: Already-pushed commits are excluded

**Given** every commit reachable from `HEAD` is present on an `origin` remote-tracking ref
**And** the worktree is clean
**When** the publishable path set is computed
**Then** the set is empty

### Requirement: The system shall send exactly one follow-up to the live implementer session when the real diff matches a declared pattern

When the push capability declares patterns, the implementer step SHALL declare an output contract
of kind `unpushable-path` with policy `follow-up`. Detection MUST match the publishable path set
against the declared patterns. When a match exists, the system MUST send exactly one follow-up
message to the same implementer session instructing the agent to either remove the change or
satisfy the requirement without changing the declared paths. The system MUST re-check after the
follow-up. It MUST NOT send a second follow-up for this contract.

#### Scenario: Follow-up resolves the violation and the step proceeds

**Given** the push capability declares `.github/workflows/**`
**And** after the implementer run the publishable path set contains `.github/workflows/ci.yml`
**When** the output verification repair loop runs and the agent removes the change
**Then** exactly one follow-up message was sent to the implementer session
**And** the re-check finds no matching path
**And** the step proceeds to commit and push

#### Scenario: At most one follow-up is sent even when the violation persists

**Given** the push capability declares `.github/workflows/**`
**And** the publishable path set contains a matching path both before and after the follow-up
**When** the output verification repair loop runs
**Then** exactly one follow-up message was sent for the `unpushable-path` contract

#### Scenario: No contract is declared under an undeclared environment

**Given** the push capability declares no patterns
**When** the implementer step declares its output contracts
**Then** no contract of kind `unpushable-path` is present

### Requirement: The system shall escalate when a declared path remains after the follow-up

When the `unpushable-path` violation is still present after the follow-up, the executor output gate
SHALL halt the step with an `awaiting-resume` halt so the job is escalated to the linked issue and
remains resumable. The halt reason MUST name the matching paths and MUST state the environment
constraint that the current token cannot push them.

#### Scenario: Persisting violation halts as awaiting-resume

**Given** the push capability declares `.github/workflows/**`
**And** the publishable path set still contains `.github/workflows/ci.yml` after the follow-up
**When** the executor evaluates the output gate for the implementer step
**Then** the step result is a halt of kind `awaiting-resume`
**And** the halt reason contains `.github/workflows/ci.yml`
**And** the halt reason states that the environment's token cannot push that path

### Requirement: The system shall block the push deterministically before commit when a declared path would be published

Immediately after the mixed reset to the pre-step HEAD and before any staging, `commitAndPush`
SHALL compute the publishable path set and match it against the declared patterns. When a match
exists the system MUST NOT stage, MUST NOT commit, and MUST NOT invoke the push. It MUST raise a
dedicated `UNPUSHABLE_PATH_BLOCKED` error whose message names the matching paths and the
environment constraint, and the pipeline MUST convert it into an `awaiting-resume` halt.

#### Scenario: Push is never attempted for a matching path

**Given** the push capability declares `.github/workflows/**`
**And** the publishable path set contains `.github/workflows/ci.yml`
**When** `commitAndPush` runs for the step
**Then** no push command is executed
**And** no commit is created
**And** an error with code `UNPUSHABLE_PATH_BLOCKED` is raised

#### Scenario: The rejection reason names the path and the constraint

**Given** the Layer 2 backstop raises `UNPUSHABLE_PATH_BLOCKED` for `.github/workflows/ci.yml`
**When** the pipeline converts the failure into a halt
**Then** the halt kind is `awaiting-resume`
**And** the halt reason contains `.github/workflows/ci.yml`
**And** the halt reason states the environment constraint that this token cannot push that path

### Requirement: The system shall leave behavior unchanged when no pattern is declared or no path matches

When the push capability declares no patterns, the system MUST NOT execute any capability-related
git command and MUST NOT alter agent messages, output contracts, staging, commit, or push behavior.
When patterns are declared but no publishable path matches, `commitAndPush` MUST proceed exactly as
it does today. The managed runtime MUST treat the `unpushable-path` contract as a no-op, reporting
no violation, and MUST do so before its missing-branch early return.

#### Scenario: No capability git commands in an undeclared environment

**Given** the push capability declares no patterns
**When** the implementer step runs through output verification and `commitAndPush`
**Then** no publishable-path enumeration command is executed

#### Scenario: Declared patterns with a non-matching diff proceed normally

**Given** the push capability declares `.github/workflows/**`
**And** the publishable path set contains only `src/core/step/executor.ts`
**When** `commitAndPush` runs for the step
**Then** the commit is created and the push is executed as usual

#### Scenario: Managed runtime reports no violation for the contract

**Given** the managed runtime validates step outputs including an `unpushable-path` contract
**And** no branch is available to the managed runtime
**When** output validation runs
**Then** the result contains no violation of kind `unpushable-path`
