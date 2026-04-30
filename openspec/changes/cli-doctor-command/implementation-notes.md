## Status

- result: completed
- tasks_completed: 13 / 14 (task 13.2 README update skipped as it is marked optional in tasks.md; tasks 14.2-14.4 verified manually below)

## Files Modified

### New files
- `src/core/doctor/types.ts` — DoctorCheck / DoctorContext / DoctorResult / DoctorCategory / DoctorFs / DoctorConfig / DoctorGitHubClient / ExecFileFunction types
- `src/core/doctor/runner.ts` — runChecks() sequential executor with per-check throw catch
- `src/core/doctor/formatter.ts` — formatHuman() and formatJson()
- `src/core/doctor/index.ts` — re-export aggregator
- `src/core/doctor/checks/index.ts` — allChecks: DoctorCheck[] (19 checks)
- `src/core/doctor/checks/runtime/node.ts` — node-version check
- `src/core/doctor/checks/runtime/bun.ts` — bun-version check
- `src/core/doctor/checks/runtime/git.ts` — git-version check
- `src/core/doctor/checks/runtime/openspec.ts` — openspec-available check (30s timeout)
- `src/core/doctor/checks/config/file-exists.ts` — config-file-exists check
- `src/core/doctor/checks/config/anthropic-key-present.ts` — anthropic-key-present check
- `src/core/doctor/checks/config/github-token-present.ts` — github-token-present check
- `src/core/doctor/checks/env/github-client-id.ts` — github-client-id check
- `src/core/doctor/checks/auth/anthropic-key-valid.ts` — anthropic-key-valid check (5s timeout)
- `src/core/doctor/checks/auth/github-token-valid.ts` — github-token-valid check (port-only)
- `src/core/doctor/checks/repo/git-repository.ts` — git-repository check
- `src/core/doctor/checks/repo/github-origin.ts` — github-origin check
- `src/core/doctor/checks/repo/openspec-project-md.ts` — openspec-project-md check
- `src/core/doctor/checks/repo/workflow-structure.ts` — workflow-structure check
- `src/core/doctor/checks/agents/agents-registered.ts` — agents-registered check
- `src/core/doctor/checks/agents/environment-registered.ts` — environment-registered check
- `src/core/doctor/checks/agents/definition-drift.ts` — agent-definition-drift check (reuses AgentRegistry)
- `src/core/doctor/checks/storage/jobs-writable.ts` — jobs-writable check
- `src/core/doctor/checks/storage/old-state-files.ts` — old-state-files check
- `src/cli/doctor.ts` — runDoctor() CLI entry point

### Modified files
- `bin/specrunner.ts` — added doctor case, USAGE update, import runDoctor
- `src/core/port/github-client.ts` — added verifyTokenScopes() method to interface
- `src/adapter/github/github-client.ts` — implemented verifyTokenScopes() in GitHubApiClient

### Test files (new)
- `tests/core/doctor/mock-context.ts` — shared mock helpers
- `tests/core/doctor/runner.test.ts` — TC-055, TC-056, TC-080
- `tests/core/doctor/formatter.test.ts` — TC-048 to TC-051, TC-057, TC-058, TC-067, TC-077, TC-078
- `tests/core/doctor/doctor-cli.test.ts` — TC-043 to TC-047, TC-052 to TC-054
- `tests/core/doctor/checks/all-checks.test.ts` — TC-068, TC-076
- `tests/core/doctor/checks/runtime/node.test.ts` — TC-001, TC-002, TC-069, TC-070
- `tests/core/doctor/checks/runtime/bun.test.ts` — TC-003, TC-004
- `tests/core/doctor/checks/runtime/git.test.ts` — TC-005, TC-006
- `tests/core/doctor/checks/runtime/openspec.test.ts` — TC-007, TC-008
- `tests/core/doctor/checks/config/file-exists.test.ts` — TC-009, TC-010, TC-011, TC-071
- `tests/core/doctor/checks/config/anthropic-key-present.test.ts` — TC-012, TC-013
- `tests/core/doctor/checks/config/github-token-present.test.ts` — TC-014, TC-015
- `tests/core/doctor/checks/env/github-client-id.test.ts` — TC-016, TC-017
- `tests/core/doctor/checks/auth/anthropic-key-valid.test.ts` — TC-018 to TC-021, TC-064
- `tests/core/doctor/checks/auth/github-token-valid.test.ts` — TC-022 to TC-024, TC-065
- `tests/core/doctor/checks/repo/git-repository.test.ts` — TC-025, TC-026
- `tests/core/doctor/checks/repo/github-origin.test.ts` — TC-027, TC-028, TC-063
- `tests/core/doctor/checks/repo/openspec-project-md.test.ts` — TC-029, TC-030
- `tests/core/doctor/checks/repo/workflow-structure.test.ts` — TC-031, TC-032
- `tests/core/doctor/checks/agents/agents-registered.test.ts` — TC-033, TC-034
- `tests/core/doctor/checks/agents/environment-registered.test.ts` — TC-035, TC-036
- `tests/core/doctor/checks/agents/definition-drift.test.ts` — TC-037, TC-038, TC-079
- `tests/core/doctor/checks/storage/jobs-writable.test.ts` — TC-039 to TC-042
- `tests/core/doctor/checks/storage/old-state-files.test.ts` — TC-059, TC-060

