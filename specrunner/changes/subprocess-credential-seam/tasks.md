# Tasks: subprocess-credential-seam

## T-01: Migrate `src/git/dynamic-context.ts` to the git-exec seam

**File**: `src/git/dynamic-context.ts`

- [ ] Remove the direct subprocess imports (`execFile as nodeExecFile` from
  `node:child_process`, `promisify` from `node:util`, and the
  `const execFileAsync = promisify(nodeExecFile);` line).
- [ ] Add `import { gitExec, defaultSpawnFn } from "../util/git-exec.js";`.
- [ ] Rewrite `runGit(cwd, args)` to delegate to the seam:
  ```ts
  async function runGit(cwd: string, args: string[]): Promise<string | null> {
    return gitExec(defaultSpawnFn, cwd, args);
  }
  ```
  (or inline `gitExec(defaultSpawnFn, cwd, args)` at the two call-sites and delete
  `runGit`). `gitExec` already returns trimmed stdout or `null`, matching the
  current contract.
- [ ] Update the file-header docstring: it no longer "uses node:child_process
  execFile directly (not git-exec.ts)" — it now routes through the `git-exec.ts`
  strip seam. Keep the "do NOT import from src/adapter/" note.

**Acceptance Criteria**:
- `dynamic-context.ts` contains no `from "node:child_process"` import.
- `collectDynamicContext` returns the same `{ gitLog, diffStat, changesList }`
  shape and still swallows git failures into empty values (existing
  `tests/git/dynamic-context.test.ts` passes unchanged).

---

## T-02: Migrate `src/git/transport-auth.ts` `getRawOriginUrl` to the git-exec seam

**File**: `src/git/transport-auth.ts`

- [ ] Remove `import { execFile } from "node:child_process";`, `import { promisify }
  from "node:util";`, and `const execFileAsync = promisify(execFile);`.
- [ ] Promote the existing type-only import of `git-exec` to a value import:
  `import { gitExec, defaultSpawnFn, type SpawnFn as GitExecSpawnFn } from "../util/git-exec.js";`
  (preserve the `SpawnFn` type alias already used by `wrapTransportGitExecSpawn`).
- [ ] Rewrite `getRawOriginUrl(cwd)` to use the seam:
  ```ts
  async function getRawOriginUrl(cwd: string): Promise<string | undefined> {
    const url = await gitExec(defaultSpawnFn, cwd, ["remote", "get-url", "origin"]);
    return url && url.length > 0 ? url : undefined;
  }
  ```
  (`gitExec` returns `null` on any failure, matching the previous
  `try/catch → undefined` behaviour; map `null`/empty to `undefined`.)

**Acceptance Criteria**:
- `transport-auth.ts` contains no `from "node:child_process"` import.
- `createTransportAuth(...).authArgs()` resolves origin URLs as before; existing
  `tests/unit/architecture/.../transport-auth*` and transport tests pass.

---

## T-03: Migrate `src/git/remote.ts` to the git-exec seam (preserve error contract)

**File**: `src/git/remote.ts`

- [ ] Remove `import { execFile } from "node:child_process";`, `import { promisify }
  from "node:util";`, and `const execFileAsync = promisify(execFile);`.
