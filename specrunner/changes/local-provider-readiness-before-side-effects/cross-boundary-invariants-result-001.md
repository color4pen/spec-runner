# cross-boundary-invariants review — local-provider-readiness-before-side-effects

- **reviewer**: cross-boundary-invariants
- **iteration**: 1
- **verdict**: approved

## Purpose

Detect implicit pre-conditions (invariants) of code the diff did *not* touch, which the new behaviour silently violates. Implementation correctness and green tests are assumed; the focus is on interaction defects that only emerge at boundaries.

---

## Scope

Changed files analysed:

| layer | files |
|---|---|
| port | `src/core/port/provider-readiness.ts`, `src/core/port/runtime-strategy.ts` |
| domain classifier | `src/core/runtime/provider-readiness.ts` |
| adapter (real probe) | `src/adapter/claude-code/provider-readiness-probe.ts` |
| runtime wiring | `src/core/runtime/local.ts`, `src/core/runtime/managed.ts` |
| gate site | `src/core/command/runner.ts` |
| error registry | `src/errors.ts` |
| tests | `tests/core/provider-readiness-gate.test.ts`, `tests/core/runtime/provider-readiness.test.ts`, `tests/adapter/claude-code/provider-readiness-probe.test.ts`, `tests/hint-command-existence.test.ts`, `tests/unit/architecture/arch-allowlist.ts`, `tests/attach/attach-resume-e2e.test.ts`, `tests/unit/cli/resume.test.ts` |

---

## Invariant walk

### INV-1 — Gate position relative to all side-effect sites (T1)

**Claim**: readiness gate fires before every persistent side effect on both `run` and `resume`.

**Walk**:

`CommandRunner.execute()` calls `assertProviderReadiness?.()` as **step 0**, before `this.prepare()`. Both `PipelineRunCommand.prepare()` and `ResumeCommand.prepare()` inherit this ordering.

- **run path**: `assertProviderReadiness` → (`assertNoDuplicateLiveJob` → `bootstrapJob`) in `prepare()` → `setupWorkspace` (git fetch, worktree, branch, journal seed). Gate fires before all of these. ✓
- **resume path**: `assertProviderReadiness` → `prepare()` which persists the `running` transition and may recreate the worktree. Gate fires before both. ✓

`ResumeCommand.execute()` wraps `super.execute()` in a try-catch for `PrepareError`. The gate uses `return 1` (not `throw`), so the outer catch is never reached from a gate failure. No execution path bypasses the gate on the shared `CommandRunner` base. ✓

**Result**: invariant holds.

---

### INV-2 — `assertNoDuplicateLiveJob` ordering

**Claim**: "A rejected run creates no job state" (existing contract in `pipeline-run.ts` comments).

**Walk**: After this change the ordering is `assertProviderReadiness` → `assertNoDuplicateLiveJob` → `bootstrapJob` → `setupWorkspace`. `assertNoDuplicateLiveJob` still fires before `bootstrapJob` and before any I/O. No job state is created on either error path. The change shifts readiness before the duplicate check — a user who triggers both conditions simultaneously sees "provider not ready" instead of "duplicate job", but no side effects occur in either case.

**Result**: invariant holds. Error priority ordering is a deliberate design choice per D1.

---

### INV-3 — Managed runtime invariant (T6, T8)

**Claim**: "Managed runtime's existing preflight and execution path are unchanged."

**Walk**: `ManagedRuntime.assertProviderReadiness(_env)` is a documented no-op that returns immediately. The gate at `CommandRunner.execute()` calls `this.runtime.assertProviderReadiness?.()` polymorphically; the managed no-op means managed jobs pass the gate in zero time. No managed-path code reads or branches on the new method. Existing managed tests were unmodified. ✓

**Result**: invariant holds.

---

### INV-4 — Arch invariant B-8 (config.runtime branching confined to `core/runtime/`)

**Claim**: "All `config.runtime` branching stays inside `core/runtime/`."

**Walk**: `CommandRunner.execute()` calls `this.runtime.assertProviderReadiness?.()` polymorphically; no `if (config.runtime === "local")` check appears in `runner.ts`. The local-vs-managed difference is entirely inside `LocalRuntime` and `ManagedRuntime`. ✓

**Result**: invariant holds.

---

### INV-5 — Arch invariant B-6 (`process.env` forwarding)

**Claim**: "Raw `process.env` must not be forwarded unfiltered to subprocesses or SDK calls."

**Walk**: `runner.ts` passes `process.env as Record<string, string | undefined>` to `assertProviderReadiness`. The adapter implementation (`LocalRuntime`) calls `stripSecrets(env)` before passing the env to the Claude Agent SDK (in `provider-readiness-probe.ts`, Step 2). The raw env is not forwarded to any subprocess.

The arch-allowlist entry (`arch-allowlist.ts`, pattern `"assertProviderReadiness(process.env"`) correctly documents this: the method is a port call, not a direct spawn; the adapter strips secrets internally.

The port type comment says "secrets stripped by the caller" but the actual caller (`runner.ts`) does *not* strip them — the adapter does. This is a documentation mismatch, not a correctness bug; the allowlist entry has the accurate description.

**Result**: invariant holds. Documentation mismatch is noted as an observation.

---

### INV-6 — Port module: no back-edges (DSM §3)

**Claim**: "`src/core/port/provider-readiness.ts` has no imports from `adapter/` or `core/runtime/`."

