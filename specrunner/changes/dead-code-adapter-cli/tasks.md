# Tasks: dead-code-adapter-cli

## T-01: Delete session-runner.ts and clean up its references

- [ ] Delete `src/adapter/managed-agent/session-runner.ts` (107 lines)
- [ ] In `src/adapter/managed-agent/index.ts`: remove lines 2-3 (`export type { ManagedAgentSessionInput, ManagedAgentSessionResult }` and `export { runManagedAgentSession }`)
- [ ] Delete `tests/core/session-runner.test.ts` (dedicated test)
- [ ] In `tests/unit/remove-session-timeout.test.ts`: delete the TC-010 describe block (lines ~89-109, including the comment header) — this is the block that reads session-runner.ts source text and dynamically imports `runManagedAgentSession`

**Acceptance Criteria**:
- `grep -r "session-runner\|runManagedAgentSession\|ManagedAgentSessionInput\|ManagedAgentSessionResult" src/ bin/ tests/` returns 0 matches
- `tests/unit/remove-session-timeout.test.ts` still exists and its remaining tests (TC-011 onwards) pass

---

## T-02: Delete assertBreakAfterCompletion no-op and its call site

- [ ] In `src/adapter/managed-agent/completion.ts`: delete the `assertBreakAfterCompletion` function (lines ~176-183)
- [ ] In `src/adapter/managed-agent/sse-stream.ts`: remove the `assertBreakAfterCompletion` import (line ~18) and remove the call at line ~131 (`assertBreakAfterCompletion(event);`). The `break` statement on the following line remains — it is the actual control flow.
- [ ] In `tests/completion.test.ts`: remove `assertBreakAfterCompletion` from the import (line 5) and delete the `it("assertBreakAfterCompletion does not throw for idle event", ...)` block (lines ~82-86)

**Acceptance Criteria**:
- `grep -r "assertBreakAfterCompletion" src/ bin/ tests/` returns 0 matches
- `tests/completion.test.ts` still exists; remaining tests (TC-026, TC-027, etc.) pass
- The `break` after `assertBreakAfterCompletion` was removed in sse-stream.ts: the break statement that previously followed the call site is still present and provides the actual loop exit

---

## T-03: Delete deleteSession from managed-agent SDK

- [ ] In `src/adapter/managed-agent/sdk/sessions.ts`: delete the `deleteSession` function (lines ~84-92, including its JSDoc comment)

**Acceptance Criteria**:
- `grep -r "deleteSession" src/ bin/ tests/` returns 0 matches
- The rest of `sessions.ts` compiles without error

---

## T-04: Delete isResultMessage and isTextDelta from message-types.ts

- [ ] In `src/adapter/claude-code/message-types.ts`: delete the `isResultMessage` function (lines ~1-26) and the `isTextDelta` function (line ~67 to end of file). Keep `isStreamEvent` and `isToolUse` — `isStreamEvent` is used internally by `isToolUse`.
- [ ] In `tests/unit/adapter/claude-code/message-types.test.ts`:
  - Remove `isResultMessage` and `isTextDelta` from the import (lines 12 and 14)
  - Delete TC-MT-001 describe block (`isResultMessage() with valid result messages`)
  - Delete TC-MT-002 describe block (`isResultMessage() with non-result values`)
  - Delete TC-MT-004 describe block (`isTextDelta() type guard`)
  - Keep TC-MT-003 (`isStreamEvent`) and TC-MT-005 (`isToolUse`) untouched

**Acceptance Criteria**:
- `grep -r "isResultMessage\|isTextDelta" src/ bin/ tests/` returns 0 matches
- `message-types.test.ts` still exists; TC-MT-003 and TC-MT-005 pass

---

## T-05: Delete deprecated turnCount field from QueryOneShotResult

