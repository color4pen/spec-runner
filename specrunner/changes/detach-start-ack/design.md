# Design: --detach start-ack — delay parent exit until registration or child death

## Context

`job start --detach` / `job resume --detach` today spawn the pipeline child and
immediately print "Detached pipeline started" + `exit 0`. All validation
(preflight, provider readiness, duplicate guard) runs only in the child.

Current flow (verified against the tree):

- The `--detach` branch sits *before* preflight; the parent resolves the slug,
  calls `detachSelf`, and `process.exit(code)` — `src/cli/command-registry.ts:427-442`
  (run / job start) and `:696-711` (resume).
- `detachSelf` spawns the child (`detached:true`, stdio → slug-keyed detach log),
  prints guidance, and returns `0`. The spawn handle (and its pid) is discarded;
  there is no wait — `src/core/command/detach.ts:105-130`.
- The child's first on-disk registration (state.json + liveness sidecar) happens
  during workspace setup: worktree modes in
  `src/core/runtime/workspace-materializer.ts:114-117 / :149 / :177`, no-worktree
  in `src/core/runtime/local.ts:369-376`. Everything before that
  (preflight → provider readiness probe → reviewer/pipeline descriptor validation
  → `git fetch` → `worktree add`) is network-dependent and unbounded.
- The liveness sidecar record is `{ pid, session, worktreePath, jobId }` written by
  `writeLivenessSidecar(slug, jobId, worktreePath, pid = process.pid)`
  (`src/core/runtime/local.ts:1432-1433`) to
  `<repoRoot>/.specrunner/local/<slug>/liveness.json` (`livenessJsonPath`,
  `src/util/paths.ts:301`). In the child, `process.pid` is the child's own pid.
- On a new run the sidecar first appears with the child's pid. On resume a *stale*
  sidecar from the previous run already exists (its pid is the dead prior process);
  the resume child overwrites the sidecar pid with its own (the resume materializer
  `writeLivenessSidecar` calls; `transitionJob` also patches `pid: process.pid`,
  `src/core/command/resume.ts:291`).
- `job wait`'s not-found retry is a fixed 5 × 2000 ms window
  (`src/cli/job-wait.ts:141-143`, loop `:180-193`); exhausting it prints
  "No job found for slug" and returns exit 2. The same exit 2 covers both
  "not yet registered" and "start failed, never registers".
- `isProcessAlive` is `process.kill(pid, 0)` (`src/core/resume/safety.ts:13-24`).
- `EXIT_CODE = { SUCCESS:0, GENERAL_ERROR:1, ARG_ERROR:2 }` (`src/errors.ts`).

Two operational failures follow: (1) a child that dies during validation is still
reported as `started` (exit 0); the reason lives only in the detach log. (2) a
`job wait` issued right after `--detach` can exhaust its 10 s window before the
child registers and exit 2 — indistinguishable from a real start failure.

Root cause: "detach success" is equated with "spawn success". The fix delays the
parent's exit until the job is *registered* or the child *dies*, and makes the
exit code match the real startup outcome. The waiting is process-death-gated (no
fixed time window), consistent with the philosophy `job wait` already uses.

## Goals / Non-Goals

**Goals**:

- The detach parent waits after spawn until one of two decisive events:
  (a) the child registers → print the existing guidance, exit 0; or
  (b) the child dies before registering → transcribe the detach log tail to
  stderr, exit `GENERAL_ERROR`. No fixed-timeout cutoff.
- `exit 0` guarantees the pipeline process is alive and `job wait <slug>` /
  `job ls` can find the job (registration has reached disk).
- Failure propagation carries a readable reason from the detach log (tail + full
  path) to the parent's stderr.
- `job wait`'s "No job found" stderr gains a detach-log hint (retry window/logic
  unchanged).
- Help/guidance wording follows the new contract; the failure text lives in one
  pinnable place.
- Foreground path and detach-child behavior are unchanged.

**Non-Goals**:

- Changing `job wait`'s retry window or settle logic (hint text only).
- A pre-acceptance ("fake-running") status — deferred to a separate request.
- Running preflight in the parent before spawn (rejected below).
- Reordering the child's validation sequence.
- Windows behavior (POSIX-primary, same as the existing detach mechanism).

## Decisions

### D1: Registration is observed as "liveness sidecar pid == spawned child pid"

The parent already learns the child's pid from the spawn handle (`handle.pid`).
The single decisive registration criterion is: the liveness sidecar at
`<repoRoot>/.specrunner/local/<slug>/liveness.json` exists **and** its `pid`
equals the spawned child's pid.