**Walk**: The port file imports nothing (it contains only type declarations). The TC-010 test reads the source and asserts no `from '...adapter/'` or `from '...core/runtime/'` patterns. ✓

`src/core/runtime/provider-readiness.ts` (classifier) imports only from `core/port/provider-readiness.ts` and `errors.ts` — no adapter imports. ✓

**Result**: invariant holds.

---

### INV-7 — Probe factory creates a new probe instance per `execute()` call

**Claim**: T3 requires "exactly once per run/resume".

**Walk**: `LocalRuntime.assertProviderReadiness()` creates a new probe via `createClaudeProviderReadinessProbe()` if no injected probe is present, then calls it once. Since `CommandRunner.execute()` calls `assertProviderReadiness` exactly once, the probe is invoked exactly once per `execute()` call. The creation-per-call has no functional consequence; the probe is stateless. ✓

Design doc T-04 says "inject the default probe into LocalRuntime (or rely on the constructor default)". The implementation relies on lazy creation in `assertProviderReadiness` rather than injection at `factory.ts`. This matches the parenthetical option in T-04 and is functionally correct.

**Result**: invariant holds.

---

### INV-8 — `KeepAlive` / `beforeExit` guard not registered on readiness failure

**Claim**: A readiness failure must not leave dangling process handles.

**Walk**: The gate fires at the top of `execute()`, before `keepAlive.acquire()` (line ~144) and before `process.on("beforeExit", ...)` (line ~121). On gate failure the function returns 1 before both registrations. No `KeepAlive` is acquired and no exit guard is registered — the process exits cleanly. ✓

**Result**: invariant holds.

---

### INV-9 — `ResumeCommand.execute()` exit-code contract

**Claim**: `ResumeCommand.execute()` must preserve its exit-code-2 contract for `PrepareError` instances.

**Walk**: `ResumeCommand.execute()` wraps `super.execute()` in a try-catch for `PrepareError`. The gate uses `return 1` (never `throw`), so no gate failure reaches that catch. `PrepareError`s thrown by `prepare()` still propagate through `CommandRunner.execute()` (no try-catch around `this.prepare()`) and are caught by `ResumeCommand.execute()` as before. ✓

**Result**: invariant holds.

---

### INV-10 — Abort controller / cleanup race in the real probe

**Claim**: The probe must never throw; all outcomes are returned as `ProviderReadinessResult`.

**Walk**: The outermost catch in `createClaudeProviderReadinessProbe` captures all errors from the `for await` loop and the SDK call. A timeout abort sets `abortController.signal.aborted = true` before the timer callback fires, so the `if (abortController.signal.aborted)` check in the catch correctly returns `unreachable`. The `finally` block unconditionally clears the timeout. ✓

The one acknowledged edge case (auth error arrives just as the timer fires, causing a race where `abortController.signal.aborted` is true but the real error is an auth failure) is documented in the design's risk section and classified conservatively as `unreachable`, consistent with the stated misjudgment-risk mitigation.

**Result**: invariant holds within the documented risk envelope.

---

### INV-11 — Existing tests backward-compatible (optional method on `RuntimeStrategy`)

**Claim**: Test fakes typed as `RuntimeStrategy` must not be broken by the new optional method.

**Walk**: `RuntimeStrategy` declares `assertProviderReadiness?` as optional. `CommandRunner.execute()` uses `if (this.runtime.assertProviderReadiness) { ... }`. Tests in `runner.test.ts` and `resume.test.ts` (core command layer) create fakes without `assertProviderReadiness`; the gate silently skips for those fakes. ✓

The e2e test (`attach-resume-e2e.test.ts`) injects a ready probe directly. `tests/unit/cli/resume.test.ts` uses `vi.mock` to intercept the lazy dynamic import path. Both approaches are correct. ✓

**Result**: invariant holds.

---

## Observations (non-blocking)

### OBS-1 — Port comment says "secrets stripped by the caller" but caller passes raw env

- **file**: `src/core/port/provider-readiness.ts`, line 56
- **severity**: low
- **rationale**: The `ProviderReadinessProbe` type comment says "Receives the sanitized process environment (secrets stripped by the caller)." The actual caller (`runner.ts`) passes raw `process.env`. The adapter strips secrets internally. The arch-allowlist entry correctly describes the real behaviour. The comment is misleading to future implementors of alternative probes who may assume the env is pre-sanitised. No correctness issue.

### OBS-2 — `local.ts` comment says "composition root injects" but `factory.ts` does not inject the probe

- **file**: `src/core/runtime/local.ts`, lines 155–162
- **severity**: low
- **rationale**: The comment says "the composition root (createRuntime / factory.ts) injects the real adapter-backed probe." `factory.ts` does not inject it; the probe is created lazily via dynamic import inside `assertProviderReadiness`. T-04 permits this via its parenthetical "(or rely on the constructor default)". Functionally correct; comment overstates what `factory.ts` does.

---

## Verdict

All eleven cross-boundary invariants examined hold. The implementation correctly:

- establishes the readiness gate before every persistent side effect on both run and resume paths
- preserves the existing `assertNoDuplicateLiveJob` ordering relative to `bootstrapJob`
- keeps managed runtime behaviour unchanged via a polymorphic no-op
- confines runtime branching to `core/runtime/` (B-8)
- documents the `process.env` forwarding in the arch allowlist (B-6)
- avoids dangling handles on gate failure
- maintains backward compatibility for all RuntimeStrategy-typed test fakes

The two observations are documentation inconsistencies with no runtime impact.

- **verdict**: approved
