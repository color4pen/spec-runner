# Tasks: job-power-assertion

## T-01: Add a resident-process seam function `spawnBackground` to `util/spawn.ts`

**File**: `src/util/spawn.ts`

- [ ] Add exported types:
  - `interface BackgroundProcessHandle { readonly pid: number | undefined; kill(): void; }`
  - `interface SpawnBackgroundOptions { cwd: string; env?: Record<string, string | undefined>; onError?: (err: Error) => void; }`
  - `type SpawnBackgroundFn = (cmd: string, args: string[], opts: SpawnBackgroundOptions) => BackgroundProcessHandle;`
- [ ] Add `export function spawnBackground(cmd, args, opts): BackgroundProcessHandle` that:
  - spawns via the module's existing `spawn` (from `node:child_process`) with
    `cwd: opts.cwd`, `shell: false`, `stdio: "ignore"`;
  - builds `env` exactly like `spawnCommand` does — `stripSecrets(process.env)`
    plus an optional `opts.env` overlay (B-6 strip point);
  - attaches `proc.on("error", (err) => opts.onError?.(err))` **synchronously**
    (before returning) so an async ENOENT never becomes an unhandled `error`;
  - calls `proc.unref()` so the child never keeps the CLI event loop alive;
  - returns a handle whose `pid` is `proc.pid` and whose `kill()` is idempotent
    (guarded by a local `killed` flag) and never throws (wrap `proc.kill("SIGTERM")`
    in try/catch).
- [ ] Do **not** add any new `import` of `node:child_process` — reuse the existing
  seam import already present in this file.

**Acceptance Criteria**:
- `spawnBackground` is exported with the `BackgroundProcessHandle` /
  `SpawnBackgroundOptions` / `SpawnBackgroundFn` types.
- `src/util/spawn.ts` still has exactly one `node:child_process` import (the
  existing one); no new B-12 allowlist entry is required.
- `kill()` called twice does not throw.

---

## T-02: Add the power-assertion helper `src/core/runtime/power-assertion.ts`

**File**: `src/core/runtime/power-assertion.ts` (new)

- [ ] Import `spawnBackground` and `type SpawnBackgroundFn` from `../../util/spawn.js`
  and `logWarn` from `../../logger/stdout.js`.
- [ ] Export `interface PowerAssertion { release(): void; }` (release idempotent,
  never throws).
- [ ] Export `interface AcquirePowerAssertionOptions { cwd: string; parentPid?: number; platform?: NodeJS.Platform; spawnBackgroundFn?: SpawnBackgroundFn; warn?: (msg: string) => void; }`.
- [ ] Export `function acquirePowerAssertion(opts): PowerAssertion` that:
  - resolves `platform = opts.platform ?? process.platform` and
    `warn = opts.warn ?? logWarn`;
  - if `platform !== "darwin"` → return a shared no-op assertion
    (`{ release() {} }`) without spawning anything (fail-open no-op);
  - if `platform === "darwin"` → resolve `parentPid = opts.parentPid ?? process.pid`
    and `spawnBg = opts.spawnBackgroundFn ?? spawnBackground`, then call
    `spawnBg("caffeinate", ["-i", "-w", String(parentPid)], { cwd: opts.cwd, onError })`
    where `onError` calls `warn(...)` with a clear "idle-sleep suppression
    unavailable (caffeinate: <message>); job will continue without it." message;
  - return `{ release() { handle.kill(); } }`.
- [ ] Reads `process.platform` only (never `process.env`) — no B-6 surface.

**Acceptance Criteria**:
- `acquirePowerAssertion` never throws for any `platform` or spawn outcome.
- On `darwin` it spawns `caffeinate` with `["-i", "-w", String(parentPid)]`.
- On non-`darwin` it spawns nothing and returns a no-op `release()`.

---

## T-03: Bind acquire/release to the local job lifecycle in `local.ts`

**File**: `src/core/runtime/local.ts`

- [ ] Import `acquirePowerAssertion` from `./power-assertion.js` and
  `spawnBackground, type SpawnBackgroundFn` from `../../util/spawn.js`.
- [ ] Extend `LocalCleanupInternals` (L57-65) with
  `releasePowerAssertion: () => void;`.
- [ ] Extend `LocalRuntimeOptions` with `spawnBackgroundFn?: SpawnBackgroundFn;`
  and `platform?: NodeJS.Platform;`.
- [ ] Add readonly fields and constructor defaults:
  `this.spawnBackgroundFn = opts.spawnBackgroundFn ?? spawnBackground;`
  `this.platform = opts.platform ?? process.platform;`.
- [ ] In `registerCleanup`, before defining `signalCleanup`, acquire:
  ```
  const powerAssertion = acquirePowerAssertion({
    cwd,
    parentPid: process.pid,
    platform: this.platform,
    spawnBackgroundFn: this.spawnBackgroundFn,
  });
  const releasePowerAssertion = () => powerAssertion.release();
  ```
- [ ] In `signalCleanup`, call `releasePowerAssertion()` immediately before
  `process.exit(130)` (the signal path bypasses `teardown`).
- [ ] Pass `releasePowerAssertion` into `makeHandle({ ... })`.
- [ ] In `teardown`, after deregistering the signal handlers and **before**
  `cleanupWorktreeOnFailure()`, call `internals.releasePowerAssertion()`
  unconditionally (all `finalStatus` values).

**Acceptance Criteria**:
- `registerCleanup` acquires exactly once; `teardown` and `signalCleanup` each
  release (idempotent kill makes any double-release safe).
- Existing `local.test.ts` TC-LR-005/006 and `signal-handler-order.test.ts` pass
  (signal-handler count and teardown cleanup behaviour unchanged; release is added
  around them, not in place of them).
