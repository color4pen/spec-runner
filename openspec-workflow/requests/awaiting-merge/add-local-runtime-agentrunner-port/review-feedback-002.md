## Code Review Result

**Verdict**: approved
**Score**: 7.55 / 10.0 (pass threshold: 7.0)
**Iteration**: 2/2
**Trend**: improving (+0.70 from 6.85)

### Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 8 | 0.30 | 2.40 |
| security | 8 | 0.25 | 2.00 |
| architecture | 7 | 0.15 | 1.05 |
| performance | 7 | 0.10 | 0.70 |
| maintainability | 6 | 0.10 | 0.60 |
| testing | 8 | 0.10 | 0.80 |
| **Total** | | | **7.55** |

### Verification Summary

| Phase | Result |
|-------|--------|
| Build | PASS (tsc --noEmit clean) |
| Type Check | PASS (0 errors) |
| Lint | SKIP (no lint script) |
| Tests | PASS (803/803 via vitest, 100/100 files) |
| Security | PASS (npm audit: 0 vulnerabilities) |

Note: `bun test` reports failures because many tests use `vi.mocked` and other vitest APIs unavailable in bun. The canonical test runner is vitest (`npm test`), which passes 100%.

### Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | architecture | src/core/port/agent-runner.ts:48-64 | The `_updatedState` field remains an undocumented private extension on `AgentRunResult`. Iteration 1 finding #3 is partially addressed: `executor.ts:107-108` now has a comment explaining the pattern, but the port type still does not declare `_updatedState` and only the managed adapter writes it. Two divergent state-management strategies (managed: adapter-managed; local: executor-managed) coexist on the same port — readers of the port file have no signal that state propagation differs by adapter. | Add a documented optional `_updatedState?: JobState` (or `state?: JobState`) field to `AgentRunResult` with a comment explaining: "Populated by adapters that manage state internally (managed runtime). When absent, the executor manages state lifecycle." Long-term, lift state management out of ManagedAgentRunner so the port returns only runtime-neutral fields. |
| 2 | MEDIUM | maintainability | src/adapter/claude-code/agent-runner.ts:172-188, 251-274 | Iteration 1 finding #5 not addressed. `ClaudeCodeRunner.run()` still calls `step.buildMessage` and `step.resultFilePath` with three `undefined as any` casts (`client`, `githubClient`) and a hard-coded `repo: { owner: "", name: "" }`. Any step that reads `deps.client` / `deps.githubClient` / `deps.repo` will silently misbehave under local runtime. | Refactor `StepDeps` so `client`, `githubClient`, `repo` are explicitly optional; or introduce a `LocalStepDeps` discriminated union variant. At minimum, document the pre-condition on `ClaudeCodeRunner` that referenced steps must not read those fields. |
| 3 | MEDIUM | security | src/adapter/claude-code/agent-runner.ts:102-127 | Iteration 1 finding #7 not addressed. `buildAdditionalInstructions` interpolates `ctx.cwd`, `ctx.branch`, `ctx.slug` into the prompt verbatim. Current input sources (request.md slug parser, CLI-derived branch) are validated, so risk is low. Defense-in-depth concern. | Validate `branch` and `slug` against `^[a-zA-Z0-9._/-]+$` before interpolation; document the trust assumption on `ctx.cwd`. |
| 4 | MEDIUM | testing | bin/specrunner.ts:79-89 | Fix #4 (reject unknown `--runtime=` values) was implemented but no regression test was added. The fix could regress silently. | Add a unit test that invokes `bin/specrunner.ts main` with `args=["init", "--runtime=manage"]` and asserts `process.exit(2)` is called and stderr contains "Unknown --runtime value". Mirror the existing `bin/specrunner.ts` empty-args test (TC-062). |
| 5 | MEDIUM | testing | src/adapter/claude-code/agent-runner.ts:209-225 | Fix #6 (preserve `cause` and attach ENOENT hint) was implemented but no regression test verifies the hint is set when `code === "ENOENT"`. The error message conditional in lines 212-214 is also a no-op (both branches build the same string). | Add a test that injects a spawn function rejecting with `Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" })` and asserts the returned `error.hint` contains "claude CLI not found" and `error.cause.code === "ENOENT"`. Also remove the no-op conditional `isEnoent ? message : message`. |
| 6 | LOW | maintainability | src/core/step/executor.ts:118-172 | The new local-runtime fallback path duplicates the success-and-history-append pattern from `runCliStep` (lines 228-274). 50+ LOC of near-identical state lifecycle code now exists in two places. | Extract a shared helper `persistAgentStepResult(state, step, deps, result)` in `executor-helpers.ts` that performs the parseResult + pushStepResult + appendHistory + persist sequence. Call from both `runAgentStep` (local path) and `runCliStep`. |
| 7 | LOW | maintainability | src/cli/init.ts:181-201 | Iteration 1 finding #9 not addressed. `runInitLocal` reads `existingConfig` without explaining why preserving `agents` / `environment` matters. | Add a one-line comment: "Preserve agents/environment from a previous managed init so a user can switch back to managed without losing agent records." |
| 8 | LOW | maintainability | src/adapter/claude-code/agent-runner.ts:31-65 | Iteration 1 finding #8 not addressed. `runSubprocess` writes `opts.input` synchronously to stdin without backpressure handling. Acceptable for typical prompt sizes but flagged for future. | Use `child.stdin.end(opts.input, "utf-8")` for atomic write+end. |
| 9 | LOW | testing | tests/unit/adapter/claude-code/agent-runner-executor-integration.test.ts:9 | TC-146 number is reused — already exists in `tests/register-branch-schema.test.ts:11` and `openspec/changes/archive/2026-05-02-finish-redesign/test-cases.md:554`. Iteration 1 finding #10 documented this drift; iter 2 fix re-used a colliding number rather than allocating a fresh one (e.g. TC-200+). | Renumber the integration test to a non-conflicting ID (e.g. TC-200 or use slug-prefixed scheme `TC-LRA-001`); add to test-cases.md under a new "Integration boundary" section. |

