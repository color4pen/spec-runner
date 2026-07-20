# Design: Local provider readiness before side effects

## Context

In the local runtime, provider (agent execution backend) availability is not
established before persistent side effects — job record, worktree, branch,
journal — are produced. Missing or bad Anthropic-side auth surfaces only at the
first agent step, by which point repository state and the job record have already
changed.

Current state:

- `src/core/runtime/prereqs.ts:38-42` — the local Anthropic check is best-effort
  only: `resolveClaudeCodeOAuthToken(env, { optional: true }).catch(() => undefined)`.
  As the code comment states, local Claude Code can authenticate through Claude's
  own interactive stores, so **preflight never verifies that an agent can actually
  run on this machine**. Credential presence is not a proxy for readiness.
- Execution order (run) — `src/cli/run.ts` calls `runPreflight()` (CLI), then
  `PipelineRunCommand.prepare()` (`bootstrapJob` is in-memory, no I/O), then
  `CommandRunner.execute()` runs `setupWorkspace()` (`src/core/command/runner.ts:130`).
  `setupWorkspace` performs `git fetch`, creates the worktree/branch, seeds the
  slug store, writes the liveness sidecar, and commits request.md — these are the
  **first persistent side effects**. The first agent step (`request-review`) runs
  afterwards and reads request.md from inside the worktree.
- Execution order (resume) — `src/cli/resume.ts` uses `bootstrap()` (CLI), then
  `ResumeCommand.prepare()` which **persists the `running` transition** (a job-record
  mutation) and resolves the worktree, then `CommandRunner.execute()` runs
  `setupWorkspace()` which may recreate a deleted worktree. Resume does **not** call
  `runPreflight()`.
- Existing patterns to reuse: the wrapping style in
  `src/core/runtime/git-fetch-error.ts` (`describeGitFetchFailure`: prescriptive
  first sentence + raw detail preserved underneath); the optional-on-port /
  required-on-`RealRuntimeStrategy` seam precedent (`assertNoDuplicateLiveJob`); the
  hint-existence teeth in `tests/hint-command-existence.test.ts`.

The measured symptom (pristine, credential-less env): a `run` with a valid GitHub
token issues a Job ID and proceeds to workspace preparation before failing, and
only reaches the provider at the first agent step. A user with a valid GitHub
token but no Anthropic-side auth first fails after worktree/branch/journal creation.

## Goals / Non-Goals

**Goals**:

- Establish local provider readiness **before any run/resume side effect**, so a
  readiness failure leaves no job record, worktree, branch, or journal.
- Check readiness exactly once per `run` / `resume`.
- Distinguish four failure kinds — auth missing, auth invalid, unreachable,
  provider failure — each with a distinct message and a kind-specific recovery
  prescription that names only real, currently-implemented commands.
- Never expose raw provider errors or credential values in the first sentence;
  keep detail under a wrap (same policy as `describeGitFetchFailure`).
- Make the readiness decision an injectable seam so CI reproduces success and each
  failure kind without a real token.

**Non-Goals**:

- Adding a local provider-alive check to `doctor` (separate decision; the readiness
  seam may be reused there later).
- Any change to managed runtime readiness / preflight or its execution path.
- Any change to GitHub token checks or git transport auth.
- Adding support for new providers.

## Decisions

### D1 — Placement: a shared readiness gate at the top of `CommandRunner.execute()`, before `prepare()`

Both `run` (`PipelineRunCommand`) and `resume` (`ResumeCommand`) extend
`CommandRunner` and funnel through `execute()`. The gate is invoked as the very
first action of `execute()`, before `this.prepare()` and therefore before every
side effect on both paths:

- run: before `bootstrapJob` and before `setupWorkspace` seeds the slug store /
  creates the worktree/branch/journal.
- resume: before `ResumeCommand.prepare()` persists the `running` transition and
  before `setupWorkspace` recreates a worktree.

This realizes the architect-approved position — "the same layer as the existing
preflight slot (before job-state creation)" — for **both** entry paths through a
single choke point.

Rationale (why here, not elsewhere):

- The CLI is not a single seam: `run` verifies via `runPreflight()` while `resume`
  uses `bootstrap()`; they are asymmetric, so a CLI-only gate would miss `resume`.
- `CommandRunner.execute()` is the one place both paths share strictly before any
  side effect. Placing the gate here also keeps it before the exit-guard
  registration, log initialization, and `KeepAlive` acquisition (all of which occur
  after `prepare()`), so a readiness failure produces no ancillary artifacts either.

Alternatives considered and rejected:

- Inside `setupWorkspace` or immediately before the first agent step — the failure
  would then occur **after** side effects, defeating the essence of this change.
- Duplicating the gate inside each `prepare()` — two call sites, and `resume`'s
  `prepare()` already persists the `running` transition, so the gate would have to
  sit above that mutation anyway; `execute()`-top is the earlier, single, uniform
  location.

### D2 — Mechanism: a live readiness probe (not moving the first agent connection earlier)

The mechanism chosen is a **lightweight live probe**: a bounded, side-effect-free
attempt to establish an authenticated provider connection, run once before side
effects and classified into a readiness result.

Rationale (why a probe, not credential inspection): local provider auth cannot be
verified from credential presence. The SDK can authenticate through Claude's own
interactive stores, which is exactly why the existing check is best-effort. Only an
actual connection attempt reveals whether the agent can run on this machine.

