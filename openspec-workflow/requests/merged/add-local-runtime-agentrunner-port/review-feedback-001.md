## Code Review Result

**Verdict**: needs-fix
**Score**: 6.85 / 10.0 (pass threshold: 7.0)
**Iteration**: 1/2
**Trend**: — (initial)

### Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 6 | 0.30 | 1.80 |
| security | 8 | 0.25 | 2.00 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 7 | 0.10 | 0.70 |
| maintainability | 6 | 0.10 | 0.60 |
| testing | 5.5 | 0.10 | 0.55 |
| **Total** | | | **6.85** |

### Verification Summary

| Phase | Result |
|-------|--------|
| Build | PASS |
| Type Check | PASS (0 errors) |
| Lint | SKIP (no lint script) |
| Tests | PASS (801/801) |
| Security | PASS (0 vulnerabilities) |

### Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | correctness | src/adapter/claude-code/agent-runner.ts:289-293 / src/core/step/executor.ts:108-118 | `ClaudeCodeRunner.run()` returns only `{ completionReason, resultContent }` and never attaches `_updatedState`. The `StepExecutor.runAgentStep` reads `_updatedState` and falls through to the "should not happen in production" branch, returning `jobState` unchanged. Local runtime cannot persist any state mutations from agent steps (history append, session, step results, branch). Pipeline state machine will not advance correctly under `runtime: "local"`. | Make state-management a first-class part of the AgentRunner contract: either (a) lift JobStateStore handling into StepExecutor (so ClaudeCodeRunner does not need to manage state), or (b) have ClaudeCodeRunner perform the same `JobStateStore.appendHistory / pushStepResult / persist` calls and attach `_updatedState`. Option (a) is preferred — eliminates the brittle `_updatedState` extension contract entirely (see #3). |
| 2 | HIGH | testing | tests/unit/adapter/claude-code/agent-runner.test.ts | No test exercises ClaudeCodeRunner via the StepExecutor / runPipeline path. The state-update gap above passes all 42 must scenarios because each must TC isolates either the runner or the executor with a fully-mocked `_updatedState`-aware fake. Scenario coverage HIGH but Test Suite reliability LOW for the integration boundary. | Add an integration test: instantiate `runPipeline` with `runtime: "local"` + a real (or simulated) `StepExecutor` + mocked `ClaudeCodeRunner.spawnFn`, drive a polling-style step (e.g. spec-review), assert that `state.steps["spec-review"]` and `state.history` are populated after the run. This catches regressions in adapter↔executor wiring. |
| 3 | MEDIUM | architecture | src/core/step/executor.ts:106-118, src/adapter/managed-agent/agent-runner.ts:351-352, 670-671 | The `_updatedState` field is an undocumented private extension on `AgentRunResult`. The port interface (`src/core/port/agent-runner.ts:48`) declares no such field; only the managed adapter writes it, only the executor reads it. ClaudeCodeRunner silently does not emit it (see #1). The contract is invisible to the type system and to anyone reading `AgentRunner`. | Either (a) move JobStateStore lifecycle into StepExecutor and remove `_updatedState` entirely (preferred — restores the port abstraction), or (b) add a documented optional `state?: JobState` field to `AgentRunResult` with a comment explaining the contract, and require both adapters to emit it consistently. |
| 4 | MEDIUM | correctness | bin/specrunner.ts:79-82 | `--runtime=foo` parses with `as "managed" \| "local"` and silently coerces to managed for any non-"local" value. `--runtime=manage` (typo) silently runs managed with no error. This violates fail-fast for an unrecognized flag. | Reject runtime values not in `{"managed", "local"}` at the bin/ argv parser with `process.stderr.write("Unknown --runtime value...") / process.exit(2)`. Mirrors the existing unknown-flag handling in the `finish` subcommand (bin/specrunner.ts:139-151). |
| 5 | MEDIUM | maintainability | src/adapter/claude-code/agent-runner.ts:172-188, 251-267 | `ClaudeCodeRunner.run()` calls `step.buildMessage` and `step.resultFilePath` with three `undefined as any` casts (`client`, `githubClient`) and a hard-coded `repo: { owner: "", name: "" }`. This relies on the implementation detail that propose / spec-review / etc. happen not to use these fields. Any step that reads `deps.client` / `deps.githubClient` / `deps.repo` will silently misbehave under local runtime. | Refactor `StepDeps` so that `client`, `githubClient`, `repo` are explicitly optional (already optional in `PipelineDeps`); update steps that genuinely need them to type-guard. Or introduce a `LocalStepDeps` variant and have `buildMessage` / `resultFilePath` accept a discriminated union. At minimum, document the pre-condition on `ClaudeCodeRunner` that referenced steps must not read those fields. |
| 6 | MEDIUM | correctness | src/adapter/claude-code/agent-runner.ts:60-64 | When `child.on("error", reject)` fires, `child.stdin?.end()` has already been called below (line 63) — fine — but `runSubprocess` rejects with the system error string (e.g. "ENOENT spawn claude"). The runner then wraps it as `CLAUDE_CODE_SUBPROCESS_FAILED`, swallowing the underlying error code. A user hitting "claude not in PATH" sees a generic failure. | Preserve and surface the original error code/cause: `error: Object.assign(new Error(...), { code: "CLAUDE_CODE_SUBPROCESS_FAILED", cause: err })`. Add a hint when `(err as NodeJS.ErrnoException).code === "ENOENT"`: "claude CLI not found. Set CLAUDE_BIN or install @anthropic-ai/claude-code". |
| 7 | MEDIUM | security | src/adapter/claude-code/agent-runner.ts:102-127 | `buildAdditionalInstructions` interpolates `ctx.cwd`, `ctx.branch`, `ctx.slug` into the prompt verbatim. If any of those values originate from untrusted input (currently they come from CLI/internal slug derivation, so risk is low), an attacker-controlled slug could inject "; rm -rf /" or false instructions. Defense-in-depth concern. | Validate `branch`, `slug` against `^[a-zA-Z0-9._/-]+$` (or the existing `stripBranchPrefix` invariant) before interpolation, and reject invalid values with a clear error. Document the trust assumption on `ctx.cwd`. |
| 8 | LOW | maintainability | src/adapter/claude-code/agent-runner.ts:34-65 | `runSubprocess` writes `opts.input` synchronously to stdin without backpressure handling. For typical step prompts (~10 KB) this is fine, but a large prompt (e.g. very long requestContent) might block. | Use `child.stdin.write(...)` + handle the `drain` event, or simply call `child.stdin.end(opts.input, "utf-8")` which performs an atomic write+end. |
| 9 | LOW | maintainability | src/cli/init.ts:181-201 | `runInitLocal` reads `existingConfig` even though it does not need any of its fields (managed `agents` / `environment` are not relevant for local runtime; preserving them is intentional but undocumented). | Add a comment: "Preserve agents/environment from a previous managed init so a user can switch back to managed without losing agent records." |
| 10 | LOW | testing | (general) | 80 distinct TC IDs in tests vs 64 defined in test-cases.md — many TC numbers in tests do not appear in test-cases.md (e.g. tests reference TC-127, TC-128, TC-146 from earlier requests). Indicates TC numbering drift across requests; not blocking but reduces traceability. | Establish a per-request TC numbering convention (e.g. prefix with slug short-hash) or reset numbering per request and grep for cross-request collisions. Out of scope for this PR. |

### Scenario Coverage

- **must scenarios defined**: 42
- **must scenarios referenced in tests**: 42 (100%)
- **Scenario Coverage**: HIGH

Scenario Coverage is HIGH but does not compensate for the missing **integration boundary** test (#1, #2). The must scenarios are well-written for unit-level invariants of each component in isolation, but they do not assert that the components compose correctly at the executor↔runner boundary.

### Iteration Comparison

(Initial iteration — no prior feedback to compare.)

### Summary

- High-severity gap: **state mutations from local-runtime agent runs are silently dropped** because `ClaudeCodeRunner.run()` does not emit the undocumented `_updatedState` extension that `StepExecutor` requires. This is a structural defect in the port abstraction (`_updatedState` is invisible to the type system) and a coverage gap (no integration test exercises the runner↔executor boundary).
- Architecture is otherwise clean: module-boundary invariant holds (`grep @anthropic-ai/sdk src/adapter/claude-code/` returns 0 lines of import statements), executor.ts has been correctly stripped of session-protocol logic, and the port file is well-documented.
- Recommended fix path: lift `JobStateStore` lifecycle into `StepExecutor` so the port returns only the runtime-neutral fields declared on `AgentRunResult`. This eliminates the `_updatedState` hack, removes the `undefined as any` casts in `ClaudeCodeRunner` (StepDeps no longer flows through the runner), and makes the local-runtime regression test trivial to write.
- Total weighted score 6.85 falls below the 7.0 threshold primarily on `correctness` (HIGH bug) and `testing` (missing integration test). With the HIGH findings resolved, the score is expected to clear 7.0 on the next iteration.