This one criterion covers both entry points uniformly:

- **new run**: the sidecar does not exist pre-spawn; it first appears written with
  the child's pid (and, per the materializer/local ordering, state.json is
  persisted immediately before the sidecar, so sidecar-present implies
  state.json-present — satisfying "sidecar + state.json の出現").
- **resume**: a stale sidecar exists with the previous (dead) run's pid, which is
  not the child's pid, so it is *not* mistaken for ack; the criterion is met only
  once the resume child overwrites the sidecar pid with its own. This is the
  resume race tooth.

Rationale — why pid identity, not weaker signals:

- state.json existence alone fails resume (state.json already exists pre-resume).
- sidecar existence alone fails resume (a stale sidecar already exists).
- `isProcessAlive(sidecar.pid)` reintroduces a pid-recycle race and cannot
  distinguish the resume child from a coincidentally-live pid.

Alternatives considered: have the child write a dedicated "ready" marker file.
Rejected — a new artifact and write-point for what sidecar-pid identity already
determines; more surface, no extra signal.

### D2: The death gate uses the child's exit event, not `isProcessAlive(childPid)`

The pipeline child is the parent's **direct** child. If it exits before the
parent reaps it, it becomes a zombie; `process.kill(childPid, 0)` still succeeds
on a zombie, so `isProcessAlive(childPid)` would report "alive" forever and the
parent would hang. Therefore the death gate is driven by the child's `exit` event
(delivered to the parent while it is alive and awaiting), which both signals death
**and** reaps the child. `spawnBackground` gains an optional `onExit` callback
(symmetric with the existing `onError`), wired via `proc.on("exit", …)`. `onError`
(e.g. ENOENT / spawn failure, or `handle.pid === undefined`) is also treated as an
immediate startup failure.

Rationale — why event, not probe: `job wait` can safely use `isProcessAlive`
because it probes a process it did **not** spawn (reparented to init, which reaps
it → `kill` returns ESRCH after death). The detach parent cannot, precisely
because the pipeline is its own child. This is the non-obvious correctness point
behind the architect's "child-death-gated" adoption.

Alternatives considered: poll `isProcessAlive(childPid)` (rejected: zombie hang).
Note the child stays `detached:true` + `unref()`'d so it still outlives the parent
on the success path; `unref` only removes it from the parent's ref-count — the
`exit` listener still fires while the parent is alive.

### D3: Registration-first ordering resolves the register-then-die race

Each wait tick checks registration (D1) **first**; only if not yet registered does
it consult the death / spawn-error flags (D2). Because the sidecar persists on disk
after the child dies, a child that registers and then immediately dies is resolved
as **success** on the next tick — which is correct: `job wait` can now find the
job and report its terminal status. This exactly matches the exit-0 contract
("`job wait`/`job ls` can discover this job"), independent of what the child does
after registering.

Rationale: without the ordering, a fast child that registers then fails could be
reported as a start failure even though the job is fully discoverable. Alternative
(check death first) is rejected for that reason.

### D4: Failure is propagated by transcribing the detach log tail

On pre-registration death, the parent reads the last N lines (N = 40) of the
detach log (`getDetachLogPath(repoRoot, slug)`), writes them plus the log's full
path to stderr, and exits `GENERAL_ERROR`. The child's stderr is already
aggregated into that log, so reading it back avoids a second failure channel and
loses no information.

Rationale: N = 40 is enough to read a preflight/credential failure without
flooding stderr; a fast-failing child produces a small log, so a whole-file read
+ tail slice is adequate.

Alternatives considered: a structured IPC / exit-code channel from child to parent
(rejected: new protocol, duplicates what the log already holds).
`ponytail:` whole-file read for the tail — switch to a reverse-chunked read only
if detach logs ever grow large before death.

### D5: `detachSelf` becomes async and child-death-gated, with injected seams

`detachSelf` evolves from "spawn + guidance + return 0" into an async function
that spawns, waits (D1/D2/D3), then either prints guidance + resolves `SUCCESS`,
or transcribes the log + resolves `GENERAL_ERROR`. Both `--detach` branches
`await` it. The spawn still happens synchronously up-front (so spawn-shape
assertions still hold), and the guidance is emitted **only** on the success path.

Testability seams (a dependency-injection object, mirroring `JobWaitDeps`):
`spawnFn`, a registration observer (reads the sidecar pid for the slug), a
detach-log-tail reader, `sleep`, and `pollIntervalMs`. Production defaults read
the real sidecar (`path.join(repoRoot, livenessJsonPath(slug))`) and detach log.
This satisfies the acceptance requirement to simulate delayed registration by
seam injection at the spawn boundary + registration observer.