- [ ] Add `import { runSubprocess, gitExecExitCode, defaultSpawnFn } from "../util/git-exec.js";`.
- [ ] Rewrite `getOriginInfo` to use `runSubprocess` (which resolves with
  `{ stdout, stderr, exitCode }` and only rejects on the spawn `error` event),
  preserving the exact `SpecRunnerError` outcomes via a `rev-parse` probe (D3):
  ```ts
  export async function getOriginInfo(cwd: string, host: string = "github.com"): Promise<OriginInfo> {
    let remoteUrl: string;
    try {
      const { stdout, exitCode } = await runSubprocess(
        defaultSpawnFn, "git", ["remote", "get-url", "origin"], { cwd },
      );
      if (exitCode !== 0) {
        // Distinguish "not a git repo" from "git repo but no origin".
        const gitDirCode = await gitExecExitCode(defaultSpawnFn, cwd, ["rev-parse", "--git-dir"]);
        if (gitDirCode === 0) {
          throw new SpecRunnerError(
            "NOT_GIT_REPO",
            "cd into a git repository before running specrunner.",
            "Origin remote not configured.",
          );
        }
        throw notGitRepoError();
      }
      remoteUrl = stdout.trim();
    } catch (err: unknown) {
      if (err instanceof SpecRunnerError) throw err;
      throw notGitRepoError(); // spawn-level failure (e.g. git binary missing)
    }

    if (!remoteUrl || remoteUrl.length === 0) {
      throw new SpecRunnerError(
        "NOT_GIT_REPO",
        "cd into a git repository before running specrunner.",
        "Origin remote not configured.",
      );
    }

    return parseRemoteUrl(remoteUrl, host);
  }
  ```
- [ ] Leave `parseRemoteUrl` unchanged (pure function).

**Acceptance Criteria**:
- `remote.ts` contains no `from "node:child_process"` import.
- `getOriginInfo` throws `SpecRunnerError("NOT_GIT_REPO", …, "Origin remote not
  configured.")` for a repo without origin, and `notGitRepoError()` for a non-repo.
- `parseRemoteUrl` tests in `tests/git-remote.test.ts` pass unchanged.

---

## T-04: Strip env in doctor's execFile adapter (composition-root)

**File**: `src/cli/doctor.ts`

- [ ] Keep the `import * as childProcess from "node:child_process";` (doctor needs
  `execFile` `timeout` + `AbortSignal`, not offered by the seam — see D4).
- [ ] Add `import { stripSecrets } from "../util/env-filter.js";`.
- [ ] Make `buildExecFile` injectable and strip env on the call:
  ```ts
  export const buildExecFile = (
    env: Record<string, string | undefined> = process.env,
    execFileAsyncImpl = execFileAsync,
  ): ExecFileFunction => {
    return async (file, args, options) => {
      const result = await execFileAsyncImpl(file, args, {
        timeout: options?.timeout,
        signal: options?.signal,
        env: stripSecrets(env) as Record<string, string>,
      });
      return { stdout: result.stdout as string, stderr: result.stderr as string };
    };
  };
  ```
- [ ] `runDoctor` continues to call `buildExecFile()` (no-arg) — defaults preserve
  current production behaviour.

**Acceptance Criteria**:
- The env passed to the underlying execFile excludes `GH_TOKEN` / `GITHUB_TOKEN` /
  `ANTHROPIC_API_KEY` / `SPECRUNNER_API_KEY` and preserves `PATH`.
- Existing doctor checks/tests pass unchanged.

---

## T-05: Narrow the B-6 claude allowlist entry to a site-specific identifier

**Files**: `src/adapter/claude-code/agent-runner.ts`, `tests/unit/architecture/arch-allowlist.ts`

### agent-runner.ts (formatting-only, no functional change)

- [ ] Collapse the resolver call (currently L270-271) onto a single physical line so
  the `process.env` reference and the resolver identifier share one grep line:
  ```ts
  const resolvedClaudeCodeToken = await this.resolveClaudeCodeOAuthTokenFn(process.env as Record<string, string | undefined>, { optional: true });
  ```
  Do not change behaviour (still passes `process.env` to the resolver; `sdkEnv`
  remains `stripSecrets(process.env)` on L268).

### arch-allowlist.ts

- [ ] Change the `src/adapter/claude-code/agent-runner.ts` B-6 entry's `pattern`
  from `"as Record<string, string | undefined>"` to
  `"resolveClaudeCodeOAuthTokenFn("`.
- [ ] Update that entry's `comment` to state the new, site-specific match and that
  the resolver input is injected into the already-stripped `sdkEnv`, not passed raw
  to a subprocess.

