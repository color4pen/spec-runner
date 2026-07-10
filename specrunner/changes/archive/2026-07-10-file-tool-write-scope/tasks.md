# Tasks: claude-code adapter Edit / Write workspace write scope

Scope of edits: `src/adapter/claude-code/agent-runner.ts` and its tests only, plus
recording empirical results into this change's `design.md` (T-01, T-04). Do NOT touch
`src/adapter/codex/`, `src/adapter/claude-code/query-one-shot.ts`, the detection
backstop, or `src/core/runtime/local.ts`. Reference the resolved decisions in
`design.md` (D1–D6) and the Scenarios in `spec.md`.

Test-ID namespace for new tests: `TC-FW-*`.

## T-01: Probe `canUseTool` × `permissionMode` and record the result in design.md

- [x] Empirically determine whether the SDK invokes `canUseTool` while
  `permissionMode: "bypassPermissions"` (per design D2, this is not derivable from the
  types/docs). Observe firing/non-firing directly (e.g. a minimal query with a
  `canUseTool` that records invocations, or the smallest reliable observation available
  in this environment).
- [x] If it does NOT fire under `bypassPermissions`, determine the `permissionMode`
  value that (a) invokes `canUseTool` and (b) never blocks on an interactive prompt in
  the non-interactive runner context (candidate: `"dontAsk"`).
- [x] Confirm `canUseTool` is also consulted for the `report_result` MCP tool and in
  the follow-up / postWork turns, or note that the default-allow arm (T-02) covers them
  regardless.
- [x] Fill in `design.md` §Empirical Results → "`canUseTool` × `permissionMode`":
  firing yes/no, branch taken (A/B), shipped `permissionMode` value, and the evidence.

