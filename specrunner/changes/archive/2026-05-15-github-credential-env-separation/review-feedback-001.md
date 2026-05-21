# Code Review: github-credential-env-separation — Iteration 1

## Summary

Implementation moves the GitHub token out of `config.json` and into a new `~/.config/specrunner/credentials.json` (0600), introduces a `resolveGitHubToken()` resolver (credentials → env), strips the `github` field on save, plumbs `GITHUB_TOKEN` env injection through `spawnCommand`, the finish orchestrator, and the managed adapter, and adds a `gh-cli-present` doctor check. The plumbing is mostly complete and tests/typecheck pass.

However, the pipeline-driven `pr-create` step (the most user-visible PR creation path during `specrunner run`) was NOT wired to receive the resolved token. The token never reaches `runPrCreate(...)`, so the pipeline's `gh pr create` continues to depend on `gh auth login` — violating acceptance criterion 7 ("`gh auth login` 未実行でも `specrunner login` だけで PR 作成 / merge が動く"). Several `must`-priority test cases (TC-33, TC-34, TC-35, TC-37) are not covered, and the `GITHUB_TOKEN_MISSING` error code is not registered in `ERROR_CODES`.

## Findings

### [BLOCKER] Pipeline `pr-create` step does not receive the resolved GitHub token

**File**: `src/core/step/pr-create.ts`
**Lines**: L27–L41

`PrCreateStep.run()` calls `runPrCreate({ branch, baseBranch, title, body, cwd })` without passing `githubToken`. `PrCreateInput.githubToken` was added to `src/core/pr-create/runner.ts` (line 21–22), and the runner correctly forwards `ghEnv = { GITHUB_TOKEN: input.githubToken }` to spawn (line 144), but the call site never supplies it. As a result, the pipeline-driven `gh pr list` / `gh pr create` invocations run with `process.env` only — `GITHUB_TOKEN` from the credentials file is never injected.

This breaks:
- request.md acceptance criterion 6 (gh CLI subprocess 呼び出し時に `GITHUB_TOKEN` env が resolver 出力から注入される)
- request.md acceptance criterion 7 (`specrunner login` だけで PR 作成 / merge が動く)
- test-cases.md TC-35 (gh CLI env injection / pr-create)
- test-cases.md TC-37 (gh CLI env injection / UX — gh auth login 不要)
- design.md D7 (which lists pr-create module as one of the two gh-spawn systems requiring env injection)
- tasks.md Task 7 (specifically lists `PrCreateInput.githubToken` propagation, but the integration into the pipeline step was missed)

**Suggested fix**: Thread the resolved token from the CLI entry layer into `PipelineDeps` (e.g. add `githubToken?: string` to `StepContext` or `PipelineDeps` in `src/core/types.ts`), populate it in `LocalRuntime.buildDeps` and `ManagedRuntime.buildDeps`, and pass `deps.githubToken` into `runPrCreate(...)` from `PrCreateStep.run()`. The CLI already resolves and propagates the token to `createRuntime` — extending it through `buildDeps` is the natural completion of the chain.

---

### [BLOCKER] `GITHUB_TOKEN_MISSING` error code not registered in `ERROR_CODES`

**File**: `src/core/credentials/github.ts`
**Lines**: L106–L110

`resolveGitHubToken()` throws `new SpecRunnerError("GITHUB_TOKEN_MISSING", ...)`, but `GITHUB_TOKEN_MISSING` is not listed in `ERROR_CODES` (see `src/errors.ts` L18–L53). This makes the code an unregistered string and a regression against the project's named-error-code convention. The TC-CRED-008 test only checks the magic string, which silently passes even though the code is undocumented.

Additionally, `src/core/preflight.ts` L80–L91 catches the resolver error and re-throws it with `ERROR_CODES.RUNTIME_PREREQ_MISSING` (`err.hint` -> `hint`, `err.message` -> `message`). That secondary mapping is fine, but the original code remains an undeclared identifier and other code paths (doctor, finish) check `err.code` directly.

**Suggested fix**: Add `GITHUB_TOKEN_MISSING: "GITHUB_TOKEN_MISSING"` to the `ERROR_CODES` map in `src/errors.ts`, and reference it via `ERROR_CODES.GITHUB_TOKEN_MISSING` in `src/core/credentials/github.ts`.

---

### [MAJOR] Missing tests for `spawnCommand` env merge behavior (TC-33 / TC-34)

**File**: `src/util/spawn.ts`
**Lines**: L40–L45

The `env` merge strategy change (`{ ...process.env, ...opts.env }`) is a behavioral change explicitly called out in design D6 and tested-case-required by TC-33 / TC-34 (both `must`). No test asserts:
- TC-33: passing `opts.env = { GITHUB_TOKEN: "..." }` results in subprocess seeing both `process.env.PATH` and the injected `GITHUB_TOKEN`.
- TC-34: omitting `opts.env` leaves subprocess env exactly equal to `process.env` (backward compat).

