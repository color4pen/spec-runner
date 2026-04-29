# Review Feedback: 2026-04-29-d4-d6-agent-migration — Iteration 2

## Code Review Result

**Verdict**: approved
**Score**: 8.25 / 10.0 (pass threshold: 7.0)
**Iteration**: 2/2
**Trend**: improving (+1.30 from 6.95)

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| correctness | 9 | 0.30 | 2.70 |
| security | 8 | 0.25 | 2.00 |
| architecture | 7 | 0.15 | 1.05 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 9 | 0.10 | 0.90 |
| **Total** | | | **8.25** |

> Note: security-reviewer / pattern-reviewer skipped per pipeline-context.md (`enabled=[module-architect, test-case-generator]`). Security score is code-reviewer's first-order assessment of the diff; no new attack surface introduced in iteration 2 (deletions + spread merge + comment updates only).

## Verdict

- **verdict**: approved
- **pass_threshold**: 7.0
- **blocking_findings**: CRITICAL: 0, HIGH: 0

## Verification Summary

| Phase | Result |
|-------|--------|
| Build | PASS (`npm run build`, exit 0) |
| Type Check | PASS (`npm run typecheck`, exit 0) |
| Lint | SKIP (no lint script) |
| Tests | PASS (280/280, 36 files; +3 from iter 1) |
| Security | n/a (security-reviewer skipped) |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | architecture | src/cli/init.ts:158-205 | `buildSdkAdapter` still duplicates `AnthropicClientAdapter`. Code-fixer documented the rationale (test mock chain via `vi.mock("sdk/client.js")`) in implementation-notes.md and decided to defer. Valid call for this iteration, but the two adapters are now truly parallel implementations of the same port — drift is a real future risk (e.g., version-fetch logic already differs slightly: init.ts retrieves before update; AnthropicClientAdapter retrieves passed `current`). | Either (a) refactor `AnthropicClientAdapter` to accept an already-instantiated SDK client (factory pattern) so init.ts can reuse it, or (b) document the duplication intent as an ADR ("SDK isolation per consumer" or similar). Track as follow-up; not blocking. |
| 2 | LOW | maintainability | src/cli/init.ts:167,170,176,185,194,197 | 5× `eslint-disable @typescript-eslint/no-explicit-any` remain in `buildSdkAdapter`. The same code in `adapter/anthropic/anthropic-client.ts` uses `(agent as unknown as { version?: number })` with no suppressions. | Apply the same `unknown as { id: string; version?: number }` pattern. Resolves naturally if finding #1 is addressed. |
| 3 | LOW | correctness | src/config/schema.ts:104-133 | `validateConfig` still does not guard `agents` is a plain object; relies on `applyMigration` to populate it. No call site bypasses migration today. | Add a `typeof agents === "object" && agents !== null` guard, or rename to `validateMigratedConfig`. Defensive, low risk. |
| 4 | LOW | maintainability | src/core/step/spec-review.ts:15, src/core/step/executor.ts:108,619, tests/unit/step/executor.test.ts | `STEP_AGENT_ROLE` narrative comments retained. Deferred to archive cleanup per implementation-notes.md. | Simplify comments at archive time. |

All previously HIGH/MEDIUM findings on correctness and the must-fix maintainability findings are resolved. Remaining findings are LOW or deferred MEDIUM with documented rationale.

## Iteration Comparison

### Improvements

| Prev # | Severity | Description | Verification |
|--------|----------|-------------|--------------|
| #1 | HIGH | runInit drops pipeline/specReview/specFixer on re-run | Fixed: `{ ...existingConfig, ... }` spread at init.ts:138. New test asserts `pipeline.maxRetries=5`, `specReview.timeoutMs=120000`, `specFixer.timeoutMs=90000` survive (init.test.ts:240-308). |
| #2 | HIGH | Empty definitionHash makes getStoredAgent return undefined → leaks legacy agent | Fixed: condition relaxed to `if (record?.agentId)`, returns `definitionHash: record.definitionHash ?? ""` (init.ts:54-62). TC-039 added (init.test.ts:338-394) verifying `updateAgent` is called for legacy agentId, NOT `createAgent`. |
| #3 | MEDIUM | Stale `src/core/agent-definition.ts` duplicate hashing | Fixed: file deleted; tests/agent-definition.test.ts migrated onto `hashObject` from `src/core/agent/hash.ts`. |
| #6 | MEDIUM | `lastSyncedAt` non-deterministic at migration | Fixed: `""` sentinel replaces `new Date().toISOString()` at migrate.ts:40,82. Migration is now deterministic; syncAll writes real timestamp. |
| #7 | MEDIUM | `updateConfig` shallow-merge foot-gun | Fixed: dead export removed entirely from store.ts. |
| #8 | MEDIUM | TC-039 / TC-041 declared `must` but unimplemented | Fixed: both tests added in init.test.ts (lines 338-394 and 396+); 280/280 PASS. |
| #10 | LOW | "ONLY place" comment in register-branch.ts inaccurate | Fixed: comment now lists propose.ts and sse-stream.ts as intentional canonical references. |
| #11 | LOW | AgentSyncer rollback re-throw loses role context | Fixed: throws `Error("Agent sync failed for role '${role}': ...")` with `cause: err, role` (syncer.ts:127-132). |

