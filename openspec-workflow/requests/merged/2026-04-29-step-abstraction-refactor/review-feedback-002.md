# Code Review Result — Step 抽象化 + Pipeline 状態機械 (iter 2)

**Verdict**: needs-fix
**Score**: 7.05 / 10.00 (pass threshold: 7.0)
**Iteration**: 2/2
**Trend**: improving (+1.10 from 5.95)

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 8 | 0.30 | 2.40 |
| security | 7 | 0.25 | 1.75 |
| architecture | 6 | 0.15 | 0.90 |
| performance | 7 | 0.10 | 0.70 |
| maintainability | 6 | 0.10 | 0.60 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **7.05** |

## Verification Summary

| Phase | Result |
|-------|--------|
| Build (tsc --noEmit false) | PASS |
| Type Check (tsc --noEmit) | PASS (0 errors) |
| Lint | N/A (no lint script in package.json) |
| Tests (vitest) | PASS (214/214, 30 files) |
| Security (npm audit --audit-level=high) | PASS (0 vulnerabilities) |
| Module Boundary (`grep @anthropic-ai/sdk` in core/, store/) | PASS (0 hits in core/store) |
| Module Boundary (indirect via src/sdk/) | PASS (0 imports of `../sdk/` from core/) |

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | architecture | src/store/job-state-store.ts vs src/state/store.ts | `JobStateStore` class is implemented (265 LOC) and exported, but **no production code in src/core/, src/cli/, or src/adapter/ imports it**. The canonical write path remains the legacy free functions in `src/state/store.ts` (`persistJobState` / `appendHistory` / `failJobState` / `updateJobState`) — invoked 91 times across `src/core/`. Acceptance criterion "JobStateStore class が実装されている" is satisfied at the type level only; the request requirement #1 ("`src/state/store.ts` の関数群を `JobStateStore` class として再構成する") is not met because the legacy functions still exist and are the actual persistence path. | Migrate `Pipeline` and `StepExecutor` to construct a single `JobStateStore` per job and replace each `persistJobState(state)` / `appendHistory(state, ...)` / `failJobState(state, ...)` call with the corresponding `store.persist(state)` / `store.appendHistory(state, ...)` method. After migration, delete the four `@deprecated` free functions from `src/state/store.ts` (keep only `createJobState` / `listJobStates`). The `appendHistory`/`persist` methods on JobStateStore appear to be referenced in deprecation notices but are not actually defined on the class — those need to be added before migration. |
| 2 | HIGH | architecture | src/core/step/spec-review.ts:151-396 | `runSpecReviewStep` legacy function (~245 LOC) remains exported with `@deprecated` but **has zero production callers** (verified via `grep -r runSpecReviewStep src/`). It is reachable only from `tests/spec-review-step.test.ts` (TC-016/017/018/019/020/021/041/042/049). This re-creates exactly the same shape as iter-1 finding #1 (`runProposeStepLegacy`, deleted in code-fixer iter 1) — the propose lifecycle was eliminated but the spec-review legacy lifecycle was not. After this refactor the spec-review session lifecycle exists in TWO places: StepExecutor.runPollingStyleStep + SpecReviewStep declaration, AND the legacy free function. | Delete `runSpecReviewStep`. Migrate the 8 test cases in `tests/spec-review-step.test.ts` to drive `Pipeline.run("spec-review", ...)` or `StepExecutor.execute(SpecReviewStep, ...)` directly. The behavior is structurally equivalent — what differs is the surface: `err.state` attachment vs. direct return. If a test specifically pins legacy error semantics, that contract belongs on the executor's error wrapping, not on a parallel implementation. After deletion, also delete the now-unused `agentId` resolution branch and `pushStepResult` calls inside the legacy function. |
| 3 | MEDIUM | architecture | src/core/step/executor.ts:84-89 | StepExecutor still uses **`step.toolHandlers && step.toolHandlers.size > 0`** as the runtime branch between propose-style (SSE) and polling-style. iter-1 finding #7. This was not addressed in iter 1: SpecFixerStep declares `toolHandlers: undefined` and SpecReviewStep also `toolHandlers: undefined` to land on the polling branch. The lifecycle choice is not declared — it is inferred from tool presence. | Add an explicit `lifecycle: "sse" \| "poll"` discriminator to the `Step` interface (or split into `SseStep`/`PollingStep` subtypes), and have StepExecutor dispatch on that field. This decouples "does this step need SSE" from "does this step have custom tools" — they happen to coincide today but they are not the same concern. |
| 4 | MEDIUM | architecture | src/core/step/executor.ts:432 | iter-1 finding #8 (unaddressed): `verifyChangeFolderViaPort` probes `githubClient.verifyPath?` which is not declared on the `GitHubClient` port. Port declares only `verifyBranch` and `getRawFile`; `verifyPath` is an adapter-shape leak. | Add `verifyPath(owner, repo, branch, path): Promise<boolean>` to the `GitHubClient` port and require all adapters to implement it. `GitHubApiClient` already has it. Then drop the `?` and the optional fallback branch via `getRawFile`. |
| 5 | MEDIUM | maintainability | src/core/step/executor.ts (892 LOC) | `runProposeStyleStep` (lines 95-388 = ~290 LOC) and `runPollingStyleStep` (lines 602-878 = ~280 LOC) duplicate the session lifecycle scaffolding (createSession + sendUserMessage + error handling + `pushStepResult` on each failure path). The propose-style path additionally has SSE handling, branch registration, and folder verification — but the session-create / send-message / handle-failure scaffolding is structurally identical. | Extract a private helper `createAndSendSession(step, state, deps): Promise<{state, sessionId, agentId}>` that handles both branches. The propose path then calls it, runs SSE + branch verify, while polling path calls it then polls. Verify after the change that LOC for executor.ts drops 100-150 LOC. |
| 6 | MEDIUM | maintainability | src/core/session.ts (67 LOC), src/sdk/sessions.ts (124 LOC) | iter-1 finding #11: both files are `@deprecated` at the file header; `core/session.ts` is now reachable only via tests (`startProposeSession` is exported but unreferenced from production). `src/sdk/sessions.ts` re-exports legacy types and forwards to `adapter/anthropic/sdk/sessions.ts`. Both should be deleted now that the production callers have moved off them. | Delete `src/core/session.ts` after migrating `tests/spec-review-step.test.ts` and `tests/completion.test.ts` to import `SessionDeps` / `SessionResult` types from `adapter/anthropic/session-client.ts` (or define them inline in tests). Delete `src/sdk/sessions.ts` after migrating `cli/init.ts` and `cli/run.ts` to import directly from `adapter/anthropic/sdk/sessions.ts` (or have `adapter/anthropic/index.ts` re-export the createAnthropicClient). |
| 7 | MEDIUM | maintainability | src/core/agent-definition.ts vs src/core/agent/index.ts | iter-1 finding #10 (unaddressed): `src/core/agent/index.ts` is a 2-line placeholder (`export {};`) and `src/core/agent-definition.ts` (74 LOC) is the actual content. The directory pattern from ADR-module-architecture-style D7 expects directory-form for grouped modules. | Move `agent-definition.ts` → `src/core/agent/agent-definition.ts`, replace the `export {}` placeholder with `export * from "./agent-definition.js";`, and update import sites (cli/init.ts, tests/agent-definition.test.ts). |
| 8 | MEDIUM | testing | tests/error-codes.test.ts:51-100 | iter-1 finding #9 partially addressed: TC-026 added an integration-level test for `SPEC_REVIEW_RETRIES_EXHAUSTED`, but TC-022/023/024 still verify only the bare error factories (`sessionTimeoutError().code === "SESSION_TIMEOUT"` etc.). The `tests/spec-review-step.test.ts` TC-018/019 do verify the trigger via legacy `runSpecReviewStep`, so the test coverage exists — but those tests will be deleted alongside #2 above. | After the legacy `runSpecReviewStep` is removed (#2), re-attach the trigger-equivalence assertions to `Pipeline.run` or `StepExecutor.execute(SpecReviewStep)` so TC-018/019/020 still verify "pollUntilComplete throws SESSION_TIMEOUT → JobState.error.code === SESSION_TIMEOUT" through the canonical path. Without this, deleting the legacy function will silently lose trigger coverage even though the assertions remain green. |
| 9 | LOW | maintainability | src/core/step/propose.ts:17, src/core/step/spec-review.ts:51, src/core/step/spec-fixer.ts:45 | iter-1 finding #12 (unaddressed): each Step declares `agent: { agentId: "" }` as a sentinel because the real agentId is resolved at runtime via `STEP_AGENT_ROLE` map in StepExecutor (lines 23-27 of executor.ts). The `agent` field on Step is therefore decorative and never read by anything in production. | Either drop the `agent` field from the `Step` interface entirely (defer to the AgentRegistry work in the next request), or change it to `resolveAgentId(config: SpecRunnerConfig): string` so the resolution lives with the Step rather than a separate map keyed by step name. The latter aligns with the "Step owns its agent" ADR D2 and removes `STEP_AGENT_ROLE` from executor.ts. |
| 10 | LOW | maintainability | src/state/helpers.ts:7-30 (toLegacyStepResult) + src/state/store.ts deprecation comments | The deprecation comments on `persistJobState/appendHistory/failJobState` reference `JobStateStore.persist()` / `JobStateStore.appendHistory()` / `JobStateStore.fail()` — but **none of those methods exist on the class** (verified by reading job-state-store.ts: only `load` / `persist` / `appendStepRun` / `getLatestStepRun` exist). The deprecation notices point to a phantom API. | When implementing #1, ensure `JobStateStore.appendHistory(state, entry)` and `JobStateStore.fail(state, errorInfo, step?)` are actually added to the class. Otherwise migration consumers will discover the API doesn't match the deprecation guidance. |
| 11 | LOW | security | src/core/step/spec-fixer.ts:14-32 | iter-1 finding #14 (unaddressed): `buildSpecFixerInitialMessage` interpolates `slug`, `branch`, `findingsPath` directly into an XML-tagged user-request without escaping. All three originate from internal config / state rather than user input, so the attack surface is narrow today, but a future config-injection (e.g., a malicious slug flowing in) could break the `<user-request>` boundary. | Defense-in-depth: escape `</user-request>` and similar closing-tag sequences in the three interpolated fields, or switch to a non-XML delimiter (e.g., a UUID-marker fence). Not a current vulnerability. |
| 12 | LOW | maintainability | src/core/types.ts:25, src/state/store.ts:47/64/123 | iter-1 finding #13 (unaddressed): multiple `@deprecated` markers but no removal date / phase plan. They will accumulate. | Either add tracking lines ("remove after request 2026-05-XX-...") or open a follow-up request linking these. Lower priority than #6 (deletion is the proper resolution). |

