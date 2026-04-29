# Code Review Result — Step 抽象化 + Pipeline 状態機械 (iter 1)

**Verdict**: needs-fix
**Score**: 5.95 / 10.00 (pass threshold: 7.0)
**Iteration**: 1/2
**Trend**: — (initial)

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 6 | 0.30 | 1.80 |
| security | 7 | 0.25 | 1.75 |
| architecture | 4 | 0.15 | 0.60 |
| performance | 7 | 0.10 | 0.70 |
| maintainability | 5 | 0.10 | 0.50 |
| testing | 6 | 0.10 | 0.60 |
| **Total** | | | **5.95** |

## Verification Summary

| Phase | Result |
|-------|--------|
| Build (tsc --noEmit false) | PASS |
| Type Check (tsc --noEmit) | PASS (0 errors) |
| Lint | N/A (no lint script in package.json) |
| Tests (vitest) | PASS (214/214, 30 files) |
| Module Boundary (grep @anthropic-ai/sdk in core/store) | PASS for direct SDK; **FAIL via src/sdk/ indirect re-export** |

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | architecture | src/core/pipeline.ts:88-454 | `runProposeStepLegacy` is ~370 LOC of inline propose-step logic kept "for backward compat with `runProposePipeline`". This duplicates the entire propose lifecycle that StepExecutor.runProposeStyleStep already implements (892 LOC executor.ts), violating the request's central goal of eliminating 45-55 LOC × 3 step coypaste. After this refactor the propose lifecycle exists in TWO places. | Delete `runProposeStepLegacy` and `runProposePipeline`. Migrate the few tests that still import it (verify with `grep -rn "runProposePipeline" tests/`) to call `runPipeline` and rely on Pipeline class error semantics. The only divergence cited (re-throw vs wrap) is a test-coupling concern, not a behavior contract — fix the tests or the executor's error wrapping, not by maintaining a parallel implementation. |
| 2 | HIGH | architecture | src/core/pipeline.ts vs src/core/pipeline/pipeline.ts | Two `pipeline.ts` files coexist — the legacy facade at `src/core/pipeline.ts` (454 LOC) and the new class at `src/core/pipeline/pipeline.ts` (373 LOC). The directory pattern from request requirement #15 (`core/pipeline/` for Pipeline class + Transition table) is violated by keeping a sibling file with the same base name. | Move `runPipeline` (the thin wrapper at lines 41-66) into `src/core/pipeline/index.ts`, delete `src/core/pipeline.ts` entirely, and update CLI import path. After deletion, `src/core/pipeline/` is the single source of truth as the directory-style ADR D7 prescribes. |
| 3 | HIGH | architecture | src/core/pipeline/pipeline.ts:79-131 | Pipeline.runInternal() ignores the `transitions` table. It is hardcoded to "Phase 1 = run startStep (propose), Phase 2 = spec-review loop". `STANDARD_TRANSITIONS` (pipeline/types.ts:19-27) is defined and stored in the constructor but never read by `runInternal` or `runSpecReviewLoop`. The acceptance criterion "Pipeline class + transition table で pipeline.ts の inline if が置換されている" is not met — the inline if was replaced by inline phase logic. | Drive the state machine from `this.transitions`: at each step's verdict, look up the next destination from the table (`transitions.find(t => t.step === current && t.on === verdict)?.to`). The loop guard tracks (current, iter) where current ∈ {spec-review, spec-fixer}. This is a 30-50 LOC change inside Pipeline.runInternal and removes runSpecReviewLoop / runSpecFixerPhase / runSpecReviewStep helpers that re-encode transitions in code. |
| 4 | HIGH | architecture | src/state/schema.ts:97 | `JobState.steps?: Record<string, StepResult[] \| StepRun[]>` keeps both shapes simultaneously, contradicting request requirement #2 ("`JobState.steps` schema を `Record<StepName, StepRun[]>` に変更する"). The acceptance criterion "JobStateStore class + StepRun[] schema が実装されている" is partially met: the class exists, but the canonical write path (`pushStepResult` in src/state/helpers.ts:53) still produces `StepResult` (legacy iteration field), not `StepRun` (attempt + outcome + startedAt/endedAt). New state files written by Pipeline.run will be in legacy StepResult shape. | Migrate `pushStepResult` to write `StepRun` (or remove pushStepResult and have StepExecutor call `JobStateStore.appendStepRun` directly). Tighten `JobState.steps` to `Record<StepName, StepRun[]>` and rely on JobStateStore.load() to normalize legacy reads. The current `StepResult \| StepRun` union forces every consumer (helpers.ts toLegacyStepResult, pipeline.ts handleExhausted, run.ts outputSpecReviewVerdict) to do shape detection — it is the union itself that must die. |
| 5 | HIGH | architecture | src/core/{pipeline,session,completion,step/spec-review}.ts | Core layer imports `../sdk/sessions.js` (4 sites). `src/sdk/sessions.ts` re-exports SDK types directly from `@anthropic-ai/sdk/resources/...`, so `src/sdk/` is an SDK adapter living outside `src/adapter/`. The request requirement #17 says "core 層から `@anthropic-ai/sdk` を import しない（adapter/anthropic 経由のみ）" — the spirit is "no transitive SDK dep in core", not just "no direct import". Task 7.7's grep covers only direct `from "@anthropic-ai/sdk"` and missed this. | Either (a) move `src/sdk/` into `src/adapter/anthropic/sdk/` and update the four core import sites to use the SessionClient port instead, or (b) have `AnthropicSessionClient` absorb all four call sites. Option (b) is cleaner: legacy pipeline.ts already uses `client as any` to call createSession; replace that with `client.createSession(...)` via the port. Then delete `src/sdk/` from core's reachable graph. |
| 6 | HIGH | maintainability | src/core/pipeline.ts:93, src/core/session.ts:88, src/core/step/spec-review.ts:162 | Three `as any` casts on `deps.client` to call SDK wrappers. Each cast strips the SessionClient port type and lets arbitrary SDK shape pass through. These exist only because legacy code paths refused to migrate (#1 + #5). | Remove all three by deleting `runProposeStepLegacy`, `runSpecReviewStep` (legacy), and the body in core/session.ts that calls SDK directly. After #1 and #5 are fixed, the `as any` should not be reachable. |
| 7 | MEDIUM | architecture | src/core/step/executor.ts (892 LOC) | StepExecutor swallowed all the lifecycle code (createSession + sendUserMessage + pollUntilComplete + streamEvents + verify branch + verify change folder + legacy fetch path + port path) into one class. The "thin Step + thick Executor" pattern is fine in principle, but the dispatch is `if (step.toolHandlers && step.toolHandlers.size > 0)` (line 84) — the runtime branch between propose-style and polling-style is determined by tool presence rather than declaration. SpecFixerStep declares `toolHandlers: undefined` purely to land on the polling branch. | Promote the propose-style/polling-style choice to an explicit Step field (e.g., `lifecycle: "sse" \| "poll"`), or split StepExecutor into two strategies (SseStepRunner / PollingStepRunner) selected by the executor. Either approach makes the contract explicit and lets a step declare its lifecycle without abusing tool presence as a flag. |
| 8 | MEDIUM | architecture | src/core/step/executor.ts:432 (`githubClient.verifyPath ? ... : ...`) | The executor probes the runtime adapter for an optional `verifyPath` method that is not on the GitHubClient port (port declares only `verifyBranch` and `getRawFile`). This is structural typing leak: core knows about adapter-specific shape. | Either (a) add `verifyPath` to GitHubClient port (recommended) and require all adapters to implement it, or (b) implement folder verification using getRawFile probes universally. Option (a) is straightforward — GitHubApiClient already has it. |
| 9 | MEDIUM | testing | tests/error-codes.test.ts:51-100 | TC-022/023/024 verify only `err.code === "SESSION_TIMEOUT"` (etc.) on the bare error factories. They do NOT verify the test-cases.md acceptance "5 種が同じ trigger で発火する" (same triggering condition produces same code). Test-cases.md must-area "エラーコード維持" requires trigger-equivalence, not factory-equivalence. Test-coverage gap is masked by green dots. | Add integration-level tests that run the executor against a mocked SessionClient where pollUntilComplete throws `SESSION_TIMEOUT` / `SESSION_TERMINATED`, where streamEvents returns `terminated: true` / `terminationReason: "end_turn"` without registered branch, etc., and assert that the resulting JobState.error.code matches the historical trigger. TC-026 already does this for SPEC_REVIEW_RETRIES_EXHAUSTED — apply the same pattern to TC-022/023/024. |
| 10 | MEDIUM | maintainability | src/core/agent-definition.ts vs src/core/agent/ | Both `src/core/agent-definition.ts` (file) and `src/core/agent/` (directory with index.ts) coexist. The directory pattern from ADR D7 expects all agent-related code under `src/core/agent/`. Same shape as finding #2 but with a different module. | Move `agent-definition.ts` into `src/core/agent/agent-definition.ts` and re-export from `src/core/agent/index.ts`. Update import sites. |
| 11 | MEDIUM | maintainability | src/core/{session,completion}.ts | Both files are marked `@deprecated` at file header but still exported and imported by core/pipeline.ts (legacy code path). They contain the legacy SDK-coupled implementation. After fixing #1 + #5, these become genuinely unreachable and should be deleted. | Delete `src/core/session.ts` and `src/core/completion.ts` once #1 + #5 are landed. The adapter equivalents (src/adapter/anthropic/session-runner.ts, completion.ts) are the canonical implementations. |
| 12 | LOW | maintainability | src/core/step/propose.ts:17 | `agent: { agentId: "" }` — empty string sentinel because the real agentId is resolved at runtime from config via STEP_AGENT_ROLE in executor.ts. The `agent` field on Step is therefore decorative and never read. | Either drop the `agent` field from Step interface entirely (until D4-D6 land in the next request) or make it a function `resolveAgentId(config): string` so the resolution lives with the Step, not in `STEP_AGENT_ROLE` map inside the executor. The latter aligns with Step-owns-its-agent (#3 in request body). |
| 13 | LOW | maintainability | src/core/types.ts:25, src/state/store.ts:47/64/123 | Multiple `@deprecated` markers point at the right replacement (JobStateStore methods, githubClient port) but the legacy functions still lack a removal date / phase plan. They will accumulate. | Either add a tracking line ("remove after request 2026-05-XX-...") or open a follow-up request linking these. |
| 14 | LOW | security | src/core/step/spec-fixer.ts:14-32 | `buildSpecFixerInitialMessage` interpolates `slug`, `branch`, `findingsPath` into an XML-tagged user-request without escaping. All three originate from internal config / state rather than user input, so the attack surface is narrow, but a future config-injection (e.g., a malicious request.md type field flowing into slug) could break the `<user-request>` boundary. | Escape any closing-tag-like sequences in the three interpolated fields, or switch to a non-XML delimiter (e.g., a UUID-marker fence) so an injected substring cannot terminate the section. Defense-in-depth only — not a current vulnerability. |

## Iteration Comparison

(Initial review — no prior iteration to compare against.)

## Summary

- 受け入れ基準で書かれた表面要件（Pipeline class が存在する、Step interface が存在する、JobStateStore class が存在する、テストが PASS）はクリアしているが、refactoring request の本質的目的である **重複排除と責務集約は未達**。
- 最も重い指摘 4 件（Findings #1〜#4）はすべて architecture：
  1. propose 全実装が `runProposeStepLegacy` として `pipeline.ts` に再生成されている（370 LOC の重複）
  2. `pipeline.ts` と `pipeline/pipeline.ts` の二重存在
  3. transition table が宣言だけで実際の遷移を駆動していない（D9 未達）
  4. `JobState.steps` の型を `StepResult[] | StepRun[]` の union のまま残し、新 schema へ移行していない（D8b 未達）
- これらは全て「振る舞い不変を壊さずに古いコードを削れなかった」結果であり、retrofit 過程で追加された負債。次の iteration では code-fixer に「legacy code path を削除し、port を経由した実装に統一する」指示を出す必要がある。
- security は GitHub トークンの取扱・register_branch の input 検証ともに既存契約を維持しており CRITICAL/HIGH 不在。
- 振る舞い不変の証跡は、テストスイート 214 全 PASS + state file fixture round-trip + stdout snapshot で、内側の構造変更が外側に漏れていないことが確認できる点はポジティブ。
- **収束トレンド**: 初回のため判定不可。次回は #1〜#5 の修正を最優先し、architecture スコアを 6 以上に押し上げて Total ≥ 7.0 を狙うべき。
