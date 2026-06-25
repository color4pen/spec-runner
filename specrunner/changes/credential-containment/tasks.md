# Tasks: credential-containment

## T-01: Extend `stripSecrets` with pattern-based denylist

**File**: `src/util/env-filter.ts`

- [x] Add `SECRET_PATTERNS: RegExp[]` constant after `SECRET_DENYLIST`:
  ```ts
  const SECRET_PATTERNS: RegExp[] = [/_TOKEN$/i, /_API_KEY$/i, /_SECRET$/i];
  ```
- [x] In `stripSecrets`, after the fixed-key loop, add a second loop over `Object.keys(result)` that deletes any key for which `SECRET_PATTERNS.some((p) => p.test(key))` is true.
- [x] Do NOT remove existing `SECRET_DENYLIST` entries (they remain as explicit documentation).
- [x] Update the JSDoc comment on `stripSecrets` to mention pattern-based stripping.

**Acceptance Criteria**:
- `stripSecrets({ MY_CORP_TOKEN: "v", SVC_API_KEY: "v", DB_SECRET: "v", PATH: "/usr" })` returns an object without the three secret keys but with `PATH` intact.
- `stripSecrets({ GH_TOKEN: "v", ANTHROPIC_API_KEY: "v", PATH: "/usr", HOME: "/h", XDG_CONFIG_HOME: "/c", SPECRUNNER_DEBUG: "pipeline" })` preserves all four benign keys.
- Original `env` object is not mutated.

---

## T-02: Update unit tests for extended `stripSecrets`

**File**: `tests/unit/util/env-filter.test.ts`

- [x] Add test case `(e) removes pattern-matched keys (*_TOKEN / *_API_KEY / *_SECRET)` asserting the three wildcard patterns strip their keys.
- [x] Add test case `(f) preserves benign variables (PATH, HOME, XDG_*, SPECRUNNER_DEBUG)` asserting those survive stripping.
- [x] Existing test cases `(a)`–`(d)` must remain passing without modification.

**Acceptance Criteria**:
- All tests in `env-filter.test.ts` pass.

---

## T-03: Fix `maskSensitive` — capture-group prefix + `i` flag

**File**: `src/logger/stdout.ts`

- [x] Refactor `MASK_PATTERNS` from `RegExp[]` to `Array<[RegExp, string]>`, where the second element is the replacement string using `$1` (the captured fixed prefix). Example:
  ```ts
  const MASK_PATTERNS: Array<[RegExp, string]> = [
    [/\b(sk-ant-)[A-Za-z0-9_-]+/gi, "$1..."],
    [/\b(gh[oprsu]_)[A-Za-z0-9]+/gi, "$1..."],
    [/\b(github_pat_)[A-Za-z0-9_]+/gi, "$1..."],
    [/\b(sk-proj-)[A-Za-z0-9_-]+/gi, "$1..."],
    [/\b(sk-svcacct-)[A-Za-z0-9_-]+/gi, "$1..."],
    [/\b(sk-)[A-Za-z0-9_-]{20,}/gi, "$1..."],
  ];
  ```
- [x] Update `maskSensitive` to use `result.replace(pattern, replacer)` for each `[pattern, replacer]` pair (replacing the loop that used the old `match.indexOf("_")` logic).
- [x] Remove the old match-position calculation logic (`match.indexOf("_")`, `match.lastIndexOf("-")`, etc.).

**Acceptance Criteria**:
- `maskSensitive("sk-ant-api03-abc_xyz123")` returns `"sk-ant-..."` (no body leaks past prefix).
- `maskSensitive("SK-ANT-api03-abc123")` returns `"SK-ANT-..."` (case-insensitive, case of prefix preserved).
- `maskSensitive("sk-proj-abc_def_ghi_jkl_mno_pqr")` returns `"sk-proj-..."`.
- `maskSensitive("gho_ABCdef123")` returns `"gho_..."`.
- Non-secret strings are returned unchanged.

---

## T-04: Add unit tests for fixed `maskSensitive`

**File**: `tests/unit/logger/stdout-mask.test.ts` (new file) or append to `tests/unit/logger/verbose-log.test.ts`