This is the lynchpin behavior — a subtle regression here (e.g. someone re-introduces `env: opts.env ?? process.env` later) would break every `gh` invocation silently.

**Suggested fix**: Add a `tests/unit/util/spawn.test.ts` that spawns a real command echoing env vars (e.g. `node -e "console.log(process.env.GITHUB_TOKEN, process.env.PATH)"`) under both branches and asserts the merged behavior.

---

### [MAJOR] Missing tests for credentials-file permission warning (TC-03 / TC-04 / TC-51)

**File**: `tests/core/credentials/github.test.ts`
**Lines**: (file scope)

test-cases.md TC-03 / TC-04 / TC-51 (all `must`) require asserting that:
- Loading a 0644 credentials file emits a `Warning: ... has loose permissions` to stderr.
- Loading a 0600 file emits no warning.

Permission warning logic exists in `src/core/credentials/github.ts` L44–L54 but no test exercises it. Without a test, the warning can be regressed without detection — and the warning was specifically migrated from `src/config/store.ts` (deleted there) into this file per design D10.

**Suggested fix**: Add two test cases mirroring the original config-store warning tests — chmod the file to 0644 / 0600 after `writeCredentials`, spy on `stderr`, call `loadCredentials`, assert the warning is/isn't emitted.

---

### [MAJOR] Permission warning bit-mask only catches "other" bits, not "group"

**File**: `src/core/credentials/github.ts`
**Lines**: L22, L47

`LOOSE_MODE_THRESHOLD = 0o007` masks only the `other` permission triple (octal `0o007 = ----rwx`). A 0640 file (group-readable, no other bits) yields `mode & 0o007 === 0` and produces no warning — yet the file is still "looser than 0600" and exposes secrets to anyone in the owning group.

The same bug existed in the pre-migration `src/config/store.ts` (per `git show de2533d:src/config/store.ts`), so the implementer inherited it via the "copy existing pattern" instruction in design D10. This is a pre-existing defect now carried over to the more security-critical file. The standard mask is `0o077` (all group + other bits).

**Suggested fix**: Change `LOOSE_MODE_THRESHOLD` to `0o077`. Add a regression test case for 0640.

---

### [MAJOR] `finish` falls back silently when token cannot be resolved

**File**: `src/cli/finish.ts`
**Lines**: L75–L83

`runFinish` swallows the resolver error and proceeds with `githubToken = undefined`. Combined with the spawn env-merge change, this means `gh` invocations run without injected `GITHUB_TOKEN` and silently fall back to whatever `gh auth login` provides. Two issues:

1. The user-facing behavior is opposite to `specrunner run`, which fails fast with a `specrunner login` hint. A user expecting "credentials file is the source of truth" can be surprised when `finish` quietly uses a different identity (e.g. a stale `gh auth login` session for a different account).
2. There is no telemetry/log — no `stderr` notice that token resolution failed and fallback is being used.

This is arguably consistent with TC-37's spirit (gh auth login still works when present), but it weakens acceptance criterion 7 because it makes the failure mode invisible.

**Suggested fix**: Either (a) emit a single-line `stderr` notice when resolver fails ("GitHub token not found in credentials/env; falling back to `gh` CLI auth.") so the user knows, or (b) treat finish like run and fail-fast if neither credentials nor env are available. Option (a) preserves backward compat; option (b) is stricter.

---

### [MINOR] `runGhPrCreate` (`src/core/gh/pr.ts`) is dead code

**File**: `src/core/gh/pr.ts`
**Lines**: L34–L71

`runGhPrCreate` is exported but never imported from production code (only `runPrCreate` in `pr-create/runner.ts` is used). The change correctly adds `githubToken` to its input contract, but since no caller exercises it, the new wiring is unverified and the file remains an attractive nuisance. Either delete or document it.

**Suggested fix**: Either remove the file (and reduce scope of this change) or add a brief comment noting it is reserved for the archive-PR path mentioned in commit `cli-finish-command` plans.

---

### [MINOR] `createRuntime` default `githubToken = ""` is a silent footgun for managed runtime

**File**: `src/core/runtime/factory.ts`
**Lines**: L28–L44

The signature `githubToken: string = ""` allows callers to forget the argument; managed `ManagedAgentRunner.createSession({ githubToken: "" })` will then fail at session-creation time rather than at the boundary. Real callers (`run.ts`, `bootstrap.ts`) pass the resolved token correctly, but a future caller could silently degrade.

**Suggested fix**: Make `githubToken` required (no default). For local runtime it is unused; explicitly pass `""` from `run.ts` if the local path is taken.

---

### [MINOR] Misleading test description references deleted check

**File**: `tests/unit/config/runtime-config.test.ts`
**Lines**: L344

`describe("TC-041: checkConfigComplete only checks github.accessToken …")` is now factually incorrect — the function returns `null` unconditionally. The inner assertions assert the new behavior, so the test passes, but the description misdirects readers.