## Iteration Comparison

### Improvements (vs. iter 1)

- **iter-1 #1 (HIGH) RESOLVED**: `runProposeStepLegacy` (370 LOC) deleted entirely. `pipeline.ts` shrunk from 454 LOC → 93 LOC.
- **iter-1 #2 (HIGH) RESOLVED**: `pipeline.ts` is now a thin 93-LOC wrapper that constructs `Pipeline` from `pipeline/pipeline.ts`. No more dual-implementation of the propose flow. (The two files still coexist by name, but `pipeline.ts` is now strictly a composition root, not a reimplementation.)
- **iter-1 #3 (HIGH) RESOLVED**: `Pipeline.runInternal` is fully table-driven from `STANDARD_TRANSITIONS`. `runSpecReviewLoop` / `runSpecFixerPhase` / `runSpecReviewStep` (private) helpers eliminated. Verdict-to-next-step lookup is `this.transitions.find(...)` per step. Acceptance criterion "Pipeline class + transition table で pipeline.ts の inline if が置換されている" now genuinely met.
- **iter-1 #4 (HIGH) RESOLVED**: `JobState.steps` narrowed to `Record<string, StepRun[]>`. `pushStepResult` writes `StepRun` objects. The `StepResult \| StepRun` union is gone from the `JobState` type. (Schema-level resolution, even though the class itself is unused — see new #1.)
- **iter-1 #5 (HIGH) RESOLVED**: Core layer no longer imports `src/sdk/sessions.ts`. SDK boundary verified by `grep`: zero `from ".*/sdk/"` imports in `src/core/` or `src/store/`. New `src/adapter/anthropic/sdk/sessions.ts` is the canonical SDK boundary.
- **iter-1 #6 (HIGH) RESOLVED**: All three `as any` casts on `deps.client` deleted. No `as any` remains in `src/core/`.
- **iter-1 #11 PARTIALLY RESOLVED**: `src/core/completion.ts` deleted. `core/session.ts` still exists but is now thin (67 LOC) and uses the SessionClient port rather than direct SDK calls. Production callers have migrated.

