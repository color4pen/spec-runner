# Spec: git-transport-auth

## Requirements

### Requirement: git transport operations MUST self-authenticate with the resolved GitHub token

Every git transport operation that specrunner spawns locally — workspace-setup fetch
(local runtime), managed-runtime setup pushes and fetch, per-step feature-branch push,
finalize push, verification-result push, archive main push, and archive/cancel branch-delete
pushes — MUST be authenticated with the GitHub token resolved by `resolveGitHubToken`,
injected per-invocation as an HTTP `extraheader`. The operations MUST NOT depend on an
ambient `credential.helper` or OS keychain.

#### Scenario: fetch succeeds without ambient git credentials

**Given** the origin remote is an HTTPS GitHub URL
**And** no `credential.helper` is configured and the OS keychain is unreachable
**And** a valid GitHub token is resolved
**When** the local runtime runs the workspace-setup `git fetch origin`
**Then** the fetch is invoked with a per-invocation `http.<origin>.extraheader` carrying the resolved token
**And** the fetch authenticates and succeeds without consulting any credential helper

#### Scenario: feature-branch push succeeds without ambient git credentials

**Given** the origin remote is an HTTPS GitHub URL
**And** no `credential.helper` is configured and the OS keychain is unreachable
**And** a valid GitHub token is resolved
**When** a pipeline step pushes the feature branch to origin
**Then** the push is invoked with a per-invocation `http.<origin>.extraheader` carrying the resolved token
**And** the push authenticates and succeeds

### Requirement: token injection MUST NOT change user git config nor persist the token

The token injection MUST use only per-invocation `git -c` parameters. It MUST NOT write the
token to any git config file (global or local), MUST NOT embed the token in the remote URL,
and MUST NOT modify the user's `credential.helper` or any other persistent git configuration.

#### Scenario: no persistent git state is written

**Given** a transport operation is authenticated with the resolved token
**When** the operation completes
**Then** the token does not appear in any `.git/config` or `~/.gitconfig`
**And** the origin remote URL is unchanged and contains no token
**And** the user's `credential.helper` setting is unchanged

### Requirement: the token MUST NOT appear in remote URL, persistent git config, or logs

The resolved token MUST NOT be written, in plaintext or in any reversible encoding, to the
remote URL, to persistent git configuration, or to any log or diagnostic output emitted by
specrunner.

#### Scenario: transport failure log excludes the token

**Given** a transport operation is invoked with the injected `extraheader`
**When** the operation fails and specrunner logs an error
**Then** the logged message does not contain the token nor the `extraheader` argument value

### Requirement: non-HTTPS origins preserve ambient git behavior

When the origin remote is not an HTTPS URL (e.g. an SSH remote), specrunner MUST NOT inject
token authentication and MUST run the git transport operation unchanged, without requiring a
resolved token.

#### Scenario: SSH origin is left unauthenticated by specrunner

**Given** the origin remote is an SSH GitHub URL (`git@github.com:owner/repo.git`)
**When** a git transport operation runs
**Then** specrunner injects no `http.extraheader` and no `credential.helper` override
**And** the operation runs as a plain git invocation relying on SSH key authentication

### Requirement: a missing token surfaces a clear error for required transport

When a required git transport operation needs a token (HTTPS origin) but no token can be
resolved, specrunner MUST surface the existing `GITHUB_TOKEN_MISSING` error with its guidance
hint rather than a cryptic git credential prompt failure. Best-effort cleanup operations
(branch-delete, finalize, verification propagation) MUST degrade to a warning and MUST NOT
abort the surrounding command.

#### Scenario: required fetch with no resolvable token

**Given** the origin remote is an HTTPS GitHub URL
**And** no GitHub token can be resolved
**When** specrunner attempts a required transport operation
**Then** it reports the `GITHUB_TOKEN_MISSING` error with the login/`GH_TOKEN` guidance hint

#### Scenario: best-effort branch delete with no resolvable token

**Given** no GitHub token can be resolved
**When** cancel attempts the best-effort remote branch-delete push
**Then** the push is attempted unauthenticated, fails, and is reported as a warning
**And** the local cancel cleanup still completes