**Acceptance Criteria**:
- The narrowed entry still covers the (now single-line) resolver call (B-6 test
  green, zero violations).
- A synthetic injected match for a cast-bearing raw-env spawn in the same file
  (e.g. `spawn(cmd, args, { env: process.env as Record<string, string | undefined> })`)
  is NOT covered by the narrowed entry (verified in T-09).

---

## T-06: Add the B-12 structural tooth (ban direct `node:child_process` import)

**Files**: `tests/unit/architecture/arch-allowlist.ts`, `tests/unit/architecture/core-invariants.test.ts`

### arch-allowlist.ts

- [ ] Add a `B-12` section with one entry per allowed importer (file + `node:child_process`):
  - `src/util/spawn.ts` — seam (`stripSecrets` strip point).
  - `src/util/git-exec.ts` — seam (`runSubprocess` strip point; covers both its value
    and type imports of `node:child_process`).
  - `src/core/verification/commands.ts` — composition-internal; already strips
    (`{ ...stripSecrets(env), PATH }`), pinned by verification env tests.
  - `src/core/verification/runner.ts` — composition-internal; already strips
    (`stripSecrets(process.env)`), pinned by `runner-git-show-env.test.ts`.
  - `src/cli/doctor.ts` — composition-root; needs `execFile` `timeout`+`AbortSignal`
    not offered by the seam; strips env at the call (T-04). Reason recorded in `comment`.
  - Use `invariant: "B-12"` and a `tracking` id (e.g. `B12-<site>`) per entry.

### core-invariants.test.ts

- [ ] Add a `describe("B-12: …")` block that greps
  `"from ['\\"]node:child_process"` across `src/` (single `grepE("…","src")`),
  excludes `__tests__/` and `.test.ts` files, filters comments, then filters through
  the `B-12` allowlist entries and asserts `violationLines(violations)` equals `[]`.
- [ ] Add a liveness assertion: the raw match count (allowlisted + not) is
  `> 0`, so a regressed grep that silently returns nothing cannot pass vacuously.
- [ ] Docstring: explain B-12 — subprocess spawn confined to the seam; direct
  `node:child_process` import banned elsewhere; this catches the **env-omission**
  class that the B-6 `process.env` grep cannot express.

**Acceptance Criteria**:
- With T-01…T-04 applied, the B-12 test is green (only allowlisted files import
  `node:child_process`).
- Removing any one allowlist entry while its file still imports `node:child_process`
  turns the test red (ratchet integrity).

---

## T-07: Env behavioral tests for the three `src/git` sites

**File**: `tests/unit/git/git-spawn-env.test.ts` (new) — model on
`tests/unit/core/verification/runner-git-show-env.test.ts`.

- [ ] `vi.mock("node:child_process", () => ({ spawn: vi.fn() }))` so the seam's
  `defaultSpawnFn` (= `nodeSpawn`) is intercepted; capture `opts.env` from the mock.
- [ ] In `beforeEach`, set `process.env.GH_TOKEN` / `GITHUB_TOKEN` /
  `ANTHROPIC_API_KEY` to known values and ensure `PATH` is set; restore in
  `afterEach`.
- [ ] Test (dynamic-context): call `collectDynamicContext(tmp, "main")`; assert the
  env captured for the `git log` / `git diff` spawns has no `GH_TOKEN` /
  `ANTHROPIC_API_KEY` and still has `PATH`.
- [ ] Test (remote): mock spawn to emit a valid `https://github.com/o/r.git` on
  stdout and close 0; call `getOriginInfo(tmp)`; assert the captured spawn env has no
  `GITHUB_TOKEN` and has `PATH`.
- [ ] Test (transport-auth): call
  `createTransportAuth({ token: "t", cwd: tmp }).authArgs()`; assert the captured
  spawn env (for `remote get-url origin`) has no `GH_TOKEN`.

