# Code Review Result — Step 抽象化 + Pipeline 状態機械 (iter 3)

**Verdict**: approved
**Score**: 7.40 / 10.00 (pass threshold: 7.0)
**Iteration**: 3/3
**Trend**: improving (+0.35 from 7.05)

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 8 | 0.30 | 2.40 |
| security | 7 | 0.25 | 1.75 |
| architecture | 7 | 0.15 | 1.05 |
| performance | 7 | 0.10 | 0.70 |
| maintainability | 7 | 0.10 | 0.70 |
| testing | 8 | 0.10 | 0.80 |
| **Total** | | | **7.40** |

## Verification Summary

| Phase | Result |
|-------|--------|
| Build (tsc --noEmit false) | PASS |
| Type Check (tsc --noEmit) | PASS (0 errors) |
| Lint | N/A (no lint script in package.json) |
| Tests (vitest) | PASS (214/214, 30 files) |
| Security (npm audit --audit-level=high) | PASS (0 vulnerabilities) |
| Module Boundary (`grep @anthropic-ai/sdk` in core/) | PASS (0 hits) |
| Module Boundary (`from "../sdk/"` in core/) | PASS (0 hits) |
| Module Boundary (`from "../adapter/"` in core/) | PASS (0 hits) |
| `as any` in src/core/ | PASS (0 hits) |

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | architecture | src/core/step/executor.ts:84-89 | iter-2 #3 (unchanged): StepExecutor still uses **`step.toolHandlers && step.toolHandlers.size > 0`** as the runtime branch between propose-style (SSE) and polling-style. SpecFixerStep and SpecReviewStep declare `toolHandlers: undefined` to land on the polling branch — the lifecycle choice is inferred from tool presence rather than declared. | Add an explicit `lifecycle: "sse" \| "poll"` discriminator to the `Step` interface (or split into `SseStep`/`PollingStep` subtypes), and have StepExecutor dispatch on that field. Decouples "needs SSE" from "has custom tools" — they coincide today but are not the same concern. |
| 2 | MEDIUM | architecture | src/core/step/executor.ts:432-477 | iter-2 #4 (unchanged): `verifyChangeFolderViaPort` probes `githubClient.verifyPath?` which is not declared on the `GitHubClient` port. Port declares only `verifyBranch` and `getRawFile`; `verifyPath` is an adapter-shape leak via optional structural typing. | Add `verifyPath(owner, repo, branch, path): Promise<boolean>` to the `GitHubClient` port and require all adapters to implement it. `GitHubApiClient` already has it. Then drop the `?` and the optional fallback branch via `getRawFile`. |
| 3 | MEDIUM | maintainability | src/core/step/executor.ts (913 LOC) | iter-2 #5 (unchanged): `runProposeStyleStep` (lines 110-404 = ~290 LOC) and `runPollingStyleStep` (lines 622-899 = ~280 LOC) duplicate the session lifecycle scaffolding (createSession + sendUserMessage + error handling + `pushStepResult` on each failure path). The propose path additionally has SSE handling, branch registration, and folder verification — but the session-create / send-message / handle-failure scaffolding is structurally identical. File grew +21 LOC vs iter 2 due to `getStore()` helper extraction without offsetting the session-scaffolding duplication. | Extract a private helper `createAndSendSession(step, state, deps, store): Promise<{state, sessionId, agentId}>` that handles createSession + sendUserMessage + error path. Both branches then call it. Verify after the change that LOC for executor.ts drops 100-150 LOC. |
| 4 | MEDIUM | maintainability | src/core/session.ts (67 LOC), src/sdk/sessions.ts (124 LOC) | iter-2 #6 (unchanged): both files are `@deprecated` at the file header. `core/session.ts` is reachable only via tests (`startProposeSession` is exported but unreferenced from production). `src/sdk/sessions.ts` is imported only by `tests/completion.test.ts` (for `isStatusIdleEvent`/`isEndTurnIdle`/`isStatusTerminatedEvent` event-shape predicates). Both can be removed if test imports are migrated. | Delete `src/core/session.ts` after migrating any test that imports `startProposeSession`. Migrate `tests/completion.test.ts` to import the event-shape predicates from `adapter/anthropic/sdk/sessions.ts` directly, then delete `src/sdk/sessions.ts`. Lower priority because production code already does not touch either file. |
| 5 | MEDIUM | maintainability | src/core/agent-definition.ts vs src/core/agent/index.ts | iter-2 #7 (unchanged): `src/core/agent/index.ts` is a 2-line placeholder (`export {};`) and `src/core/agent-definition.ts` (74 LOC) is the actual content. The directory pattern from ADR-module-architecture-style D7 expects directory-form for grouped modules. | Move `agent-definition.ts` → `src/core/agent/agent-definition.ts`, replace the `export {}` placeholder with `export * from "./agent-definition.js";`, and update import sites (cli/init.ts, tests/agent-definition.test.ts). Mechanical move; defer to next request if not in scope. |
| 6 | LOW | maintainability | src/core/step/propose.ts:17, src/core/step/spec-review.ts:48, src/core/step/spec-fixer.ts:43 | iter-2 #9 (unchanged): each Step declares `agent: { agentId: "" }` as a sentinel because the real agentId is resolved at runtime via `STEP_AGENT_ROLE` map in StepExecutor (lines 23-27 of executor.ts). The `agent` field on Step is therefore decorative and never read by anything in production. | Either drop the `agent` field from the `Step` interface entirely (defer to the AgentRegistry work in the next request), or change it to `resolveAgentId(config: SpecRunnerConfig): string` so the resolution lives with the Step rather than a separate map keyed by step name. The latter aligns with the "Step owns its agent" ADR D2 and removes `STEP_AGENT_ROLE` from executor.ts. |
| 7 | LOW | maintainability | src/state/store.ts:47-69 | iter-2 #1 was largely fixed but **`persistJobState` and `updateJobState` remain as @deprecated thin shims**. `persistJobState` is called only from inside `createJobState`, and `updateJobState` is called by `tests/spec-review-step.test.ts:36/47`. Production code now imports only `createJobState` and `listJobStates` (verified by grep). | After the next test cleanup pass, inline `persistJobState` into `createJobState` (or rewrite `createJobState` to use a single `JobStateStore.persist` call), migrate the test usage of `updateJobState` to a JobStateStore call, and delete both shims. Low priority because they are no longer canonical write paths and have zero production impact. |
| 8 | LOW | security | src/core/step/spec-fixer.ts:14-32 | iter-2 #11 (unchanged): `buildSpecFixerInitialMessage` interpolates `slug`, `branch`, `findingsPath` directly into an XML-tagged user-request without escaping. All three originate from internal config / state rather than user input, so the attack surface is narrow today, but a future config-injection (e.g., a malicious slug flowing in) could break the `<user-request>` boundary. | Defense-in-depth: escape `</user-request>` and similar closing-tag sequences in the three interpolated fields, or switch to a non-XML delimiter (e.g., a UUID-marker fence). Not a current vulnerability. |
| 9 | LOW | maintainability | src/core/types.ts, src/state/store.ts, src/core/session.ts | iter-2 #12 (unchanged): multiple `@deprecated` markers (file-level on `core/session.ts`, `sdk/sessions.ts`; field-level on `state/store.ts:persistJobState`/`updateJobState`) without removal date / phase plan. They will accumulate. | Either add tracking lines ("remove after request 2026-05-XX-...") or open a follow-up request linking these. Several are eligible for outright deletion now (see #4, #7). |

