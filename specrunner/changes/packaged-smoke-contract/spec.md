# Spec: CI の package smoke を初回接触契約の assert に拡張する

## Requirements

### Requirement: Packaged smoke SHALL assert first-contact contracts through the real npm entry (`npx --no-install specrunner`) on the packed tarball

The project SHALL provide a smoke check that MUST exercise the published artifact by
installing the packed npm tarball into the fixture projects and invoking the CLI
exclusively via `npx --no-install specrunner` (exercising the package `bin` wiring,
shebang, and `.bin/specrunner` generation), and MUST NOT depend on `bun` or on the
repository's TypeScript sources (`src/`). The smoke MUST assert the out-of-repo init,
subdirectory init, isolated-XDG doctor, and subdirectory `request new` contracts, and
MUST retain the existing `--help` startup check. When any asserted contract does not
hold, the smoke MUST exit non-zero.

#### Scenario: init outside a git repository writes nothing including under isolated XDG

**Given** the smoke has packed the tarball and installed it into a non-git fixture directory
**And** a working directory that is not inside any git repository
**And** an isolated empty `XDG_CONFIG_HOME`
**When** the smoke runs `npx --no-install specrunner init` from that directory
**Then** the process exits non-zero
**And** no `specrunner/` directory and no `.gitignore` are created in that directory
**And** no `config.json` is created under the isolated `XDG_CONFIG_HOME`

#### Scenario: init from a subdirectory lands scaffold at repo root without nesting and reports created

**Given** a fixture git repository with a nested subdirectory
**And** an isolated empty `XDG_CONFIG_HOME`
**When** the smoke runs `npx --no-install specrunner init` with the subdirectory as the working directory
**Then** the process exits 0
**And** `specrunner/drafts` and `specrunner/changes` exist at the repository root
**And** no nested `specrunner/` directory is created under the subdirectory
**And** stdout contains a created item report for the scaffold

#### Scenario: isolated XDG init then doctor reports config-file-exists pass judged per-check

**Given** a fixture git repository and an isolated empty `XDG_CONFIG_HOME`
**And** the smoke has run `npx --no-install specrunner init` with that isolated `XDG_CONFIG_HOME`
**When** the smoke runs `npx --no-install specrunner doctor --json` from both the repo root and the subdirectory with the same isolated `XDG_CONFIG_HOME`
**Then** the smoke parses the JSON output and finds the check named `config-file-exists`
**And** that check's `status` is `pass`
**And** the judgment uses that check's status, not the doctor process exit code

#### Scenario: second init reports per-item already-exists (idempotent)

**Given** the fixture git repo has been fully initialized by a prior `init`
**When** the smoke runs `npx --no-install specrunner init` again from the subdirectory
**Then** it exits 0 and reports `already exists` for each item (global config, `.gitignore`, `specrunner/drafts`, `specrunner/changes`)

#### Scenario: half-initialized repo is completed with a per-item created / already-exists split

**Given** the global config exists but the project scaffold (`specrunner/`, `.gitignore`) has been removed
**When** the smoke runs `npx --no-install specrunner init` from the subdirectory
**Then** it exits 0, reports `already exists` for the global config, and reports `created` for `.gitignore`, `specrunner/drafts`, and `specrunner/changes`

#### Scenario: doctor per-check results are identical from root and subdirectory

**Given** the fixture git repo is initialized
**When** the smoke runs `npx --no-install specrunner doctor --json` from the repo root and from the nested subdirectory
**Then** the per-check (name, status) sets of the two runs are identical

#### Scenario: help output includes usage text

**Given** the tarball is installed in the fixture git repo
**When** the smoke runs `npx --no-install specrunner --help`
**Then** it exits 0 and the output contains `Usage: specrunner`

#### Scenario: request new from a subdirectory lands at repo root without nesting

**Given** a fixture git repository with a nested subdirectory
**When** the smoke runs `npx --no-install specrunner request new <slug>` with the subdirectory as the working directory
**Then** `specrunner/drafts/<slug>/request.md` exists at the repository root
**And** no nested `specrunner/` directory is created under the subdirectory

#### Scenario: help startup check is retained on the packaged artifact

**Given** the installed tarball
**When** the smoke runs `npx --no-install specrunner --help`
**Then** the process exits 0 and prints usage output

#### Scenario: the smoke does not reference bun or repository sources

**Given** the smoke script and its CI invocation
**When** the smoke executes end to end
**Then** it invokes the installed tarball only via `npx --no-install specrunner` plus `npm`/`node`/`git`/coreutils
**And** it does not invoke `bun`
**And** it does not read from the repository `src/` tree

### Requirement: Smoke SHALL run hermetically and token-free, isolated from developer and runner state

The smoke MUST create all fixtures under a temporary directory and MUST isolate
`XDG_CONFIG_HOME` and `HOME` so that assertions do not depend on the real config or
credential state of the CI runner or a developer machine. The smoke MUST be composed
only of assertions that hold in the absence of authentication tokens, and MUST run the
CLI non-interactively so it never blocks on a prompt.

#### Scenario: assertions hold regardless of ambient tokens

**Given** an environment that may or may not have GitHub / API tokens present
**When** the smoke runs its assertions
**Then** every assertion's outcome is independent of token presence
**And** the isolated-XDG doctor assertion relies on the per-check `config-file-exists` status rather than the token-sensitive overall exit code

#### Scenario: fixtures and config are isolated from the host

**Given** a developer machine or CI runner with an existing specrunner config
**When** the smoke runs
**Then** all fixtures are created under a temporary directory
**And** `XDG_CONFIG_HOME` and `HOME` are redirected to temporary paths for the CLI invocations
**And** the host's real config and credentials are not read or modified

### Requirement: CI SHALL run the smoke as a gate and the smoke SHALL be locally runnable

CI SHALL execute the smoke script as a required step that MUST fail the build when any
asserted contract does not hold, and a developer MUST be able to run the same smoke
script locally. The change MUST NOT modify other CI jobs or steps, nor the existing
build/test/lint configuration.

#### Scenario: CI runs the smoke script and fails on a broken contract

**Given** the CI workflow after the build step has produced the dist bundle
**When** the smoke step runs the script
**Then** the script asserts the packaged contracts
**And** the CI job fails if any assertion fails

#### Scenario: a developer runs the same smoke locally

**Given** a developer with a built dist bundle
**When** the developer runs the smoke script locally
**Then** the same assertions run against the packed tarball with node
**And** no separate CI-only assertion logic is required

### Requirement: Each smoke assertion SHALL be independently falsifiable

Each smoke assertion MUST be structured so that it can fail on its own — inverting the
expected value of one assertion SHALL cause exactly that assertion to fail while the
others continue to be evaluated independently.

#### Scenario: inverting one expectation fails exactly that assertion

**Given** the smoke script with its per-scenario assertions
**When** the expected value of a single assertion is intentionally inverted
**Then** that assertion fails
**And** the failure is attributable to that specific scenario