- [ ] In `src/adapter/claude-code/query-one-shot.ts`: delete the `turnCount` field (line ~78, including its `@deprecated` JSDoc comment). Ensure no other line sets or reads `turnCount`.
- [ ] In `tests/unit/adapter/claude-code/query-one-shot.test.ts`: delete the `it("turnCount is undefined (reserved for future use)", ...)` block (lines ~90-100)

**Acceptance Criteria**:
- `grep -r "turnCount" src/ bin/ tests/` returns 0 matches
- Remaining tests in `query-one-shot.test.ts` pass

---

## T-06: Remove _spawnFn/spawnFn from ClaudeCodeRunner and delete git-exec.ts shim

- [ ] In `src/adapter/claude-code/agent-runner.ts`:
  - Remove `import { defaultSpawnFn, type SpawnFn } from "./git-exec.js";` (line ~33)
  - Remove `export type { SpawnFn } from "./git-exec.js";` (line ~57)
  - Remove `_spawnFn?: SpawnFn;` from `ClaudeCodeRunnerDeps` interface (line ~396)
  - Remove `private readonly spawnFn: SpawnFn;` class field (line ~418)
  - Remove `this.spawnFn = deps._spawnFn ?? defaultSpawnFn;` from constructor (line ~427)
- [ ] Delete `src/adapter/claude-code/git-exec.ts` (11-line re-export shim — now has zero src consumers)
- [ ] In `tests/unit/adapter/claude-code/agent-runner.test.ts`:
  - Remove `SpawnFn` from the `agent-runner.js` import (line ~20; keep `QueryFn` and `CreateMcpServerFn` imports from `agent-runner.js`)
  - Remove `_spawnFn: spawnFn,` from the two `ClaudeCodeRunner` constructor calls (lines ~701 and ~749)
  - Delete the `makeGitSimulatingSpawnFn` helper function (line ~144) and its call sites — it is only used in those two constructor calls

**Acceptance Criteria**:
- `grep -r "_spawnFn\|spawnFn\|defaultSpawnFn\|git-exec" src/adapter/claude-code/ tests/unit/adapter/claude-code/` returns 0 matches
- `src/adapter/claude-code/git-exec.ts` does not exist
- `agent-runner.test.ts` compiles and passes

---

## T-07: Repoint transient-error and session-log-writer importers, delete shims

- [ ] In `src/adapter/claude-code/agent-runner.ts`:
  - Change `import { SessionLogWriter } from "./session-log-writer.js";` (line ~49) → `"../shared/session-log-writer.js"`
  - Change `import { isTransientAgentError } from "./transient-error.js";` (line ~54) → `"../shared/transient-error.js"`
- [ ] In `src/adapter/claude-code/__tests__/transient-error.test.ts`: change `from "../transient-error.js"` → `from "../../shared/transient-error.js"`
- [ ] In `src/adapter/claude-code/__tests__/session-log-writer.test.ts`: change `from "../session-log-writer.js"` → `from "../../shared/session-log-writer.js"`
- [ ] Delete `src/adapter/claude-code/transient-error.ts` (5-line shim)
- [ ] Delete `src/adapter/claude-code/session-log-writer.ts` (5-line shim)

**Acceptance Criteria**:
- `src/adapter/claude-code/transient-error.ts` and `src/adapter/claude-code/session-log-writer.ts` do not exist
- `grep -r "claude-code/transient-error\|claude-code/session-log-writer" src/ tests/` returns 0 matches
- `__tests__/transient-error.test.ts` and `__tests__/session-log-writer.test.ts` still pass

---

## T-08: Delete REPORT_TOOL and REPORT_TOOL_CUSTOM_TOOL_SPEC from report-tool.ts

- [ ] In `src/core/step/report-tool.ts`:
  - Delete `REPORT_TOOL_CUSTOM_TOOL_SPEC` constant (lines ~36-41) and its JSDoc comment (~32-35)
  - Delete `REPORT_TOOL` constant (lines ~21-29) and its JSDoc comment (~16-20). Keep all other exports (`toCustomToolSpec`, `PRODUCER_REPORT_TOOL`, `JUDGE_REPORT_TOOL`, `CODE_REVIEW_REPORT_TOOL`, `CONFORMANCE_REPORT_TOOL`, `REQUEST_REVIEW_REPORT_TOOL`).
