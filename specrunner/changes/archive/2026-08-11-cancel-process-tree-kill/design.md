# Design: job cancel process-tree kill

## Context

`job cancel` on a **detached** job leaves the agent subprocess (the `claude` CLI
spawned by the Claude Agent SDK) as an orphan. Three structural gaps in the kill
path stack up:

1. **Status-gated kill** — the kill block runs only when
   `state.status === "running"` (`src/core/cancel/runner.ts:348-361`). During a
   resume the main-checkout `state.json` stays `awaiting-resume` while the real
   process runs (the running transition is persisted to the worktree-side store;
   this disk-lag is documented in `src/cli/job-wait.ts:1-12`). On that path the
   kill is silently skipped.
2. **No pid fallback** — cancel reads only `state.pid`. `job wait` resolves
   `state.pid → liveness sidecar → last-known` (`src/cli/job-wait.ts:209-218`),
   but cancel has no sidecar fallback and abandons the kill with a
   "no PID recorded" warning when `state.pid` is null. The liveness sidecar
   (`.specrunner/local/<slug>/liveness.json`) carries the runner pid
   (`src/core/runtime/local.ts:1432`).
3. **Single-pid kill** — `gracefulKill` targets one pid only
   (`src/core/cancel/pid-kill.ts:31-94`); there is no process-group propagation.
   The runner's SIGTERM handler only persists `awaiting-resume` and
   `process.exit(130)` (`src/core/runtime/local.ts:1518-1550`); it never
   terminates the in-flight agent subprocess. On SIGKILL escalation the handler
   never runs, so the subprocess is guaranteed to orphan.

The detach child is spawned with `detached: true`
(`src/util/spawn.ts:118-122`, `src/core/command/detach.ts:119-124`), so on POSIX
it is its own process-group leader (pgid == pid). Its agent subprocess inherits
that group. A signal to the group (`kill(-pid)`) reaps the whole subtree
atomically. The runner pid recorded in the sidecar/state **is** that group
leader.

The per-call abort seam already exists as a wall-clock-timeout `AbortController`
inside the agent runner (`src/adapter/claude-code/agent-runner.ts:515-520`), but
no signal handler can reach it.

## Goals / Non-Goals

**Goals**:

- Resolve the cancel kill-target pid with the same `state.pid → liveness sidecar`
  chain as `job wait`, adopting the sidecar pid only when its `jobId` matches.
- Decide whether to kill from **process liveness**, never from on-disk status, so
  the resume disk-lag path is covered.
