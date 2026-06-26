# Spec: subprocess-credential-seam

## Requirements

### Requirement: `src/git` subprocesses MUST spawn git with stripped env

Every git subprocess started by `src/git/dynamic-context.ts`,
`src/git/remote.ts`, and `src/git/transport-auth.ts` SHALL receive an environment
produced by `stripSecrets`, so that `GH_TOKEN`, `GITHUB_TOKEN`,
`ANTHROPIC_API_KEY`, `SPECRUNNER_API_KEY`, and any `*_TOKEN` / `*_API_KEY` /
`*_SECRET` key are absent from the child process. Benign variables such as `PATH`
SHALL be preserved.

#### Scenario: dynamic-context git log/diff env contains no secrets

**Given** `GH_TOKEN` and `ANTHROPIC_API_KEY` are present in the ambient `process.env`
**When** `collectDynamicContext(cwd, baseBranch)` runs its `git log` / `git diff` commands
**Then** the env passed to each spawned git process contains neither `GH_TOKEN` nor `ANTHROPIC_API_KEY`
**And** the env still contains `PATH`

#### Scenario: remote get-url env contains no secrets

**Given** `GITHUB_TOKEN` is present in the ambient `process.env`
**When** `getOriginInfo(cwd)` spawns `git remote get-url origin`
**Then** the env passed to the spawned git process does not contain `GITHUB_TOKEN`

#### Scenario: transport-auth origin lookup env contains no secrets

**Given** `GH_TOKEN` is present in the ambient `process.env`
**When** `createTransportAuth({ cwd }).authArgs()` resolves the origin URL via `git remote get-url origin`
**Then** the env passed to the spawned git process does not contain `GH_TOKEN`

#### Scenario: getOriginInfo still distinguishes repo states

**Given** a directory that is a git repository but has no `origin` remote
**When** `getOriginInfo(cwd)` runs
**Then** it throws a `SpecRunnerError` with code `NOT_GIT_REPO` carrying the "Origin remote not configured" detail
**And given** a directory that is not a git repository, `getOriginInfo(cwd)` throws the not-a-git-repo error

---

### Requirement: doctor's execFile MUST spawn with stripped env

The `execFile` adapter built by `buildExecFile` in `src/cli/doctor.ts` SHALL pass an
environment produced by `stripSecrets` to the underlying `execFile`, so doctor's
`git --version` / `codex --version` / `git remote get-url` invocations do not inherit
credential keys. `PATH` SHALL be preserved.

#### Scenario: doctor execFile env contains no secrets

**Given** `GH_TOKEN` is present in the environment seen by `buildExecFile`
**When** the built execFile function is invoked
**Then** the env passed to the underlying execFile does not contain `GH_TOKEN`
**And** the env still contains `PATH`

---

### Requirement: direct `node:child_process` import MUST be confined to the spawn seam

A structural architecture tooth (tag B-12) SHALL assert that no file under `src/`
imports `node:child_process` except the spawn seam modules (`src/util/spawn.ts`,
`src/util/git-exec.ts`) and the explicitly allowlisted composition-root /
already-stripping sites recorded in `arch-allowlist.ts`. The allowlist SHALL be
shrink-only, consistent with the existing B-1…B-11 / DSM ratchet.

#### Scenario: a new direct import in src/git is flagged

**Given** a simulated grep match `{ file: "src/git/new-helper.ts", content: 'import { execFile } from "node:child_process";' }` that is not in the allowlist
**When** the B-12 violation filter is applied
**Then** the match is reported as a violation

#### Scenario: the seam's own import is exempt

**Given** a simulated grep match `{ file: "src/util/git-exec.ts", content: 'import { spawn as nodeSpawn } from "node:child_process";' }`
**When** the B-12 violation filter is applied with the B-12 allowlist
**Then** the match is NOT reported as a violation

#### Scenario: the pre-migration src/git state is detectable

**Given** the un-migrated `src/git` files still importing `node:child_process` directly (no allowlist entry for them)
**When** the B-12 tooth evaluates them
**Then** they are reported as violations (the tooth is red before D2's migration)

---

### Requirement: the B-6 claude allowlist entry MUST be site-specific

The B-6 allowlist entry for `src/adapter/claude-code/agent-runner.ts` SHALL identify
the OAuth-token resolver call-site by a site-specific identifier
(`resolveClaudeCodeOAuthTokenFn(`) rather than the file's generic cast idiom, so that
any other raw `process.env` spawn introduced in that file is no longer suppressed.

#### Scenario: a future cast-bearing raw-env spawn in the same file is flagged

**Given** a simulated grep match `{ file: "src/adapter/claude-code/agent-runner.ts", content: "spawn(cmd, args, { env: process.env as Record<string, string | undefined> });" }`
**When** the B-6 violation filter is applied with the narrowed B-6 allowlist
**Then** the match is reported as a violation (the narrowed pattern does not cover it)

#### Scenario: the legitimate resolver input remains allowlisted

**Given** the resolver call-site line containing both `process.env` and `resolveClaudeCodeOAuthTokenFn(`
**When** the B-6 violation filter is applied with the narrowed B-6 allowlist
**Then** the line is NOT reported as a violation

---

### Requirement: git transport and read commands MUST keep working after the env strip

Removing credential keys from git's environment SHALL NOT break push, fetch, clone,
log, diff, or remote resolution, because GitHub transport authentication is injected
per-invocation via `git -c http.<scope>.extraheader=…` rather than via environment
tokens.

#### Scenario: transport auth args are still produced from a token

**Given** a GitHub token and an HTTPS origin URL
**When** `buildTransportAuthArgs(token, originUrl)` runs
**Then** it returns the `http.<scope>.extraheader` and `credential.helper=` `-c` arguments unchanged by this change