### Regressions (vs. iter 1)

None. All metrics improved or held.

### Unchanged Issues

- iter-1 #7 (MEDIUM) → still #3: tool-presence-as-lifecycle-flag.
- iter-1 #8 (MEDIUM) → still #4: `verifyPath?` structural typing leak.
- iter-1 #10 (MEDIUM) → still #7: `agent-definition.ts` vs `agent/index.ts` directory-form mismatch.
- iter-1 #12 (LOW) → still #9: empty `agent: { agentId: "" }` sentinel.
- iter-1 #13 (LOW) → still #12: `@deprecated` without removal date.
- iter-1 #14 (LOW) → still #11: spec-fixer XML interpolation defense-in-depth.

### New Issues Introduced by iter-1 fix

- **#1 (HIGH)**: `JobStateStore` class introduced but never actually adopted as the persistence path. Production code still calls the legacy free functions.
- **#2 (HIGH)**: `runSpecReviewStep` legacy duplication is now isomorphic to the iter-1 finding that was resolved (`runProposeStepLegacy`). Same root cause: tests pinned to a legacy entry point that should have been migrated together with the production callers.
- **#5 (MEDIUM)**: StepExecutor's two style-branches duplicate ~150 LOC of session-create scaffolding.
- **#10 (LOW)**: `JobStateStore` deprecation comments reference methods (`appendHistory`, `fail`) that do not exist on the class.