## Iteration Comparison

### Improvements (vs. iter 2)

- **iter-2 #1 (HIGH) RESOLVED**: `JobStateStore.appendHistory` / `update` / `fail` / `persist` methods added. `runProposeStyleStep` and `runPollingStyleStep` now call `store.appendHistory(...)` (39 invocations across executor.ts + pipeline.ts). Pipeline.ts also constructs `JobStateStore` instances for transition history (`transitionStore.appendHistory(...)`) and exhausted handling (`exhaustedStore.persist(...)`). Production code in `src/core/` and `src/cli/` no longer imports `appendHistory`, `failJobState`, or `updateJobState` from `state/store.ts`. The legacy free functions `appendHistory` and `failJobState` were **deleted** (verified by grep — no longer exist in store.ts). `persistJobState` and `updateJobState` remain as @deprecated thin shims (#7 above) but are no longer reachable from production. Acceptance criterion "JobStateStore class が canonical な persistence path として使われている" now genuinely met.
- **iter-2 #2 (HIGH) RESOLVED**: `runSpecReviewStep` (~245 LOC) deleted from `src/core/step/spec-review.ts`. File shrunk from 396 LOC → 146 LOC (-250). `tests/core/steps/spec-review.test.ts` (TC-044/045/046) migrated to `runStep(jobState, deps)` which internally calls `executor.execute(SpecReviewStep, ...)`. `tests/spec-review-step.test.ts` (TC-016/017/018/019/020/021/041/042/049) was already on `runSpecReviewViaExecutor` after iter 1; trigger-equivalence assertions for `SESSION_TIMEOUT`/`SESSION_TERMINATED`/`SPEC_REVIEW_RESULT_NOT_FOUND` now exclusively run through the canonical `StepExecutor.execute(SpecReviewStep)` path. iter-2 #8 (testing — Scenario Coverage gap) is also resolved by virtue of this migration: TC-018/019/020 verify error codes through the canonical path, not a parallel implementation.
- **iter-2 #10 (LOW) RESOLVED**: `JobStateStore.appendHistory` / `update` / `fail` methods now exist on the class — deprecation comments in `state/store.ts` previously referenced phantom API. The class API now matches what the deprecation guidance points to.