### Modified test files (regression fix for verifyTokenScopes port extension)
- `tests/pipeline.test.ts`
- `tests/spec-review-step.test.ts`
- `tests/cli-stdout-snapshot.test.ts`
- `tests/pipeline-integration.test.ts`
- `tests/error-codes.test.ts`
- `tests/core/pipeline/pipeline.test.ts`
- `tests/core/step/step-interface.test.ts`
- `tests/core/steps/spec-review.test.ts`
- `tests/unit/core/pipeline/pipeline.transitions.test.ts`
- `tests/unit/core/step/types.test.ts`
- `tests/unit/step/build-fixer.test.ts`
- `tests/unit/step/code-fixer.test.ts`
- `tests/unit/step/code-review.test.ts`
- `tests/unit/step/executor.test.ts`
- `tests/unit/step/implementer.test.ts`
- `tests/unit/step/pr-create.test.ts`
- `tests/unit/step/review-exit-contract.test.ts`
- `tests/unit/step/verification.test.ts`

## Blocked Tasks

None. All required tasks completed.

## Manual Acceptance (TC-072, TC-073, TC-074)

- `bun bin/specrunner.ts doctor` — executed successfully on real environment. 16 pass, 3 warn, 0 fail. All 7 categories shown.
- `bun bin/specrunner.ts doctor --json | python3 -c "..."` — valid JSON confirmed. summary.pass=16, summary.warn=3, summary.fail=0, 19 results.
- `bun bin/specrunner.ts --help` — output contains "doctor" with "Diagnose environment / config / auth prerequisites".

## Test Summary

- Original: 533 tests (all passing, regression 0)
- New doctor tests: 83 tests
- Total: 616 tests passing
- Build: `bun run build` exits 0 (no TypeScript errors)

## Notes

- allChecks has 19 checks (not 18) because storage category has 2 checks: jobs-writable + old-state-files. The proposal.md mentioned "18 kinds" but design.md D8 defines two separate storage checks.
- ADR file creation is deferred to Step 7 adr-create skill per design.md D5 and tasks.md T-13.1.
- DoctorContext.homeDir is injected for test isolation (avoids real $HOME dependency in unit tests).

## Fix History (iter 1 — code-fixer)

### Fixed findings from review-feedback-001.md

| Finding | Severity | Files Modified | Summary |
|---------|----------|---------------|---------|
| #1 | HIGH | `bin/specrunner.ts`, `tests/core/doctor/doctor-cli.test.ts` | Split `--help`/`-h` (stdout + exit 0) from empty-args (stderr + exit 2). Exported `main()` and guarded auto-invoke with `VITEST` env check. Added TC-062 and TC-063/TC-063b behavioral tests |
| #2 | MEDIUM | `src/core/doctor/types.ts`, `src/cli/doctor.ts`, `src/core/doctor/checks/runtime/node.ts`, `src/core/doctor/checks/config/file-exists.ts`, `tests/core/doctor/mock-context.ts`, `tests/core/doctor/checks/runtime/node.test.ts`, `tests/core/doctor/checks/config/file-exists.test.ts` | Added `processVersion: string` and `platform: NodeJS.Platform` to `DoctorContext`. Populated from `process.version`/`process.platform` in `src/cli/doctor.ts`. Removed all direct `process.*` references from check files |
| #3 | MEDIUM | `src/core/doctor/checks/agents/definition-drift.ts` | Removed `let _registry` module-level mutable cache. Replaced `getRegistry()` with `buildRegistry()` called per `check()` invocation |
| #4 | MEDIUM | `openspec/changes/test-slug/pr-create-result.md` (deleted) | Removed stray test execution artifact |
| #5 | LOW | `src/core/doctor/types.ts` | Removed dead `DoctorAnthropicClient` empty interface |
| #6 | LOW | `src/core/doctor/types.ts` | Removed unused `import type * as nodeFsPromises` |
| #7 | LOW | `src/core/doctor/checks/runtime/openspec.ts` | Removed redundant `timeout: OPENSPEC_TIMEOUT_MS` from `execFile` options; `signal: controller.signal` is the single timeout source |
| #8 | LOW | `tests/core/doctor/checks/agents/definition-drift.test.ts` | Replaced tautology TC-079 (import-only) with behavioral spy asserting `AgentRegistry.prototype.hashOf` is called during check execution |
| #9 | LOW | `openspec/changes/cli-doctor-command/proposal.md` | Updated ADR filename from `{NNN}-external-dependency-policy.md` to `ADR-20260430-external-dependency-policy.md` |
| #10 | LOW | Covered by #1 fix | TC-062/TC-063 behavioral tests added alongside #1 fix |
