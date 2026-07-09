# Design: claude-code adapter workspace write scope via SDK native sandbox

## Context

spec-runner runs pipeline step agents through two local adapters:

- **codex adapter** (`src/adapter/codex/agent-runner.ts`) executes every step with
  `sandboxMode: "workspace-write"` and `workingDirectory: cwd`. Writes outside the
  workspace are blocked at the OS level. This is design D2 of the codex adapter.
- **claude-code adapter** (`src/adapter/claude-code/agent-runner.ts`) executes every
  step with `permissionMode: "bypassPermissions"` and `allowedTools:
  ["Read","Edit","Write","Bash","Grep","Glob"]`, and holds **no path restriction**.
  Edit / Write / Bash can each write to any absolute path, including the main
  checkout of the repository outside the job worktree.

This asymmetry is the direct cause of a real escape-write incident: during a fast
run, an agent under the claude-code adapter edited the main checkout's
`.specrunner/config.json` directly (outside its worktree).

A **detection backstop** — comparison of the main-checkout state across step
boundaries followed by escalation — has already been introduced in a separate
change (`main-checkout-write-detection`). The present change is the **prevention**
side: give the claude-code adapter a workspace write scope symmetric to the codex
adapter's `workspace-write`.

### External SDK surface (`@anthropic-ai/claude-agent-sdk` v0.2.128, verified in `sdk.d.ts`)

- The query `Options` object exposes `sandbox?: SandboxSettings`.
- `sandbox.filesystem` carries `allowWrite` / `denyWrite` / `allowRead` / `denyRead`
  (arrays of glob paths). `allowWrite` grants additional writable paths inside an
  otherwise write-denied sandbox, enforced at the OS filesystem layer.
- `sandbox.enabled: boolean` turns the sandbox on.
- `sandbox.autoAllowBashIfSandboxed: boolean` auto-allows Bash tool execution when
  the sandbox is active.
- `sandbox.failIfUnavailable: boolean` **defaults to `true`** — when the sandbox
  cannot start (missing OS dependency or unsupported platform) the SDK errors at
  startup. Setting it to `false` makes the SDK emit a warning and continue running
  **unsandboxed** (graceful degradation).
- `sandbox.network` (out of scope here) sits alongside `filesystem`.
- The query `Options` also expose `stderr?: (data: string) => void`, a callback that
  receives the Claude Code process stderr stream (where the degradation warning is
  surfaced).
- `canUseTool` (pre-execution permission callback) also exists but cannot statically
  resolve the target path of an arbitrary Bash command string, so it cannot enforce
  a write scope for the primary escape route.

### Current call sites

- `src/adapter/claude-code/agent-runner.ts` — step agent query options (the target
  of this change).
- `src/adapter/claude-code/query-one-shot.ts` — one-shot / read-oriented steps
  (`allowedTools: ["Read","Bash","Grep","Glob"]` + `bypassPermissions`). Out of
  scope.

## Goals / Non-Goals

**Goals**:

- Introduce SDK native sandbox into the claude-code **step agent** execution so that
  filesystem **writes** are scoped to the workspace (the agent's `cwd` = the job
  worktree, or the repo root in `--no-worktree` mode). **Reads are not restricted.**
- Keep Bash tool execution working under the sandbox.
- When the sandbox is unavailable in the current environment, fail open: the run
  continues unsandboxed and a single warning is written to stderr.
- Fix the presence of the sandbox settings in the query options with a test, in the
  same style as the existing TC-AR-01 `disallowedTools` assertion.
- Leave the codex adapter and the one-shot path behaviorally unchanged.

**Non-Goals**:

- Sandbox for the one-shot / read path (`query-one-shot.ts`). Those steps do not
  produce artifacts; the write-scope risk lives on the step-agent side. If ever
  needed, a separate change.
- Network restriction (`sandbox.network`).
- `canUseTool` path inspection.
- Any change to the detection backstop (already delivered by
  `main-checkout-write-detection`).
- Any change to the codex adapter.

## Decisions

### D1: Scope step-agent writes with SDK native sandbox (`filesystem.allowWrite` = cwd subtree)

The step agent query options gain a `sandbox` setting whose `filesystem.allowWrite`
grants the agent's `cwd` (and its subtree) as the only writable region. Every other
path is write-denied at the OS filesystem layer, symmetric with the codex adapter's
`workspace-write`.

- **Rationale**: OS-level filesystem enforcement is the only mechanism that also
  covers Bash-driven writes (`echo ... > /abs/path`, `cp`, redirection). The escape
  incident went through a write to an absolute path outside the worktree; a scope
  that the OS enforces on every syscall is the matching countermeasure.
- **Alternatives considered**:
  - `canUseTool` path inspection — **rejected**. Edit / Write inputs carry an
    explicit `file_path`, but a Bash command string cannot be statically resolved to
    the paths it touches, so the primary escape route (Bash) would remain open.
  - Switching away from `bypassPermissions` to deny-rule permission operation —
    **rejected**. Permission-rule path semantics are weaker than the sandbox (they do
    not constrain a process that issues syscalls directly), and the behavior change
    carries higher regression risk.

### D2: Fail open when the sandbox is unavailable, with a single stderr warning

The sandbox is configured with `failIfUnavailable: false`. When the OS sandbox
cannot start, the SDK degrades to an unsandboxed run instead of erroring, and the
adapter emits **one** `[specrunner] warn:` line to stderr for that run.

