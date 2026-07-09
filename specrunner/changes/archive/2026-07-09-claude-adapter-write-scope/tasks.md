# Tasks: claude-code adapter workspace write scope

Scope of edits: `src/adapter/claude-code/agent-runner.ts` and its tests only. Do NOT
touch `src/adapter/codex/`, `src/adapter/claude-code/query-one-shot.ts`, or the
detection backstop. Reference the resolved values in `design.md` (D1–D6) and the
Scenarios in `spec.md`.

## T-01: Build the workspace-scoped sandbox setting for the step agent

- [x] In `src/adapter/claude-code/agent-runner.ts`, add a small helper (e.g.
  `buildWorkspaceSandbox(cwd: string)`) that returns the SDK `sandbox` setting:
  - `enabled: true`
  - `failIfUnavailable: false` (fail-open per D2 / spec "graceful degradation")
  - `autoAllowBashIfSandboxed: true` (Bash preserved per D4)
  - `filesystem.allowWrite` containing `cwd` and covering its subtree. Confirm the
    exact glob form against SDK v0.2.128 semantics (a bare `cwd` and/or `${cwd}/**`);
    `cwd` MUST be one of the entries.
  - Do NOT set `denyRead` / `allowRead` (reads unrestricted per D3).
  - Do NOT set `sandbox.network` (out of scope).
- [x] Wire the setting into the step-agent `queryOptions` object (the object built at
  `agent-runner.ts:276-287`), keyed as `sandbox`. Keep `allowedTools`,
  `disallowedTools`, and `permissionMode` exactly as they are.

**Acceptance Criteria**:
- `queryOptions.sandbox` is present with `enabled === true`,
  `failIfUnavailable === false`, `autoAllowBashIfSandboxed === true`.
- `queryOptions.sandbox.filesystem.allowWrite` contains the resolved `cwd`.
- `queryOptions.sandbox.filesystem` has no `denyRead` / `allowRead`.
- `queryOptions.allowedTools`, `disallowedTools`, `permissionMode` are unchanged.
- `typecheck` passes (setting conforms to the SDK `SandboxSettings` type).

## T-02: Emit a single stderr warning on sandbox degradation (fail-open observability)

- [x] Add a pure predicate (e.g. `isSandboxUnavailableWarning(chunk: string):
  boolean`) that recognizes the SDK's sandbox-unavailable stderr signature. Keep it
  broad-but-specific (matches a sandbox-unavailable / disabled / falling-back
  signature; ignores unrelated stderr lines).
- [x] In `run()`, declare a once-latch (e.g. `let sandboxDegradationWarned = false`)
  and register an `stderr` callback on `queryOptions`. On the first chunk for which
  the predicate returns `true`, call `stderrWrite(...)` once with a
  `[specrunner] warn:` message that names the step and states the run continues
  without the workspace write scope (mention that the main-checkout backstop still
  guards escape writes). Set the latch so subsequent chunks do not re-warn.
- [x] Ensure the same `stderr` callback (hence the same latch) propagates to the
  follow-up / retry / postWork / outputVerification turns — they are built by
  spreading `...queryOptions`, so reuse that object rather than re-creating the
  callback, so the warning stays once-per-run across all turns.
- [x] Confirm during implementation whether registering `stderr` suppresses the SDK's
  default stderr forwarding (Open Question in design.md). If it does, write-through
  the received `data` to the process stderr inside the callback to preserve existing
  visibility.
  - **Resolved**: SDK default without `stderr` callback is `stdio: "ignore"` for the
    subprocess stderr — it was previously silently dropped. Registering our callback
    switches it to `"pipe"` and enables capture. No prior forwarding existed, so no
    write-through is needed.
- [x] The fail-open continuation itself MUST rely on `failIfUnavailable: false` (T-01),
  not on this callback — the callback is observability only.

**Acceptance Criteria**:
- The predicate returns `true` for a representative sandbox-unavailable line and
  `false` for unrelated stderr lines.
- The `stderr` callback emits the warning at most once per `run()` invocation.
- No new error path is introduced: a degradation signal never changes
  `completionReason`.

## T-03: Test — sandbox settings are fixed in the step-agent query options

- [x] Add tests in the claude-code adapter test suite (same style as TC-AR-01 in
  `src/adapter/claude-code/__tests__/agent-redirect-integration.test.ts`, which
  captures `params.options` via an injected `_queryFn`). Suggested new file
  `src/adapter/claude-code/__tests__/sandbox-scope.test.ts` or an added `describe`
  block; use test IDs `TC-SB-01` / `TC-SB-02`.
