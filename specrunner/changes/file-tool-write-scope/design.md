# Design: claude-code adapter Edit / Write workspace write scope via `canUseTool`

## Context

spec-runner runs pipeline step agents through the claude-code local adapter
(`src/adapter/claude-code/agent-runner.ts`). A prior change
(`claude-adapter-write-scope`, ADR-20260709-claude-adapter-workspace-write-scope)
added an SDK native sandbox to the step-agent query options:

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

Confirmation against the official SDK docs established that the sandbox is a
**Bash-subprocess-only** mechanism: built-in file tools (`Read` / `Edit` /
`Write`) do **not** pass through the sandbox — they are handled by the permission
system directly. Under `permissionMode: "bypassPermissions"` the permission system
auto-allows everything, so `Edit` / `Write` can still write to any absolute path
outside the workspace (e.g. the repository main checkout). Two residual gaps were
recorded in that ADR's *Known Gaps* and are the subject of this change:

1. **Edit / Write path inspection** — file tools carry an explicit `file_path`
   argument, so the write target can be judged statically. A `canUseTool` callback
   that denies out-of-workspace `file_path` values is the natural complement to the
   sandbox (which covers Bash).
2. **`dangerouslyDisableSandbox` escape hatch** — when a sandboxed Bash command
   fails, the model may retry it with `dangerouslyDisableSandbox: true`. That retry
   goes through the permission flow, which `bypassPermissions` auto-allows, yielding
   an unsandboxed execution. `sandbox.allowUnsandboxedCommands: false` disables it.

### Current call sites

- `src/adapter/claude-code/agent-runner.ts` — step-agent query options built at
  `run()` (the object currently at lines ~347–366) and reused (via `...queryOptions`)
  by the follow-up / retry / postWork / outputVerification turns. **Target of this
  change.**
- `src/adapter/claude-code/query-one-shot.ts` — one-shot / read-oriented steps
  (`allowedTools: ["Read","Bash","Grep","Glob"]`, `permissionMode: "bypassPermissions"`,
  no sandbox). **Out of scope**, frozen by regression tests.

### External SDK surface (`@anthropic-ai/claude-agent-sdk` 0.2.128, verified in `sdk.d.ts`)

- `Options.canUseTool?: CanUseTool` — "Called before each tool execution to determine
  if it should be allowed, denied, or prompt the user." Signature:
  `(toolName: string, input: Record<string, unknown>, opts: { signal, ... }) => Promise<PermissionResult>`.
- `PermissionResult` (relevant variants):
  - allow: `{ behavior: "allow", updatedInput?: Record<string, unknown> }`
  - deny:  `{ behavior: "deny", message: string, interrupt?: boolean }`
  The `deny` message is surfaced to the agent, which can re-target the path inside the
  worktree and retry.
- `PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'`.
- `SandboxSettings.allowUnsandboxedCommands?: boolean` — when `false`, the
  `dangerouslyDisableSandbox` parameter is completely ignored.
- **Unverified from types/docs**: whether `canUseTool` is invoked while
  `permissionMode: "bypassPermissions"`. The documented purpose of `bypassPermissions`
  is to skip the permission system, which suggests the callback may be skipped. This
  is resolved by an empirical probe (T-01) and recorded in §Empirical Results below.

## Goals / Non-Goals

**Goals**:

- Deny `Edit` / `Write` step-agent tool executions whose resolved `file_path` is
  outside the agent working directory (`cwd`) subtree, via the SDK `canUseTool`
  callback, returning a `deny` result with a message that directs the agent to write
  inside its worktree.
- Keep every other execution behaviorally identical: `Read` / `Grep` / `Glob` / `Bash`,
  the `report_result` MCP tool, and in-workspace `Edit` / `Write` remain allowed with
  no interactive prompting.
- Disable the `dangerouslyDisableSandbox` escape hatch on the step-agent sandbox by
  setting `allowUnsandboxedCommands: false`, unless a legitimate step-agent Bash need
  for unsandboxed execution is established (then waive with recorded rationale).
- Fix the guard's input/output behavior with unit tests over `canUseTool` directly.
- Leave the one-shot path and the codex adapter behaviorally unchanged.

**Non-Goals**:

