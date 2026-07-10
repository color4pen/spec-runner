# Tasks: claude-code adapter workspace write guard (measured `default` configuration)

Scope of product-code edits: `src/adapter/claude-code/agent-runner.ts` and its tests;
a new probe under `scripts/probes/`; the `cross-boundary-invariants` reviewer file;
and recording the probe log into this change's `design.md`. Do NOT touch
`src/adapter/claude-code/query-one-shot.ts`, `src/core/runtime/local.ts`,
`src/adapter/codex/**`, or the detection backstop. Reference the resolved decisions in
`design.md` (D1–D7) and the Scenarios in `spec.md`.

The measured SDK facts in `design.md` are **given** — do NOT re-derive them from docs
or types. Re-confirm them only by running the probe (T-04).

New test-ID namespace: `TC-FW-*`.

## T-01: Implement `createWorkspaceToolGuard(cwd)` (the workspace guard)

- [x] In `src/adapter/claude-code/agent-runner.ts`, add and export a pure factory
  `createWorkspaceToolGuard(cwd: string): WorkspaceToolGuard` (type defined locally
  matching CanUseTool shape; kept free of direct SDK import per TC-024).
- [x] Behavior (design D2):
  - `toolName === "Edit" | "Write"`: read `input.file_path`. Missing / non-string →
    `{ behavior: "allow" }`. Otherwise `path.resolve(cwd, file_path)` and test
    containment with `path.relative(cwd, resolved)` — inside iff the relative path is
    `""` or does not start with a `..` segment and is not absolute. Inside →
    `{ behavior: "allow" }`; outside → `{ behavior: "deny", message }`.
  - Any other `toolName` (`Read`, `Grep`, `Glob`, `Bash`, MCP tools, anything else)
    → `{ behavior: "allow" }`.
- [x] The deny `message` MUST be stable, non-empty, name the worktree (`cwd`), and
  instruct the agent to write only inside it.
- [x] Do NOT special-case `Agent` / `Task` here (design D3-adjacent): they stay
  blocked by `disallowedTools` + the existing redirect counter.

**Acceptance Criteria**:
- `createWorkspaceToolGuard` is exported and typed as `CanUseTool`.
- Out-of-workspace `Edit` / `Write` → `deny` with a non-empty worktree-naming message.
- In-workspace `Edit` / `Write`, malformed `file_path`, and all other tools → `allow`.
- `bun run typecheck` passes (return type conforms to `PermissionResult`).

## T-02: Rewire the step-agent query options to the measured `default` configuration

- [x] In `run()` (`agent-runner.ts`), change `permissionMode` from
  `"bypassPermissions"` to `"default"`.
- [x] Change the base `allowedTools` from
  `["Read","Edit","Write","Bash","Grep","Glob"]` to `["Read","Bash","Grep","Glob"]`
  (remove `Edit` and `Write`; do NOT add them to `disallowedTools`).
- [x] When `ctx.policy?.reportTool` is configured, append
  `mcp__specrunner_report__${toolSpec.name}` to `allowedTools` (design D3). Reuse the
  `REPORT_MCP_SERVER_NAME` constant (defined before the createSdkMcpServer call) for
  single-sourcing. When `reportTool` is absent, add no MCP entry.
- [x] Add `canUseTool: createWorkspaceToolGuard(cwd)` to `queryOptions` (design D2).
  Because follow-up / retry / postWork / outputVerification turns spread
  `...queryOptions`, this single addition propagates to all turns (same pattern as the
  existing `stderr` callback) — do not re-create the guard per turn.
- [x] Leave `disallowedTools`, `sandbox` (aside from T-03), `stderr`, `model`,
  `abortController`, `env`, `resume`, and `mcpServers` wiring unchanged.

**Acceptance Criteria**:
- `queryOptions.permissionMode === "default"`.
- `queryOptions.allowedTools` contains neither `"Edit"` nor `"Write"`.
- With `reportTool` configured, `queryOptions.allowedTools` contains
  `mcp__specrunner_report__report_result`; without it, no `mcp__specrunner_report__*`
  entry is present.
- `queryOptions.canUseTool` is the guard built for the run's `cwd`.
- `queryOptions.disallowedTools` is unchanged (`["Agent","Task"]`).

## T-03: Close the escape hatch in `buildWorkspaceSandbox`

- [x] Add `allowUnsandboxedCommands: false` to the object returned by
  `buildWorkspaceSandbox(cwd)` (design D4). Leave `enabled`, `failIfUnavailable`,
  `autoAllowBashIfSandboxed`, and `filesystem.allowWrite` unchanged; do NOT set
  `sandbox.network`, `denyRead`, or `allowRead`.

**Acceptance Criteria**:
- `buildWorkspaceSandbox(cwd)` returns `allowUnsandboxedCommands: false`.
- Step-agent query options carry `sandbox.allowUnsandboxedCommands === false`.
- `sandbox.network`, `denyRead`, `allowRead` remain unset.

## T-04: Write the probe, run it, and record the raw log in design.md

- [x] Add `scripts/probes/write-scope-guard-probe.ts` implementing the probe contract
  in design D5: build the T-02/T-03 configuration for a temp workspace `W` with
  `canUseTool = createWorkspaceToolGuard(W)` and an in-process `specrunner_report`
  MCP server exposing `report_result`, then run the three scenarios and print one
  `[PROBE] scenario=... verdict=...` line each (out-of-workspace-write,
  in-workspace-write, report_result).
