# Implementation Notes — github-credential-env-separation

## Fix History

### code-fixer iter 1 (2026-05-16)

**#1 (BLOCKER): Register GITHUB_TOKEN_MISSING in ERROR_CODES**
- `src/errors.ts`: Added `GITHUB_TOKEN_MISSING: "GITHUB_TOKEN_MISSING"` to `ERROR_CODES` map.
- `src/core/credentials/github.ts`: Added `ERROR_CODES` to import; changed raw string `"GITHUB_TOKEN_MISSING"` to `ERROR_CODES.GITHUB_TOKEN_MISSING` in the throw.

**#2 (BLOCKER): Thread githubToken through to PrCreateStep**
- `src/core/types.ts`: Added `githubToken?: string` to `StepContext` interface.
- `src/core/runtime/local.ts`: Added `githubToken?: string` to `LocalRuntimeOptions`, `private readonly githubToken: string` field, initialized in constructor; `buildDeps` now includes `githubToken: this.githubToken`.
- `src/core/runtime/managed.ts`: `buildDeps` now includes `githubToken: this.githubToken`.
- `src/core/runtime/factory.ts`: `LocalRuntime` construction now passes `githubToken`.
- `src/core/step/pr-create.ts`: `runPrCreate({...})` call now includes `githubToken: deps.githubToken`.

**#3 (MAJOR): Fix permission mask**
- `src/core/credentials/github.ts`: Changed `LOOSE_MODE_THRESHOLD = 0o007` to `0o077` to catch group-readable bits (e.g. 0640).

**#4 (MAJOR): Add stderr notice in finish.ts when token resolution fails**
- `src/cli/finish.ts`: Added `process.stderr.write(...)` in the catch block so users know the fallback is happening.

**#5 (MAJOR): Add tests for spawn env merge behavior**
- Created `tests/unit/util/spawn.test.ts` with TC-33 and TC-34.

**#6 (MAJOR): Add tests for credentials file permission warning**
- `tests/core/credentials/github.test.ts`: Added TC-CRED-009 (0644 warns), TC-CRED-010 (0600 no warn), TC-CRED-011 (0640 warns, regression for 0o077 mask fix).
