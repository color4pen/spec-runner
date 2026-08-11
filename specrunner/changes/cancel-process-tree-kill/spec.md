# Spec: job cancel process-tree kill

## Requirements

### Requirement: Cancel resolves the kill-target pid from state then a jobId-matched sidecar

`cancelSingleJob` SHALL resolve the kill-target pid using the chain
`state.pid → liveness sidecar`, and MUST adopt the sidecar pid **only when** the
sidecar's `jobId` equals the state's `jobId`. When neither source yields a pid,
cancel MUST NOT signal any process.

#### Scenario: state.pid drives the kill

**Given** a job whose `state.pid` is 1234
**When** `cancelSingleJob` runs
**Then** the graceful kill targets pid 1234

#### Scenario: sidecar fills in a null state.pid

**Given** a job whose `state.pid` is null and whose liveness sidecar carries
`{ pid: 5678, jobId: <this job's id> }`
**When** `cancelSingleJob` runs
**Then** the graceful kill targets pid 5678

#### Scenario: foreign sidecar is not adopted

**Given** a job whose `state.pid` is null and whose liveness sidecar carries
`{ pid: 5678, jobId: <a different job's id> }`
**When** `cancelSingleJob` runs
**Then** no process is signalled and cancel warns that no PID could be resolved

### Requirement: Cancel gates the kill on process liveness, not on job status

`cancelSingleJob` MUST NOT decide whether to kill from `state.status`. When a pid
resolves it SHALL invoke the graceful kill regardless of the on-disk status
(including `awaiting-resume`), so the resume disk-lag path is covered. When no
pid resolves it SHALL warn and continue the cancel.

#### Scenario: awaiting-resume with a resolved live pid is killed

**Given** a job whose on-disk `state.status` is `awaiting-resume` and whose
resolved pid is a live process
**When** `cancelSingleJob` runs
**Then** the graceful kill sends SIGTERM to that pid
**And** if the status gate were restored, the SIGTERM would not be sent

#### Scenario: no resolvable pid warns and continues

**Given** a job with no `state.pid` and no jobId-matched sidecar pid
**When** `cancelSingleJob` runs
**Then** cancel emits a warning containing "no PID recorded" and still transitions
the job to `canceled`

### Requirement: Graceful kill reaps the process group on SIGKILL escalation only for group leaders

On SIGKILL escalation, `gracefulKill` SHALL send SIGKILL to the target pid and,
**only when** the target pid is a process-group leader, additionally send SIGKILL
to the process group (`-pid`) to reap descendants. It MUST NOT send any
group-directed signal when the pid is not a group leader. The result MUST report
whether a group signal was sent.

#### Scenario: leader pid escalation reaps the group

**Given** a pid that stays alive through the SIGTERM poll window and is a group
leader
**When** `gracefulKill` escalates to SIGKILL
**Then** it sends SIGKILL to the pid and SIGKILL to the group `-pid`
**And** the result reports the group was killed

#### Scenario: non-leader pid escalation does not touch the group

**Given** a pid that stays alive through the SIGTERM poll window and is not a
group leader
**When** `gracefulKill` escalates to SIGKILL
**Then** it sends SIGKILL to the pid only
**And** no group-directed (`-pid`) signal is sent

### Requirement: The runner aborts in-flight agent queries on SIGINT/SIGTERM before exit

The runner's SIGINT/SIGTERM handler SHALL abort any in-flight agent query through
a registration seam before exiting, so the SDK subprocess is torn down. The wait
for abort completion MUST be bounded, and the existing `awaiting-resume` persist
MUST remain the signal path's final state write.

#### Scenario: SIGTERM aborts the registered query controller

**Given** an in-flight agent query whose `AbortController` is registered with the
runner's abort hub
**When** the runner's signal handler runs
**Then** that `AbortController` is aborted
**And** if the abort call were removed, the controller would remain un-aborted

#### Scenario: awaiting-resume is still persisted after abort

**Given** the runner's signal handler aborts an in-flight query
**When** the handler completes
**Then** the job state is persisted as `awaiting-resume` before the process exits

### Requirement: Cancel output distinguishes a skipped kill from a group reap

Cancel output SHALL make the kill outcome observable: a skipped kill (no pid
resolvable) MUST surface as a warning, and a completed group reap MUST surface as
an informational line.

#### Scenario: group reap is reported

**Given** a cancel whose graceful kill escalated and reaped a leader's group
**When** cancel finishes
**Then** its output includes an info line indicating the process group was reaped

#### Scenario: skipped kill is reported

**Given** a cancel that could not resolve any pid
**When** cancel finishes
**Then** its output includes a warning that no PID was recorded
