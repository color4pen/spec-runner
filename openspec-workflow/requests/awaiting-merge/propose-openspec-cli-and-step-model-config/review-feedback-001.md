## Code Review Result

**Verdict**: approved
**Score**: 8.45 / 10.0 (pass threshold: 7.0)
**Iteration**: 1/2
**Trend**: — (初回)

### Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 9 | 0.30 | 2.70 |
| security | 9 | 0.25 | 2.25 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **8.45** |

### Verification Summary

| Phase | Result |
|-------|--------|
| Build | N/A (no build step configured) |
| Type Check | PASS (0 errors) |
| Lint | N/A |
| Tests | PASS (118/118 branch-modified tests pass; 80 pre-existing failures unrelated to this branch) |
| Security | PASS (no new security concerns) |

### Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | architecture | src/adapter/claude-code/agent-runner.ts:89-105 | `buildMessage` and `resultFilePath` are called with `client: undefined as any` and `githubClient: undefined as any` in `StepDeps`. This is a pre-existing issue (documented in constraints.md as a known debt) but the `step.maxTurns` change relies on the same pattern -- if a future step's `buildMessage` accesses `client` or `githubClient`, it will crash at runtime. | Tracked as pre-existing debt. No action required for this PR. Future request should introduce `LocalStepDeps` discriminated union per constraints.md guidance. |
| 2 | MEDIUM | maintainability | src/prompts/propose-system.ts:46-75 | The openspec CLI workflow section uses `npx openspec` throughout, but `buildAdditionalInstructions` in agent-runner.ts does not reference `npx` -- it only adds runtime context. The system prompt and the runtime instructions are consistent, but the `npx` vs `node_modules/.bin/openspec` decision is left implicit. The prompt says "PATH に存在しない場合は npx openspec を使用してください" but doesn't specify which is the default path. | Acceptable for now. The spec-fixer decided this is scope-external (decisions/spec-fixer.md). Consider making the default explicit in a follow-up. |
| 3 | MEDIUM | testing | tests/unit/adapter/claude-code/agent-runner.test.ts:65-82 | The `makeAgentStep` helper uses `model: "claude-sonnet-4-5"` as its default fixture value. While this is intentionally a fixture-only value (not asserting production step values), it references the old model name. The implementation-notes.md explicitly documents this decision ("Test fixtures that use 'claude-sonnet-4-5' as fixture data were left unchanged"). | No change required. The fixture value is semantically neutral -- it's mock data, not a production assertion. Using `"test-model"` would improve clarity but is LOW priority. |
| 4 | LOW | maintainability | src/core/step/types.ts:91-96 | The JSDoc for `maxTurns` references "Design D3 (propose-openspec-cli-and-step-model-config)" which is a change-specific reference. After archive, this reference becomes stale. | Replace with a generic description: "per-step maxTurns configuration for SDK query() call". The design context is preserved in the archived change folder. |
| 5 | LOW | maintainability | src/core/step/*.ts | Each step file has a comment `// Design D3 (propose-openspec-cli-and-step-model-config).` next to `maxTurns`. Same staleness concern as #4. | Remove change-slug references from production code comments after merge. |

### Iteration Comparison

(iteration 1 のため該当なし)

### Improvements
- （初回）

### Regressions
- （初回）

### Unchanged Issues
- （初回）

### Scenario Coverage (test-cases.md)

| TC | Priority | Type | Status | Notes |
|----|----------|------|--------|-------|
| TC-001 | must | unit | implemented | step-model-maxturn-config.test.ts |
| TC-002 | must | unit | implemented | agent-runner.test.ts |
| TC-003 | must | unit | implemented | agent-runner.test.ts |
| TC-004 | must | unit | implemented | step-model-maxturn-config.test.ts |
| TC-005 | must | unit | implemented | step-model-maxturn-config.test.ts |
| TC-006 | must | unit | implemented | step-model-maxturn-config.test.ts |
| TC-007 | must | unit | implemented | propose-system.test.ts |
| TC-008 | must | unit | implemented | propose-system.test.ts |
| TC-009 | must | unit | implemented | propose-system.test.ts |
| TC-010 | must | unit | implemented | propose-system.test.ts |
| TC-011 | must | unit | implemented | propose-system.test.ts |
| TC-012 | must | unit | implemented | propose-system.test.ts |
| TC-013 | must | manual | not-automated | Requires live propose agent run |
| TC-014 | must | manual | not-automated | Requires live propose agent run |

must automated: 12/12 implemented (100%)
must manual: 2 (deferred to live validation)
must total coverage: 12/14 automated = 85.7%

### Summary

The implementation is clean, well-structured, and faithfully follows the request.md requirements and design.md decisions.

**Correctness (9/10)**: All three objectives are correctly implemented: (1) `PROPOSE_SYSTEM_PROMPT` now contains the full openspec CLI workflow with explicit non-omission rules, (2) model constants follow the opusplan pattern exactly as specified, (3) `maxTurns` is properly threaded from `AgentStep` interface through `ClaudeCodeRunner` to `query()` with the correct `?? 30` fallback. The `buildInitialMessage` signature and behavior are preserved per design D4.

**Security (9/10)**: The existing security guards (path-fence, user-request XML tagging, prompt injection protection) are maintained in the rewritten system prompt. The `<user-request>` boundary and the "user-request override" clause in the initial message template are intact. No new attack surface introduced.

**Architecture (8/10)**: The changes are minimal and surgical. Each step file owns its model and maxTurns as constants -- consistent with the existing Design D1 (step owns its AgentDefinition). The `maxTurns ?? 30` pattern in ClaudeCodeRunner is clean. The pre-existing `undefined as any` debt in `StepDeps` construction is noted but not worsened.

**Performance (8/10)**: No performance concerns. The model changes (Opus for design/review, Sonnet for implementation/fixing) follow the opusplan consensus. The maxTurns values are reasonable for each step's workload.

**Maintainability (8/10)**: Code is readable and well-commented. Minor concern: change-slug references in production JSDoc comments will become stale after archive. The system prompt rewrite is comprehensive and well-organized with clear sections.

**Testing (7/10)**: All 12 automated must test cases are implemented and passing. The new `step-model-maxturn-config.test.ts` provides thorough coverage of model and maxTurns values across all 7 steps. The `agent-runner.test.ts` additions verify the maxTurns passthrough correctly. TC-013/TC-014 (manual) require live propose agent runs and cannot be automated. The test fixture using old model name (`claude-sonnet-4-5`) is intentional and documented. Score reflects the 2 must manual TCs that remain unverified.
