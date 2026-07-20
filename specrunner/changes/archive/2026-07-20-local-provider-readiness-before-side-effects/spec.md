# Spec: Local provider readiness before side effects

## Requirements

### Requirement: Local provider readiness is verified before any run/resume side effect

For the local runtime, `run` and `resume` SHALL verify provider readiness through a
shared gate that executes before any persistent side effect. When readiness fails,
no job record, worktree, branch, or journal SHALL be created, and (on `resume`) no
job-record state transition SHALL be persisted and no worktree SHALL be recreated.

#### Scenario: readiness failure on run leaves no side effects

**Given** the local runtime whose provider readiness probe reports a not-ready result
**When** `specrunner run` executes
**Then** the command exits non-zero and no worktree, no feature branch, no change
folder, no job state file, and no event journal are created for the slug

#### Scenario: readiness failure on resume mutates nothing

**Given** an existing awaiting-resume job on the local runtime whose provider
readiness probe reports a not-ready result
**When** `specrunner resume` executes
**Then** the command exits non-zero, the job state is not transitioned to `running`,
and no worktree is recreated

#### Scenario: the gate is load-bearing (breakage check)

**Given** the same not-ready provider and a job whose agent step would also fail
**When** the readiness gate is relocated to after workspace setup (mutation)
**Then** the failure moves to after workspace side effects, so a worktree/branch/
journal exists at failure time and the no-side-effects assertion fails

### Requirement: Readiness failures are classified into four distinguishable kinds

The readiness gate MUST distinguish four failure kinds — auth missing, auth invalid,
unreachable, and provider failure — and report each with a different message and a
kind-specific recovery prescription. Each recovery prescription MUST reference only
commands that actually exist, and MUST be covered by the existing hint-command
existence check.

#### Scenario: each kind produces a distinct message and prescription

**Given** an injected probe configured to return, in turn, auth-missing, auth-invalid,
unreachable, and provider-failure
**When** the readiness gate runs for each
**Then** each produces a distinct human-readable message and a kind-specific recovery
prescription

#### Scenario: auth prescriptions name only real commands

**Given** the auth-missing and auth-invalid prescriptions
**When** the hint-command-existence check inspects them
**Then** every referenced `specrunner <verb>` (e.g. `specrunner login`) is a
registered command

### Requirement: Readiness is checked exactly once per run/resume

A single `run` or `resume` invocation SHALL invoke the provider readiness probe
exactly once.

#### Scenario: probe invoked once per run

**Given** a local runtime with a call-counting readiness probe
**When** a single `specrunner run` (or `specrunner resume`) invocation executes
**Then** the probe has been invoked exactly one time

### Requirement: Raw provider errors and credential values are not exposed

The readiness failure message MUST NOT present a raw provider error or any credential
value in its first sentence. Any provider detail SHALL be preserved beneath the
prescriptive first sentence, and credential values SHALL never appear.

#### Scenario: prescriptive first sentence, detail preserved underneath

**Given** a probe result whose detail carries a provider error summary
**When** the readiness gate reports the failure
**Then** the first sentence is a prescriptive instruction, the provider detail
appears only after it, and no credential value appears anywhere in the output

### Requirement: Readiness verification uses an injectable seam requiring no real token

The readiness decision SHALL be reached through an injectable seam so that tests
reproduce success and every failure kind without a real token, and no long-lived
token is added to CI.

#### Scenario: CI reproduces success and each failure kind via injection

**Given** a fake readiness probe injected into the local runtime
**When** the probe is configured to return ready or any failure kind
**Then** the corresponding gate outcome is exercised without any real credential

### Requirement: Managed runtime readiness and preflight are unchanged

The managed runtime's readiness, preflight, and execution behavior SHALL be
unchanged by this change.

#### Scenario: managed gate is a no-op

**Given** the managed runtime
**When** the shared readiness gate runs during `execute()`
**Then** it performs no provider readiness probe and the managed execution path is
unaffected