### Scenario Coverage

- **must scenarios defined**: 42
- **must scenarios referenced in tests**: 42 (100%)
- **integration boundary covered**: YES (new tests/unit/adapter/claude-code/agent-runner-executor-integration.test.ts)
- **Scenario Coverage**: HIGH

The previous integration coverage gap is closed. The new test exercises:
1. Success path: ClaudeCodeRunner → StepExecutor → state.steps populated, state.history populated, verdict event emitted, state persisted to disk.
2. Error path: subprocess exit non-zero → completionReason="error" → executor records failed step, throws with attached state.

### Iteration Comparison

**Improvements** (from iter 1):

| # iter1 | Status | Change |
|---------|--------|--------|
| 1 (HIGH correctness) | RESOLVED | StepExecutor.runAgentStep now handles state lifecycle when adapter returns no `_updatedState` (executor.ts:118-172). Local runtime no longer silently drops state mutations. |
| 2 (HIGH testing) | RESOLVED | New `agent-runner-executor-integration.test.ts` adds 2 integration tests (TC-146) for success and error paths. Both pass. |
| 3 (MEDIUM architecture) | PARTIAL | Comments added at executor.ts:107-108 documenting `_updatedState` pattern. Port type still does not declare the field — see new finding #1. |
| 4 (MEDIUM correctness) | RESOLVED (untested) | bin/specrunner.ts now rejects unknown `--runtime=` values with exit code 2. No regression test — see new finding #4. |
| 6 (MEDIUM correctness) | RESOLVED (untested) | Subprocess error now preserves `cause` and attaches ENOENT hint. No regression test — see new finding #5. |

**Regressions**: NONE. No previously-passing behavior was broken.

**Unchanged Issues** (carried over from iter 1):

- #5 (MEDIUM maintainability): `undefined as any` casts still present → restated as new finding #2.
- #7 (MEDIUM security): branch/slug interpolation still unguarded → restated as new finding #3.
- #8 (LOW maintainability): stdin backpressure → restated as new finding #8.
- #9 (LOW maintainability): runInitLocal undocumented preservation → restated as new finding #7.
- #10 (LOW testing): TC numbering drift → restated as new finding #9 (and made worse by TC-146 collision).

### Convergence Trend

| Metric | Iter 1 | Iter 2 | Change |
|--------|--------|--------|--------|
| Total | 6.85 | 7.55 | **+0.70** (improving) |
| CRITICAL | 0 | 0 | — |
| HIGH | 2 | 0 | **-2** |
| MEDIUM | 5 | 5 | 0 |
| LOW | 3 | 4 | +1 (new #6 from duplication in executor.ts) |

Trend: **improving**. Both HIGH findings resolved; MEDIUM count unchanged because some iter 1 fixes carried unaddressed maintainability/security debt forward.

### Summary

- **HIGH findings cleared**: state-management gap on the local runtime path is fixed; integration boundary now has dedicated regression test (passes 100%).
- **Score crosses pass threshold**: 7.55 ≥ 7.0 with CRITICAL: 0, HIGH: 0 → verdict approved.
- **Carry-over MEDIUM findings**: the fixer chose minimum-viable patches for iter 1 fixes (Option b for state lifecycle, comment-only architecture documentation, untested fixes for #4/#6). These are appropriate for shipping but accumulate technical debt:
  - The `_updatedState` extension contract remains type-system-invisible.
  - Two state-management strategies coexist on the same port.
  - `undefined as any` casts in `ClaudeCodeRunner` mask the StepDeps type contract.
- **Recommended follow-up** (not blocking this PR): a small refactor to (a) declare `_updatedState` on `AgentRunResult` (or rename to `state?`), (b) introduce `LocalStepDeps` to eliminate the `as any` casts, (c) add the missing regression tests for fixes #4 and #6, (d) extract the shared persist-step-result helper between agent and CLI paths.
- Verification: 803/803 tests pass via vitest (the canonical runner). `bun test` reports failures because of vitest-specific API usage (`vi.mocked`, `vi.mock` hoisting), which is expected and not a regression.