- [x] Test: `_`-containing sk-ant key body is fully masked (AC from spec §4 scenario 1).
- [x] Test: uppercase sk-ant variant is masked (AC from spec §4 scenario 2).
- [x] Test: sk-proj key with underscores is masked (AC from spec §4 scenario 3).
- [x] Test: non-secret string passes through unchanged.
- [x] Test: gho_ / ghr_ / etc. variants still work (regression guard for existing behaviour).

**Acceptance Criteria**:
- All new tests pass.

---

## T-05: Fix `runSubprocess` — pass `stripSecrets` env

**File**: `src/util/git-exec.ts`

- [x] Import `stripSecrets` from `./env-filter.js` at the top of the file.
- [x] In `runSubprocess`, add `env: stripSecrets(process.env as Record<string, string | undefined>) as Record<string, string>` to the options object passed to `spawnFn`:
  ```ts
  const child = spawnFn(bin, args, {
    cwd: opts.cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: stripSecrets(process.env as Record<string, string | undefined>) as Record<string, string>,
  });
  ```
- [x] Verify that `SpawnOptions` (from `node:child_process`) accepts the `env` field — it does; no type change needed.

**Acceptance Criteria**:
- A spy wrapping `defaultSpawnFn` captures the `env` argument and confirms `GH_TOKEN` / `GITHUB_TOKEN` / `ANTHROPIC_API_KEY` are absent when those keys exist in `process.env`.
- `gitExec` and `gitExecExitCode` still return expected values in existing tests (no regression).

---

## T-06: Add unit tests for `git-exec` env stripping

**File**: `tests/unit/util/git-exec.test.ts` (new file, or append to existing if present)

- [x] Use a spy `SpawnFn` that captures the `opts` argument and resolves with `{ stdout: "", stderr: "", exitCode: 0 }`.
- [x] Test: call `gitExec(spyFn, "/tmp", ["status"])` with `GH_TOKEN` in `process.env` (via test env setup); assert the captured `opts.env` does not contain `GH_TOKEN`.
- [x] Test: same assertion for `gitExecExitCode`.
- [x] Test: `PATH` is preserved in `opts.env` (benign variable regression).

**Acceptance Criteria**:
- All new tests pass.

---

## T-07: Fix verification `git show` spawn — pass `stripSecrets` env

**File**: `src/core/verification/runner.ts`

- [x] `stripSecrets` is already imported at line 11. No new import needed.
- [x] Inside `checkPackageJsonScriptsIntegrity`, add `env: stripSecrets(process.env as Record<string, string | undefined>)` to the `spawn` options:
  ```ts
  const child = spawn("git", ["show", `origin/${baseBranch}:package.json`], {
    cwd,
    shell: false,
    env: stripSecrets(process.env as Record<string, string | undefined>),
  });
  ```

**Acceptance Criteria**:
- The `spawn` call inside `checkPackageJsonScriptsIntegrity` no longer inherits full `process.env`.
- Existing verification tests pass without modification.

---

## T-08: Add unit tests for verification `git show` env stripping

**File**: `tests/unit/core/verification/runner-git-show-env.test.ts` (new file)

- [x] Mock `node:child_process` `spawn` to capture arguments and return a fake stdout of `{}` (valid empty package.json with no scripts), exit code 0.
- [x] Call `runVerification(slug, cwd, undefined, "main")` with a `GH_TOKEN` set in the test process env (or inject via a wrapper).
- [x] Assert that the `env` argument passed to the mocked `spawn` does not contain `GH_TOKEN`.
- [x] Assert `PATH` is present in the captured env (benign var preserved).

**Acceptance Criteria**:
- All new tests pass.

---

## T-09: Fix codex adapter SDK factory — pass `env` + `apiKey` options

**Files**: `src/adapter/codex/sdk-loader.ts`, `src/adapter/codex/agent-runner.ts`

### sdk-loader.ts

- [x] Update the `CodexSdk` interface's `Codex` constructor signature:
  ```ts
  export interface CodexSdk {
    Codex: new (opts?: { env?: Record<string, string>; apiKey?: string }) => CodexInstance;
  }
  ```

### agent-runner.ts