- Any change to the detection backstop (`main-checkout-write-detection`).
- Network restriction (`sandbox.network`).
- Applying the guard, or any sandbox, to the one-shot path (`query-one-shot.ts`).
- Restricting `Read` (or any read tool) by path — reads remain unrestricted.
- Changing the codex adapter.

## Decisions

### D1: Enforce Edit / Write write-scope with a `canUseTool` workspace guard

Add a pure factory, `createWorkspaceToolGuard(cwd: string): CanUseTool`, exported
from `agent-runner.ts`. The returned callback:

- For `toolName === "Edit"` or `"Write"`: read `input.file_path`. Resolve it to an
  absolute path against `cwd` (`path.resolve(cwd, file_path)` handles both absolute
  and relative inputs; an absolute input resolves to itself). If the resolved path is
  **not** within the `cwd` subtree, return
  `{ behavior: "deny", message }` where the message names the worktree (`cwd`) and
  instructs the agent to write only inside it. Otherwise return `{ behavior: "allow" }`.
- For every other `toolName` (including `Read`, `Grep`, `Glob`, `Bash`, and MCP tools
  such as `report_result`): return `{ behavior: "allow" }`.

Containment is decided with `path.relative(cwd, resolved)`: the target is inside iff
the relative path is `""` (equals `cwd`) or does not start with `..` and is not
itself absolute. See D6 for path-semantics details.

- **Rationale**: The sandbox already covers Bash (the mechanism that reaches the OS
  filesystem via subprocesses); `Edit` / `Write` are the only remaining write path,
  and they expose the target statically as `file_path`. A `canUseTool` guard over
  those two tools plus the Bash-covering sandbox is the complete, dependency-zero
  cover of every write path. This is the mechanism the prior change rejected as
  incomplete when it was expected to also constrain Bash; with the sandbox owning
  Bash, the two mechanisms are complementary rather than competing.
- **Alternatives considered**:
  - *Redirect out-of-workspace writes (rewrite `file_path` inside cwd via
    `updatedInput` and allow)* — **rejected**. The SDK supports it, but it silently
    lands a write the agent did not intend at a location it did not choose, making the
    provenance of artifacts opaque. An explicit `deny` with a corrective message is
    honest and lets the agent re-target deliberately.
  - *`PreToolUse` hook instead of `canUseTool`* — **rejected**. Adds a second
    permission surface with its own semantics; its firing under `bypassPermissions` is
    equally unverified, so it does not avoid the probe, and it is more machinery than
    the single-callback guard needs.
  - *Abort the run on an out-of-workspace write* — **rejected**. `deny` preserves run
    availability: the agent adjusts and continues, matching the sandbox's own
    fail-and-continue posture on a blocked Bash write.

### D2: Select `permissionMode` from the empirical probe; preserve prior auto-allow behavior

`canUseTool` only enforces the guard if the SDK actually invokes it. Because the
firing behavior under `bypassPermissions` is not derivable from the types/docs, T-01
runs an empirical probe and this design records the outcome (§Empirical Results). Two
branches:

- **Branch A — `canUseTool` fires under `bypassPermissions`.** Keep
  `permissionMode: "bypassPermissions"` unchanged and add `canUseTool`. No permission
  behavior changes for any currently-allowed tool. The frozen assertion
  `permissionMode === "bypassPermissions"` (in `agent-runner.test.ts`, the TC-023
  options test) stays green with zero edits.
- **Branch B — `canUseTool` does not fire under `bypassPermissions`.** Change
  `permissionMode` to the mode that (a) invokes `canUseTool` and (b) never blocks on
  an interactive prompt in the non-interactive runner context (candidate: `"dontAsk"`;
  the probe confirms the exact value). Behavior invariance for currently-allowed tools
  is reproduced by the guard's default-allow arm (D3): every tool except an
  out-of-workspace `Edit` / `Write` returns `allow`, so nothing that ran before is
  blocked and nothing prompts. The chosen mode is fixed by a test (D5).

In either branch, the guard is added to `queryOptions` as `canUseTool` so that the
`...queryOptions` spreads propagate it to the follow-up / retry / postWork /
outputVerification turns unchanged, exactly as the existing `stderr` callback is
propagated.

- **Rationale**: The requirement is *behavior invariance for currently-allowed tools*
  (request Req 2), not preservation of the literal `permissionMode` string. Branch B
  changes the mode only to keep `canUseTool` consulted, and the default-allow arm
  restores identical effective permissions.
