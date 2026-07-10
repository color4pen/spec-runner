# Spec: claude-code adapter Edit / Write workspace write scope

## Requirements

### Requirement: Step agent denies Edit / Write outside the workspace

The claude-code step-agent runner SHALL enforce, through the SDK `canUseTool`
permission callback, that an `Edit` or `Write` tool execution whose resolved
`file_path` lies outside the agent working directory (`cwd`) subtree is denied. The
denial MUST be returned as `{ behavior: "deny", message }` where the message directs
the agent to write only inside its worktree.

#### Scenario: absolute out-of-workspace Write is denied

**Given** a workspace guard built for working directory `cwd`
**When** it is consulted for a `Write` tool whose `file_path` is an absolute path
outside `cwd` (e.g. the repository main checkout)
**Then** it returns `behavior: "deny"`
**And** the `message` names the worktree and instructs writing inside it

#### Scenario: relative path escaping the workspace is denied

**Given** a workspace guard built for working directory `cwd`
**When** it is consulted for an `Edit` tool whose `file_path` resolves (against `cwd`)
to a location outside the `cwd` subtree (e.g. `../outside.txt`)
**Then** it returns `behavior: "deny"` with a non-empty `message`

### Requirement: In-workspace writes and all other tools remain allowed

The workspace guard SHALL return `{ behavior: "allow" }` for `Edit` / `Write`
executions whose resolved `file_path` is within the `cwd` subtree, and for every
non-write tool — `Read`, `Grep`, `Glob`, `Bash`, and MCP tools such as
`report_result` — regardless of any path argument. This preserves the prior behavior
in which those executions were auto-allowed.

#### Scenario: in-workspace Edit is allowed

**Given** a workspace guard built for working directory `cwd`
**When** it is consulted for an `Edit` tool whose `file_path` is inside the `cwd`
subtree
**Then** it returns `behavior: "allow"`

#### Scenario: non-write tools are allowed regardless of path

**Given** a workspace guard built for working directory `cwd`
**When** it is consulted for a `Bash` tool (any command), a `Read` tool (any path), or
the `report_result` MCP tool
**Then** it returns `behavior: "allow"` in each case

### Requirement: Step-agent query options carry the guard and a prompt-free permission mode

The step-agent query options SHALL include the `canUseTool` workspace guard, and
SHALL set `permissionMode` to a value under which the guard is invoked and no tool
execution blocks on an interactive prompt, so that every tool previously auto-allowed
remains auto-allowed. The empirically determined firing behavior under
`bypassPermissions` and the shipped `permissionMode` value MUST be recorded in
design.md.

#### Scenario: query options include the guard

**Given** the claude-code step-agent runner is invoked with working directory `cwd`
**When** it builds the query options passed to the SDK `query()`
**Then** the options contain a `canUseTool` callback
**And** `permissionMode` equals the value recorded in design.md as shipped (Branch A:
`"bypassPermissions"`; Branch B: the selected prompt-free mode)
**And** `allowedTools` and `disallowedTools` are unchanged from before this change

#### Scenario: guard propagates to follow-up turns

**Given** step-agent query options carrying the `canUseTool` guard
**When** follow-up / retry / postWork / outputVerification turns are built by
spreading the query options
**Then** those turns carry the same `canUseTool` guard

### Requirement: The dangerouslyDisableSandbox escape hatch is disabled

Unless a legitimate step-agent Bash need for unsandboxed execution is established and
recorded as a waiver in design.md, `buildWorkspaceSandbox(cwd)` SHALL set
`allowUnsandboxedCommands: false`, and the step-agent query options SHALL carry that
value, so the model cannot re-run a sandboxed Bash command unsandboxed.

#### Scenario: sandbox settings disable unsandboxed commands

**Given** the step-agent sandbox settings built by `buildWorkspaceSandbox(cwd)`
**When** the settings object is constructed (escape-hatch closure adopted)
**Then** `allowUnsandboxedCommands` is `false`
**And** the step-agent query options carry `sandbox.allowUnsandboxedCommands === false`

### Requirement: One-shot and codex paths are unchanged

The one-shot query path (`query-one-shot.ts`) SHALL NOT gain a `canUseTool` guard or a
sandbox setting, and MUST keep `permissionMode: "bypassPermissions"` and its tool
list. The codex adapter SHALL be unchanged.

#### Scenario: one-shot options carry no guard

**Given** the one-shot query wrapper is invoked
**When** it builds the options passed to the SDK `query()`
**Then** the options contain no `canUseTool` key
**And** the options contain no `sandbox` key
**And** `permissionMode` equals `"bypassPermissions"`
**And** `allowedTools` equals `["Read", "Bash", "Grep", "Glob"]` unless the caller
overrides it