- [ ] In `tests/adapter/codex/agent-runner.test.ts`:
  - Remove `import { REPORT_TOOL } from "../../../src/core/step/report-tool.js";` (line 15)
  - Add a local fixture constant near the top of the test file:
    ```typescript
    // Local fixture — replaces the removed REPORT_TOOL production export
    const REPORT_TOOL_FIXTURE = {
      name: "report_result" as const,
      description: "Report the completion of this step.",
      zodSchema: {},
      parseInput: (input: unknown) => input,
    };
    ```
  - Replace all usages of `REPORT_TOOL` in the test file with `REPORT_TOOL_FIXTURE`
  - Verify the fixture type is compatible with the `reportTool` field in test call sites (type annotation may need `as any` or a cast if strict typing requires it)
- [ ] In `tests/adapter/codex/agent-runner-transient-retry.test.ts`:
  - Remove `import { REPORT_TOOL } from "../../../src/core/step/report-tool.js";` (line 14)
  - Add the same local fixture constant as above (`REPORT_TOOL_FIXTURE`) and replace all usages of `REPORT_TOOL` with `REPORT_TOOL_FIXTURE`

**Acceptance Criteria**:
- `grep -r "REPORT_TOOL_CUSTOM_TOOL_SPEC" src/ bin/ tests/` returns 0 matches
- `grep -r '\bREPORT_TOOL\b' tests/` returns 0 matches (note: `REPORT_TOOL_FIXTURE`, `PRODUCER_REPORT_TOOL`, `JUDGE_REPORT_TOOL`, etc. are unaffected)
- `grep -r '\bREPORT_TOOL\b' src/ bin/` returns 0 matches
- Both codex `agent-runner` test files compile and pass

---

## T-09: Delete formatAge and truncate from cli/ps.ts

- [ ] In `src/cli/ps.ts`: delete the `formatAge` function (lines ~23-36) and the `truncate` function (lines ~38-44), including their JSDoc comments. No test changes needed — no test imports these functions.

**Acceptance Criteria**:
- `grep -r "\bformatAge\b\|\btruncate\b" src/cli/ps.ts` returns 0 matches
- `grep -r "from.*cli/ps.*formatAge\|from.*cli/ps.*truncate" src/ tests/` returns 0 matches
- `src/cli/ps.ts` compiles without error; existing ps tests pass

---

## T-10: Delete MANAGED_RESET_USAGE alias and remove unused bin exports

- [ ] In `src/cli/command-registry.ts`: delete lines ~196-197 (`/** @deprecated Use RUNTIME_RESET_USAGE */` and `export const MANAGED_RESET_USAGE = RUNTIME_RESET_USAGE;`)
- [ ] In `bin/specrunner.ts`:
  - Remove `export { USAGE, RUNTIME_RESET_USAGE };` (line 14)
  - Remove `RUNTIME_RESET_USAGE` from the import at line 7; the import should become `import { COMMANDS, USAGE, NO_DETAILED_HELP_USAGE } from "../src/cli/command-registry.js";`

**Acceptance Criteria**:
- `grep -r "MANAGED_RESET_USAGE" src/ bin/ tests/` returns 0 matches
- `grep -r "^export.*RUNTIME_RESET_USAGE" bin/` returns 0 matches
- `RUNTIME_RESET_USAGE` still exists in `src/cli/command-registry.ts` and is used at line ~1050 in COMMANDS; `tests/unit/cli/help-flag-dispatch.test.ts` passes unchanged

---

## T-11: Remove archive --dry-run flag (flag definition, parse, field, help text)

- [ ] In `src/cli/command-registry.ts`:
  - In `ARCHIVE_USAGE` string: remove the line `  --dry-run              Reserved for future use` (line ~281)
  - In the `archive` command's `flags` definition: remove `"dry-run": { type: "boolean" },` (line ~867)
  - In the `archive` command's handler: remove `dryRun: !!parsed.flags["dry-run"],` from the `runArchive` call (line ~888)
