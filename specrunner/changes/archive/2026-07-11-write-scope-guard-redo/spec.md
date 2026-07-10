# Spec: claude-code adapter workspace write guard (measured `default` configuration)

## Requirements

### Requirement: Step agent denies Edit / Write outside the workspace

The claude-code step-agent runner SHALL enforce, through the SDK `canUseTool`
permission callback, that an `Edit` or `Write` execution whose resolved `file_path`
lies outside the agent working directory (`cwd`) subtree is denied. The denial MUST
be returned as `{ behavior: "deny", message }` where the `message` names the worktree
and directs the agent to write only inside it.

#### Scenario: absolute out-of-workspace Write is denied

**Given** a workspace guard built for working directory `cwd`
**When** it is consulted for a `Write` whose `file_path` is an absolute path outside
`cwd` (e.g. the repository main checkout)
**Then** it returns `behavior: "deny"`
**And** the `message` is non-empty and names the worktree / instructs writing inside it

#### Scenario: relative path escaping the workspace is denied

**Given** a workspace guard built for working directory `cwd`
**When** it is consulted for an `Edit` whose `file_path` resolves (against `cwd`) to a
location outside the `cwd` subtree (e.g. `../outside.txt`)
**Then** it returns `behavior: "deny"` with a non-empty `message`

### Requirement: In-workspace writes, non-write tools, and malformed input remain allowed

The workspace guard SHALL return `{ behavior: "allow" }` for `Edit` / `Write` whose
resolved `file_path` is within the `cwd` subtree, for every non-write tool (`Read`,
`Grep`, `Glob`, `Bash`, and MCP tools such as
`mcp__specrunner_report__report_result`), and for `Edit` / `Write` whose `file_path`
is missing or not a string (deferred to the tool's own input validation).

#### Scenario: in-workspace Edit is allowed

**Given** a workspace guard built for working directory `cwd`
**When** it is consulted for an `Edit` whose `file_path` is inside the `cwd` subtree
**Then** it returns `behavior: "allow"`

#### Scenario: non-write tools are allowed regardless of path

**Given** a workspace guard built for working directory `cwd`
**When** it is consulted for a `Bash` tool (any command), a `Read` tool (any path), or
the `mcp__specrunner_report__report_result` MCP tool
**Then** it returns `behavior: "allow"` in each case

#### Scenario: malformed file_path is allowed

**Given** a workspace guard built for working directory `cwd`
**When** it is consulted for a `Write` whose `file_path` is missing or not a string
**Then** it returns `behavior: "allow"`

### Requirement: Step-agent query options carry the measured `default` configuration

The step-agent query options SHALL set `permissionMode: "default"`, SHALL exclude
`Edit` and `Write` from `allowedTools`, and SHALL include the `canUseTool` workspace
guard, so that `Edit` / `Write` are routed to the guard while all previously
auto-allowed tools remain effectively allowed.

#### Scenario: options set default mode, exclude Edit/Write, carry the guard

**Given** the claude-code step-agent runner is invoked with working directory `cwd`
**When** it builds the query options passed to the SDK `query()`
**Then** `permissionMode` equals `"default"`
**And** `allowedTools` contains neither `"Edit"` nor `"Write"`
**And** the options contain a `canUseTool` callback

#### Scenario: the guard propagates to follow-up turns

**Given** step-agent query options carrying the `canUseTool` guard
**When** follow-up / retry / postWork / outputVerification turns are built by
spreading the query options
**Then** those turns carry the same `canUseTool` guard

### Requirement: The report_result MCP tool is pre-approved when configured

When a report tool is configured, the step-agent `allowedTools` SHALL include
`mcp__specrunner_report__<toolSpec.name>` so the tool is pre-approved and runs
immediately; when no report tool is configured, `allowedTools` SHALL include no
`mcp__specrunner_report__*` entry.

#### Scenario: report tool name is pre-approved when configured

**Given** the step-agent runner is invoked with a configured report tool named
`report_result`
**When** it builds the query options
**Then** `allowedTools` contains `mcp__specrunner_report__report_result`

#### Scenario: no MCP entry when no report tool is configured

**Given** the step-agent runner is invoked with no report tool configured
**When** it builds the query options
**Then** `allowedTools` contains no entry beginning with `mcp__specrunner_report__`

### Requirement: The dangerouslyDisableSandbox escape hatch is disabled

`buildWorkspaceSandbox(cwd)` SHALL set `allowUnsandboxedCommands: false`, and the
step-agent query options SHALL carry that value, so the model cannot re-run a
sandboxed Bash command unsandboxed.

#### Scenario: sandbox settings disable unsandboxed commands

**Given** the step-agent sandbox settings built by `buildWorkspaceSandbox(cwd)`
**When** the settings object is constructed
**Then** `allowUnsandboxedCommands` is `false`
**And** the step-agent query options carry `sandbox.allowUnsandboxedCommands === false`

### Requirement: A runnable probe exists and its raw log is recorded in design.md

The repository SHALL contain a runnable probe script that stands up the shipped
configuration against the real SDK and exercises the three scenarios (out-of-workspace
write denied, in-workspace write allowed, report_result runs), and design.md SHALL
record the probe's raw execution log including one verdict line per scenario. SDK
docs, type definitions, or bundled-source reading MUST NOT be recorded as a substitute
for the execution trace.

#### Scenario: probe script exists and its log is recorded

**Given** the completed change
**When** the probe script and design.md are inspected
**Then** a probe script exists under `scripts/probes/`
**And** design.md's §Probe Execution Log contains the raw output with three
`[PROBE] scenario=... verdict=...` lines

### Requirement: cross-boundary-invariants covers the adapter layer

The `cross-boundary-invariants` reviewer `paths` SHALL include `src/adapter/**` so an
adapter-layer change triggers the cross-boundary lens.

#### Scenario: adapter path is in the reviewer paths

**Given** `specrunner/reviewers/cross-boundary-invariants.md`
**When** its frontmatter `paths` list is read
**Then** it contains `src/adapter/**`

### Requirement: One-shot, LocalRuntime.query, and codex paths are unchanged

The one-shot query path (`query-one-shot.ts`) SHALL NOT gain a `canUseTool` guard or a
sandbox and MUST keep `permissionMode: "bypassPermissions"` and its default tool list
`["Read","Bash","Grep","Glob"]`. `LocalRuntime.query()` and the codex adapter SHALL be
unchanged.

#### Scenario: one-shot options carry no guard

**Given** the one-shot query wrapper is invoked
**When** it builds the options passed to the SDK `query()`
**Then** the options contain no `canUseTool` key
**And** the options contain no `sandbox` key
**And** `permissionMode` equals `"bypassPermissions"`
**And** `allowedTools` equals `["Read","Bash","Grep","Glob"]` unless the caller
overrides it