- [x] Run it against the real SDK: `bun scripts/probes/write-scope-guard-probe.ts`.
- [x] Paste the RAW stdout/stderr into `design.md` §Probe Execution Log, replacing the
  placeholder block. The pasted output includes the three verdict lines. This is
  the ONLY edit to `design.md` the implementer makes.
- [x] Confirmed the probe file lives under `scripts/probes/` (outside `tsconfig` include,
  eslint globs, vitest include, and tsup entry) so it does not enter the verification
  gate.

**Acceptance Criteria**:
- `scripts/probes/write-scope-guard-probe.ts` exists and is runnable via `bun`.
- `design.md` §Probe Execution Log contains the raw output with the three
  `[PROBE] scenario=... verdict=...` lines.
- The three scenarios read: out-of-workspace write denied (no file created);
  in-workspace write allowed (file created); report_result runs immediately.

## T-05: Test — guard input/output (`TC-FW-*`)

- [x] Add unit tests calling `createWorkspaceToolGuard(cwd)` directly over a real
  `mkdtemp` `cwd` at
  `src/adapter/claude-code/__tests__/workspace-tool-guard.test.ts`:
  - `TC-FW-01`: out-of-workspace absolute `Write` → `deny`; message non-empty,
    contains a `worktree`/`workspace` substring. ✓
  - `TC-FW-02`: relative-escape `Edit` (`file_path: "../outside.txt"`) → `deny`. ✓
  - `TC-FW-03`: in-workspace `Edit` (path under `cwd`) → `allow`. ✓
  - `TC-FW-04`: `Bash` (any command), `Read` (any path), and
    `mcp__specrunner_report__report_result` → `allow` each. ✓
  - `TC-FW-05`: `Write` with missing / non-string `file_path` → `allow`. ✓

**Acceptance Criteria**:
- `TC-FW-01`..`TC-FW-05` pass, exercising the guard purely through input/output (no
  real SDK, no filesystem write beyond the temp `cwd`).

## T-06: Test — step-agent query-options freeze (`TC-FW-*`)

- [x] Add tests capturing `params.options` via an injected `_queryFn` (the TC-023
  pattern), asserting individual keys (never a whole-object `toEqual`):
  - `TC-FW-06` (no reportTool, `policy: {}`): `permissionMode === "default"`;
    `allowedTools` contains neither `"Edit"` nor `"Write"`; `allowedTools` contains no
    `mcp__specrunner_report__*` entry; `canUseTool` is a function;
    `sandbox.allowUnsandboxedCommands === false`. ✓
  - `TC-FW-07` (with `policy: { reportTool: makeReportTool() }`): `allowedTools`
    contains `mcp__specrunner_report__report_result`. ✓
  - Also assert the captured `canUseTool` denies out-of-workspace and allows
    in-workspace writes (end-to-end guard wiring check). ✓

**Acceptance Criteria**:
- `TC-FW-06` fixes `permissionMode`, the `Edit`/`Write` exclusion, the absence of an
  MCP entry when unconfigured, the presence of `canUseTool`, and the escape-hatch
  closure.
- `TC-FW-07` fixes the MCP tool-name inclusion when `reportTool` is configured.

## T-07: Update the bounded existing test (TC-023 options case)

- [x] In `tests/unit/adapter/claude-code/agent-runner.test.ts`, in the TC-023 case
  `query() is called with allowedTools, permissionMode, and model`, update the two
  now-stale assertions (design D7):
  - `allowedTools` expectation → `["Read","Bash","Grep","Glob"]` (this case uses
    `policy: {}`, so no MCP entry). ✓
  - `permissionMode` expectation → `"default"`. ✓
- [x] Changed NOTHING else in that test and NO other existing test. All other
  existing tests (TC-SB-05, TC-FW-07 in query-one-shot.test.ts, local.test.ts:609,
  disallowedTools/redirect tests, TC-018, TC-024) remain unedited and green. ✓

**Acceptance Criteria**:
- Exactly two assertion lines change in the single TC-023 options case, matching the
  shipped `allowedTools` and `permissionMode`; every other existing test is unedited.
- The deviation from the "1 line" acceptance criterion is already recorded in
  `design.md` §D7 (two lines are unavoidable because the same test freezes both
  rewritten fields).

## T-08: Extend the `cross-boundary-invariants` reviewer paths

- [x] In `specrunner/reviewers/cross-boundary-invariants.md`, append `src/adapter/**`
  to the frontmatter `paths` list (keeping the existing entries). ✓

**Acceptance Criteria**:
- The `paths` list contains `src/adapter/**` in addition to the existing four globs.
- No other content of the reviewer file changes.

## T-09: Verification — green gate and invariance checks

- [x] Run `bun run typecheck && bun run test` and confirmed green (6430/6430 tests pass). ✓
- [x] Confirmed the one-shot regression tests (`TC-SB-05`, `TC-FW-07`), the
  `LocalRuntime.query` test (`local.test.ts:609`), the `disallowedTools` / redirect
  tests, and the MCP-server tests remain unedited and green. ✓
- [x] Confirmed `query-one-shot.ts`, `src/core/runtime/local.ts`, and
  `src/adapter/codex/**` are untouched. ✓
- [x] Confirmed the probe under `scripts/probes/` did not enter the gate (typecheck
  and test pass without it; probe lives outside tsconfig include / vitest include). ✓

**Acceptance Criteria**:
- `typecheck` and `test` are green.
- Only the TC-023 options case (two assertions) changed among existing tests; all new
  behavior is covered by `TC-FW-*` tests.
- One-shot, `LocalRuntime.query`, and codex paths are behaviorally unchanged.