### Regressions (vs. iter 2)

None. All metrics improved or held.

### Unchanged Issues

- iter-2 #3 (MEDIUM) → still #1: tool-presence-as-lifecycle-flag.
- iter-2 #4 (MEDIUM) → still #2: `verifyPath?` structural typing leak.
- iter-2 #5 (MEDIUM) → still #3: executor.ts session-scaffolding duplication (slight regression in raw LOC: 892 → 913 due to `getStore()` helper, but offset elsewhere).
- iter-2 #6 (MEDIUM) → still #4: `core/session.ts` + `sdk/sessions.ts` deprecation deletion.
- iter-2 #7 (MEDIUM) → still #5: `agent-definition.ts` vs `agent/index.ts` directory-form mismatch.
- iter-2 #9 (LOW) → still #6: empty `agent: { agentId: "" }` sentinel.
- iter-2 #11 (LOW) → still #8: spec-fixer XML interpolation defense-in-depth.
- iter-2 #12 (LOW) → still #9: `@deprecated` without removal date.

### New Issues Introduced by iter-2 fix

- **#7 (LOW)**: `persistJobState` and `updateJobState` remain as @deprecated thin shims in `state/store.ts`. Severity downgraded from iter-2's #1 (HIGH for canonical-path violation) to LOW because production code no longer imports them — only `createJobState`/`listJobStates` are imported. Cleanup task; no behavioral risk.

### Convergence Trend

| Iter | Total | CRITICAL | HIGH | MEDIUM | LOW | Trend |
|------|-------|----------|------|--------|-----|-------|
| 1 | 5.95 | 0 | 6 | 3 | 5 | — |
| 2 | 7.05 | 0 | 2 | 5 | 4 | improving (+1.10) |
| 3 | 7.40 | 0 | 0 | 5 | 4 | improving (+0.35) |

**Trend: improving** by +0.35. The two iter-2 HIGH findings (`JobStateStore` not canonical, `runSpecReviewStep` legacy) were both resolved — the same playbook used for `runProposeStepLegacy` in iter 1 was successfully applied to `runSpecReviewStep` and to the persistence layer. Net LOC reduction: spec-review.ts -250, state/store.ts -44, executor.ts +21 (helper refactor), pipeline.ts +11 (transitionStore), job-state-store.ts +53 (new methods). Ratio of deletion to addition is healthy.

## Summary

- 振る舞い不変は完全に保持されている (214/214 tests PASS、build PASS、tsc 0 errors、npm audit 0 vulns、`as any` ゼロ in core)。
- iter 2 で指摘された 2 件の HIGH (architecture × 2: JobStateStore canonical path、runSpecReviewStep delete) は **両方解消**。受け入れ基準 #1 (`src/state/store.ts` の関数群を `JobStateStore` class として再構成) と #4 (legacy 関数の削除) が真の意味で達成された。
- 残存する MEDIUM × 5 (#1-#5) は extension または eventual cleanup レベル — lifecycle discriminator・port verifyPath 宣言・executor LOC duplication・deprecated session 削除・agent dir form。いずれも振る舞い不変を脅かさず、blocker ではない。
- 残存する LOW × 4 (#6-#9) は documentation hygiene と defense-in-depth レベル — sentinel agentId・@deprecated removal date・XML escape・shim cleanup。
- iter 2 → iter 3 で score は 7.05 → 7.40 と +0.35 改善し pass threshold 7.0 を 0.40 上回る。HIGH/CRITICAL は 0 件。**verdict は automatically approved**（review-standards.md: HIGH = 0 かつ Total ≥ 7.0 → approved）。
- Trend は **improving**（+0.35）。新規 HIGH も regressions も無く、収束 (convergence) と判定できる。
- security findings は全て LOW で defense-in-depth レベル。CRITICAL/HIGH 不在。GitHub トークン取扱・register_branch input 検証・XML interpolation はいずれも既存契約を維持。
- 残された MEDIUM × 5 は次の request (例: AgentRegistry / Step lifecycle discriminator / executor refactor) でまとめて扱うのが適切。本 request の scope (Step 抽象化 + Pipeline 状態機械) としては完了とみなせる。