Rationale: extend the existing entry point rather than add a parallel module;
the DI object matches the established `job wait` testing style. A standalone
`waitForStartAck` helper is an equivalent factoring if the implementer prefers a
thinner `detachSelf` (see Open Questions).

### D6: `job wait` "No job found" gains a detach-log hint

Where `job wait` prints "No job found for slug" and returns exit 2
(`src/cli/job-wait.ts:190-193`), append a hint line pointing at
`getDetachLogPath(repoRoot, slug)` and noting the job may still be initializing or
may have failed to start. The retry count/interval and the not-found decision are
untouched, so the existing exit-2 / retry-count tests stay green.

Rationale: the hint disambiguates "not yet registered" from "failed to start" for
the caller without changing the (out-of-scope) retry logic. Alternative (widen the
retry window) is rejected by the request — it shrinks the race but never removes
it, since setup time is network-unbounded.

### D7: Wording/help follow the new contract, failure text in one place

The help lines that promise immediate return ("即座に return" /
"returns immediately") — `src/cli/command-registry.ts:84 / :91 / :116 / :231-232`
— are reworded to state the parent waits until the job is registered (or reports a
start failure). The success guidance (`buildDetachGuidance`) is unchanged. The new
failure message is defined as a single exported constant / builder in `detach.ts`
so an output-contract test can pin it by substring, following the existing
output-contract test style. The foreground notice (`operational-guidance.ts`) and
the detach-child path (marker, log redirect, recursion guard) are untouched.

Rationale: one pinnable definition keeps the contract test decoupled from prose,
matching `FOREGROUND_NOTICE` / `buildDetachGuidance`. Alternatives (inline strings
at call sites) are rejected — they cannot be pinned without coupling to wording.

## Risks / Trade-offs

- [Risk] pid-identity assumption: D1 requires `handle.pid` to equal the child's
  `process.pid` (no intermediate re-exec). → Mitigation: the existing detach spawn
  is `spawn(execPath, [argv[1], …], { shell:false })` — a direct exec of the CLI,
  no shell / wrapper, so the spawned pid *is* the CLI process; a test pins this.
  If a future launcher re-execs, identity never matches and the parent waits until
  child exit (fail-safe toward "not acked", never a false success).
  `ponytail:` pid identity — revisit if the CLI ever launches via a shim.

- [Risk] pid recycle producing a false identity match: negligible — the child
  rewrites the sidecar with its own pid; a stale sidecar coincidentally holding the
  new child's exact pid is astronomically unlikely and is overwritten anyway.

- [Risk] event-loop liveness: the parent must stay alive while awaiting. →
  Mitigation: the poll `sleep` (setTimeout) keeps the loop alive until resolution;
  the child remains `detached:true` + `unref()`'d so it survives the parent's exit
  on success. No `KeepAlive` sentinel is involved (that is pipeline-scoped).

- [Risk] **Test-scope gap in the request's acceptance criteria.** The criteria name
  `detach-flag-cli.test.ts` and `detach-output-contract.test.ts` as the pins to
  update, and list `detach.test.ts` **nowhere**. But
  `src/core/command/__tests__/detach.test.ts` (TC-001/002/003) exercises the *real*
  `detachSelf` with only `spawnFn` injected and asserts it synchronously
  `returns 0`. Making `detachSelf` async + gated breaks these, and because they use
  *default* registration/sleep deps their un-awaited promise would poll a
  nonexistent sidecar forever and **hang the suite**. → Mitigation: `detach.test.ts`
  is included in the update task (T-05). This is not scope expansion — leaving it
  unchanged makes the request's own final criterion (`typecheck && test` green)
  impossible.

- [Trade-off] Success now blocks the parent for the full (unbounded) setup
  duration, plus ≤ `pollIntervalMs` registration-poll latency. That is the intended
  contract: exit 0 must mean "discoverable by `job wait`", which cannot be promised
  earlier without the deferred fake-running status.

## Open Questions

- Detach log tail length: proposed **N = 40** lines. Confirm in review.
- Ack poll interval: proposed **~200 ms** (latency only; the wait itself is
  process-death-gated and unbounded). Reusing `job wait`'s 2000 ms is also
  acceptable but adds visible latency on success. Confirm in review.
- Factoring: design assumes the ack loop folded into `detachSelf` with a deps
  object (D5); a standalone `waitForStartAck` is an equivalent factoring left to
  the implementer.
