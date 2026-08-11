# Tasks: --detach start-ack

<!-- Ordering: T-01 (spawn seam) → T-02 (ack in detachSelf) → T-03 (wire + help)
     → T-04 (job wait hint) → T-05 (update existing pin tests). -->

## T-01: Add `onExit` callback to `spawnBackground` (child-exit + reaping seam)

- [ ] In `src/util/spawn.ts`, add an optional `onExit?: (code: number | null, signal: NodeJS.Signals | null) => void` to `SpawnBackgroundOptions` (place it symmetric with the existing `onError`).
- [ ] Wire it via `proc.on("exit", opts.onExit)` when provided (in addition to the existing `proc.on("error", ...)`). Attaching an `exit` listener also lets Node reap the child, avoiding a zombie — this is why the death gate must not use `isProcessAlive` (design D2).
- [ ] Do NOT change the default behavior: when `onExit` is omitted, spawn behaves exactly as today (still `unref()`'d, `detached`/`logFilePath`/`rawEnv`/`stripSecrets` unchanged).
- [ ] Keep `SpawnBackgroundFn` type compatible (only an optional field added to options).

**Acceptance Criteria**:
- `SpawnBackgroundOptions` has an optional `onExit`; when passed, `proc.on("exit", ...)` is registered.
- `src/util/__tests__/spawn-background-detach.test.ts` passes **unchanged** (no `onExit` in those calls; existing assertions on `detached`/`stdio`/`env`/`unref`/`openSync` unaffected).
- `typecheck` passes.

## T-02: Make `detachSelf` async and child-death-gated with injected seams

- [ ] In `src/core/command/detach.ts`, change `detachSelf` to `async` returning `Promise<number>`. Perform the spawn synchronously up-front (unchanged spawn shape: `detached:true`, slug-keyed `logFilePath`, `rawEnv` with `DETACH_MARKER_ENV`), capturing the returned handle and its `pid`.
- [ ] Introduce a dependency-injection object (mirroring `JobWaitDeps` style) with: `spawnFn`, a registration observer `readSidecarPid(repoRoot, slug): number | null`, a detach-log-tail reader `readDetachLogTail(logPath, lines): string`, `sleep(ms)`, and `pollIntervalMs`. Provide real production defaults (sidecar read from `path.join(repoRoot, livenessJsonPath(slug))`; tail read from `getDetachLogPath(repoRoot, slug)`). Keep the existing positional `spawnFn` override working, or fold it into the deps object — either is fine as long as the seams are injectable.
- [ ] Register `onExit` (child died) and `onError` (spawn failure / ENOENT) on the spawn call; set an internal `childEnded` flag from either. Treat `handle.pid === undefined` as an immediate startup failure.
- [ ] Ack loop (process-death-gated, no fixed timeout). Each tick, in this order (design D3):
  1. **Registration check (first):** if `readSidecarPid(repoRoot, slug) === childPid`, the job is registered → emit `buildDetachGuidance(slug)` to stdout → resolve `EXIT_CODE.SUCCESS`.
  2. **Death check:** else if `childEnded` is set → the child died before registering → read the detach-log tail (N = 40 lines), write the failure message (see T-02 below) + the full detach-log path to stderr → resolve `EXIT_CODE.GENERAL_ERROR`.
  3. Otherwise `await sleep(pollIntervalMs)` and continue.
- [ ] Define the failure text as a single exported constant/builder (e.g. `buildDetachStartFailure(slug, logPath, logTail)`) so it can be pinned by substring in an output-contract test (design D7). It MUST include the slug, the full detach-log path, and the transcribed tail.
- [ ] Guidance is emitted ONLY on the success path (remove the unconditional stdout guidance from the old body).
- [ ] Registration criterion is pid identity (`sidecar.pid === childPid`), NOT sidecar-existence or `isProcessAlive` — this is what makes resume's stale sidecar (dead pid) not count as ack (design D1).

**Acceptance Criteria**:
- With an injected `spawnFn` (fake handle, known pid) + a `readSidecarPid` that returns `null` for several ticks then `childPid`, the returned promise does NOT resolve until registration, then resolves `EXIT_CODE.SUCCESS` and guidance was emitted. Destructive check: if the registration wait is removed (resolve immediately), the "does not resolve before registration" assertion fails.
- With an injected `spawnFn` whose handle fires `onExit` before any registration (and `readSidecarPid` stays `null`), the promise resolves `EXIT_CODE.GENERAL_ERROR`, and the stderr text contains the transcribed detach-log tail and the full detach-log path.
- Register-then-die: if `readSidecarPid` returns `childPid` on the same/earlier tick that `onExit` fired, the result is `SUCCESS` (registration-first ordering).
- Resume race tooth: pre-seed `readSidecarPid` to return a dead pid `!== childPid`; the promise does NOT resolve as success on that stale value; it resolves `SUCCESS` only once `readSidecarPid` returns `childPid`.
- Spawn error path: an injected `spawnFn` that triggers `onError` (or returns `pid: undefined`) resolves `EXIT_CODE.GENERAL_ERROR` without hanging.
- `typecheck` passes.

## T-03: Await `detachSelf` in both `--detach` branches and reword help

- [ ] In `src/cli/command-registry.ts`, change both detach branches to `const code = await detachSelf({ ... }); process.exit(code);` — run/job start at `:435-441`, resume at `:704-710`. The pre-spawn slug validation / `--detach` + `--json` mutual-exclusion checks are unchanged and remain before the call.
- [ ] Reword the help/usage lines that claim immediate return to reflect the new contract (parent waits until the job is registered, or reports a start failure): `USAGE` lines at `:84`, `:91`, `:116`, and the `JOB_RESUME_USAGE` `--detach` description at `:231-232`. Keep the substrings `--detach` and `job wait` present (existing TC-019 asserts these).
- [ ] No behavior change to the foreground path or to the detach-child path (marker/log-redirect/recursion guard untouched).

**Acceptance Criteria**:
- Both branches `await detachSelf` and exit with its resolved code.
- `USAGE` still contains `--detach` and `job wait`; the "即座に return" / "returns immediately" phrasing is replaced by the wait-for-registration contract.
- Integration: after `job start --detach` resolves `SUCCESS`, the sidecar (pid = child) and state.json exist, so a subsequent `job wait <slug>` finds the job and does NOT exit 2 (registration precedes the parent's exit 0).
- `typecheck` passes.

## T-04: Add a detach-log hint to `job wait` "No job found"

- [ ] In `src/cli/job-wait.ts`, at the not-found exit (`:190-193`), after the existing `Error: No job found for slug: ${slug}` line, write an additional hint line to stderr pointing at `getDetachLogPath(repoRoot, slug)` and noting the job may still be initializing or may have failed to start under `--detach`.
- [ ] Do NOT change `notFoundRetryCount` / `notFoundRetryIntervalMs` or the not-found decision logic (scope: hint text only).

**Acceptance Criteria**:
- The "No job found" stderr output includes a hint that references the detach-log path for the slug.
- `src/cli/__tests__/job-wait.test.ts` passes **unchanged** (TC-018 asserts exit 2 + 5 retries only; adding a hint line does not change exit code or retry count).
- `typecheck` passes.

## T-05: Update the existing pin tests to the new contract

- [ ] `src/core/command/__tests__/detach.test.ts` (NOT named in the request's acceptance criteria, but MUST be updated — see design R "Test-scope gap"): TC-001 spawn-shape assertions stay (spawn is still synchronous up-front) but the calls must inject the ack seams and `await` the async `detachSelf`; TC-002 ("returns 0" / guidance) must simulate registration (seam returns `childPid`) so the promise resolves `SUCCESS` with guidance; TC-003 destructive tooth stays on the spawn-shape (detached/marker) assertions. The fake `spawnFn` handle must support the new `onExit`/pid contract used by `detachSelf`.
- [ ] `src/cli/__tests__/detach-flag-cli.test.ts`: change the `detachSelf` mock from `mockReturnValue(0)` to `mockResolvedValue(0)` (line 39, and the inline `vi.mocked(detachSelf).mockReturnValue(0)` at :216) since the branch now `await`s it. TC-004 / TC-024 assertions otherwise unchanged.
- [ ] `src/cli/__tests__/detach-output-contract.test.ts`: add pins for the new single-source failure message constant/builder and for the reworded help contract (help no longer promises immediate return). Existing TC-019/026/027/028 assertions remain green.
- [ ] Leave `src/util/__tests__/spawn-background-detach.test.ts`, `src/util/__tests__/xdg-detach-log.test.ts`, and the existing it()s in `src/cli/__tests__/job-wait.test.ts` unchanged and green.

**Acceptance Criteria**:
- `detach.test.ts`, `detach-flag-cli.test.ts`, `detach-output-contract.test.ts` are updated to the new async / registration-gated contract and pass.
- `spawn-background-detach.test.ts`, `xdg-detach-log.test.ts`, and the pre-existing `job-wait.test.ts` it()s pass unchanged.
- Full `typecheck && test` is green.