- **Existing-test consequence (surfaced deliberately)**: Under Branch B the single
  assertion that freezes the literal `permissionMode` value (`agent-runner.test.ts`,
  TC-023, the line asserting `permissionMode === "bypassPermissions"`) documents the
  *previous* contract for the exact field this change intentionally alters. Updating
  that one assertion to the newly chosen mode is an intended, minimal contract update
  — not a regression paper-over. It is the **only** existing assertion permitted to
  change, and only in Branch B; all other existing tests remain unedited (see T-08).
  Under Branch A no existing assertion changes at all.
- **Alternatives considered**:
  - *Keep `bypassPermissions` regardless and accept that the guard may be inert* —
    **rejected**. If the probe shows `canUseTool` does not fire, an inert guard would
    leave the gap open while appearing to close it. Enforcement must be observable.
  - *Switch to `default` mode with an `allowedTools` allow-list only* — **rejected**.
    `default` prompts for tools outside the allow-list, which can block in a
    non-interactive runner; the guard-driven mode must be prompt-free.

### D3: Default-allow every non-target tool; leave `disallowedTools` as the independent gate

The guard makes an allow/deny **decision only** for out-of-workspace `Edit` / `Write`.
For all other tools it returns `allow`. It does not attempt to police `Agent` / `Task`:
those remain blocked by `disallowedTools: ["Agent", "Task"]` and the existing
in-stream redirect counter, both untouched.

- **Rationale**: `disallowedTools` and the redirect counter already enforce the
  `Agent` / `Task` block independently of the permission callback. Keeping the guard's
  responsibility narrow (write-scope only) avoids duplicating — or accidentally
  weakening — that gate, and guarantees the `report_result` MCP tool and every read
  tool keep working. The existing agent-redirect tests must stay green.

### D4: Disable the escape hatch with `allowUnsandboxedCommands: false`

Add `allowUnsandboxedCommands: false` to the object returned by
`buildWorkspaceSandbox(cwd)`.

- **Network assessment** (request Req 4 requires this before adopting): The step-agent
  Bash workload in this pipeline is local — `git status` / `diff` / `add` (local),
  build / typecheck / test / lint with dependencies already installed. The one
  network-bound git operation, `git push`, is performed **outside** the agent query by
  `StepExecutor.commitAndPush()` (claude-code adapter D5), not inside a Bash turn. No
  standard step-agent Bash command requires reaching a non-workspace host or an
  unsandboxed capability. Note also that `allowUnsandboxedCommands` only has effect
  while the sandbox is active; on fail-open (unsandboxed) platforms it is moot.
- **Decision**: Adopt `allowUnsandboxedCommands: false`. It closes the self-unsealing
  path with no impact on the assessed workload, and is fixed by a test (query options
  carry it, and `buildWorkspaceSandbox` returns it).
- **Conditional waiver**: If, during implementation, a legitimate step-agent Bash use
  that requires unsandboxed / network execution is identified, Req 4 is waived and the
  reason is recorded in §Empirical Results instead of adopting the flag.
- **Rationale**: An open escape hatch makes the sandbox advisory — the model can opt
  out of it on any failed command. With the assessed workload fully sandbox-completable,
  closing it costs nothing and restores the sandbox as a hard boundary.
- **Alternatives considered**:
  - *Leave the escape hatch open (SDK default `true`)* — **rejected**. It voids the
    sandbox guarantee for any Bash command the model chooses to retry unsandboxed.
  - *Split the escape-hatch fix into a separate change* — **rejected**. It edits the
    same `buildWorkspaceSandbox` / query-options site as the `canUseTool` wiring; the
    split overhead exceeds the few-line change.

### D5: Fix the new options and guard behavior with tests; confine edits to the step agent

- The guard is tested directly as a unit (`createWorkspaceToolGuard(cwd)` called with
  representative `Edit` / `Write` / other-tool inputs), asserting `deny` (with message)
  for out-of-workspace writes and `allow` otherwise.
- The step-agent query options are asserted to carry `canUseTool`, the chosen
  `permissionMode`, and (when adopted) `sandbox.allowUnsandboxedCommands === false`,
  by individual-key assertions (never a whole-object `toEqual`), so unrelated keys are
  not coupled.
- Only `agent-runner.ts` (and its tests) change. `query-one-shot.ts` and the codex
  adapter are untouched and frozen by regression tests.

