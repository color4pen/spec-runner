# Test Cases: git-transport-auth

## Summary

- **Total**: 29 cases
- **Automated** (unit/integration): 29
- **Manual**: 0
- **Priority**: must: 13, should: 14, could: 2

---

## Unit — transport-auth module

### TC-001: fetch succeeds without ambient git credentials

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: git transport operations MUST self-authenticate with the resolved GitHub token > Scenario: fetch succeeds without ambient git credentials

### TC-002: feature-branch push succeeds without ambient git credentials

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: git transport operations MUST self-authenticate with the resolved GitHub token > Scenario: feature-branch push succeeds without ambient git credentials

### TC-003: no persistent git state is written

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: token injection MUST NOT change user git config nor persist the token > Scenario: no persistent git state is written

### TC-004: transport failure log excludes the token

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: the token MUST NOT appear in remote URL, persistent git config, or logs > Scenario: transport failure log excludes the token

### TC-005: SSH origin is left unauthenticated by specrunner

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: non-HTTPS origins preserve ambient git behavior > Scenario: SSH origin is left unauthenticated by specrunner

### TC-006: required fetch with no resolvable token

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: a missing token surfaces a clear error for required transport > Scenario: required fetch with no resolvable token

### TC-007: best-effort branch delete with no resolvable token

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: a missing token surfaces a clear error for required transport > Scenario: best-effort branch delete with no resolvable token

---

## Unit — buildTransportAuthArgs

### TC-008: token absent or empty returns empty args

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `token` is `undefined` or an empty string, and any `originUrl`
**WHEN** `buildTransportAuthArgs(token, originUrl)` is called
**THEN** it returns `[]`

### TC-009: non-HTTPS origin URL returns empty args

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria, design.md > D3

**GIVEN** a valid token
**And** `originUrl` is an SSH remote (`git@github.com:owner/repo.git` or `ssh://github.com/owner/repo.git`)
**WHEN** `buildTransportAuthArgs(token, originUrl)` is called
**THEN** it returns `[]`

### TC-010: HTTPS origin + valid token returns host-scoped extraheader and credential.helper disable

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria, design.md > D1, D2

**GIVEN** a valid token `tok` and HTTPS origin `https://github.com/owner/repo.git`
**WHEN** `buildTransportAuthArgs(tok, originUrl)` is called
**THEN** it returns exactly:
  `["-c", "http.https://github.com/.extraheader=AUTHORIZATION: basic <base64('x-access-token:tok')>", "-c", "credential.helper="]`
**And** the scope is `https://github.com/` (not a global `http.extraheader`)
**And** the returned array contains no remote URL with the token embedded

### TC-011: wrapper injects auth args only for transport subcommands

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria, design.md > D4

**GIVEN** a `wrapTransportSpawn` wrapping a spy SpawnFn with auth args `["-c", "http.….extraheader=…", "-c", "credential.helper="]`
**WHEN** it is called with `git fetch origin`, `git push origin branch`, `git clone <url>`, `git ls-remote`, `git pull`
**THEN** each invocation prepends the auth args so the effective argv starts with `["git", "-c", …, "fetch/push/clone/ls-remote/pull", …]`

### TC-012: wrapper passes non-transport git commands through unchanged

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria, design.md > D4

**GIVEN** a `wrapTransportSpawn` with auth args configured
**WHEN** it is called with `git add`, `git commit`, `git diff`, `git rev-parse`, `git branch -D`, `git checkout`, `git status`
**THEN** the spy SpawnFn receives the original argv without any auth args prepended

### TC-013: wrapper passes non-git commands through unchanged

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-01 Acceptance Criteria, design.md > D4

**GIVEN** a `wrapTransportSpawn` with auth args configured
**WHEN** it is called with a non-git command (e.g., `bun`, `ls`)
**THEN** the spy SpawnFn receives the original argv without modification

### TC-014: createTransportAuth memoizes origin URL resolution

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-01 Acceptance Criteria, design.md > D4

**GIVEN** a `createTransportAuth` provider with a spy `resolveOriginUrl`
**WHEN** three transport operations (fetch, push, push) are dispatched through the wrapped spawn
**THEN** `resolveOriginUrl` is called exactly once
**And** all three transport invocations carry the same auth args

---

## Integration — LocalRuntime wiring

### TC-015: LocalRuntime C1 workspace-setup fetch uses auth extraheader

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria, design.md > D4 wiring table

**GIVEN** a `LocalRuntime` constructed with a resolved `githubToken` and HTTPS origin
**And** `this.spawnFn` is replaced with a spy wrapped by `wrapTransportSpawn`
**WHEN** the workspace-setup `git fetch origin` is executed (C1)
**THEN** the spy captures argv containing `-c http.<scope>.extraheader=…` before `fetch`
**And** `-c credential.helper=` is also present

### TC-016: LocalRuntime C5 commit-push pushOnly uses auth extraheader

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria, design.md > D4 wiring table

**GIVEN** `PipelineDeps.gitTransportSpawn` is set to a spy wrapped by `wrapTransportGitExecSpawn`
**And** the git-exec SpawnFn used by `StepExecutor` / `commit-push pushOnly` routes through it
**WHEN** a pipeline step executes `pushOnly` (C5)
**THEN** the spy captures a `git push origin <branch>` argv with auth args prepended

