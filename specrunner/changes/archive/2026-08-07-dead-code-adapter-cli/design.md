# Design: dead-code-adapter-cli

## Context

Codebase audit confirmed dead code across adapter, CLI, config, and logger areas. All deletion targets have been pre-verified: production callers = 0, with some items having only dedicated tests or test-only references. This change removes those items cleanly.

Three categories of work:

1. **Pure deletion** — functions/fields with zero callers anywhere (e.g., `deleteSession`, `REPORT_TOOL_CUSTOM_TOOL_SPEC`, `MANAGED_RESET_USAGE`, `formatAge`, `truncate`, `resolveXdgStateDir`, `draftPathLegacy`, `draftUsageJsonPath`).
2. **Deletion with test cleanup** — symbols that only appear in dedicated tests; tests deleted alongside (e.g., `session-runner.ts`, `isResultMessage`, `isTextDelta`, `assertBreakAfterCompletion`, `checkConfigComplete`, `logDebug`, `FileConfigStore`, `saveProjectConfig`).
3. **Deletion with importer repointing** — re-export shims whose importers need to point to the canonical source (e.g., `git-exec.ts`, `transient-error.ts`, `session-log-writer.ts` shimmed files).

All pre-verified assertions are documented in the request-review attestation. No new behaviors are introduced.

## Goals / Non-Goals

**Goals**:
- Delete verified dead code across adapter / CLI / config / logger areas
- Remove dedicated tests for deleted symbols
- Trim shared tests to remove assertions for deleted symbols only
- Repoint shim importers (agent-runner, tests) to canonical shared/util paths, then delete shims
- Move `REPORT_TOOL` from production code to test-local fixture in codex tests

**Non-Goals**:
- `wireProgressDisplay` — production-used in run/resume/reopen
- `VerificationCommand` type — production-used in verification commands/runner
- `specFixer` config field and `src/config/migrate.ts` legacy migration — published npm format, needs separate compatibility review
- Adapter repair-loop integration — has behavioral differences, separate request
- Core dead code — separate request
- Any new replacement implementations (recovery via git history)

## Decisions

**D1: Delete-only policy — no replacement implementations.**
Rationale: all items are confirmed dead; git history serves as recovery. Alternative (keep with additional @deprecated comment) rejected — comments don't reduce maintenance load.

**D2: `REPORT_TOOL` fixture moves to the test files that use it, not kept in production code for test convenience.**
Rationale: production code must not be maintained for test import convenience. Each codex test file defines a local `REPORT_TOOL_FIXTURE` constant of the same shape (`ReportToolSpec<BaseReportResult>` without zod dependency on the live schema — a minimal stub matching the tests' actual needs). Alternative (keep `REPORT_TOOL` with `@deprecated`) rejected by architect.

**D3: Re-export shims deleted after repointing importers.**
Rationale: two-hop import paths (`agent-runner.ts → transient-error.ts → shared/transient-error.ts`) add indirection with no value. Repointing directly to `../shared/transient-error.js`, `../shared/session-log-writer.js`, `../../util/git-exec.js` reduces the chain to one hop. Alternative (keep shims) rejected by architect.

**D4: `LEVEL_ORDER` is un-exported, not deleted.**
Rationale: `isLevelEnabled` uses `LEVEL_ORDER` internally on every call. Deleting it would require inlining magic numbers. Un-exporting converts it to a module-private const with no external interface change. Alternative (inline the numbers) rejected — readability cost not justified.

**D5: Archive `--dry-run` removed as a unit (flag + parse + field + help text). Inbox and prune `--dry-run` untouched.**
Rationale: `RunArchiveOptions.dryRun` has zero read-sites in `runArchive`; the help string itself says "Reserved for future use." Inbox `--dry-run` is consumed by `runInboxRun` and is live. Prune's dry-run concept is separate. Alternative (keep "for future use") rejected — the flag misleads users about behavior.

## Risks / Trade-offs

[Risk] Dynamic import in `tests/unit/remove-session-timeout.test.ts:104` uses `await import("...session-runner.js")` — TypeScript type-check cannot catch this. Mitigation: acceptance criterion requires grep-0 for all deleted symbol names, including string literals and comments.

[Risk] Codex test fixtures for `REPORT_TOOL` will be local copies that could diverge from the actual report-tool schema over time. Mitigation: codex tests use the fixture only as a stub for `policy.reportTool`; they don't validate report-tool schema correctness. The live schema is tested separately.

[Risk] After removing `_spawnFn`/`spawnFn` from `ClaudeCodeRunner`, tests that injected `_spawnFn: spawnFn` will have dead `makeGitSimulatingSpawnFn` helper code in `agent-runner.test.ts`. Mitigation: the helper and its call sites are removed together.

## Open Questions

None — all design decisions pre-confirmed in architect evaluation attached to the request.