**Suggested fix**: Rename to something like `TC-041: checkConfigComplete returns null (github check moved to runPreflight)`.

---

### [NIT] `loadCredentials` swallows malformed JSON instead of throwing

**File**: `src/core/credentials/github.ts`
**Lines**: L56–L61

test-cases.md TC-05 (`should`, not `must`) specifies that malformed JSON should throw a `SpecRunnerError`. The implementation silently returns `{}` (which is what TC-CRED-003 actually tests). The decision diverges from the test spec but matches the `loadCredentials → resolveGitHubToken → user gets login hint` user flow. Worth a one-line comment in the function explaining the deliberate divergence, so future readers don't "fix" it.

**Suggested fix**: Add a code comment: `// Malformed JSON treated as empty — resolveGitHubToken's "no token" path provides the user-friendly error.`

---

## Test Coverage Assessment

test-cases.md declares **52 must-priority** scenarios. The implementation covers them at the following levels:

| Area | Coverage | Notes |
|------|----------|-------|
| TC-01, TC-02 (loadCredentials basics) | covered | TC-CRED-001/002 |
| TC-03, TC-04 (permission warning) | **NOT covered** | No test exercises the 0644/0600 warning path. MAJOR finding above. |
| TC-05 (malformed JSON) | divergent | Implementation returns `{}`; test asserts the `{}` behavior, contradicting the test-case spec. NIT above. |
| TC-06, TC-07, TC-08 (saveCredentials + merge + 0600) | partial | TC-CRED-004/005 cover write+merge, but no test asserts the resulting file mode is 0600 after save. |
| TC-09–TC-11 (resolver priority chain) | covered | TC-CRED-006/007/008 |
| TC-12 (no subprocess in resolver) | implicit | Source review confirms pure file I/O; no automated check. |
| TC-13 (no `github` field in types) | covered by typecheck | TS errors would surface. |
| TC-14, TC-15, TC-17 (saveConfig strip + load passthrough + warning removed) | partial | Store-level tests not added; existing cli tests indirectly exercise it. |
| TC-16 (checkConfigComplete) | covered | tests/unit/config/runtime-config.test.ts TC-041 |
| TC-18, TC-19, TC-20, TC-21 (login credentials write) | **NOT covered** | No login.test.ts updated; manual verification only. |
| TC-22, TC-23, TC-24, TC-25 (CLI entry token injection) | partial | bootstrap.test.ts TC-BS-001 exercises the path; run/doctor not directly tested but indirectly through tests/cli.test.ts TC-064. |
| TC-26, TC-27, TC-28, TC-29 (preflight) | partial | TC-064 covers "missing token → exit 1". No test for "GITHUB_TOKEN env-only path" (TC-27). |
| TC-30, TC-31, TC-32 (ManagedAgentRunner constructor injection) | covered | tests/unit/adapter/managed-agent/agent-runner.test.ts updated with `githubToken: "ghp_test"`. |
| TC-33, TC-34 (spawnCommand env merge) | **NOT covered** | MAJOR finding above. |
| TC-35 (pr-create env injection) | **NOT covered** | Pipeline pr-create doesn't even receive the token — BLOCKER above. |
| TC-36 (finish env injection) | partial | Plumbed; no behavioral test asserts env reaches spawn. |
| TC-37 (gh auth login 不要) | **NOT covered** | Cannot be covered until BLOCKER above is fixed. |
| TC-38, TC-39 (type-level fields) | covered by typecheck. |
| TC-40–TC-49 (doctor checks) | covered | Updated test files. |
| TC-50, TC-51 (permission warning move) | partial | TC-50 (config warning removed) covered indirectly; TC-51 (credentials warning emitted) NOT covered. |
| TC-52, TC-53 (backward compat) | **NOT covered** | No explicit test asserts that a legacy `github.accessToken` in config loads cleanly and is stripped on save. |
| TC-54, TC-55 (typecheck + test green) | covered | verification-result.md confirms 159 files / 1895 tests pass. |
| TC-56 (no `config.github` references) | covered by grep | Manually verified: only a comment in `src/core/doctor/types.ts:115` mentions `github.accessToken` (as docstring example). |
| TC-57, TC-58, TC-59 (new unit tests exist) | partial | TC-57 missing the 0644 warning case; TC-58 covered; TC-59 covered. |
| TC-60, TC-61 (XDG path) | **NOT covered** | No direct test for `getCredentialsPath()` with/without `XDG_CONFIG_HOME`. (Indirectly via test setup.) |

Coverage summary:
- ~75% of must-priority scenarios are covered, but two BLOCKERs leave acceptance criteria 6 and 7 functionally broken in the pipeline path.
- Behavioral assertions for the lynchpin spawn env merge change are missing.
- Login flow tests were not added even though `specrunner login` is the entire premise of the change.

## Verdict

- **verdict**: needs-fix
