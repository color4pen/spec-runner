# Implementation Notes: dsm-runtime-strategy-demote

## Scan Results — DSM domain→comp-root import sites

grep scan: `grep -rn "runtime/strategy\.js\|runtime/prereqs\.js" src/core/ src/cli/ tests/`

### T-01: RuntimeStrategy interface moved to `core/port/runtime-strategy.ts`

New file created: `src/core/port/runtime-strategy.ts`
- Copied from `src/core/runtime/strategy.ts`
- Import path adjusted: `../port/agent-runner.js` → `./agent-runner.js`

`src/core/port/index.ts` updated to re-export:
- Added: `export type { RuntimeStrategy, QueryOptions, WorkspaceOptions, WorkspaceContext, CleanupHandle } from "./runtime-strategy.js";`

### T-02: RuntimePrereqChecker / RuntimeCredentialsResolver ports to `core/port/runtime-prereqs.ts`

New file created: `src/core/port/runtime-prereqs.ts`
- Defines: `RuntimeCredentials`, `RuntimePrereqChecker`, `RuntimeCredentialsResolver`

`src/core/port/index.ts` updated to re-export:
- Added: `export type { RuntimeCredentials, RuntimePrereqChecker, RuntimeCredentialsResolver } from "./runtime-prereqs.js";`

`src/core/runtime/prereqs.ts` updated:
- Removed inline `RuntimeCredentials` interface definition
- Added: `export type { RuntimeCredentials } from "../port/runtime-prereqs.js";`

`src/core/preflight.ts` updated:
- Removed: `import { checkRuntimePrereqs, resolveRuntimeCredentials } from "./runtime/prereqs.js"`
- Removed: `export { checkRuntimePrereqs } from "./runtime/prereqs.js"` (re-export)
- Added: `import type { RuntimePrereqChecker, RuntimeCredentialsResolver, RuntimeCredentials } from "./port/runtime-prereqs.js"`
- `runPreflight` signature extended with `deps: { prereqChecker: RuntimePrereqChecker; credentialsResolver: RuntimeCredentialsResolver }` param
- Internal calls replaced: `checkRuntimePrereqs(...)` → `deps.prereqChecker.check(...)`, `resolveRuntimeCredentials(...)` → `deps.credentialsResolver.resolve(...)`

`src/cli/run.ts` updated:
- Added: `import { checkRuntimePrereqs, resolveRuntimeCredentials } from "../core/runtime/prereqs.js"`
- `runPreflight` call extended with `deps` object passing concrete implementations

### T-03: Domain import sites updated (5 violations resolved)

| File | Old import | New import |
|---|---|---|
| `src/core/types.ts` (line 9) | `./runtime/strategy.js` | `./port/runtime-strategy.js` |
| `src/core/command/runner.ts` (line 35) | `../runtime/strategy.js` | `../port/runtime-strategy.js` |
| `src/core/command/resume.ts` (line 21) | `../runtime/strategy.js` | `../port/runtime-strategy.js` |
| `src/core/command/pipeline-run.ts` (line 12) | `../runtime/strategy.js` | `../port/runtime-strategy.js` |
| `src/core/preflight.ts` | `./runtime/prereqs.js` | resolved via DI in T-02 |

### T-04: Composition-root internal imports + bootstrap updated

| File | Old import | New import |
|---|---|---|
| `src/core/runtime/local.ts` (line 33) | `./strategy.js` | `../port/runtime-strategy.js` |
| `src/core/runtime/managed.ts` (line 24) | `./strategy.js` | `../port/runtime-strategy.js` |
| `src/core/runtime/factory.ts` (line 14) | `./strategy.js` | `../port/runtime-strategy.js` |
| `src/core/runtime/index.ts` (line 2) | `./strategy.js` | `../port/runtime-strategy.js` |
| `src/cli/bootstrap.ts` (line 19) | `../core/runtime/strategy.js` | `../core/port/runtime-strategy.js` |

`src/core/runtime/strategy.ts` deleted.

Test files updated (import path → port):
- `tests/pipeline-integration.test.ts`
- `tests/unit/core/command/runner.test.ts`
- `tests/unit/core/command/resume.test.ts`
- `tests/unit/step/commit-and-push.test.ts`
- `tests/unit/step/executor.commit.test.ts`

Other test files updated:
- `tests/unit/core/preflight.test.ts`: `checkRuntimePrereqs` import moved from `core/preflight.js` to `core/runtime/prereqs.js`
- `tests/core/preflight.test.ts`: `runPreflight` calls extended with `deps` argument

### T-05: Allowlist entries removed

Removed from `tests/unit/architecture/arch-allowlist.ts`:
- `DSM-domain-comp-root-preflight-prereqs`
- `DSM-domain-comp-root-types-strategy`
- `DSM-domain-comp-root-resume-strategy`
- `DSM-domain-comp-root-runner-strategy`
- `DSM-domain-comp-root-pipeline-strategy`
- Section comment `// ── C) domain → composition-root` (block now empty)
