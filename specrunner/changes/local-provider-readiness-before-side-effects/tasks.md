# Tasks: Local provider readiness before side effects

Acceptance-criteria identifiers T1–T7 below map to the request's acceptance criteria.
Implementer must keep managed runtime behavior and existing managed tests unchanged.

## T-01: Add the provider-readiness port types and seam method

- [ ] Add a new port module `src/core/port/provider-readiness.ts` declaring the
  readiness result and probe types:
  - `ProviderReadinessKind = "ready" | "auth-missing" | "auth-invalid" | "unreachable" | "provider-failure"`
  - `ProviderReadinessResult` — discriminated union: `{ kind: "ready" }` or a
    non-ready kind with an optional bounded, credential-free `detail?: string`.
  - `ProviderReadinessProbe = (env: Record<string, string | undefined>) => Promise<ProviderReadinessResult>`
- [ ] In `src/core/port/runtime-strategy.ts`, add `assertProviderReadiness?(env): Promise<void>`
  as an **optional** method on `RuntimeStrategy` (test-fake safety) and add it as a
  **required** method on the `RealRuntimeStrategy` intersection type (compile-enforced).
  Mirror the existing `assertNoDuplicateLiveJob` doc/comment convention.

**Acceptance Criteria**:
- `typecheck` passes with both `LocalRuntime` and `ManagedRuntime` still assignable to `RealRuntimeStrategy`.
- Port module has no imports from `core/runtime/` or `adapter/` (no back-edges).

## T-02: Add the pure classifier, recovery-hint map, and error code

- [ ] Add `PROVIDER_NOT_READY` to `ERROR_CODES` in `src/errors.ts` (leave it out of
  `EXIT_CODE_MAP` so it defaults to exit 1, matching `RUNTIME_PREREQ_MISSING`).
- [ ] Add `src/core/runtime/provider-readiness.ts` (pure domain module, no adapter import):
  - `PROVIDER_READINESS_HINTS: Record<Exclude<ProviderReadinessKind, "ready">, string>`
    with kind-specific recovery prescriptions naming only real commands:
    - `auth-missing` / `auth-invalid` → reference `claude setup-token` and
      `specrunner login --provider claude` (auth-invalid phrases it as regenerate/replace).
    - `unreachable` → check network connectivity and retry (no `specrunner` verb required).
    - `provider-failure` → retry shortly; if it persists, check provider status.
  - `classifyProviderReadiness(result): SpecRunnerError | null` — returns `null` for
    `ready`; otherwise returns `new SpecRunnerError("PROVIDER_NOT_READY", hint, message)`
    where `message` = a prescriptive first sentence + `"\n"` + the bounded
    credential-free `detail` (detail omitted when absent), following the
    `describeGitFetchFailure` shape (prescriptive first sentence, raw detail underneath).

**Acceptance Criteria** (T2, T4):
- Each of the four non-ready kinds yields a distinct `message` and a distinct `hint` from `PROVIDER_READINESS_HINTS`.
- The first sentence of `message` contains no provider raw-error text and no credential value; any `detail` appears only on a following line.
- `classifyProviderReadiness({ kind: "ready" })` returns `null`.

## T-03: Add the real adapter-backed readiness probe

- [ ] Add `src/adapter/claude-code/provider-readiness-probe.ts` exporting a factory
  (e.g. `createClaudeProviderReadinessProbe(...)`) that returns a `ProviderReadinessProbe`.
- [ ] The probe performs a **minimal, side-effect-free** authenticated connection
  attempt via the Claude Agent SDK (reuse `sdk-loader` / one-shot query infrastructure):
  read-only, no tools, no MCP, cheapest viable model, `maxTurns` 1, an `AbortController`
  wall-clock timeout comparable to `doctor`'s reachability check, and early abort once
  an authenticated turn is confirmed.
- [ ] Resolve the Claude Code OAuth token best-effort (token absence alone is NOT
  `auth-missing`; the SDK may authenticate via interactive stores). Inject env via
  `stripSecrets(process.env)` plus the resolved token, exactly as `agent-runner.ts` does.