- [ ] In `src/cli/archive.ts`:
  - Update file-level JSDoc comment at line 9: change `specrunner job archive <slug> [--with-merge] [--dry-run]` → `specrunner job archive <slug> [--with-merge]`
  - In `RunArchiveOptions` interface: remove `/** --dry-run: reserved for future use (currently no-op). */ dryRun?: boolean;` (lines ~79-80)

**Acceptance Criteria**:
- `grep -r "dry-run\|dryRun" src/cli/archive.ts` returns 0 matches
- `grep "dry-run" src/cli/command-registry.ts` returns only inbox-related lines (lines ~208 and ~969) and the prune description (line ~259/265); no archive-related dry-run
- `runArchive` compiles without the `dryRun` parameter; existing archive tests pass
- Inbox `--dry-run` behavior is unchanged; inbox tests pass

---

## T-12: Delete deprecated cwd field from RunConfigEffectiveOptions

- [ ] In `src/cli/config-effective.ts`:
  - Remove the `cwd?: string;` field and its `@deprecated` JSDoc from `RunConfigEffectiveOptions` (lines ~28-31)
  - Remove the backward-compat fallback in `runConfigEffective` body (lines ~70-72): change the `const repoRoot = ...` line to simply `const repoRoot = options.repoRoot ?? undefined;`
- [ ] In `tests/unit/cli/config-effective.test.ts`:
  - Line ~79: change `{ cwd: repoRoot, requestType: "bug-fix", json: true }` → `{ repoRoot, requestType: "bug-fix", json: true }`
  - Line ~103: change `{ cwd: repoRoot }` → `{ repoRoot }`

**Acceptance Criteria**:
- `grep -r "\bcwd\b" src/cli/config-effective.ts` returns 0 matches
- `grep "cwd:" tests/unit/cli/config-effective.test.ts` returns 0 matches
- `config-effective.test.ts` passes

---

## T-13: Delete FileConfigStore class and saveProjectConfig function

- [ ] In `src/config/store.ts`:
  - Delete `saveProjectConfig` function (lines ~223-231, including its JSDoc comment)
  - Delete `FileConfigStore` class (lines ~237-293, including its JSDoc comment)
- [ ] In `tests/config/store.test.ts`:
  - Remove `saveProjectConfig` from the import at line 15
  - Delete the `// saveProjectConfig` comment block and the `describe("saveProjectConfig", ...)` block (lines ~311-~342)

**Acceptance Criteria**:
- `grep -r "FileConfigStore\|saveProjectConfig" src/ bin/ tests/` returns 0 matches
- `store.test.ts` still exists and remaining tests pass

---

## T-14: Delete checkConfigComplete no-op and its call site

- [ ] In `src/config/schema/validation.ts`: delete the `checkConfigComplete` function (lines ~722-728), including its multi-line JSDoc comment (~707-721)
- [ ] In `src/core/preflight.ts`:
  - Remove the import of `checkConfigComplete` from `../config/schema.js`
  - Remove the call site and the surrounding if-block (lines ~52-59):
    ```typescript
    const incomplete = checkConfigComplete(config);
    if (incomplete) {
      throw new SpecRunnerError(...);
    }
    ```
- [ ] In `tests/unit/config/runtime-config.test.ts`:
  - Remove `checkConfigComplete` from the import at line 20
  - Delete the TC-041 describe block (lines ~334-355)
- [ ] In `tests/core/preflight.test.ts`:
  - Remove the `checkConfigComplete: vi.fn().mockReturnValue(null),` entry from the `vi.mock` factory (line ~13)

**Acceptance Criteria**:
- `grep -r "checkConfigComplete" src/ bin/ tests/` returns 0 matches
- `preflight.ts` compiles without the call; `preflight.test.ts` passes
- `tests/unit/config/runtime-config.test.ts` passes

