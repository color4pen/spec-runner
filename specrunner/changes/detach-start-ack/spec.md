# Spec: --detach start-ack

## Requirements

### Requirement: The detach parent SHALL wait for registration or child death before exiting

The `--detach` parent process (for both `job start` and `job resume`) SHALL, after
spawning the child, wait until either the child registers on disk or the child
process ends. It MUST NOT exit on spawn success alone, and it MUST NOT cut the wait
off with a fixed time window (the wait is process-death-gated).

#### Scenario: parent does not exit while registration is pending and the child is alive

**Given** a detach parent has spawned the child and the child has not yet written
its liveness sidecar
**And** the child process is still alive
**When** the parent evaluates whether to exit
**Then** the parent keeps waiting (it does not exit and does not print guidance)

#### Scenario: parent exits 0 with guidance once the child registers

**Given** a detach parent is waiting for the child to register
**When** the liveness sidecar for the slug appears with `pid` equal to the spawned
child's pid
**Then** the parent prints the detach guidance (slug, `job wait`, `job show`) to
stdout and exits with `EXIT_CODE.SUCCESS`

### Requirement: A registered exit 0 SHALL guarantee the job is discoverable

The detach parent's `EXIT_CODE.SUCCESS` MUST mean the pipeline process is alive and
the job has reached a state where `job wait <slug>` / `job ls` can discover it. The
observation point is the liveness sidecar carrying the spawned child's pid (which,
on a new run, is written immediately after state.json).

#### Scenario: job wait finds the job immediately after a successful detach start

**Given** `job start --detach <slug>` has exited with `EXIT_CODE.SUCCESS`
**When** `job wait <slug>` runs immediately afterward
**Then** it finds the job (it does NOT exit 2 "No job found")

#### Scenario: resume does not treat a stale sidecar as registration

**Given** a `job resume --detach <slug>` where a stale liveness sidecar from the
previous run already exists with the previous (dead) run's pid
**When** the detach parent observes the sidecar still carrying that dead pid
**Then** it does NOT treat this as registration and keeps waiting
**And** it treats the job as registered only once the sidecar `pid` becomes the
spawned resume child's pid

### Requirement: A child that dies before registering SHALL fail the parent with the log tail

If the child process ends before it registers, the detach parent MUST exit with
`EXIT_CODE.GENERAL_ERROR` and MUST write, to stderr, the tail of the detach log
(enough lines to read the failure reason) together with the detach log's full path.

#### Scenario: pre-registration child death propagates as a non-zero exit with the log tail

**Given** a detach parent is waiting and the child process ends without ever
writing a liveness sidecar carrying the child's pid
**When** the parent detects the child has ended
**Then** the parent exits with `EXIT_CODE.GENERAL_ERROR`
**And** stderr contains the transcribed tail of the detach log and the full detach
log path

#### Scenario: registration observed on the same tick as death is treated as success

**Given** the liveness sidecar has been written with the child's pid
**And** the child process has also ended
**When** the parent evaluates the wait
**Then** it resolves as success (registration is checked before death), exits
`EXIT_CODE.SUCCESS`, and prints guidance

### Requirement: `job wait` "No job found" SHALL include a detach-log hint

When `job wait` exhausts its not-found retries and reports "No job found for slug",
its stderr output MUST additionally include a hint pointing at the detach log for
that slug. The retry count, retry interval, and not-found decision logic SHALL
remain unchanged.

#### Scenario: not-found output carries the detach-log hint

**Given** `job wait <slug>` for a slug that never registers
**When** the not-found retries are exhausted
**Then** it exits 2
**And** stderr contains the "No job found" message plus a hint referencing the
detach-log path for the slug

### Requirement: Help and guidance wording SHALL follow the new contract, with failure text defined once

The `--detach` help/usage text SHALL describe the new contract (the parent waits
until the job is registered, or reports a start failure) rather than promising an
immediate return. The startup-failure message MUST be defined in a single place so
it can be pinned by an output-contract test.

#### Scenario: help no longer promises immediate return

**Given** the CLI usage text for `--detach`
**When** it is inspected
**Then** it still references `--detach` and `job wait`
**And** it no longer states that the parent returns immediately

#### Scenario: failure message is a single pinnable definition

**Given** the startup-failure output emitted on pre-registration child death
**When** an output-contract test inspects it
**Then** the message comes from one exported constant/builder and contains the slug
and the detach-log path

### Requirement: Foreground and detach-child behavior SHALL be unchanged

This change MUST NOT alter the foreground (non-`--detach`) path, nor the detach
child's behavior: the `SPECRUNNER_DETACHED` recursion marker, the detach-log stdio
redirect, and the recursion guard SHALL be preserved.

#### Scenario: detach child still runs foreground without re-spawning

**Given** a process started with the `SPECRUNNER_DETACHED` marker set (the detach
child)
**When** it evaluates the `--detach` branch
**Then** it does not spawn again and runs the pipeline in the foreground, exactly as
before this change