### TC-017: LocalRuntime C6 commitFinalState finalize push uses auth extraheader

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria, design.md > D4 wiring table

**GIVEN** `LocalRuntime` with wrapped `spawnFn` (auth configured)
**WHEN** `commitFinalState` executes the finalize push (C6)
**THEN** the spy captures `git push origin <branch>` argv with auth args prepended

### TC-018: LocalRuntime C7 verification propagate push uses auth extraheader

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria, design.md > D4 wiring table

**GIVEN** `buildDeps.spawn` is set to the wrapped spy spawn (auth configured)
**WHEN** `verification/propagate` executes `git push origin <branch>` via `deps.spawn` (C7)
**THEN** the spy captures argv with auth args prepended

---

## Integration — ManagedRuntime wiring

### TC-019: ManagedRuntime C2 validateStepInputs fetch uses auth extraheader and preserves best-effort semantics

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-03 Acceptance Criteria, design.md > D4 wiring table

**GIVEN** `ManagedRuntime` with wrapped `spawnFn` and a token
**WHEN** `validateStepInputs` executes `git fetch origin <branch>` (C2, inside `.catch`)
**THEN** the spy captures argv with auth args prepended
**And** if the fetch throws, the `.catch` still suppresses the error and execution continues

### TC-020: ManagedRuntime C3 managed setup branch push uses auth extraheader

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-03 Acceptance Criteria, design.md > D4 wiring table

**GIVEN** `ManagedRuntime` with wrapped `spawnFn`
**WHEN** managed setup pushes the initial branch (C3)
**THEN** the spy captures `git push origin <branchName>` argv with auth args prepended

### TC-021: ManagedRuntime C4 request.md commit push uses auth extraheader

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-03 Acceptance Criteria, design.md > D4 wiring table

**GIVEN** `ManagedRuntime` with wrapped `spawnFn`
**WHEN** setup pushes after committing request.md (C4)
**THEN** the spy captures `git push origin <branchName>` argv with auth args prepended

---

## Integration — archive orchestrator wiring

### TC-022: archive orchestrator C8 main push uses auth extraheader

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria, design.md > D4 wiring table

**GIVEN** `ArchiveInput.githubToken` is populated from the resolved token in `archive.ts`
**And** orchestrator wraps its `spawn` with auth
**WHEN** `git push origin <baseBranch>` (C8) is executed
**THEN** the spy captures argv with auth args prepended
**And** the existing escalation error path on failure is unchanged

### TC-023: archive orchestrator C9 branch-delete push uses auth extraheader and warns on failure

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-04 Acceptance Criteria, design.md > D4 wiring table

**GIVEN** `ArchiveInput.githubToken` is populated and orchestrator uses wrapped spawn
**WHEN** `git push origin --delete <branch>` (C9) is executed and returns non-zero
**THEN** the spy captures argv with auth args prepended
**And** the orchestrator emits a warning and continues without aborting

---

## Integration — cancel runner wiring

### TC-024: cancel runner C10 branch-delete with resolved token uses auth extraheader

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-05 Acceptance Criteria, design.md > D4 wiring table

**GIVEN** `CancelDeps.githubToken` contains a resolved token
**And** cancel runner uses a wrapped spawn
**WHEN** `git push origin --delete <branch>` (C10) is executed
**THEN** the spy captures argv with auth args prepended

### TC-025: cancel runner C10 without resolved token completes local cleanup

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-05 Acceptance Criteria, design.md > Risks

**GIVEN** `CancelDeps.githubToken` is `undefined` (token resolution failed or skipped)
**WHEN** cancel executes the best-effort branch-delete push (C10)
**THEN** `buildTransportAuthArgs(undefined, originUrl)` returns `[]`
**And** git push runs as a plain invocation (no auth injected)
**And** the push fails with a non-zero exit, is captured as a warning
**And** worktree deletion, local branch deletion, and state transitions still complete

### TC-026: non-HTTPS origin: no auth args injected in any wiring point

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-07, design.md > D3

**GIVEN** the origin remote is `git@github.com:owner/repo.git` (SSH)
**And** the runtime or orchestrator has a token configured
**WHEN** any transport operation (fetch or push) is executed through the wrapped spawn
**THEN** the spy captures argv with no `-c http.…extraheader` and no `-c credential.helper=` prepended
**And** the git invocation is passed through unchanged

---

## Integration — log and persistence safety

### TC-027: error log does not contain the token or auth args

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria, design.md > D5

**GIVEN** a transport operation is configured with auth args containing a base64-encoded token
**WHEN** the operation fails (non-zero exit from git) and specrunner logs an error
**THEN** the logged message contains only the git stderr output
**And** the message does not contain the token string, its base64 encoding, or the `extraheader` argument value

### TC-028: remote URL is unchanged after any transport operation

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria, design.md > D1

**GIVEN** the origin remote URL is recorded before a transport operation
**WHEN** the operation completes (success or failure)
**THEN** `git remote get-url origin` returns the same URL with no token embedded

### TC-029: git config files are unmodified after transport

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria, design.md > D2

**GIVEN** snapshots of `~/.gitconfig` and `.git/config` are taken before a transport operation
**WHEN** the operation completes
**THEN** both config files are byte-for-byte identical to their snapshots
**And** no token value appears in any git config file

---

## Result

```yaml
result: completed
total: 29
automated: 29
manual: 0
must: 13
should: 14
could: 2
blocked_reasons: []
```
