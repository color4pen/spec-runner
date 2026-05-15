# Code Review: github-credential-env-separation — Iteration 2

## Summary

All 2 BLOCKERs and all 4 MAJORs from iteration 1 are confirmed fixed. The `githubToken` is now fully threaded through `StepContext → PipelineDeps → PrCreateStep → runPrCreate`, `GITHUB_TOKEN_MISSING` is registered in `ERROR_CODES`, the permission mask is corrected to `0o077`, `finish.ts` emits a stderr notice on fallback, and two missing test suites (spawn env merge, credentials permission warning including 0640 regression) are added. Typecheck and 1895 tests remain green.

3 MINORs and 1 NIT from iteration 1 were not addressed by the code-fixer. They do not block the change — documented below for tracking.

## Findings

### [MINOR] `runGhPrCreate` in `src/core/gh/pr.ts` is still dead code

**Status**: Not fixed (carried from iteration 1)

`runGhPrCreate` is exported but has zero production callers (`grep` confirms only the definition in `src/core/gh/pr.ts:34`). The file header says "for reuse in finish" but the finish orchestrator injects `GITHUB_TOKEN` via `spawnCommand` directly — it never calls this function. The new `githubToken` wiring added in this iteration is correct but unexercised by any real call path. Dead exports are an attractive nuisance: future callers may pick them up expecting production-proven behaviour.

**Suggested fix**: Either remove the function (simplify scope) or add a `// NOTE: not yet called from production — reserved for ...` comment so the next reader doesn't trust it blindly.

---

### [MINOR] `createRuntime` default `githubToken = ""` remains a silent footgun

**Status**: Not fixed (carried from iteration 1)

`src/core/runtime/factory.ts:34` — `githubToken: string = ""`. The same applies to `ManagedRuntime` constructor (`src/core/runtime/managed.ts:34`). Both current call sites pass the token correctly, but the `= ""` default means a future caller that forgets the argument compiles cleanly and silently degrades the managed runtime at session-creation time rather than at the boundary. For local runtime `""` is harmless; for managed it results in a token-less `createSession` call.

**Suggested fix**: Remove the default from `createRuntime` (make `githubToken` required). For `ManagedRuntime` constructor, the same — require the parameter and have `LocalRuntime` pass `""` explicitly if needed. No functional change; adds compile-time safety.

---

### [MINOR] TC-041 test description still falsely references `github.accessToken`

**Status**: Not fixed (carried from iteration 1)

`tests/unit/config/runtime-config.test.ts:344`:
```
describe("TC-041: checkConfigComplete only checks github.accessToken (managed prereqs moved to checkRuntimePrereqs)"
```
`checkConfigComplete` now returns `null` unconditionally (`src/config/schema.ts`). The inner assertions verify the new behaviour correctly, but the description leads readers to believe the function still inspects `github.accessToken`. The first inner test's label ("returns null when github token is set") adds to the confusion.

**Suggested fix**: Rename to e.g. `TC-041: checkConfigComplete always returns null (GitHub token check moved to runPreflight)`.

---

### [MINOR] `TC-CRED-004` asserts readability, not the 0600 file mode

`tests/core/credentials/github.test.ts:77-85` — test name is "creates credentials.json and the file is readable", which only round-trips the data through `saveCredentials` / `loadCredentials`. The 0600 mode claim in the describe label is unverified. If `atomicWriteJson` stopped honouring the `mode` option, the test would still pass.

**Suggested fix**: Add `const stat = await fs.stat(credPath()); expect(stat.mode & 0o777).toBe(0o600);` after `saveCredentials`.

---

### [NIT] `loadCredentials` malformed-JSON comment is too terse

`src/core/credentials/github.ts:58-60`:
```typescript
  } catch {
    // Malformed JSON — treat as empty
    return {};
  }
```
The comment is accurate but doesn't signal the intentional divergence from test-cases.md TC-05 ("should throw `SpecRunnerError`"). A reader coming from the spec will think this is a bug.

**Suggested fix**: `// Malformed JSON — deliberately treated as empty (not thrown). resolveGitHubToken's "no token" path provides the user-facing error and login hint.`

---

## Acceptance Criteria Verification

| Criterion | Status |
|-----------|--------|
| `SpecRunnerConfig`/`RawConfig` `github` field deleted | ✅ |
| `config.github.accessToken` call sites replaced (run.ts, bootstrap.ts, doctor.ts, agent-runner.ts) | ✅ |
| `specrunner login` writes `credentials.json` (0600) provider-keyed JSON | ✅ |
| credentials file structure `{ "github": { "token": "..." } }` | ✅ |
| No token → `specrunner run` fails with login hint | ✅ |
| `gh` CLI subprocesses receive `GITHUB_TOKEN` from resolver | ✅ (via `spawnCommand` env merge + finish/pr-create wiring) |
| `gh auth login` not required when `specrunner login` done | ✅ (token flows through `PrCreateStep` → `runPrCreate` → `spawnCommand`) |
| `specrunner doctor` token check uses credentials / env | ✅ |
| `specrunner doctor` checks `gh` binary presence | ✅ |
| `src/config/store.ts` 0600 warning deleted | ✅ |
| credentials file 0600 warning added | ✅ |
| existing `github.accessToken` in config ignored / stripped on save | ✅ |
| `bun run typecheck && bun run test` green | ✅ (159 files, 1895 tests) |

## Test Coverage Assessment

All `must`-priority test scenarios that were blocking iteration 1 are now covered:

| Gap from iter-1 | Status |
|-----------------|--------|
| TC-03/TC-04/TC-51 — permission warning | ✅ TC-CRED-009/010/011 added |
| TC-33/TC-34 — spawn env merge | ✅ `tests/unit/util/spawn.test.ts` added |
| TC-35/TC-37 — pr-create env injection (pipeline path) | ✅ `githubToken` now in `PrCreateStep` |
| GITHUB_TOKEN_MISSING error code | ✅ registered in `ERROR_CODES` |

Remaining gaps (all `should` or observational):

- TC-18–TC-21 (login → credentials write flow): `src/cli/login.ts` has no unit test. The underlying `saveCredentials` is tested; the CLI wrapper depends on a mocked `runDeviceFlow` which was not added. Low risk given credentials I/O coverage elsewhere, but login is the headline UX of this change.
- TC-CRED-004 mode assertion: file mode not checked post-save (noted above).
- TC-60/TC-61 (XDG_CONFIG_HOME for `getCredentialsPath`): not directly tested; indirectly covered by the credential tests which set `XDG_CONFIG_HOME` in `beforeEach`.

## Verdict

- **verdict**: approved
