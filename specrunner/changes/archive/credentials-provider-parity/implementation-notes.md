# Implementation Notes: credentials-provider-parity

## result: completed
## tasks_completed: 14/14

## Summary

All 14 tasks completed. `bun run typecheck && bun run test` passes (2093/2093 tests green).

One unplanned addition: extracted shared `src/core/credentials/credentials-io.ts` to isolate `loadCredentials`/`saveCredentials` from `github.ts`. This prevented `resume.test.ts` (which mocks `github.js` for only `resolveGitHubToken`) from breaking when `anthropic.ts` needed `loadCredentials`. The extraction is purely an implementation detail and doesn't change any public API.

## Files Modified

| Path | Operation | Description |
|------|-----------|-------------|
| `src/core/credentials/types.ts` | modify | Added `anthropic?: { apiKey?: string }` to `CredentialsFile` |
| `src/errors.ts` | modify | Added `ANTHROPIC_KEY_MISSING` to `ERROR_CODES` |
| `src/core/credentials/credentials-io.ts` | create | Shared `loadCredentials`/`saveCredentials` with deep merge logic |
| `src/core/credentials/github.ts` | modify | Now re-exports from `credentials-io.ts`; removed duplicated I/O code |
| `src/core/credentials/anthropic.ts` | create | `resolveSpecRunnerApiKey` (overloaded optional/required) + `saveSpecRunnerApiKey` |
| `src/core/credentials/requirements.ts` | create | `requirementsFor(runtime)` → declarative credential matrix |
| `src/core/doctor/types.ts` | modify | Added `resolvedSpecRunnerApiKey`/`specRunnerApiKeySource` to `DoctorContext` |
| `src/cli/doctor.ts` | modify | Pre-resolves Anthropic key; injects into `DoctorContext` |
| `src/core/doctor/checks/config/managed-key-present.ts` | modify | Uses `ctx.resolvedSpecRunnerApiKey`; includes source in pass message |
| `src/core/doctor/checks/auth/managed-key-valid.ts` | modify | Uses `ctx.resolvedSpecRunnerApiKey`; removed boilerplate guard |
| `src/core/doctor/checks/agents/agent-provider-alive.ts` | modify | Uses `ctx.resolvedSpecRunnerApiKey`; removed boilerplate guard |
| `src/core/doctor/checks/agents/environment-provider-alive.ts` | modify | Uses `ctx.resolvedSpecRunnerApiKey`; removed boilerplate guard |
| `src/core/preflight.ts` | modify | `checkRuntimePrereqs` now async + declarative via `requirementsFor`; `PreflightResult` extended |
| `src/cli/bootstrap.ts` | modify | Uses `resolveSpecRunnerApiKey`; conditional on runtime |
| `src/cli/run.ts` | modify | Uses `resolveSpecRunnerApiKey`; conditional on runtime |
| `src/cli/rm.ts` | modify | Uses `resolveSpecRunnerApiKey`; conditional on runtime |
| `src/cli/managed.ts` | modify | All 3 functions use `resolveSpecRunnerApiKey` |
| `tests/core/credentials/anthropic.test.ts` | create | 13 test cases covering TC-ANTH-001~006, TC-SAVE-001~003, TC-MERGE-001~002 |
| `tests/core/credentials/requirements.test.ts` | create | 4 test cases covering TC-REQ-001~004 |
| `tests/core/doctor/mock-context.ts` | modify | Added `resolvedSpecRunnerApiKey`/`specRunnerApiKeySource` to `buildMockContext` |
| `tests/core/doctor/checks/config/managed-key-present.test.ts` | modify | Uses `resolvedSpecRunnerApiKey` instead of `env` |
| `tests/core/doctor/checks/auth/managed-key-valid.test.ts` | modify | Uses `resolvedSpecRunnerApiKey` instead of `env` |
| `tests/core/preflight.test.ts` | modify | Added mocks for `anthropic.js` and `requirements.js` |
| `tests/unit/core/preflight.test.ts` | modify | Updated for async `checkRuntimePrereqs`; added anthropic mock |
| `specrunner/specs/credential-store/spec.md` | create | New spec: provider-symmetric credential storage and resolver rules |
| `specrunner/specs/github-device-flow-auth/spec.md` | modify | Fixed `config.json` → `credentials.json` inaccuracy; added cross-reference |
| `specrunner/specs/managed-agent-runtime/spec.md` | modify | Added credential-store cross-reference |

## Blocked Tasks

None.

## Test Cases Skipped

None — all must test cases implemented.

## Implementation Notes

### credentials-io.ts extraction

The task specified importing `loadCredentials`/`saveCredentials` from `github.ts`. However, `resume.test.ts` mocks `github.ts` with `{ resolveGitHubToken: vi.fn() }` only, which would cause `anthropic.ts`'s import of `loadCredentials` to receive `undefined`. Extracting to `credentials-io.ts` decouples the I/O from the resolver without breaking any existing tests or API surfaces. `github.ts` re-exports both functions for backward compatibility.

### checkRuntimePrereqs now async

The function became async because it calls `resolveSpecRunnerApiKey` to validate the Anthropic key. All callers that used the synchronous return value (`tests/unit/core/preflight.test.ts`) were updated to `await`.

### overload type constraint

TypeScript's overload resolution requires literal `true`/`false` types for the `optional` parameter. Passing `config.runtime !== "managed"` (a `boolean`) is rejected. Fixed by using explicit conditional branches in `bootstrap.ts`, `run.ts`, and `rm.ts`.