- Reap the process **group** on every path where the target's death is observed
  (SIGTERM poll paths and SIGKILL escalation) — but only when the target pid is
  a group leader (detached job). A leader that dies from SIGTERM can leave
  surviving descendants keeping the group alive; reaping there is the point of
  this change. Never signal the group of a foreground job (would hit the
  caller's shell / sibling processes).
- Give the runner's own SIGINT/SIGTERM handler a seam to abort the in-flight
  agent query before exit, so the SDK subprocess is torn down gracefully; bound
  the wait; keep the existing `awaiting-resume` persist.
- Make the cancel output distinguish "kill skipped (no pid)" from
  "group reaped".

**Non-Goals**:

- Managed-runtime cancel path (marker / state teardown unchanged).
- Windows process-group semantics (POSIX is the primary target, same as the
  existing detach mechanism; the Windows constraint is stated below).
- Pre-acceptance `fake-running` status (separate change).
- Behavior changes to `job wait` / `job ls`.
- Recording child pids in state / sidecar (rejected — see D3 alternatives).

## Decisions

### D1: Shared pid resolver with jobId-gated sidecar fallback

Extract a pure resolver plus a sidecar reader into a neutral module
(recommended `src/core/liveness/resolve-pid.ts`):

- `readLivenessSidecar(absPath) → { pid, jobId } | null` (async fs read; returns
  null on absent/unparseable).
- `resolveJobPid({ statePid, sidecar, expectedJobId }) → { pid, source }` — pure:
  returns `statePid` when present; otherwise the sidecar pid **only if**
  `sidecar.jobId === expectedJobId`; otherwise null.

`cancelSingleJob` consumes both, passing `expectedJobId = state.jobId`.

**Rationale**: cancel must gain the sidecar fallback `job wait` already has, and
jobId gating is a hard safety boundary — the sidecar can belong to a different
job that reclaimed the slug, and killing that job's pid is unacceptable. A pure
resolver keeps the jobId gate testable without fs.

**Alternatives considered**:
- Inline the resolution in `cancelSingleJob` — rejected: duplicates `job wait`'s
  chain and lets the two drift; the request asks for a shareable form.
- Refactor `job wait` onto the shared resolver in this change — **deferred**:
  `job wait` behavior change is out of scope and its `readSidecarPid` injection
  seam would churn wait tests. The module is placed so `job wait` can consolidate
  later with a behavior-preserving change (it already implements the equivalent
  chain inline, plus a wait-only `last-known` tail).

### D2: Kill decision is process-death-gated, not status-gated

Replace the `state.status === "running"` gate with a pid gate: resolve the pid
(D1); if a pid resolves, call `gracefulKill(pid, …)`; if no pid resolves, warn
and continue. `gracefulKill` already treats an already-dead pid as a no-op
(SIGTERM → `ESRCH` → `killed: true`), so liveness — not status — governs whether
a real process is signalled. This closes the resume disk-lag hole: an
`awaiting-resume` on-disk status with a live resolved pid is killed.

**Rationale**: disk status is provably stale during resume; the live process is
the only correct signal. Routing the liveness decision through `gracefulKill`
(rather than an explicit `isAlive` pre-gate) preserves the existing running-path
test, which sends SIGTERM even when the poll immediately reports dead.

**Alternatives considered**:
- Explicit `isAlive(pid)` pre-gate before `gracefulKill` — rejected: it would
  skip the SIGTERM that the existing running-status test pins, and `gracefulKill`
  already handles the dead-pid case.
- Keep a status allow-list (kill only running/awaiting-resume) — rejected: the
  request forbids a status gate; disk status is unreliable on the very path this
  change targets.

**Residual risk**: pid reuse (a dead runner's pid reclaimed by an unrelated live
process). This is pre-existing (the running path and `job wait` share it), and is
bounded by (a) jobId-gated sidecar adoption, (b) sidecars being deleted on
terminal transitions, and (c) group signals only firing on a clean positive
`isGroupLeader` probe — for the poll-death paths the group can only be signalled
while it still exists (surviving members hold the pgid), and for the escalation
path the pid stayed continuously alive across the SIGTERM poll window. See Risks.

### D3: Group reap on every observed death path, gated by leader detection

`gracefulKill` gains an injected `isGroupLeader(pid) → boolean` in `KillDeps`.
On every path where the target's death is observed — the SIGTERM poll paths
(death seen via `isAlive` false or ESRCH) and the SIGKILL-escalation step (which
keeps sending SIGKILL to the pid, unchanged) — when `isGroupLeader(pid)` is
true, it sends SIGKILL to the group (`kill(-pid, "SIGKILL")`) to reap surviving
descendants. `KillResult` gains `groupKilled: boolean`.
Group-signal errors are best-effort (same EPERM/ESRCH handling) and do not flip
the pid-kill outcome.

Leader detection (production impl, injected from the CLI): `kill(-pid, 0)` —
success ⟺ the process group `pid` exists ⟺ (for a live pid) the pid is the group
leader. A detached child (`detached: true`) is a leader (pgid == pid) → success.
A foreground job is a member of the shell's group → group `pid` does not exist →
`ESRCH` → not a leader. Any throw ⇒ treat as non-leader (conservative: never
group-signal unless the group probe cleanly succeeds).

`CancelDeps` gains an optional `isGroupLeader`; `cancelSingleJob` passes
`deps.isGroupLeader ?? (() => false)` into `gracefulKill` so unwired callers
(existing tests) never group-signal. The CLI (`src/cli/cancel.ts`) supplies the
real `process.kill(-pid, 0)` probe.

**Rationale**: the kernel is the authority on group membership; the probe reuses
the same `process.kill` primitive as liveness and is zero-state. The safety bias
is asymmetric — a false "leader" would kill the caller's shell group
(catastrophic, forbidden), a false "not-leader" merely leaves an orphan
(degraded, safe) — so we group-signal only on a clean positive probe.

**Alternatives considered**:
- Record a `detached`/leader flag in state or sidecar — rejected: extra state
  that can go stale and lie; the kernel probe is authoritative and survives cases
  a flag would miss. (Also covers the request's rejection of recording child
  pids: ownership is expressed by the process group, not by persisted pid lists.)
- `ps`-based process-tree walk then kill each pid — rejected: non-portable and
  racy (a child can spawn between the walk and the kill). The group signal is
  delivered atomically by the kernel.

### D4: Runner self-abort seam (`QueryAbortHub`) for the graceful path

The agent subprocess pid is not observable from cancel (it is created and
destroyed per step). The process that knows where its children are is the runner
itself, so it owns graceful teardown.

- Add a minimal registration port (recommended `src/core/port/query-abort.ts`):
  `interface QueryAbortRegistration { register(controller: AbortController): () => void }`.
  The adapter already imports only from `core/port`, so this respects the
  existing layer boundary.
- Add a concrete `QueryAbortHub` (recommended `src/core/lifecycle/query-abort-hub.ts`)
  implementing `register` (returns a deregister fn), `abortActive()` (abort all
  registered controllers), and `drain(timeoutMs, sleep)` (resolve when the
  registered set empties or the bound elapses). Pure, no I/O — unit-testable.
- `ClaudeCodeRunner` accepts the hub via `ClaudeCodeRunnerDeps` (typed as
  `QueryAbortRegistration`). In `run()` it registers the per-call
  `AbortController` immediately after creation and deregisters on every exit path
  (`finally`). When the hub is absent (managed runtime / unwired tests) behavior
  is unchanged.
- `LocalRuntime` constructs the hub, threads it into `createAgentRunner()`, and
  in `signalCleanup` (after the synchronous `markSignalHandlerFired()`) calls
  `hub.abortActive()` then `await hub.drain(bound, sleep)` **before** the existing
  `awaiting-resume` persist. The existing persist → `releasePowerAssertion()` →
  `process.exit(130)` tail is preserved and remains the last state write on the
  signal path.

**Rationale**: this reuses the existing per-call `AbortController` exactly as the
request asks; the registry is the only new state and it is bounded and
observable. Aborting first lets the SDK begin subprocess teardown while the
persist I/O runs; the bounded drain prevents an unbounded hang; group-SIGKILL
(D3) is the backstop if the SDK does not reap in time. `markSignalHandlerFired()`
stays synchronous-before-first-await, so the existing exit-guard ordering
contract holds.

**Alternatives considered**:
- Import a concrete hub module directly into the adapter — rejected: crosses the
  `adapter → core/port`-only boundary. Structural port typing avoids it.
- Await the whole `run()` promise from the signal handler — rejected: couples the
  handler to pipeline internals; draining the registration set is sufficient and
  bounded.

### D5: Cancel output reflects the kill outcome

- pid unresolvable → warning containing the substring `no PID recorded`
  (preserved so the existing null-pid test stays green), widened to note both
  `state.pid` and the sidecar were empty.
- `KillResult.groupKilled` true → an `info` line stating the process group was
  reaped (referencing `-<pid>`).

**Rationale**: the request requires the skip reason and the group reap to be
distinguishable from output; reusing the existing `warnings` / `info` channels is
the smallest change.

**Alternatives considered**: a structured machine-readable field on the result —
rejected as unrequested (`warnings`/`info` already carry human-readable outcome).

## Risks / Trade-offs

- **[Group signal hits the wrong group via pid reuse]** → Mitigation: escalation
  to SIGKILL (and thus the group signal) only occurs after the pid stayed alive
  through the entire SIGTERM poll window, so within a single `gracefulKill` call
  the pid was never free to be reused; leader detection is a fresh kernel probe
  at escalation time.
- **[Killing a foreground job's shell group]** → Mitigation: D3 leader gate —
  group signal only on a clean `kill(-pid, 0)` positive, which a foreground
  (non-leader) pid never yields.
- **[`awaiting-resume` clobbered by a concurrent pipeline persist during the
  drain]** → Mitigation: the signal path persists `awaiting-resume` after the
  drain (last write on that path); `markSignalHandlerFired()` already suppresses
  the exit-guard writers; the group-SIGKILL backstop reaps any subprocess the SDK
  missed; resume re-derives state. If an integration surfaces a clobber, the
  minimal follow-up is to gate the pipeline's mid-run persist on
  `isSignalHandlerFired()` — flagged, not pre-emptively built.
- **[SDK does not honor `AbortController` and leaves the subprocess]** →
  Mitigation: this is exactly why the forceful path (group SIGKILL) exists;
  graceful abort is best-effort, group reap is the guarantee.
- **[Windows process groups differ]** → POSIX is the primary target (same as the
  existing detach mechanism). On Windows `kill(-pid, …)` semantics differ; leader
  detection returns non-leader on any throw, so the group path is simply skipped
  and behavior degrades to the current single-pid kill. Stated as a constraint.

## Open Questions

- Whether `job wait` should later consolidate onto the D1 resolver — deferred
  (out of scope for this change; behavior must not change).
- Exact module filenames/locations for the new resolver, port, and hub are
  recommendations; the implementer may co-locate as long as the
  `adapter → core/port` boundary is respected.

This change carries architecturally significant decisions (process-death-gated
kill, leader-gated group signalling, runner-owned graceful abort); ADR generation
is left to the adr-gen step.