- Production construction (no injected `spawnBackgroundFn` / `platform`) uses
  `spawnBackground` and `process.platform`.

---

## T-04: Unit-test the `spawnBackground` seam

**File**: `tests/unit/util/spawn-background.test.ts` (new) — model env assertions on
`tests/unit/core/verification/runner-git-show-env.test.ts` / `git-spawn-env.test.ts`
(`vi.mock("node:child_process", () => ({ spawn: vi.fn() }))` and capture `opts.env`).

- [ ] Env strip: set `process.env.GH_TOKEN` / `ANTHROPIC_API_KEY` and a `PATH` in
  `beforeEach` (restore in `afterEach`); call `spawnBackground("caffeinate",
  ["-i"], { cwd })`; assert the captured `opts.env` has neither secret and still
  has `PATH`, and that `stdio` is `"ignore"` and `shell` is `false`.
- [ ] Kill idempotency: with a fake `ChildProcess` (mock `kill`, `unref`, `on`,
  `pid`), assert `handle.kill()` twice calls the underlying `kill` at most once and
  never throws (even if `kill` throws internally).
- [ ] onError plumbing: capture the `error` listener registered on the fake child,
  invoke it with `new Error("spawn caffeinate ENOENT")`, and assert the
  `opts.onError` callback receives it.

**Acceptance Criteria**:
- All three tests pass and would fail against an env-omission or
  no-error-handler implementation.

---

## T-05: Unit-test `acquirePowerAssertion`

**File**: `tests/unit/core/runtime/power-assertion.test.ts` (new)

- [ ] darwin acquire: inject a `spawnBackgroundFn` that records `(cmd, args, opts)`
  and returns a fake handle with a `kill` spy; call
  `acquirePowerAssertion({ cwd: "/w", parentPid: 4242, platform: "darwin", spawnBackgroundFn })`;
  assert it was called once with `"caffeinate"`, `["-i", "-w", "4242"]`, and
  `opts.cwd === "/w"`; call `release()` and assert the handle's `kill` was called.
- [ ] non-darwin no-op: call with `platform: "linux"` and a recording
  `spawnBackgroundFn`; assert the spawn fn was **not** called and `release()` does
  not throw.
- [ ] fail-open ENOENT: inject a `spawnBackgroundFn` that synchronously invokes
  `opts.onError?.(new Error("spawn caffeinate ENOENT"))` and returns a no-pid fake
  handle; inject a `warn` spy; assert `acquirePowerAssertion` does not throw, the
  `warn` spy was called, and `release()` is safe.

**Acceptance Criteria**:
- All three tests pass; darwin args and non-darwin no-op are pinned; fail-open path
  warns and never throws.

---

## T-06: Lifecycle-binding test in `LocalRuntime` (acquire/release across teardown & signal)

**File**: `tests/unit/core/runtime/local-power-assertion.test.ts` (new) — reuse the
mock-manager / mock-github helpers from `local.test.ts` and the `process.exit` +
`JobStateStore` mocking pattern from `src/core/runtime/__tests__/signal-handler-order.test.ts`.

- [ ] Construct `LocalRuntime` with `platform: "darwin"` and an injected
  `spawnBackgroundFn` that records calls and returns a fake handle with a `kill`
  spy; run `setupWorkspace(...)` then `registerCleanup(jobId, step)`.
- [ ] Acquire: assert the injected `spawnBackgroundFn` was called once with
  `"caffeinate"`, `["-i", "-w", String(process.pid)]`.
- [ ] Release on success: call `teardown(handle, "awaiting-archive")`; assert the
  fake handle's `kill` was called.
- [ ] Release on error: fresh handle; call `teardown(handle, "failed")`; assert
  `kill` was called.
- [ ] Release on signal: extract `signalCleanup` from the handle internals, mock
  `process.exit` (and `JobStateStore.load`/`appendInterruption`/`persist`), invoke
  `signalCleanup()`; assert the fake handle's `kill` was called.
- [ ] Fail-open at runtime: construct with `platform: "linux"` (recording
  `spawnBackgroundFn`); `registerCleanup` + `teardown(handle, "awaiting-archive")`
  complete without spawning and without throwing.

**Acceptance Criteria**:
- Acquire is observed at `registerCleanup`; release is observed on the success,
  error, and signal paths — all via the injected spawn (per the request's
  observation method).
- The non-darwin runtime path completes with no spawn and no throw.

---

## T-07: Guard managed-runtime invariance and B-12/B-6 continuity; full verification

**Files**: (verification only — no `managed.ts` edits)

- [ ] Confirm `src/core/runtime/managed.ts` is unmodified and its existing tests
  (`tests/unit/core/runtime/managed.test.ts`) pass unchanged.
- [ ] Confirm the B-12 tooth is green and the set of `node:child_process` importers
  is unchanged: `spawnBackground` lives in the already-allowlisted `util/spawn.ts`
  and `power-assertion.ts` imports only from the seam (no new allowlist entry).
- [ ] `bun run typecheck` passes.
- [ ] `bun run test` passes — including `tests/grep-no-bun-imports.test.ts`,
  `tests/unit/architecture/core-invariants.test.ts` (B-6, B-12), the new
  `spawn-background` / `power-assertion` / `local-power-assertion` tests, and the
  unchanged `managed.test.ts` / `local.test.ts` / `signal-handler-order.test.ts`.

**Acceptance Criteria**:
- All `request.md` acceptance criteria are satisfied: acquire on job start; release
  on success/error/signal teardown; fail-open on unsupported platform and ENOENT;
  spawn routed through `util/spawn.ts` (B-12 green, no new direct import); managed
  tests green unchanged; `typecheck && test` green.