- [ ] Classify the outcome into `ProviderReadinessResult`: authenticated turn → `ready`;
  unauthenticated / no-credential signal → `auth-missing`; rejected/revoked token
  (401-equivalent) → `auth-invalid`; timeout / network error → `unreachable`; other
  server-side error → `provider-failure`. Use conservative signal patterns (in the
  spirit of the existing `AUTH_PATTERNS`).
- [ ] `detail` must be a short, credential-free summary; never include the token value.

**Acceptance Criteria**:
- The probe writes no worktree, no branch, no state, and no journal.
- Timeout maps to `unreachable`; the token value never appears in any returned `detail`.

## T-04: Wire the probe into LocalRuntime and the composition root

- [ ] Add `providerReadinessProbe?: ProviderReadinessProbe` to `LocalRuntimeOptions`
  in `src/core/runtime/local.ts`, defaulting to the adapter-backed probe from T-03
  (same injection style as `queryFn`).
- [ ] Implement `LocalRuntime.assertProviderReadiness(env)`: call the injected probe
  once, pass its result to `classifyProviderReadiness`, and `throw` the returned
  `SpecRunnerError` when non-null; resolve when `ready`.
- [ ] In `src/core/runtime/factory.ts` (`createRuntime`), inject the default probe into
  `LocalRuntime` (or rely on the constructor default) so production runs use the real probe.

**Acceptance Criteria** (T5):
- With an injected fake probe, `assertProviderReadiness` throws a classified `SpecRunnerError` for each non-ready kind and resolves for `ready` — with no real token.

## T-05: Add a managed no-op implementation

- [ ] Implement `ManagedRuntime.assertProviderReadiness(_env)` as a no-op (returns
  immediately), mirroring the existing `assertNoDuplicateLiveJob` no-op.

**Acceptance Criteria** (T6, T8):
- Managed performs no provider readiness probe; existing managed tests pass unchanged.

## T-06: Invoke the shared gate in CommandRunner.execute() before prepare()

- [ ] In `src/core/command/runner.ts`, at the very top of `execute()` (before
  `this.prepare()` and before exit-guard registration / log init / `KeepAlive`),
  call `await this.runtime.assertProviderReadiness?.(process.env as Record<string, string | undefined>)`
  inside a `try/catch`.
- [ ] On a caught `SpecRunnerError`: print `err.message` via `logError` and, when
  present, `err.hint` via `stderrWrite("Hint: ...")`, then `return 1` (do not throw).
  On a non-`SpecRunnerError`, print its message and `return 1`.
- [ ] Do not emit `RunResultContract` JSON on this path (pre-job failure; no job exists).

**Acceptance Criteria** (T1, T3):
- For a not-ready probe, `run` and `resume` exit 1 with no worktree/branch/change-folder/state/journal created (run) and no `running` transition / worktree recreation (resume).
- The probe is invoked exactly once per `run` / `resume` invocation (verified by a call-counting fake).
- Relocating the gate to after `setupWorkspace` (mutation) causes the no-side-effects test to fail (gate is load-bearing).

## T-07: Extend the hint-command-existence teeth to cover readiness prescriptions

- [ ] In `tests/hint-command-existence.test.ts`, add a case that iterates
  `PROVIDER_READINESS_HINTS` and asserts every referenced `specrunner <verb>` is a
  registered command in `COMMANDS`.

**Acceptance Criteria** (T2):
- The readiness prescriptions are on the existing hint-existence teeth and pass (e.g. `specrunner login` is registered).

## T-08: Tests

- [ ] Classifier unit test (T2, T4): four non-ready kinds → distinct messages + distinct hints; no raw error / credential in the first sentence; `ready` → `null`.
- [ ] Gate integration test (T1, T3, T5): with an injected not-ready probe, assert `run` (and `resume`) create no side effects and exit 1; assert the probe is called exactly once; include the load-bearing / mutation-sensitivity assertion for T1's breakage check; use only injected fakes (no real token).
- [ ] Managed no-op test (T6, T8): managed `assertProviderReadiness` performs no probe and managed execution is unaffected.

**Acceptance Criteria** (T5, T6, T7):
- All new tests are green without any real token; no long-lived token is added to CI.
- Existing managed tests pass unchanged.
- `typecheck && test` is green.
