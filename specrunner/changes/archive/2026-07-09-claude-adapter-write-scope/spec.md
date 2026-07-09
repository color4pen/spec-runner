# Spec: claude-code adapter workspace write scope

## Requirements

### Requirement: Step agent execution scopes filesystem writes to the workspace

The claude-code step agent runner SHALL include an SDK native sandbox setting in the
query options that restricts filesystem **writes** to the agent's working directory
(the job worktree, or the repo root in `--no-worktree` mode) and its subtree. Reads
MUST NOT be restricted. The sandbox setting MUST be present regardless of whether the
current platform can actually start the sandbox.

#### Scenario: query options carry a workspace-scoped sandbox

**Given** the claude-code step agent runner is invoked with a working directory `cwd`
**When** it builds the query options passed to the SDK `query()`
**Then** the options contain a `sandbox` setting with `enabled: true`
**And** `sandbox.filesystem.allowWrite` contains `cwd`
**And** no read-restricting field (`denyRead` / `allowRead`) is set

#### Scenario: Bash remains executable under the sandbox

**Given** the claude-code step agent runner builds sandboxed query options
**When** it constructs the `sandbox` setting
**Then** `sandbox.autoAllowBashIfSandboxed` is `true`
**And** the `allowedTools` list still contains `"Bash"`

### Requirement: Sandbox unavailability fails open with a single warning

When the OS sandbox cannot be started in the current environment, the step agent run
SHALL continue unsandboxed rather than fail, and the runner SHALL emit at most one
warning to stderr for that run describing the degradation.

#### Scenario: degraded run continues and warns once

**Given** a step agent run whose SDK signals that the sandbox is unavailable
**When** the run executes with the degradation surfaced on the process stderr
**Then** the run completes with its normal completion reason (not an error caused by
the sandbox)
**And** exactly one `[specrunner] warn:` line about the sandbox degradation is written
to stderr

#### Scenario: repeated degradation signals still warn only once

**Given** a step agent run whose SDK surfaces the sandbox-unavailable signal more than
once during the same run
**When** the run processes those signals
**Then** the runner writes the sandbox degradation warning to stderr no more than once

#### Scenario: sandbox configured for graceful degradation

**Given** the claude-code step agent runner builds sandboxed query options
**When** it constructs the `sandbox` setting
**Then** `sandbox.failIfUnavailable` is `false`

### Requirement: One-shot query behavior is unchanged

The one-shot / read-oriented query path (`query-one-shot.ts`) SHALL NOT gain a
sandbox setting, and its tool and permission configuration MUST remain as before.

#### Scenario: one-shot options carry no sandbox

**Given** the one-shot query wrapper is invoked
**When** it builds the options passed to the SDK `query()`
**Then** the options contain no `sandbox` key
**And** `allowedTools` equals `["Read", "Bash", "Grep", "Glob"]` (unless the caller
overrides it)
**And** `permissionMode` equals `"bypassPermissions"`