Rationale (why a probe, not "move the first real agent connection before side
effects"): the first agent step (`request-review`) reads request.md from inside the
job worktree, so it structurally depends on the worktree/branch/change-folder
already existing — the very side effects this change must avoid producing before a
readiness failure. Relocating that step before workspace creation would break its
input contract and require restructuring the pipeline. A dedicated probe needs no
worktree, so it is the only mechanism that can fail **before** side effects. This is
strictly simpler and cheaper than relocating a full pipeline step.

Cost / latency (requirement 7): the probe is bounded — a single call per run/resume,
a wall-clock timeout comparable to `doctor`'s reachability check, the cheapest
viable model, and early abort as soon as an authenticated turn is confirmed. On the
success path this is negligible against a full pipeline run; on the failure path it
is net-cheaper than discovering the failure after worktree/branch/journal creation
plus a wasted agent turn.

Misjudgment risk: transient/network failures are classified as `unreachable` with a
retry prescription, never as an auth failure, so a network blip cannot be
misreported as bad credentials.

### D3 — Injectable seam and runtime ownership

A new runtime capability expresses the gate:

- Port: `assertProviderReadiness(env)` — **optional** on `RuntimeStrategy` (so
  `RuntimeStrategy`-typed test fakes may omit it) and **required** on
  `RealRuntimeStrategy` (compile-enforced for concrete runtimes). This mirrors the
  `assertNoDuplicateLiveJob` precedent exactly.
- Local: `LocalRuntime` implements it by invoking an injected probe. The probe is a
  new constructor option (`providerReadinessProbe`) with an adapter-backed default,
  in the same style as the existing `queryFn` / `_resolveClaudeCodeOAuthTokenFn`
  injections. The default is wired at the composition root (`createRuntime`).
- Managed: `ManagedRuntime` implements it as a no-op, so managed's preflight and
  execution path are unchanged. Keeping the branch inside the runtime preserves the
  B-8 invariant (`config.runtime` branching stays in `core/runtime/`); `execute()`
  calls the method polymorphically with no runtime knowledge.

The probe returns a discriminated result — ready, auth-missing, auth-invalid,
unreachable, provider-failure — so CI injects fakes to reproduce each kind
deterministically without a real token (requirement 6, T5). The probe types live in
the port layer so both the adapter (real probe) and the domain (classifier) can
reference them without back-edges.

### D4 — Classification and message shape (mirror `describeGitFetchFailure`)

A pure domain classifier maps a non-ready probe result to a classified
`SpecRunnerError`:

- message = a prescriptive first sentence + newline + a bounded, credential-free
  detail summary (never the raw provider error object, never a token value).
- hint = a kind-specific recovery prescription that names only real commands.

Recovery prescriptions (real commands only):

- auth-missing → generate a token with `claude setup-token`, then store it with
  `specrunner login --provider claude` (or set `CLAUDE_CODE_OAUTH_TOKEN`).
- auth-invalid → the token was rejected; regenerate with `claude setup-token` and
  re-store with `specrunner login --provider claude`.
- unreachable → check network connectivity and retry.
- provider-failure → retry shortly; if it persists, check provider status.

The prescriptions are exposed as a `PROVIDER_READINESS_HINTS` map so the existing
hint-existence teeth (`tests/hint-command-existence.test.ts`) can assert that every
`specrunner <verb>` they reference is a registered command (`login` is registered;
`claude setup-token` is an external command and is not matched by the `specrunner
<verb>` check). T4 is satisfied because the prescriptive first sentence carries no
raw error and no credential — the probe never emits a token into `detail`.

### D5 — Error surfacing and exit code

The gate catches its own classified `SpecRunnerError`, prints the message via
`logError` and the hint via stderr, and **returns exit code 1** rather than
re-throwing. Returning (not throwing) keeps hint printing uniform for both `run`
and `resume` regardless of their divergent outer `catch` blocks, and is consistent
with the existing pre-job prerequisite failure (`RUNTIME_PREREQ_MISSING`, exit 1).
A dedicated error code (`PROVIDER_NOT_READY`) is added for clarity and testing.

Because a readiness failure occurs before any job exists, no `RunResultContract`
JSON is emitted (consistent with existing preflight failures, which also emit none).

## Risks / Trade-offs

- [Probe cost / latency] → bounded: single call per run/resume, wall-clock timeout,
  cheapest model, early abort; local-only; net-cheaper than a post-side-effect
  failure.
- [Transient network blip blocks a runnable job] → classified as `unreachable` with
  a retry prescription, not as auth blame; the user can immediately retry.
- [Real-probe error-string classification is fuzzy] → the real probe uses
  conservative signal patterns (in the spirit of the existing `AUTH_PATTERNS`);
  CI does not depend on real error strings because the four kinds are reproduced via
  injected fakes.
- [Managed regression] → managed implements a no-op; the gate is a polymorphic
  no-op for managed and existing managed tests remain unchanged.

## Open Questions

- The cheapest reliable SDK signal that confirms "authenticated" without a full
  generation (e.g. abort on the first successful init/turn message vs. a lighter
  handshake if the SDK exposes one). This is an implementation detail of the real
  probe and does not affect the seam, the classification, or any acceptance
  criterion.
