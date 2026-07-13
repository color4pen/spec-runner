# Spec: job-power-assertion

## Requirements

### Requirement: A running local job MUST hold an idle-sleep power assertion

The local runtime SHALL acquire an OS idle-sleep power assertion when a job enters
its running window (at `registerCleanup`) and SHALL release it when the job leaves
that window (at `teardown`, or at signal interruption). The assertion SHALL NOT be
held while no job is running (e.g. while the inbox daemon idles between ticks).

#### Scenario: assertion is acquired at job start

**Given** a `LocalRuntime` on a `darwin` platform with an injected background-spawn function
**When** `registerCleanup(jobId, startStep)` is called
**Then** the injected spawn function is invoked exactly once to start the power-assertion process
**And** the spawned command is `caffeinate` with arguments `["-i", "-w", "<parentPid>"]` where `<parentPid>` is `process.pid`

#### Scenario: assertion is released on success teardown

**Given** an acquired power assertion for a running local job
**When** `teardown(handle, "awaiting-archive")` is called
**Then** the power-assertion process is killed (released)

#### Scenario: assertion is released on error teardown

**Given** an acquired power assertion for a running local job
**When** `teardown(handle, "failed")` (or `"error"`) is called
**Then** the power-assertion process is killed (released)

#### Scenario: assertion is released on signal interruption

**Given** an acquired power assertion for a running local job
**When** the registered `signalCleanup` handler runs (SIGINT/SIGTERM)
**Then** the power-assertion process is killed (released) before the process exits

### Requirement: Power-assertion acquisition MUST fail open

The power-assertion mechanism SHALL NOT stop, fail, or delay a job when suppression
is unavailable. On an unsupported platform, or when the suppression executable is
absent (ENOENT) or otherwise fails to spawn, acquisition SHALL degrade to a no-op
and, where applicable, emit a warning; the job SHALL continue normally.

#### Scenario: unsupported platform is a no-op

**Given** a `platform` other than `darwin`
**When** `acquirePowerAssertion({ ... })` is called
**Then** no background process is spawned
**And** the returned assertion's `release()` is a safe no-op
**And** the job proceeds unaffected

#### Scenario: missing caffeinate does not stop the job

**Given** a `darwin` platform where spawning `caffeinate` emits an `error` (ENOENT)
**When** `acquirePowerAssertion({ ... })` is called
**Then** acquisition does not throw
**And** a warning is emitted through the injected warn channel
**And** the returned assertion's `release()` is a safe no-op
**And** the job runs to completion

### Requirement: The resident process MUST be spawned through the util/spawn.ts seam

The power-assertion process SHALL be started via a `util/spawn.ts` seam function
(`spawnBackground`), never via a new direct `node:child_process` importer, so the
B-12 tooth stays green with no new allowlist entry. The child's environment SHALL
be produced by `stripSecrets` (B-6), so `*_TOKEN` / `*_API_KEY` / `*_SECRET` keys
are absent while `PATH` is preserved.

#### Scenario: no new direct child_process importer

**Given** the change is applied
**When** the B-12 architecture tooth scans `src/` for direct `node:child_process` imports
**Then** the set of importing files is unchanged (only the existing seam/allowlisted files)
**And** the B-12 test passes

#### Scenario: resident child env is stripped of secrets

**Given** `GH_TOKEN` / `ANTHROPIC_API_KEY` are present in the ambient `process.env`
**When** `spawnBackground(cmd, args, { cwd })` starts a child
**Then** the environment handed to the child contains neither `GH_TOKEN` nor `ANTHROPIC_API_KEY`
**And** the environment still contains `PATH`

### Requirement: The resident process MUST NOT be orphaned

The power-assertion process SHALL be terminated on teardown and SHALL also
self-terminate when its parent (the CLI process) exits, so a teardown-less stop
(crash, SIGKILL) leaves no lingering process.

#### Scenario: process is wired to follow parent exit

**Given** a `darwin` platform
**When** the power-assertion process is started
**Then** it is started with `-w <parentPid>` bound to the CLI's `process.pid`
**And** it is `unref()`-ed so it does not keep the CLI event loop alive

### Requirement: The managed runtime MUST remain unchanged

The managed runtime SHALL NOT acquire any power assertion; its `registerCleanup`
and `teardown` behaviour is unchanged by this change.

#### Scenario: managed runtime acquires no assertion

**Given** a job executed on the managed runtime
**When** `registerCleanup` / `teardown` run
**Then** no power-assertion process is spawned
**And** the existing managed runtime tests pass unchanged