**Acceptance Criteria**:
- All three tests pass and would fail against the pre-migration (env-omission)
  `src/git` implementations.

---

## T-08: Env behavioral test for doctor's execFile

**File**: `tests/unit/cli/doctor-execfile-env.test.ts` (new)

- [ ] Import `buildExecFile` from `src/cli/doctor.ts`.
- [ ] Create a spy `execFileAsyncImpl = vi.fn().mockResolvedValue({ stdout: "", stderr: "" })`.
- [ ] Call `buildExecFile({ GH_TOKEN: "secret", PATH: "/usr/bin" }, spy)` and invoke
  the returned function with `("git", ["--version"])`.
- [ ] Assert the third arg passed to the spy has `env` without `GH_TOKEN` and with
  `PATH: "/usr/bin"`, and that `timeout` / `signal` are still forwarded.

**Acceptance Criteria**:
- Test passes; doctor's execFile env is verified stripped while preserving
  `timeout` / `signal` plumbing.

---

## T-09: Regression-guard tests for B-12 and the narrowed B-6 entry

**File**: `tests/unit/architecture/core-invariants.test.ts` (append to the existing
`T-04 regression guard` describe block, mirroring its synthetic-injection style).

- [ ] B-12 detection: inject a synthetic match
  `{ file: "src/git/new-helper.ts", content: 'import { execFile } from "node:child_process";' }`,
  filter through B-12 entries, assert exactly one violation.
- [ ] B-12 suppression: inject a synthetic match for `src/util/git-exec.ts` with an
  `import … from "node:child_process"` line, assert zero violations (seam exempt).
- [ ] B-6 narrowing: inject a synthetic match
  `{ file: "src/adapter/claude-code/agent-runner.ts", content: "spawn(cmd, args, { env: process.env as Record<string, string | undefined> });" }`,
  filter through the (narrowed) B-6 entries, assert exactly one violation —
  demonstrating the generic-cast hole is closed.

**Acceptance Criteria**:
- All three guard tests pass, proving the toothed detection (not just the current
  codebase state).

---

## T-10: Update existing `git-remote.test.ts` for the seam migration

**File**: `tests/git-remote.test.ts`

- [ ] TC-013 (`getOriginInfo with no git repo`): replace the `vi.mock("node:child_process",
  { execFile })` setup — `remote.ts` no longer imports `execFile`. Either mock
  `node:child_process` `spawn` (returning a child that closes non-zero) and assert
  `getOriginInfo` rejects with `NOT_GIT_REPO`, or point the test at a real non-repo
  temp dir and assert the thrown error. Keep it a meaningful assertion (the current
  body asserts nothing).
- [ ] TC-015 (`uses execFile not exec`): update the intent from the literal
  `content.toContain("execFile")` to assert the new shell-injection-safe shape —
  `remote.ts` imports from `../util/git-exec.js` and contains no string-shell `exec(`
  (the existing `not.toMatch(/child_process["']\)?\.exec\s*\(/)` guard stays valid;
  drop or rephrase the `toContain("execFile")` line). The safety property holds:
  the seam spawns with an argument array and `shell:false`.

**Acceptance Criteria**:
- `tests/git-remote.test.ts` passes against the migrated `remote.ts`.
- The shell-injection-prevention intent of TC-015 is still asserted (no string-shell
  `exec`).

---

## T-11: Full verification

- [ ] `bun run typecheck` passes.
- [ ] `bun run test` passes (B-6, B-12, all git/doctor env tests, transport tests).
- [ ] `grep -rn "from ['\"]node:child_process" src` shows only the five allowlisted
  files (the two seam modules, `verification/commands.ts`, `verification/runner.ts`,
  `cli/doctor.ts`).

**Acceptance Criteria**:
- All acceptance criteria in `request.md` are satisfied; no regression in git
  push / fetch / log / diff / remote behaviour.