- [x] `TC-SB-01`: run the step agent with `cwd = tempDir`; assert
  `capturedOptions.sandbox.enabled === true`,
  `capturedOptions.sandbox.failIfUnavailable === false`,
  `capturedOptions.sandbox.filesystem.allowWrite` contains `tempDir`, and that no
  `denyRead` / `allowRead` is set.
- [x] `TC-SB-02`: assert `capturedOptions.sandbox.autoAllowBashIfSandboxed === true`
  and `capturedOptions.allowedTools` contains `"Bash"`.

**Acceptance Criteria**:
- `TC-SB-01` and `TC-SB-02` fail against the current adapter and pass after T-01.
- Tests assert individual keys (do not `toEqual` the whole options object), so they do
  not couple to unrelated option keys.

## T-04: Test — fail-open continuation and single warning on degradation

- [x] Using an injected `_queryFn` (SDK behavior faked per the request's allowance),
  invoke `params.options.stderr(...)` with a simulated sandbox-unavailable line, then
  yield a normal success `result` message.
- [x] `TC-SB-03`: spy on the stderr sink (e.g. spy `stderrWrite` /
  `process.stderr.write`); assert the run's `completionReason` is `"success"` (run
  continues) and that exactly one `[specrunner] warn:` sandbox line is emitted.
- [x] `TC-SB-04`: fake `_queryFn` calls `options.stderr(...)` twice with the
  degradation line; assert the warning is emitted only once.

**Acceptance Criteria**:
- `TC-SB-03` proves the run continues and warns exactly once.
- `TC-SB-04` proves the once-latch holds across repeated signals.
- Both tests drive the fake SDK only through the injected `_queryFn` / `stderr`
  callback (no real sandbox dependency).

## T-05: Test — one-shot query options remain unchanged

- [x] In `tests/unit/adapter/claude-code/query-one-shot.test.ts`, add `TC-SB-05`
  capturing the one-shot query options via the injected query fn.
- [x] Assert the captured options contain no `sandbox` key, `allowedTools` equals
  `["Read", "Bash", "Grep", "Glob"]` for the default call, and `permissionMode`
  equals `"bypassPermissions"`.

**Acceptance Criteria**:
- `TC-SB-05` passes and would fail if a sandbox setting were ever added to the
  one-shot path (regression guard for D6 / spec "One-shot query behavior is
  unchanged").

## T-06: Verification — existing tests unchanged and green

- [x] Run `bun run typecheck && bun run test` (or the project's `verification.commands`)
  and confirm green. (457 test files / 6284 tests, all passed)
- [x] Confirm no existing test file was modified to accommodate the new options
  (additive keys only): the existing TC-023 options test and TC-AR-01 must still pass
  untouched. (Only `query-one-shot.test.ts` was extended with an additive describe block.)
- [x] Note in the implementation notes the outcome of the two design Open Questions
  actually resolved during coding (stderr forwarding behavior; whether temp/git paths
  needed to be added to `allowWrite`).

### Implementation Notes

**Open Question 1 — Does registering `stderr` suppress default forwarding?**
Resolved: No. The SDK sets `stdio: "ignore"` for stderr by default (when no callback
and no `DEBUG_CLAUDE_AGENT_SDK` env var). Registering our callback switches it to
`"pipe"` and starts capture. There was no prior forwarding to preserve, so no
write-through is needed.

**Open Question 2 — Do temp/git paths need to be in `allowWrite`?**
Not validated on a real sandbox-capable platform (no real sandbox invocation in tests
per request allowance). The `filesystem.allowWrite` entries are `[cwd, "${cwd}/**"]`,
matching the pattern of the codex `workspace-write` adapter. If additional paths
(OS temp dir, git worktree internal dir) prove necessary during a real run, they can
be added to `buildWorkspaceSandbox` in a follow-up.

**Open Question 3 — Exact glob form for `allowWrite` subtree coverage?**
Both `cwd` (bare directory) and `${cwd}/**` (recursive glob) are included to cover
both the directory itself and all paths within it, regardless of which form the SDK
requires.

**Acceptance Criteria**:
- `typecheck` and `test` are green.
- No pre-existing test was edited; all new behavior is covered by the new `TC-SB-*`
  tests.
