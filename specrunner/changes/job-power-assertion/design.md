# Design: job-power-assertion

## Context

A long-running local job (`config.runtime === "local"`) can be silently stopped
when the host enters OS idle sleep (issue #758). The unattended primary story —
issue → approval → tick → PR — depends on the machine staying awake **while a job
is actually running**. We want to hold an OS power assertion for exactly the
window a local job executes, and release it the moment the job ends (so the idle
inbox daemon between ticks does not keep the machine awake).

### Current-state anchors

- `src/core/runtime/local.ts`
  - `registerCleanup(jobId, startStep)` (≈L922) builds the per-job cleanup handle,
    registers `process.on("SIGINT"/"SIGTERM", signalCleanup)` (L991-992), and
    returns an opaque `CleanupHandle` via `makeHandle(...)`.
  - `teardown(handle, finalStatus)` (≈L1004) deregisters the signal handlers
    (L1008-1009) and runs `cleanupWorktreeOnFailure()` on non-success paths.
  - **The `registerCleanup` → `teardown` window is precisely "the job is
    running".** It is the natural acquire/release boundary for a power assertion.
  - `CleanupHandle` internals (`LocalCleanupInternals`, L57-65) already carry
    `signalCleanup` / `cleanupWorktreeOnFailure`; a release closure fits the same
    shape.
  - The signal path calls `signalCleanup()` which ends in `process.exit(130)` —
    it does **not** flow through `teardown`. Any explicit release on the signal
    path must therefore happen inside `signalCleanup`.
  - `runner.ts` (the single caller) invokes `registerCleanup` once (L188) and
    `teardown` once — either `teardown(handle, "error")` on a pipeline throw
    (L244) or `teardown(handle, finalState.status)` on completion (L260). One
    acquire, one release.

- `src/util/spawn.ts` — `spawnCommand(cmd, args, opts)` is an **await-to-close**
  helper: it buffers stdout/stderr and resolves on `close`. It is unusable for a
  process that must stay alive for the whole job, and it exposes no kill handle.
  This module is one of the two B-12 seam modules that may import
  `node:child_process` directly, and it strips env via `stripSecrets` (B-6).

- No path currently spawns a **resident** (long-lived) subprocess.

- `src/core/runtime/managed.ts` — GitHub-hosted, ephemeral execution. Idle sleep
  is not a concept there; it must remain untouched.

### Constraints that shape the design

- **B-12** (arch tooth in `tests/unit/architecture/core-invariants.test.ts` +
  allowlist in `arch-allowlist.ts`): direct `node:child_process` import is banned
  outside the two seam modules and a shrink-only allowlist. Adding a new module
  that imports `node:child_process` would need a new allowlist entry — a
  regression against the one-directional ratchet.
- **B-6**: env handed to a subprocess must pass through `stripSecrets`.
- Acquire must be **synchronous** (`registerCleanup` returns a value, not a
  Promise) and must **never throw** (fail-open).

## Goals / Non-Goals

**Goals**:

1. Hold an OS idle-sleep power assertion for the duration of a running **local**
   job (acquire at `registerCleanup`, release at `teardown`).
2. Release on every job-end path: success (`awaiting-archive`), error/failure,
   and signal interruption (SIGINT/SIGTERM). Do **not** hold the assertion while
   the inbox daemon idles between ticks.
3. **Fail-open**: on an unsupported platform or when `caffeinate` is absent
   (ENOENT), warn and continue — the inability to suppress sleep must never stop
   or fail a job.
4. **Seam-compliant**: the resident process is spawned through `util/spawn.ts`
   (B-12), with env stripped via `stripSecrets` (B-6) — no new
   `node:child_process` importer, no new allowlist entry.
5. **No orphans**: teardown kills the process explicitly, and the process is
   additionally wired to self-terminate when the CLI (its parent) exits, so a
   teardown-less stop (crash, SIGKILL) leaves nothing behind.
6. Pin the acquire/release lifecycle binding, the fail-open paths, and the
   seam-routing with tests that inject the spawn function and observe calls.
7. Managed runtime behaviour is unchanged.

**Non-Goals**:

- Any stop cause other than OS idle sleep (network kill / parent kill / terminal
  disconnect / SIGHUP).
- Real suppression on non-macOS platforms (Linux `systemd-inhibit`, etc.) — those
  are fail-open no-ops with a documented extension seam.
- Sleep suppression for the managed runtime.
- Suppression during `awaiting-resume` / idle (only the running window).
- Recording the signal name in the interruption record (#764, separate).

## Decisions

### D1 — Extend the `util/spawn.ts` seam with a resident-process function

Add `spawnBackground(cmd, args, opts)` to `src/util/spawn.ts` (the existing B-12
seam module). It spawns a long-lived child and returns a small handle:

- `BackgroundProcessHandle { readonly pid: number | undefined; kill(): void }`
  where `kill()` is idempotent and never throws.
- `SpawnBackgroundOptions { cwd: string; env?: …; onError?: (err: Error) => void }`.
- Env is composed exactly like `spawnCommand`: `stripSecrets(process.env)` (plus
  any explicit `opts.env` overlay) — same B-6 strip point.
- `stdio: "ignore"`, `shell: false`, and the child is `unref()`-ed so it never
  keeps the CLI event loop alive.
- The async `error` event (e.g. ENOENT) is forwarded to `opts.onError` so callers
  can fail-open; without a handler, an unhandled `error` would crash the process.

**Rationale**: B-12's intent is to *confine* spawning to the seam, not to forbid
new spawn shapes. Extending the seam keeps the direct-import allowlist unchanged
(the ratchet only shrinks). `spawnCommand` cannot be reused — it resolves on
`close`, so it can only model short-lived commands and never exposes a kill
handle.

**Alternatives considered**:
- *Reuse `spawnCommand`* — rejected; await-to-close cannot host a resident
  process nor return a kill handle.
- *A dedicated power-assertion module importing `node:child_process` directly and
  adding a B-12 allowlist entry* — rejected; it grows a shrink-only allowlist and
  reintroduces a per-site env decision the seam exists to remove.
- *Reuse the `git-exec.ts` seam's raw-`ChildProcess` `SpawnFn`* — rejected; that
  seam is git-oriented (`runSubprocess` collects to close) and the request
  explicitly scopes the new capability to `util/spawn.ts`.

### D2 — A `core/runtime` power-assertion helper, platform-gated, fail-open

Add `src/core/runtime/power-assertion.ts` exporting:

- `interface PowerAssertion { release(): void }` (idempotent, never throws).
- `acquirePowerAssertion(opts)` where `opts` carries `cwd`, and injectable
  `parentPid` (default `process.pid`), `platform` (default `process.platform`),
  `spawnBackgroundFn` (default `spawnBackground`), and `warn` (default `logWarn`).

Behaviour:

- `platform !== "darwin"` → return a shared no-op `PowerAssertion` (fail-open
  no-op; the extension seam for future platforms).
- `platform === "darwin"` → spawn `caffeinate` via the injected seam (D3) and
  return a `release()` that calls the handle's `kill()`. On the child's `error`
  event, `warn(...)` is emitted and the job continues (fail-open).

The helper reads only `process.platform` (not `process.env`), so it is outside
B-6's scope; `platform` is injectable purely so tests are host-independent.

**Rationale**: isolating the platform gate + fail-open policy in one pure,
fully-injectable function keeps `local.ts` thin and makes both the darwin and
non-darwin behaviours unit-testable without touching the host OS or real
processes. `logWarn` is the project's masked, level-aware stderr warning channel.

**Alternatives considered**:
- *Inline the caffeinate logic in `registerCleanup`* — rejected; couples the
  lifecycle plumbing with platform detail and is harder to test in isolation.
- *Throw on unsupported platform and catch in the caller* — rejected; violates
  fail-open (requirement 3) and complicates the synchronous acquire.

### D3 — macOS implementation: `caffeinate -i -w <parentPid>`

On darwin the helper spawns `caffeinate -i -w <parentPid>`:

- `-i` asserts against **idle** system sleep (the exact stop cause in #758).
- `-w <parentPid>` makes `caffeinate` wait on the CLI's own pid and exit when the
  CLI exits — the orphan backstop for teardown-less stops (requirement 5).

`parentPid` defaults to `process.pid` (the CLI process). The child is **not**
detached, so a terminal-delivered SIGINT reaches it too; combined with the
explicit `kill()` in teardown/signal and the `-w` backstop, three independent
mechanisms prevent an orphan.

**Rationale**: `-i` is the minimal assertion matching the requirement (idle
sleep), and `-w <pid>` is a built-in, race-free auto-exit that needs no extra
bookkeeping. It is exactly the request author's recommendation.

**Alternatives considered**:
- *`-s` (prevent sleep on AC only)* — rejected; narrower than idle-sleep and
  AC-conditional; `-i` matches the stated cause.
- *Track and reap the child ourselves without `-w`* — rejected; loses the
  crash/SIGKILL backstop the request asks for.

### D4 — Bind acquire/release to the job lifecycle in `local.ts`

- `LocalRuntimeOptions` gains `spawnBackgroundFn?: SpawnBackgroundFn` (default
  `spawnBackground`) and `platform?: NodeJS.Platform` (default `process.platform`);
  the constructor stores both as readonly fields. These are the injection points
  the tests use.
- `registerCleanup` calls `acquirePowerAssertion({ cwd, parentPid: process.pid,
  platform: this.platform, spawnBackgroundFn: this.spawnBackgroundFn })` and holds
  the resulting `release` closure.
- `LocalCleanupInternals` gains `releasePowerAssertion: () => void`, threaded
  through `makeHandle`.
- `signalCleanup` calls `releasePowerAssertion()` immediately before
  `process.exit(130)` (the signal path never reaches `teardown`).
- `teardown` calls `internals.releasePowerAssertion()` unconditionally (all
  `finalStatus` values), **before** `cleanupWorktreeOnFailure()`, so the assertion
  is freed promptly regardless of the worktree cleanup branch.

Because `release()`/`kill()` are idempotent, a double release (defensive) is safe.
Acquire is fail-open and cannot throw, so it does not endanger `registerCleanup`.

**Rationale**: `registerCleanup`↔`teardown` is the exact running-window boundary
named in the request; the signal path needs its own explicit release because it
bypasses teardown. Placing the injection knobs on `LocalRuntime` lets a single
test observe both the caffeinate spawn (acquire) and the kill (release) across the
real lifecycle, host-independently.

**Alternatives considered**:
- *Rely solely on `-w <pid>` for the signal path (no explicit release in
  `signalCleanup`)* — rejected; requirement 2 wants an explicit release on the
  signal path, and the explicit `kill()` frees the assertion without waiting on
  process teardown timing.
- *Inject a whole `acquirePowerAssertion` function into `LocalRuntime`* — rejected;
  it would hide the spawn call from the lifecycle test, whereas the acceptance
  criterion asks to observe acquire/release via an injected spawn.

### D5 — Managed runtime is not touched

No power-assertion wiring is added to `src/core/runtime/managed.ts`. Its
`registerCleanup`/`teardown` remain as-is (requirement 7 / non-goal).

**Rationale**: managed jobs run on ephemeral GitHub-hosted runners; host idle
sleep is not a concept, and adding a caffeinate spawn there would be meaningless
and would risk the "managed tests unchanged" acceptance gate.

### D6 — Record the resident-process seam ruling via ADR

`request.adr === true`, so the adr-gen step records the architectural ruling:
"resident/background subprocesses are spawned through an extended `util/spawn.ts`
seam (`spawnBackground`), not via new direct `node:child_process` importers", and
the power-assertion lifecycle binding. Promotion of any canonical invariant row
into `architecture/model.md` is an out-of-loop owner action and is not performed
by the implementer.

**Rationale**: keeps the seam-extension decision on record while respecting the
out-of-loop status of `architecture/model.md`.

## Risks / Trade-offs

- [Risk] A resident child keeps the CLI event loop alive and blocks natural exit →
  **Mitigation**: `stdio: "ignore"` + `proc.unref()` in `spawnBackground`; the
  child never refs the loop, and the existing `KeepAlive` lifecycle binding is
  unaffected.
- [Risk] An unhandled `error` from a failed spawn (ENOENT) crashes the CLI →
  **Mitigation**: `spawnBackground` attaches an `error` listener synchronously and
  routes it to `opts.onError`; the helper maps it to a `logWarn` and continues.
- [Risk] A teardown-less stop (SIGKILL of the CLI, hard crash) leaves `caffeinate`
  running → **Mitigation**: `-w <parentPid>` makes `caffeinate` exit when the CLI
  pid disappears (D3), independent of teardown.
- [Risk] The lifecycle test is host-dependent (green only on macOS CI) →
  **Mitigation**: `platform` is injected as `"darwin"` in the lifecycle test and
  the seam is a recorded fake, so acquire/release are observed on any host.
- [Risk] Widening `LocalRuntimeOptions` looks like surface creep → **Mitigation**:
  both new fields are optional with production defaults (`spawnBackground`,
  `process.platform`); production construction is unchanged.
- [Risk] The B-12 tooth regresses if the helper imports `node:child_process` →
  **Mitigation**: the helper imports only `spawnBackground` from the seam; a task
  asserts the `node:child_process` import set (and the B-12 test) is unchanged.

## Open Questions

- Should `spawnBackground` grow explicit process-group control (`detached` +
  group kill) for future resident processes with child trees? Deferred —
  `caffeinate` has no children, and `-w <pid>` + explicit `kill()` cover this case.
- A future Linux implementation (`systemd-inhibit --what=idle …`) would slot into
  the `platform` switch in `power-assertion.ts`; out of scope here (fail-open
  no-op is the placeholder).