- **Rationale**: The write-scope risk is on the artifact-producing step agent. Narrow
  edits minimize blast radius; individual-key assertions keep the new tests robust to
  future additive option keys.

### D6: Path-containment semantics

The guard judges containment statically from `file_path`, matching the file-tool
model (the SDK itself keys file-tool permissions off `file_path`):

- Resolve with `path.resolve(cwd, file_path)` — absolute inputs pass through; relative
  inputs resolve against `cwd`.
- Inside iff `path.relative(cwd, resolved)` is `""` or does not begin with a `..`
  segment and is not absolute.
- Missing / non-string `file_path`: treat as not-a-write-target and `allow` (the tool
  will fail on its own malformed input; the guard does not synthesize new error paths).
- Symlink traversal and TOCTOU are **not** resolved by this static check. Residual
  coverage: the Bash-side sandbox constrains subprocess writes at the OS layer, and the
  detection backstop compares the main-checkout across step boundaries. This is
  consistent with the request's "static `file_path` judgement" framing.

## Risks / Trade-offs

- **[`canUseTool` does not fire under `bypassPermissions` → `permissionMode` must
  change, breaking the frozen assertion]** → Under Branch B the TC-023 assertion that
  freezes `permissionMode === "bypassPermissions"` must be updated to the new mode.
  Mitigation: this is an intended, single-line contract update for the exact field
  being changed; it is explicitly bounded in T-08 (only that one assertion, only in
  Branch B), and Branch A requires no edit. The decision and the affected assertion are
  documented so review can confirm the change is intentional, not a regression cover-up.

- **[`allowUnsandboxedCommands: false` blocks a legitimate network/unsandboxed Bash
  command]** → A step whose Bash turn genuinely needs a non-workspace host would fail.
  Mitigation: the assessment (D4) shows the agent Bash turn is offline and `git push`
  is outside it; if a real need surfaces, Req 4 is waived with a recorded reason rather
  than adopted.

- **[Branch B mode blocks on an interactive prompt in the non-interactive runner]** →
  A mode that prompts (rather than consulting `canUseTool` and returning) would hang
  the run. Mitigation: the probe selects a prompt-free mode (candidate `dontAsk`) and
  verifies via the guard's default-allow arm that no currently-allowed tool prompts.

- **[Static path check bypass via symlink / normalization]** → An out-of-workspace
  write reachable through a symlinked path inside `cwd` would pass the static check.
  Mitigation: accepted residual (D6); covered by the Bash-side sandbox and the
  detection backstop. Out of scope to fully resolve here.

- **[Guard accidentally weakens the `Agent` / `Task` block]** → A default-allow guard
  that is (incorrectly) treated as the sole permission gate could allow `Agent` /
  `Task`. Mitigation: D3 keeps `disallowedTools` and the redirect counter as the
  independent gate; the existing agent-redirect tests must remain green.

## Empirical Results

<!-- Populated by T-01 / T-04 during implementation; required by acceptance criteria
     AC3 (canUseTool × permissionMode) and AC4 (allowUnsandboxedCommands adoption).
     Record concrete probe observations here before wiring. -->

### `canUseTool` × `permissionMode` (AC3)

- Does `canUseTool` fire under `permissionMode: "bypassPermissions"`? **[T-01 to record: yes / no]**
- Branch taken: **[A (keep `bypassPermissions`) / B (switch mode)]**
- `permissionMode` value shipped: **[`bypassPermissions` / `dontAsk` / other]**
- Evidence: **[T-01 to record: how firing/non-firing and prompt-free behavior were observed]**

### `allowUnsandboxedCommands` adoption (AC4)

- Adopted `allowUnsandboxedCommands: false`? **[T-04 to confirm: yes / waived]**
- If waived: the legitimate step-agent Bash use requiring unsandboxed/network execution
  that justified the waiver. **[T-04 to record, if applicable]**

## Open Questions

- Exact `permissionMode` value for Branch B (`dontAsk` is the candidate; the probe
  confirms it invokes `canUseTool` and never prompts). — Resolved by T-01.
- Whether `canUseTool` is invoked identically for MCP tools (`report_result`) and in
  the postWork / outputVerification follow-up turns. — Confirmed by T-01; the
  default-allow arm covers MCP tools regardless.