- [x] Import `stripSecrets` from `../../util/env-filter.js`.
- [x] In the `run` method, replace the current default factory line:
  ```ts
  // BEFORE:
  const codexFactory = this.injectedCodexFactory ?? (() => new sdk!.Codex());
  ```
  with:
  ```ts
  // AFTER:
  const strippedEnv = stripSecrets(
    process.env as Record<string, string | undefined>,
  ) as Record<string, string>;
  const openaiApiKey = (process.env as Record<string, string | undefined>)["OPENAI_API_KEY"];
  const codexFactory = this.injectedCodexFactory ?? (() =>
    new sdk!.Codex({
      env: strippedEnv,
      ...(openaiApiKey !== undefined ? { apiKey: openaiApiKey } : {}),
    })
  );
  ```
- [x] The injected `_codexFactory?: () => CodexInstance` in `CodexAgentRunnerDeps` is NOT changed (tests inject a fully-constructed mock).

**Acceptance Criteria**:
- `strippedEnv` passed to the default `Codex` factory does not contain `GH_TOKEN`, `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`, or `SPECRUNNER_API_KEY`.
- When `process.env.OPENAI_API_KEY` is set, it is forwarded via the `apiKey` option.

---

## T-10: Add unit tests for codex adapter env containment

**File**: `tests/unit/adapter/codex/agent-runner-env.test.ts` (new file)

- [x] Create a test that injects `_codexFactory` capturing what options it would receive if it were the default. To test the default factory path, use a test that:
  - Sets `process.env.GH_TOKEN = "secret"` temporarily (restore in teardown).
  - Constructs a `CodexAgentRunner` with a spy `_loadSdkFn` that returns a fake `CodexSdk` capturing the `opts` passed to `new Codex(opts)`.
  - Runs a minimal `ctx` through the runner (or mocks `run` to just invoke the factory path).
  - Asserts captured `opts.env` contains no `GH_TOKEN`, `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`, `SPECRUNNER_API_KEY`.
- [x] Test: when `process.env.OPENAI_API_KEY = "sk-openai-xxx"`, the factory receives `apiKey: "sk-openai-xxx"`.
- [x] Test: when `process.env.OPENAI_API_KEY` is unset, `apiKey` is not present in opts.

> **Note**: The `buildDefaultCodexFactory` helper was extracted and exported from `agent-runner.ts` to enable isolated unit testing of the factory construction logic without running the full `run()` loop.

**Acceptance Criteria**:
- All new tests pass.
- No secrets present in the env object forwarded to the codex SDK.

---

## T-11: Extend B-6 architecture test + update allowlist

**Files**: `tests/unit/architecture/core-invariants.test.ts`, `tests/unit/architecture/arch-allowlist.ts`

### arch-allowlist.ts

- [x] Add five allowlist entries under the `B-6` invariant section:
  - `src/util/env-filter.ts` + `SPECRUNNER_DEBUG`
  - `src/util/xdg.ts` + `XDG_CONFIG_HOME`
  - `src/util/xdg.ts` + `XDG_STATE_HOME`
  - `src/adapter/claude-code/agent-runner.ts` + `as Record<string, string | undefined>` (line 271; the function name is on the preceding line)
  - `src/adapter/codex/agent-runner.ts` + `OPENAI_API_KEY` (new: reads single key for explicit SDK forwarding)

### core-invariants.test.ts

- [x] In the `"B-6: …"` describe block, extend the grep to also cover `src/adapter/` and `src/util/`.
- [x] Update the `it` block description to reflect the new scope.
- [x] Update the JSDoc comment inside the `describe("B-6…")` block to mention `src/adapter/` and `src/util/` in the Scope line.
- [x] The regression-guard tests (B-6 detection / seam-exemption `it` blocks further down the file) remain unchanged — they test the `filterViolations` helper with synthetic matches and are scope-agnostic.

**Acceptance Criteria**:
- `bun run typecheck` passes.
- `bun run test` passes (all B-6 tests green with zero violations).
- A manually injected synthetic match for `src/adapter/foo/runner.ts` (without `stripSecrets`) is caught by the violation filter in the regression-guard test.