**Acceptance Criteria**:
- `design.md` §Empirical Results records the firing behavior and the adopted
  `permissionMode` value (satisfies AC "canUseTool × permissionMode の実測結果が
  design.md に記録されている").
- The chosen `permissionMode` is prompt-free (does not hang the runner).

## T-02: Implement the workspace write guard (`createWorkspaceToolGuard`)

- [x] In `src/adapter/claude-code/agent-runner.ts`, add and export a pure factory
  `createWorkspaceToolGuard(cwd: string): CanUseTool` (import `CanUseTool` type from the
  SDK loader / `@anthropic-ai/claude-agent-sdk`).
- [x] Behavior (design D1 / D6):
  - For `toolName === "Edit"` or `"Write"`: read `input.file_path`. If it is missing or
    not a string, return `{ behavior: "allow" }` (do not synthesize a new error path).
    Otherwise resolve with `path.resolve(cwd, file_path)` and test containment with
    `path.relative(cwd, resolved)` — inside iff the relative path is `""` or does not
    start with a `..` segment and is not absolute. If outside, return
    `{ behavior: "deny", message }`; if inside, return `{ behavior: "allow" }`.
  - For every other `toolName` (`Read`, `Grep`, `Glob`, `Bash`, MCP tools such as
    `report_result`, and anything else): return `{ behavior: "allow" }`.
- [x] The deny `message` MUST name the worktree (`cwd`) and instruct the agent to write
  only inside it (stable wording; a test asserts a substring such as `worktree` or
  `workspace` and that it is non-empty).
- [x] Do NOT special-case `Agent` / `Task` here — they stay blocked by
  `disallowedTools` and the existing redirect counter (design D3).

**Acceptance Criteria**:
- `createWorkspaceToolGuard` is exported and callable as
  `(toolName, input, { signal }) => Promise<PermissionResult>`.
- Out-of-workspace `Edit` / `Write` → `deny` with a non-empty, worktree-naming message.
- In-workspace `Edit` / `Write` and all other tools → `allow`.
- `typecheck` passes (return type conforms to the SDK `PermissionResult`).

## T-03: Wire the guard (and, if Branch B, the permission mode) into the step-agent query options

- [x] Add `canUseTool: createWorkspaceToolGuard(cwd)` to the step-agent `queryOptions`
  object in `run()`. Because follow-up / retry / postWork / outputVerification turns are
  built by spreading `...queryOptions`, this single addition propagates to all turns
  (same pattern as the existing `stderr` callback) — do not re-create the guard per turn.
- [x] Set `permissionMode` to the value chosen in T-01:
  - Branch A: leave `permissionMode: "bypassPermissions"` unchanged.
  - Branch B: change `permissionMode` to the selected prompt-free mode.
- [x] Keep `allowedTools`, `disallowedTools`, `sandbox`, and `stderr` exactly as they
  are (aside from T-04's `allowUnsandboxedCommands` addition inside `buildWorkspaceSandbox`).

**Acceptance Criteria**:
- `queryOptions.canUseTool` is present and is the guard built for the run's `cwd`.
- `queryOptions.permissionMode` equals the value recorded as shipped in design.md.
- `queryOptions.allowedTools` and `queryOptions.disallowedTools` are unchanged.

## T-04: Disable the escape hatch in `buildWorkspaceSandbox` (or waive with recorded reason)

- [x] Confirm the design D4 network assessment against the step-agent Bash workload
  (local git / build / typecheck / test / lint; `git push` is outside the agent query
  via `StepExecutor.commitAndPush`). If no legitimate step-agent Bash need for
  unsandboxed/network execution exists, add `allowUnsandboxedCommands: false` to the
  object returned by `buildWorkspaceSandbox(cwd)`.
- [x] If a legitimate need IS found, do NOT add the flag; record the waiver and its
  reason in `design.md` §Empirical Results → "`allowUnsandboxedCommands` adoption".
- [x] Record the adoption/waiver outcome in `design.md` §Empirical Results either way.

**Acceptance Criteria**:
- `design.md` §Empirical Results records the adoption decision and its rationale
  (satisfies AC "allowUnsandboxedCommands の採否と根拠が design.md に記録されている").
- When adopted: `buildWorkspaceSandbox(cwd)` returns `allowUnsandboxedCommands: false`
  and the step-agent query options carry `sandbox.allowUnsandboxedCommands === false`.
- `denyRead` / `allowRead` remain unset; `sandbox.network` remains unset.

## T-05: Test — guard input/output (deny out, allow in, allow others)

- [x] Add `TC-FW-*` unit tests (suggested file
  `src/adapter/claude-code/__tests__/workspace-tool-guard.test.ts`, or a new `describe`
  block in `sandbox-scope.test.ts`) that call `createWorkspaceToolGuard(cwd)` directly.
- [x] `TC-FW-01`: out-of-workspace absolute `Write` → `behavior: "deny"`, message
  non-empty and contains a worktree/workspace substring.
- [x] `TC-FW-02`: relative-escape `Edit` (`file_path: "../outside.txt"`) → `deny`.
- [x] `TC-FW-03`: in-workspace `Edit` (path under `cwd`) → `allow`.
- [x] `TC-FW-04`: `Bash` (any command), `Read` (any path), and an MCP tool name (e.g.
  `report_result`) → `allow` for each.
- [x] Use a real temp dir as `cwd` (mkdtemp) so `path.resolve` / `path.relative`
  behave against a concrete absolute base, mirroring the existing sandbox-scope tests.

**Acceptance Criteria**:
- `TC-FW-01`..`TC-FW-04` pass; they exercise the guard purely through its
  input/output (no real SDK, no real filesystem write required beyond the temp `cwd`).

## T-06: Test — step-agent query options carry the guard, mode, and escape-hatch closure

- [x] Add `TC-FW-*` tests that capture `params.options` via an injected `_queryFn`
  (same pattern as TC-SB-01 / TC-AR-01), asserting individual keys (never a whole-object
  `toEqual`).
- [x] `TC-FW-05`: `capturedOptions.canUseTool` is a function; `capturedOptions.permissionMode`
  equals the shipped value from design.md; `allowedTools` and `disallowedTools` are
  unchanged (`["Read","Edit","Write","Bash","Grep","Glob"]` and `["Agent","Task"]`).
- [x] `TC-FW-06` (when T-04 adopts the flag): `capturedOptions.sandbox.allowUnsandboxedCommands === false`.
- [x] Optionally assert the captured `canUseTool` denies an out-of-workspace write and
  allows an in-workspace write, to fix end-to-end that the wired guard is the workspace guard.

**Acceptance Criteria**:
- `TC-FW-05` fixes the presence of `canUseTool` and the shipped `permissionMode`.
- `TC-FW-06` fixes `allowUnsandboxedCommands === false` in the query options (when adopted).

## T-07: Test — one-shot query options remain unchanged (regression guard)

- [x] In `tests/unit/adapter/claude-code/query-one-shot.test.ts`, add a NEW `describe`
  block (`TC-FW-07`) — do NOT edit the existing `TC-SB-05` block.
- [x] Capture the one-shot options via the injected query fn and assert: no `canUseTool`
  key, no `sandbox` key, `permissionMode === "bypassPermissions"`, and default
  `allowedTools` equals `["Read","Bash","Grep","Glob"]`.

**Acceptance Criteria**:
- `TC-FW-07` passes and would fail if a `canUseTool` guard or sandbox were ever added
  to the one-shot path (regression guard for design D5 / spec "One-shot and codex paths
  are unchanged").
- The existing `TC-SB-05` block is unmodified.

## T-08: Verification — existing tests green; bounded test edits only

- [x] Run `bun run typecheck && bun run test` (or the project's `verification.commands`)
  and confirm green.
- [x] Confirm no existing test file was modified to accommodate the additive
  `canUseTool` / `allowUnsandboxedCommands` keys — the existing TC-023 options test,
  TC-AR-01 `disallowedTools` test, TC-AR-02 redirect test, and the TC-SB-01..04
  sandbox-scope tests must remain untouched and green.
- [x] **Single permitted exception, Branch B only**: if T-01 shipped a changed
  `permissionMode`, the ONE assertion in `tests/unit/adapter/claude-code/agent-runner.test.ts`
  that freezes `permissionMode === "bypassPermissions"` (the TC-023 options test) must
  be updated to the newly shipped value. This is the only existing assertion permitted
  to change, and only in Branch B; leave every other assertion in that test untouched.
  Under Branch A, make no edit to any existing test.

**Acceptance Criteria**:
- `typecheck` and `test` are green.
- Under Branch A: zero existing-test edits.
- Under Branch B: exactly one existing assertion changed (the TC-023 `permissionMode`
  literal), matching the shipped mode; all other existing tests unedited.
- All new behavior is covered by the `TC-FW-*` tests.