- **Rationale**: The sandbox is platform-dependent (macOS seatbelt and equivalents).
  Fail-closed would halt every run on a platform without sandbox support. The escape
  write is already caught by the detection backstop (step-boundary comparison →
  escalation), so degradation of the prevention layer is acceptable; it must be
  visible, not silent.
- **Alternatives considered**:
  - Fail-closed (`failIfUnavailable: true`) — **rejected**. Blocks all runs on
    unsupported platforms with no compensating benefit given the backstop.
  - Silent degradation (SDK's own warning only) — **rejected**. spec-runner should
    surface the degradation in its own consistent `[specrunner] warn:` voice so it is
    greppable alongside other adapter warnings.

### D3: Do not restrict reads

`filesystem.denyRead` / `allowRead` are not set; reads remain unrestricted.

- **Rationale**: The step agent reads across the whole repository (rules.md, existing
  source, sibling change folders). A read restriction would break existing behavior
  and is unrelated to the escape-write risk this change addresses.

### D4: Preserve Bash and keep `bypassPermissions`

`sandbox.autoAllowBashIfSandboxed: true` is set so Bash keeps executing under the
sandbox. `permissionMode: "bypassPermissions"` and the `allowedTools` /
`disallowedTools` lists are left unchanged.

- **Rationale**: The sandbox is orthogonal to the permission mode: it constrains
  where writes may land, not whether a tool may run. Keeping the permission surface
  identical minimizes behavior change; the sandbox alone supplies the new constraint.
  Bash must remain available because steps rely on it (git status/diff, build, test).

### D5: Detect degradation via the `stderr` callback, decoupled from the fail-open guarantee

Two independent concerns:

1. **Fail-open continuation** is guaranteed structurally by `failIfUnavailable:
   false` — the run proceeds regardless of whether the adapter notices the
   degradation.
2. **The single warning** is produced by observing the Claude Code process stderr
   through the `stderr` callback. A pure predicate recognizes the sandbox-unavailable
   signature; on the first matching chunk the adapter writes one
   `[specrunner] warn:` line, guarded by a once-latch that is shared across the main
   turn and every follow-up turn of the same run.

- **Rationale**: The SDK exposes no structured (typed) signal for sandbox
  degradation — the init/system message carries no sandbox status field, and the
  degradation surfaces only as a stderr warning. The `stderr` callback is the
  documented capture channel. Decoupling detection from continuation means that even
  if the predicate fails to match a future SDK wording, the run still continues
  (fail-open preserved); only the extra warning is missed. That is an acceptable
  graceful failure of an observability layer sitting on top of a backstopped
  prevention feature.
- **Alternatives considered**:
  - Adapter-side platform probe that decides availability before the query —
    **rejected**. It duplicates the SDK's platform knowledge and can diverge from the
    SDK's actual runtime decision, and it would omit the sandbox from the options on
    "unavailable" platforms, undermining the symmetry with codex.

### D6: Confine the change to the step agent

Only `agent-runner.ts` is modified. `query-one-shot.ts` and the codex adapter are
untouched; their options are frozen by regression tests.

- **Rationale**: The write-scope risk is the step agent, which produces artifacts.
  Read-oriented one-shot steps do not write deliverables, so widening the blast
  radius is unjustified for this change.

## Risks / Trade-offs

- **[Over-restriction breaks a legitimate out-of-`cwd` write]** → In worktree mode
  the worktree's real git directory lives under `<main>/.git/worktrees/<name>` (i.e.
  outside `cwd`), and tools may use the OS temp directory. If the sandbox denies
  those writes, a step could break. Mitigation: the codex `workspace-write` adapter
  already runs successfully in the same worktree layout, which is evidence the OS
  sandbox profiles tolerate temp/git internals; the implementer MUST validate on a
  real sandbox-capable platform and, only if a legitimate write is blocked, add the
  minimal extra path(s) to `allowWrite` (commit + push itself is done by
  `StepExecutor.commitAndPush()` outside the agent query, per adapter D5, so the
  agent turn should not need to write the git object store).

- **[`stderr` callback changes stderr handling]** → Registering an `stderr` callback
  might suppress the SDK's default forwarding of process stderr to the terminal,
  hiding debug output. Mitigation: the callback is observation-only; if validation
  shows default forwarding is suppressed, the callback write-throughs the received
  data so existing visibility is preserved.

- **[Degradation predicate misses a future SDK wording]** → The single warning would
  not fire. Mitigation: by D5 the run still continues; the missed warning is
  non-fatal and the backstop still guards the escape write. Keep the predicate broad
  but specific (matches a sandbox-unavailable signature, ignores unrelated lines).

- **[`allowWrite` glob semantics]** → It is not yet certain whether a bare directory
  path or a recursive glob (`<cwd>/**`) is required to grant the subtree. Mitigation:
  the implementer validates the exact form; the test fixes that `allowWrite` contains
  the `cwd` value and tolerates additional entries.

## Open Questions

- Does registering the `stderr` callback suppress the SDK's default stderr
  forwarding? (Resolve during implementation; write-through if so.)
- Does the OS sandbox profile auto-allow the system temp directory and the worktree
  git directory, or must they be added to `allowWrite`? (Validate on macOS and, if
  available, Linux.)
- Exact glob form required by `filesystem.allowWrite` to cover the `cwd` subtree
  (directory path vs `<cwd>/**`).