### Regressions

None detected. Test count rose from 277 → 280 (no test removal), all PASS. Type check and build still PASS.

### Unchanged Issues

| Prev # | Severity | Status | Rationale |
|--------|----------|--------|-----------|
| #4 | MEDIUM → MEDIUM | deferred (now finding #1 above) | Documented in implementation-notes.md "Key Design Decision #2": inline adapter preserves vi.mock("sdk/client.js") test isolation. Acceptable for this iteration; recommend ADR or factory refactor as follow-up. |
| #5 | MEDIUM → resolved-by-design | deferred | Documented: post-syncAll environment failure rollback is init.ts's responsibility, not AgentSyncer's. Boundary is now explicit. Re-classified as not-a-bug. |
| #9 | LOW → LOW | deferred (now finding #2 above) | Linked to finding #1; will be addressed when buildSdkAdapter is removed. |
| #12 | LOW → LOW | deferred (now finding #3 above) | Defensive guard, no current bug exposure. |
| #13 | LOW → LOW | deferred (now finding #4 above) | Documentation cleanup at archive time. |

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|------------|---------|-------------|
| 1 | 6.95 | needs-fix | initial review — 2 HIGH correctness bugs |
| 2 | 8.25 | approved | both HIGH fixed; 4 MEDIUM resolved; 4 deferred with documented rationale |

Per-category delta:

| Category | Iter 1 | Iter 2 | Δ | Driver |
|----------|--------|--------|---|--------|
| correctness | 6 | 9 | +3 | Both HIGH bugs fixed; #6 sentinel; #7 dead export; #11 throw context |
| security | 8 | 8 | 0 | No security-relevant changes |
| architecture | 8 | 7 | -1 | Mild downgrade: #4/#5 explicitly deferred; duplication is real but documented |
| performance | 8 | 8 | 0 | — |
| maintainability | 6 | 8 | +2 | #3 stale module deleted; #7/#10/#11 cleanup |
| testing | 7 | 9 | +2 | TC-039 + TC-041 + user-tuned regression test added; 280/280 PASS |

## Convergence

- **trend**: improving (+1.30)
- **recommendation**: approved — proceed to archive. Track findings #1 (buildSdkAdapter unification) as a follow-up request or ADR; the remaining LOW findings can be addressed at archive time or batched into a future cleanup.

## Summary

- Code review iteration 2 verdict: **approved**. Total score **8.25 / 10.0**, passing the 7.0 threshold by a comfortable margin. Both HIGH correctness bugs from iteration 1 are resolved with dedicated regression tests, and the request's central goal (clean idempotent migration with per-role agent management) is now demonstrably achieved.
- Verification: 280/280 tests PASS (+3 new), `tsc --noEmit` exit 0, `npm run build` exit 0. The new tests cover TC-039 (legacy migration → updateAgent), TC-041 (404 fallback → propose-only re-create), and the user-tuned-fields preservation regression — addressing both the previously-uncovered scenario coverage gap and the round-trip idempotency claim.
- Deferred items have explicit rationale in `implementation-notes.md`. The `buildSdkAdapter` duplication (finding #1 here) is the only architectural concern worth tracking — it is a real risk for future drift, but the current divergence is small and the decision to keep test isolation is defensible. Recommend documenting as ADR or refactoring `AnthropicClientAdapter` to accept an SDK client in a follow-up request.
- Architecture (D1-D9 module boundaries: `core/agent/`, `core/port/`, `adapter/anthropic/`) is intact and consistent with `ADR-20260429-module-architecture-style.md`. AgentRegistry is pure aggregation, AgentSyncer encapsulates per-role transactional sync with rollback, the schema migration is deterministic, and `STEP_AGENT_ROLE` is fully removed from runtime paths.
- Path forward: approved → continue to archive (Step 9) → optionally open a follow-up to unify the two AnthropicClient implementations.
