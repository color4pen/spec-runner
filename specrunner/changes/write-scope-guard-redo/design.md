# Design: claude-code adapter workspace write guard via `canUseTool` (measured `default`-mode configuration)

## Context

Pipeline step agents run through the claude-code local adapter
(`src/adapter/claude-code/agent-runner.ts`). The step-agent query options are
built once in `run()` (currently lines ~347–366) and reused by every follow-up /
retry / postWork / outputVerification turn via `...queryOptions` spreads. The
current object (state after the #768 revert) is:

```
queryOptions = {
  allowedTools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"],
  disallowedTools: ["Agent", "Task"],
  permissionMode: "bypassPermissions",
  sandbox: buildWorkspaceSandbox(cwd),   // filesystem.allowWrite = [cwd, `${cwd}/**`]
  stderr: <degradation-warning callback>,
  ...
}
```

### Why the previous attempt (#766) was reverted (#768)

`#766` (`file-tool-write-scope`, archived at
`specrunner/changes/archive/2026-07-10-file-tool-write-scope/`) tried to deny
out-of-workspace `Edit` / `Write` with a `canUseTool` guard, but shipped
`permissionMode: "dontAsk"` **while leaving `Edit` / `Write` in `allowedTools`**.
That configuration had two independent defects:

1. **`dontAsk` deny-by-default broke the pipeline.** `dontAsk` does not delegate
   an un-pre-approved tool to `canUseTool`; it denies it outright ("denied because
   Claude Code is running in don't ask mode"). The `report_result` MCP tool was not
   on `allowedTools`, so the SDK denied it at the permission layer and every run
   stopped at escalation.
2. **The guard was inert.** `Edit` / `Write` were on `allowedTools`, so they were
   pre-approved and `canUseTool` was never consulted for them — the guard it was
   built to enforce never fired.

The root cause recorded in that change was epistemic: the SDK's permission
behavior was read statically from docs/types and **recorded as if measured**. The
spec-review approved it on the same static reading. This redo removes that failure
mode by requiring a **runnable probe whose raw execution log is the evidence**.

### SDK measured facts (given; not to be re-derived)

`@anthropic-ai/claude-agent-sdk` `^0.2.128`, confirmed by live-query probe on
2026-07-10. These are inputs to this design; the implementer **re-confirms** them by
running the probe (§Probe Execution Log), not by re-reading docs/types:

1. `bypassPermissions`: `canUseTool` is **never** called (all tools auto-allowed).
2. `dontAsk`: a tool not on `allowedTools` is **denied without consulting**
   `canUseTool` — unsuitable for a headless runner.
3. `default` + a tool **absent** from `allowedTools`: `canUseTool` fires as the
   permission handler. It does not hang headless; a `{ behavior: "deny", message }`
   result is delivered to the agent, which continues.
4. A tool **listed** in `allowedTools` is pre-approved and **bypasses**
   `canUseTool` (so a tool to be guarded must NOT be on `allowedTools`).
5. An in-process MCP tool is named `mcp__<serverName>__<toolName>` (here
   `mcp__specrunner_report__<toolSpec.name>`). Listed on `allowedTools` it is
   pre-approved under `default` and runs immediately.
6. Verified green configuration (three scenarios): `default` +
   `allowedTools = [Read, Bash, Grep, Glob, <MCP report name>]` + `canUseTool =`
   workspace guard yields (i) out-of-workspace Write → guard fires, denies, no file
   written; (ii) in-workspace Write → guard fires, allows, file written; (iii)
   `report_result` → runs immediately.

### SDK type surface (`sdk.d.ts`, 0.2.128)

- `CanUseTool = (toolName, input, opts) => Promise<PermissionResult>`.
- `PermissionResult` = `{ behavior: "allow", updatedInput? }` |
  `{ behavior: "deny", message: string, interrupt? }`. The `deny` `message` is
  surfaced to the agent.
- `PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'`.
- `SandboxSettings.allowUnsandboxedCommands?: boolean` — when `false`,
  `dangerouslyDisableSandbox` on a Bash call is ignored.

### Current call sites

- `src/adapter/claude-code/agent-runner.ts` — step-agent options in `run()` and
  `buildWorkspaceSandbox(cwd)`. **Target of this change.**
- `src/adapter/claude-code/query-one-shot.ts` — one-shot path
  (`allowedTools:["Read","Bash","Grep","Glob"]`, `bypassPermissions`, no sandbox).
  **Out of scope**, frozen by existing regression tests (TC-SB-05, TC-FW-07).
- `src/core/runtime/local.ts` `LocalRuntime.query()` — a separate general-purpose
  query path (`bypassPermissions`), **out of scope**, frozen by
  `tests/unit/core/runtime/local.test.ts:609`.
- `src/adapter/codex/**` — **out of scope**, unchanged.

## Goals / Non-Goals

**Goals**:

- Make `canUseTool` actually fire for `Edit` / `Write` by moving the step-agent to
  the measured `default` configuration (measured fact 3/4): `permissionMode:
  "default"`, and `Edit` / `Write` removed from `allowedTools`.
- Deny `Edit` / `Write` whose resolved `file_path` is outside the agent working
  directory (`cwd`) subtree, via a pure `canUseTool` workspace guard, returning
  `{ behavior: "deny", message }` that directs the agent to work inside its worktree.
- Keep the `report_result` MCP tool executing immediately by pre-approving its
  `mcp__specrunner_report__<name>` on `allowedTools` (measured fact 5), so the
  pipeline lifeline is isolated from the guard.
- Keep every other execution behaviorally identical: `Read` / `Grep` / `Glob` /
  `Bash` and in-workspace `Edit` / `Write` remain allowed with no prompting.
- Close the `dangerouslyDisableSandbox` escape hatch with
  `allowUnsandboxedCommands: false`.
- Leave a runnable probe in the repo and record its raw execution log (with three
  scenario verdict lines) in this design's §Probe Execution Log.
- Add `src/adapter/**` to the `cross-boundary-invariants` reviewer `paths` so an
  adapter-layer change like this is never again scanned by zero reviewers.
- Freeze the new query-options contract and the guard behavior with tests.

**Non-Goals**:

- Network restriction (`sandbox.network`) — unset.
- Restricting `Read` (or any read tool) by path.
- Any guard or sandbox on the one-shot path (`query-one-shot.ts`) or
  `LocalRuntime.query()`.
- Redirecting (rewriting `file_path`) instead of denying — rejected in #766 because
  it makes artifact provenance opaque.
- Changes to the detection backstop (`main-checkout-write-detection`).
- Changes to the codex adapter.
- Resume-path changes (separate request: `resume-member-step-routing`).

## Decisions

### D1: Move the step agent to the measured `default` configuration

Change the step-agent `queryOptions` in `run()`:

- `permissionMode: "default"` (was `"bypassPermissions"`).
- `allowedTools` base becomes `["Read", "Bash", "Grep", "Glob"]` — `Edit` and
  `Write` are **removed** from the list. They remain *available* tools (they are not
  added to `disallowedTools`); removal from `allowedTools` only means each `Edit` /
  `Write` call is routed to `canUseTool` instead of being pre-approved.
- `disallowedTools: ["Agent", "Task"]` is unchanged; the in-stream redirect counter
  is unchanged.

- **Rationale**: Measured facts 3 + 4. `canUseTool` fires only for tools **not** on
  `allowedTools`, and only under `default` (not `bypassPermissions`, which never
  calls it, nor `dontAsk`, which denies without consulting it). This is the only
  measured configuration in which the guard runs and the runner does not hang. The
  request author and architect fixed this configuration; the implementer confirms it
  via the probe (§Probe Execution Log), not by re-reading the SDK.
- **Alternatives considered**:
  - *Keep `bypassPermissions` and add `canUseTool`* — rejected: fact 1, the callback
    is never invoked; the guard would be inert (the #766 defect).
  - *Use `dontAsk`* — rejected: fact 2, it denies un-pre-approved tools without
    consulting the callback; this is the #766 escalation-stall cause.
  - *Keep `Edit` / `Write` on `allowedTools` and expect the guard to run* — rejected:
    fact 4, they would be pre-approved and bypass the callback.

### D2: `createWorkspaceToolGuard(cwd)` — the pure workspace guard

Add and export a pure factory
`createWorkspaceToolGuard(cwd: string): CanUseTool` (type imported from
`@anthropic-ai/claude-agent-sdk` / the SDK loader). The returned callback:

- For `toolName === "Edit"` or `"Write"`: read `input.file_path`.
  - If `file_path` is missing or not a string → `{ behavior: "allow" }` (defer to
    the tool's own input validation; do not synthesize a new error path).
  - Otherwise resolve `path.resolve(cwd, file_path)` and test containment via
    `path.relative(cwd, resolved)`: **inside** iff the relative path is `""` (equals
    `cwd`) or does not begin with a `..` segment and is not itself absolute.
  - Inside → `{ behavior: "allow" }`. Outside →
    `{ behavior: "deny", message }` where `message` is stable and names the worktree
    (`cwd`) and instructs the agent to write only inside it (a test asserts a
    non-empty message containing a `worktree`/`workspace` substring).
- For every other `toolName` (`Read`, `Grep`, `Glob`, `Bash`, and any MCP tool such
  as `mcp__specrunner_report__report_result`) → `{ behavior: "allow" }`.

Wire it once into `queryOptions` as `canUseTool: createWorkspaceToolGuard(cwd)`, so
the existing `...queryOptions` spreads propagate it to all follow-up turns (same
propagation the `stderr` callback already relies on). Do not re-create it per turn.

- **Rationale**: The sandbox (D4) covers Bash subprocess writes at the OS layer;
  `Edit` / `Write` expose their target statically as `file_path`, so a `canUseTool`
  decision over exactly those two tools is the complete, dependency-free cover of the
  remaining write path. Default-allow for every other tool preserves prior effective
  permissions exactly (nothing that ran before is now blocked or prompted). Even
  though MCP tools are pre-approved (D3) and never reach the callback, the
  default-allow arm keeps the guard correct if the SDK ever consults it (belt and
  suspenders).
- **Alternatives considered**:
  - *Redirect out-of-workspace writes via `updatedInput`* — rejected (scope-out,
    #766): silently lands a write the agent did not choose, making provenance opaque.
  - *Abort the run on an out-of-workspace write* — rejected: `deny` preserves run
    availability; the agent re-targets and continues.
  - *Special-case `Agent` / `Task` in the guard* — rejected: they stay blocked by
    `disallowedTools` + the redirect counter (independent gate); duplicating that gate
    risks weakening it.

### D3: Pre-approve the `report_result` MCP tool on `allowedTools`

When `ctx.policy.reportTool` is configured, append
`mcp__specrunner_report__${toolSpec.name}` to `allowedTools` for the main-work turn.
The server name is the constant `specrunner_report` used in `createSdkMcpServer`; the
tool name is `toolSpec.name` (dynamic, e.g. `report_result`). When `reportTool` is
not configured, no MCP name is added.

- **Rationale**: Measured fact 5 — a listed MCP name is pre-approved under `default`
  and runs immediately. Pre-approving the report tool keeps the pipeline's completion
  signal off the permission-decision surface entirely, isolating the `report_result`
  path (the pipeline lifeline) from any future change to the guard. This is the
  architect-adopted decision. The MCP-name construction lives next to the existing
  `mcpServers.specrunner_report` wiring so the server name stays single-sourced.
- **Alternatives considered**:
  - *Rely on `canUseTool`'s default-allow arm to permit the MCP tool* — rejected as
    the primary mechanism: it works (the arm allows it) but routes the lifeline
    through the guard; pre-approval removes that coupling. The default-allow arm
    remains as defense in depth.
  - *Hardcode `report_result` in the MCP name* — rejected: `toolSpec.name` is dynamic;
    hardcoding would drift if a step registers a differently-named report tool.

### D4: Close the `dangerouslyDisableSandbox` escape hatch

Add `allowUnsandboxedCommands: false` to the object returned by
`buildWorkspaceSandbox(cwd)`. The step-agent query options then carry
`sandbox.allowUnsandboxedCommands === false`.

- **Network assessment** (carried over from #766 AC4): the step-agent Bash workload
  is local — `git status` / `diff` / `add`, build / typecheck / test / lint with
  dependencies already installed. The one network-bound git operation, `git push`, is
  performed **outside** the agent query by `StepExecutor.commitAndPush()`, not in a
  Bash turn. No step-agent Bash command needs unsandboxed / non-workspace access, so
  closing the hatch costs nothing on the assessed workload.
- **Rationale**: An open escape hatch makes the sandbox advisory — the model can opt
  out on any failed command. `allowUnsandboxedCommands` only has effect while the
  sandbox is active; on fail-open (unsupported) platforms it is moot, so this never
  changes the fail-open guarantee (`failIfUnavailable: false`).
- **Alternatives considered**:
  - *Leave the hatch open (SDK default)* — rejected: voids the sandbox guarantee for
    any Bash command the model retries unsandboxed.
  - *Split the hatch fix into a separate change* — rejected: it edits the same
    `buildWorkspaceSandbox` site; the split overhead exceeds the one-line change.

### D5: Probe artifact + raw execution log as the acceptance evidence

Add a runnable probe script at `scripts/probes/write-scope-guard-probe.ts` (run via
`bun scripts/probes/write-scope-guard-probe.ts`). It stands up the D1–D3
configuration against the real SDK and exercises the three measured-fact-6
scenarios, printing one machine-greppable verdict line per scenario. The implementer
runs it and pastes the **raw stdout/stderr** into §Probe Execution Log below.

Probe contract (the implementer owns the exact prompts/impl; the log must be
checkable):

- Build query options exactly as D1–D3 for a temp workspace dir `W` (via `mkdtemp`),
  with `canUseTool = createWorkspaceToolGuard(W)` and an in-process
  `specrunner_report` MCP server exposing `report_result`.
- Scenario **out-of-workspace-write**: prompt the agent to `Write` a file to a path
  outside `W` (a sibling temp path `O`). Observe: `canUseTool` fired, decision
  `deny`, and `O` was **not** created.
- Scenario **in-workspace-write**: prompt the agent to `Write` a file under `W`.
  Observe: `canUseTool` fired, decision `allow`, and the file **was** created.
- Scenario **report_result**: prompt the agent to call `report_result`. Observe: the
  MCP tool handler ran (pre-approved; `canUseTool` not consulted for it).
- Verdict line format (one per scenario), e.g.:
  `[PROBE] scenario=out-of-workspace-write canUseTool=fired decision=deny file_created=false verdict=PASS`
  `[PROBE] scenario=in-workspace-write canUseTool=fired decision=allow file_created=true verdict=PASS`
  `[PROBE] scenario=report_result canUseTool=not-consulted handler_invoked=true verdict=PASS`

Placement rationale: `scripts/probes/` is **outside** `tsconfig.json` `include`
(`src`, `bin`, `tests`, `vitest.config.ts`), the eslint globs (`./src ./tests`), the
vitest `include`, and the tsup `entry` (`bin/specrunner.ts`). The probe therefore
does not enter the verification gate (build / typecheck / test / lint) — correct,
because it requires live SDK auth and must not run in CI. It is validated by manual
execution, whose trace is the recorded log.

- **Rationale**: The #766 failure was a static SDK claim recorded as measured and
  passed through review unverified. Making a runnable probe + its raw log an
  acceptance condition means "an assertion about the external SDK carries an execution
  trace" is enforced by conformance (the file exists; design.md carries the log).
- **Alternatives considered**:
  - *Record the log inline in a unit test* — rejected: a real-SDK, real-auth probe
    cannot run in the offline verification gate; forcing it into `tests/` would break
    the green gate. A repo script + pasted log keeps the gate offline and the evidence
    durable.
  - *Skip the probe and trust the given facts* — rejected: that is exactly the #766
    failure mode this request exists to prevent.

### D6: Extend `cross-boundary-invariants` reviewer to cover `src/adapter/**`

Add `src/adapter/**` to the `paths` glob list in
`specrunner/reviewers/cross-boundary-invariants.md` frontmatter (append to the
existing `src/core/pipeline/**`, `src/core/step/**`, `src/state/**`,
`src/store/**`).

- **Rationale**: #766 changed only `src/adapter/**` and matched no reviewer `paths`,
  so no cross-boundary reviewer ran on it. Adding the adapter tree closes that
  scanning hole. This is a reviewer-config change (no product-code effect); reviewer
  definitions are snapshotted at job start, so this takes effect for future jobs.
- **Alternatives considered**:
  - *Create a new adapter-specific reviewer* — rejected: the cross-boundary lens
    (invariants broken by unchanged code interacting with new paths) is exactly what
    an adapter permission change needs; a new reviewer is redundant machinery.

### D7: Freeze the new contract with tests; bound the existing-test edit

New tests (`TC-FW-*` namespace):

- **Guard unit tests** — call `createWorkspaceToolGuard(cwd)` directly over a real
  `mkdtemp` `cwd`: out-of-workspace absolute `Write` → `deny` + non-empty
  worktree-naming message; relative-escape `Edit` (`../outside.txt`) → `deny`;
  in-workspace `Edit` → `allow`; `Bash` / `Read` / an MCP name
  (`mcp__specrunner_report__report_result`) → `allow` each; non-string/missing
  `file_path` on `Write` → `allow`.
- **Query-options freeze** — capture `params.options` via an injected `_queryFn`
  (the TC-023 pattern), asserting individual keys (never a whole-object `toEqual`):
  `permissionMode === "default"`; `allowedTools` does **not** contain `Edit` or
  `Write`; `canUseTool` is a function; `sandbox.allowUnsandboxedCommands === false`.
  With `policy.reportTool` set (via `makeReportTool()`), `allowedTools` **contains**
  `mcp__specrunner_report__report_result`; with `reportTool` absent, `allowedTools`
  **does not** contain any `mcp__specrunner_report__*` entry.

Existing-test edit (bounded): The one step-agent options test, TC-023
(`tests/unit/adapter/claude-code/agent-runner.test.ts`, the
`query() is called with allowedTools, permissionMode, and model` case), freezes
**two** fields this change rewrites:

- line ~310 `allowedTools` `toEqual(["Read","Edit","Write","Bash","Grep","Glob"])`
- line ~311 `permissionMode` `toBe("bypassPermissions")`

Under `policy: {}` (no reportTool) the new `allowedTools` is
`["Read","Bash","Grep","Glob"]` and `permissionMode` is `"default"`, so **both**
assertions must be updated. This is a single, intended contract update confined to
the one test; no other existing test changes.

> **Deviation from the acceptance criterion "update only the TC-023 `permissionMode`
> assertion (1 line)".** That criterion overlooked that the same TC-023 test also
> freezes `allowedTools` with `Edit`/`Write` (line ~310); Requirement 1 removes them,
> so that line must change too. The honest, minimal edit is **two** assertion lines
> in the one TC-023 test — not one. This is surfaced here for the reviewer rather than
> papered over. All other existing tests remain unedited: the one-shot regression
> tests (`TC-SB-05`, `TC-FW-07` in `query-one-shot.test.ts`), the `LocalRuntime.query`
> assertion (`local.test.ts:609`, out of scope, stays `bypassPermissions`), the
> `disallowedTools` / redirect-counter tests, and the MCP-server tests (TC-018,
> TC-024) all stay green untouched.

- **Rationale**: Individual-key assertions keep the freeze robust to future additive
  option keys. Bounding the existing edit to the two stale TC-023 assertions keeps the
  blast radius auditable and prevents regression paper-overs elsewhere.

## Risks / Trade-offs

- **[`default` mode changes effective permissions for some tool the runner relied on
  being auto-allowed]** → Under `bypassPermissions` everything was auto-allowed;
  under `default` only `allowedTools` entries are pre-approved and everything else is
  routed to `canUseTool`. Mitigation: the guard's default-allow arm returns `allow`
  for every tool except an out-of-workspace `Edit` / `Write`, reproducing the prior
  effective permissions; the probe's report_result scenario confirms the MCP path,
  and the query-options tests confirm the tool lists.

- **[The two-line TC-023 update looks like a regression paper-over]** →
  Mitigation: D7 documents that both fields are the exact contract this change
  rewrites, and the deviation note names the overlooked `allowedTools` assertion; the
  new `TC-FW-*` freeze tests independently pin the new contract.

- **[`allowUnsandboxedCommands: false` blocks a legitimate network/unsandboxed Bash
  command]** → Mitigation: the D4 assessment shows the agent Bash turn is offline and
  `git push` is outside it; the hatch only matters while the sandbox is active.

- **[Static `file_path` check bypass via symlink / normalization]** → An
  out-of-workspace write reachable through a symlink inside `cwd` passes the static
  check. Mitigation: accepted residual (matches the #766 framing); covered by the
  Bash-side sandbox at the OS layer and the detection backstop across step
  boundaries. Out of scope to fully resolve here.

- **[Probe cannot run in the offline verification gate]** → It needs live SDK auth.
  Mitigation: by design it lives outside all gate globs (D5); it is run once by the
  implementer and its raw log is pasted here as the durable evidence.

## Open Questions

- None. The permission-mode / `allowedTools` / MCP-name configuration is fixed by the
  given measured facts and re-confirmed by the probe; the escape-hatch closure and the
  reviewer-path extension are unconditional.

## Probe Execution Log

<!--
IMPLEMENTER: after writing `scripts/probes/write-scope-guard-probe.ts` and running it
against the real SDK (`bun scripts/probes/write-scope-guard-probe.ts`), paste the RAW
stdout/stderr below, replacing this placeholder. The pasted output MUST include the
three `[PROBE] scenario=... verdict=...` lines (out-of-workspace-write,
in-workspace-write, report_result). Do NOT substitute SDK docs, type definitions, or
bundled-source reading for the real execution trace.
-->

```
<!-- raw probe output to be pasted here by the implementer -->
```
