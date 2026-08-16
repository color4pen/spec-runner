# `inbox` review

Status: **reviewed**  
Verdict: **KEEP namespace and `run`**, but fix execution-result propagation and dead output flags.

Current subcommand: `run`.

## User goal

Use GitHub issues as the unattended inbound transport for starting and resuming SpecRunner jobs.

This is not another spelling of `job start` / `job resume`. `inbox run` owns trigger collection, permission/cutoff checks, planning, reject comments, stale-running recovery, and dispatch into the existing job operations.

The accepted architecture intentionally chooses a **one-shot command + external scheduler** rather than a daemon. One invocation scans once, executes the planned effects, then exits; cron / launchd / GitHub Actions own recurrence.

## Verdict

- `inbox` top-level namespace: **KEEP**
- `inbox run`: **KEEP**
- do not move this under `job`: it is an inbound transport / automation surface, while `job` owns one execution lifecycle
- preserve the explicit wording that `run` means one pass, not a resident watcher

## Findings

### 1. Child job failure is currently reported as inbox success

The default effects call:

```ts
await runRunCore(...)
await runResumeCore(...)
```

but discard their numeric exit codes. Both core operations report ordinary pipeline/preflight/resume failures by returning non-zero rather than necessarily throwing.

The inbox orchestrator then unconditionally appends the action to `summary.started` / `summary.resumed` after the effect resolves. `runInboxRun` returns non-zero only when `summary.errors` contains entries.

Therefore a child operation can fail with exit code 1 while `inbox run` reports the action as successful and exits 0.

**Direction:** the effect contract must carry operation outcome. The smallest shape is for default effects to throw or return a typed result when `runRunCore` / `runResumeCore` returns non-zero; the orchestrator must classify that action as an error and must not place it in the success arrays.

This is more important than CLI naming cleanup because unattended automation depends on the process exit code being trustworthy.

### 2. `--verbose` / `--quiet` are exposed but unused

The command registry accepts both flags and `InboxRunCliOptions` carries them, but `runInboxRun` never resolves or applies a log level and does not forward one to `runRunCore` / `runResumeCore`.

They are currently dead public flags.

**Direction:** either wire them through to child job operations and inbox diagnostics, or remove them. Given the command can execute long-running jobs, wiring them is more useful than deleting them.

The command spec should mechanically prevent a public flag from existing without a consumer/semantic owner where feasible.

### 3. `run` is one pass, but one pass can be long-running

The accepted ADR deliberately rejected detached start. The default effects await `runRunCore` / `runResumeCore` inline, so a single inbox pass may remain alive while started/resumed pipelines run to their next settled state. `maxStartsPerRun` limits starts per pass; it does not mean the command merely queues N jobs and exits immediately.

This is valid architecture, not a defect, but the CLI help should state it clearly enough for cron operators to choose an appropriate schedule/overlap policy.

Suggested semantic wording:

```text
Scan once, execute eligible start/resume actions inline, then exit.
Does not run as a daemon.
```

### 4. `--dry-run` and `--limit` are good command-local controls

`--dry-run` observes the deterministic plan without effects, and `--limit` temporarily overrides the configured start budget. These belong on `inbox run` and should remain.

`--limit 0` retaining resume/recovery behavior while suppressing new starts is a useful operational contract and should be documented in detailed help/guide.

### 5. Repo ownership is already correctly expressed here

`inbox run` is `requiresRepo: true` and receives dispatch-resolved `repoRoot`; config, state, origin resolution, and orchestration all use that root. Unlike several older commands, there is no reason to retain `process.cwd()` as an internal-state base here.

The worktree guard is also semantically appropriate because inbox may start jobs and materialize worktrees.

## Discoverability

This should be visible as an **automation / unattended operation** command, not mixed into everyday `job` lifecycle help.

A future `guide inbox` should own scheduler-oriented knowledge such as:

- one-pass semantics
- approval label and `/resume` trigger model
- `--limit 0`
- cron / CI credential requirements
- avoiding overlapping scheduler invocations where desired

The CLI detailed help should remain concise and mechanical.

## Command-spec implications

`inbox` reinforces several fields already emerging from the inventory:

- `requiresRepo: true`
- worktree policy / guard
- audience/category: automation
- typed flags with summaries
- output modes (`json`, human)
- operation result propagation independent from presentation

The CLI adapter should not infer success from “the delegated Promise resolved”; application operations need an explicit result/exit contract.