---

## T-15: Un-export LEVEL_ORDER, delete logDebug and getLogLevel

- [ ] In `src/logger/stdout.ts`:
  - Change `export const LEVEL_ORDER: Record<LogLevel, number> = {` (line ~14) → `const LEVEL_ORDER: Record<LogLevel, number> = {` (remove `export`)
  - Delete the `getLogLevel` function (lines ~46-48) and its JSDoc
  - Delete the `logDebug` function (lines ~215-218) and its JSDoc
- [ ] In `tests/unit/logger/log-level.test.ts`:
  - Remove `logDebug` from the import (line ~17)
  - Delete TC-21, TC-22, TC-23 describe blocks (lines ~264-289, all three `logDebug` test blocks)
- [ ] In `src/cli/__tests__/job-show-detach-log.test.ts`: remove the `getLogLevel: vi.fn().mockReturnValue("default"),` entry from the `vi.mock` factory (line ~64)
- [ ] In `src/cli/__tests__/view-commands-worktree-guard.test.ts`: remove the `getLogLevel: vi.fn().mockReturnValue("default"),` entry from the `vi.mock` factory (line ~36)
- [ ] In `src/cli/__tests__/detach-output-contract.test.ts`: remove the `getLogLevel: vi.fn().mockReturnValue("default"),` entry from the `vi.mock` factory (line ~26)

**Acceptance Criteria**:
- `grep -r "\blogDebug\b\|\bgetLogLevel\b" src/ bin/ tests/` returns 0 matches
- `grep -r "\bexport.*LEVEL_ORDER\b\|\bLEVEL_ORDER\b" src/ bin/ tests/ --include='*.ts' | grep -v 'src/logger/stdout.ts'` returns 0 matches
- `LEVEL_ORDER` is present in `src/logger/stdout.ts` without `export` and used by `isLevelEnabled`
- `isLevelEnabled` behavior is unchanged (verified by existing tests that call it)
- Three CLI test files compile and pass

---

## T-16: Delete resolveXdgStateDir and its dedicated test

- [ ] In `src/util/xdg.ts`: delete the `resolveXdgStateDir` function (lines ~29-38, including its JSDoc comment)
- [ ] In `tests/unit/util/xdg.test.ts`:
  - Remove `resolveXdgStateDir` from the import (line ~13)
  - Delete the `beforeEach` and `afterEach` blocks (lines ~18-30) — they exist only to save/restore `XDG_STATE_HOME` for the `resolveXdgStateDir` tests
  - Delete the `describe("resolveXdgStateDir", ...)` block (lines ~32-47)
  - Keep the `getVerboseLogDir` and `getVerboseLogPath` describe blocks

**Acceptance Criteria**:
- `grep -r "resolveXdgStateDir\|XDG_STATE_HOME" src/ bin/ tests/` returns 0 matches
- `xdg.test.ts` still exists; TC-XDG-03 and TC-XDG-04 tests pass

---

## T-17: Delete draftPathLegacy and draftUsageJsonPath from util/paths.ts

- [ ] In `src/util/paths.ts`:
  - Delete `draftPathLegacy` function (lines ~178-184, including JSDoc)
  - Delete `draftUsageJsonPath` function (lines ~256-262, including JSDoc)
- [ ] In `tests/unit/util/paths.test.ts`:
  - Remove `draftPathLegacy` from the import (line 8)
  - Delete TC-PATHS-003 describe block (`draftPathLegacy()`, lines ~22-30)
- [ ] In `tests/util/paths.test.ts`:
  - Remove `draftUsageJsonPath` from the import (line 12)
  - Delete the `describe("draftUsageJsonPath", ...)` block (lines ~151-158)

**Acceptance Criteria**:
- `grep -r "draftPathLegacy\|draftUsageJsonPath" src/ bin/ tests/` returns 0 matches
- Both `paths.test.ts` files still exist and remaining tests pass
