# Spec: credential-containment

## Requirements

### Requirement: codex subprocess MUST NOT inherit cross-provider credential keys

The default codex SDK factory SHALL pass `env: stripSecrets(process.env)` so that `GH_TOKEN`, `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`, `SPECRUNNER_API_KEY`, and any `*_TOKEN` / `*_API_KEY` / `*_SECRET` key are absent from the codex subprocess environment. Codex's own `OPENAI_API_KEY` SHALL be passed explicitly via the `apiKey` option so codex authentication is not broken.

#### Scenario: codex subprocess env contains no cross-provider keys

**Given** a `CodexAgentRunner` constructed without a `_codexFactory` override
**When** the runner invokes the default codex factory (i.e. `new Codex({ env, apiKey })`)
**Then** the `env` object passed to `Codex` contains neither `GH_TOKEN` nor `GITHUB_TOKEN` nor `ANTHROPIC_API_KEY` nor `SPECRUNNER_API_KEY`

#### Scenario: codex keeps its own API key

**Given** `process.env.OPENAI_API_KEY` is set to a value
**When** the default factory is invoked
**Then** the `apiKey` option passed to `Codex` equals `process.env.OPENAI_API_KEY`

---

### Requirement: git-exec spawn MUST use stripped env

`runSubprocess` in `src/util/git-exec.ts` SHALL pass `env: stripSecrets(process.env)` to the `spawnFn` so that all `gitExec` / `gitExecExitCode` callers transitively produce git processes without credential inheritance.

#### Scenario: git subprocess env contains no denylist keys

**Given** a spy wrapping `defaultSpawnFn`
**When** `gitExec(spyFn, cwd, ["status"])` is called with `GH_TOKEN` present in the ambient `process.env`
**Then** the `env` argument received by the spy does not contain `GH_TOKEN`

---

### Requirement: verification `git show` MUST use stripped env

The `spawn("git", ["show", …], …)` call inside `checkPackageJsonScriptsIntegrity` in `src/core/verification/runner.ts` SHALL include `env: stripSecrets(process.env)`.

#### Scenario: git show subprocess env contains no denylist keys

**Given** `GH_TOKEN` is present in the ambient `process.env`
**When** `runVerification` reaches the package.json integrity check
**Then** the spawned `git show` process does not inherit `GH_TOKEN`

---

### Requirement: `SECRET_DENYLIST` MUST cover wildcard patterns

`stripSecrets` SHALL remove any env key matching `/_TOKEN$/i`, `/_API_KEY$/i`, or `/_SECRET$/i` in addition to the existing fixed keys. Benign variables (`PATH`, `HOME`, `XDG_*`, `LANG`, `SPECRUNNER_DEBUG`, etc.) SHALL be preserved.

#### Scenario: pattern-matched key is removed

**Given** an env object containing `MY_CORP_TOKEN: "val"`, `SVC_API_KEY: "val"`, `DB_SECRET: "val"`
**When** `stripSecrets(env)` is called
**Then** all three keys are absent from the result

#### Scenario: benign variables are preserved

**Given** an env object containing `PATH: "/usr/bin"`, `HOME: "/home/user"`, `XDG_CONFIG_HOME: "/home/.config"`, `SPECRUNNER_DEBUG: "pipeline"`
**When** `stripSecrets(env)` is called
**Then** all four keys are present in the result with their original values

#### Scenario: original object is not mutated

**Given** an env object containing pattern-matched keys
**When** `stripSecrets(env)` is called
**Then** the original env object is unchanged

---

### Requirement: `maskSensitive` MUST fully mask `_`-containing token bodies

`maskSensitive` SHALL replace the secret portion of a matched token with `...` immediately after the recognizable fixed prefix (e.g. `sk-ant-`, `gho_`). It SHALL be case-insensitive so that `SK-ANT-abc` is masked identically to `sk-ant-abc`.

#### Scenario: sk-ant token with underscore in body is fully masked

**Given** a string containing `sk-ant-api03-abc_xyz123` (underscore in body)
**When** `maskSensitive` is called
**Then** the result contains `sk-ant-...` and does NOT contain `abc_xyz123` or any fragment after the prefix

#### Scenario: uppercase variant is masked

**Given** a string containing `SK-ANT-abc123`
**When** `maskSensitive` is called
**Then** the result contains `SK-ANT-...` (prefix case preserved, body replaced)

#### Scenario: sk- generic long key is masked

**Given** a string containing `sk-proj-abc_def_ghi` (≥20 chars after sk-)
**When** `maskSensitive` is called
**Then** the result contains `sk-proj-...` and does NOT contain `abc_def_ghi`

---

### Requirement: B-6 architecture test MUST scan `src/adapter/` and `src/util/`

The B-6 `it` block in `tests/unit/architecture/core-invariants.test.ts` SHALL grep `src/adapter/` and `src/util/` in addition to `src/core/` and assert zero violations (after applying the stripSecrets content-filter and the updated B-6 allowlist).

#### Scenario: unguarded spawn in adapter is detected

**Given** a simulated grep match `{ file: "src/adapter/foo/runner.ts", content: "spawn(bin, args, { env: process.env })" }` not containing `stripSecrets`
**When** the B-6 violation filter is applied
**Then** the match is reported as a violation

#### Scenario: stripSecrets-guarded call-site is exempt

**Given** a simulated grep match `{ file: "src/adapter/foo/runner.ts", content: "env: stripSecrets(process.env)" }`
**When** the B-6 violation filter is applied
**Then** the match is NOT reported as a violation