### Convergence Trend

| Iter | Total | CRITICAL | HIGH | MEDIUM | LOW | Trend |
|------|-------|----------|------|--------|-----|-------|
| 1 | 5.95 | 0 | 6 | 3 | 5 | — |
| 2 | 7.05 | 0 | 2 | 5 | 4 | improving (+1.10) |

**Trend: improving** by +1.10. The big-ticket architecture findings from iter 1 (#1-#6) were all resolved. New findings #1 and #2 are HIGH but represent a different shape of debt: the iter-1 fix landed the new types/classes correctly, but did not finish the migration to make them the canonical path. This is the same "delete the old, keep the new" pattern that iter 1 fixer just demonstrated for `runProposeStepLegacy`; the same playbook applies to `runSpecReviewStep` and to the persistence functions.

## Summary

- 振る舞い不変は完全に保持されている（214/214 tests PASS、build PASS、tsc 0 errors、npm audit 0 vulns）。
- iter 1 で指摘された 6 件の HIGH（architecture × 5、maintainability × 1）は **すべて解消**。Pipeline は table-driven、SDK 境界は厳密、`as any` ゼロ、`runProposeStepLegacy` は削除、`StepResult|StepRun` union は撲滅。
- ただし iter 1 fix の過程で **2 件の新しい HIGH** が顕在化:
  1. `JobStateStore` class は導入されたが production 経路で使われていない（src/state/store.ts の legacy free functions が依然として唯一の write path）
  2. `runSpecReviewStep` legacy（~245 LOC）が tests のためだけに残存。iter 1 で削除した `runProposeStepLegacy` と完全に同形の負債
- これは **「新しい構造を作ったが旧構造を削除しきれていない」** という同一根本原因のパターン。修正方針も同じで、tests を新エントリ点（`StepExecutor.execute` / `JobStateStore` methods）に移植して legacy を削除する。
- iter 1 → iter 2 で score は 5.95 → 7.05 と +1.10 改善し pass threshold 7.0 を 0.05 上回るが、HIGH が 2 件残存しているため自動的に **needs-fix**（review-standards.md: HIGH ≥ 1 → verdict は needs-fix で確定）。
- 次 iter は #1 + #2 の解消に集中すべき:
  - #1: JobStateStore に `appendHistory` / `fail` method を追加 → Pipeline / StepExecutor を `store.persist()` / `store.appendHistory()` 経由に移植 → `src/state/store.ts` の deprecated functions を削除
  - #2: `tests/spec-review-step.test.ts` を `Pipeline.run` / `StepExecutor.execute` 経由に書き換え → `runSpecReviewStep` を削除
- Trend は **improving**（+1.10）で停滞ではない。次 iter で +0.5〜+0.8 の改善は十分射程内（#1 #2 解消で architecture 6→8、maintainability 6→7 が現実的）。
- security findings は全て LOW で defense-in-depth レベル、CRITICAL/HIGH 不在。GitHub トークン取扱・register_branch input 検証・XML interpolation はいずれも既存契約を維持。
