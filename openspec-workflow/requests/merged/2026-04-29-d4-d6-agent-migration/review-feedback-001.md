# Review Feedback: 2026-04-29-d4-d6-agent-migration — Iteration 1

## Code Review Result

**Verdict**: needs-fix
**Score**: 6.95 / 10.0 (pass threshold: 7.0)
**Iteration**: 1/2
**Trend**: — (initial)

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| correctness | 6 | 0.30 | 1.80 |
| security | 8 | 0.25 | 2.00 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 6 | 0.10 | 0.60 |
| testing | 7 | 0.10 | 0.55 |
| **Total** | | | **6.95** |

> Note: security-reviewer / pattern-reviewer were skipped per pipeline-context.md (`enabled=[module-architect, test-case-generator]`). Security score above is code-reviewer's first-order assessment of the diff (no secrets in stdout, atomic write, 0600 permissions retained, no injection vectors introduced); review-integrator did not consolidate a dedicated security-reviewer.

## Verdict

- **verdict**: needs-fix
- **pass_threshold**: 7.0
- **blocking_findings**: CRITICAL: 0, HIGH: 2

## Verification Summary

| Phase | Result |
|-------|--------|
| Build | PASS |
| Type Check | PASS (`npm run typecheck`, exit 0) |
| Lint | SKIP (no lint script) |
| Tests | PASS (277/277, 36 files) |
| Security | n/a (security-reviewer skipped) |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | correctness | src/cli/init.ts:131-140 | `runInit` rebuilds `newConfig` from scratch and only carries `version`, `anthropic`, `agents`, `environment`, `github`. `pipeline`, `specReview`, `specFixer` (incl. `pipeline.maxRetries`, `specReview.timeoutMs`, `specFixer.timeoutMs`) from `existingConfig` are silently dropped. Re-running `specrunner init` wipes user-tuned timeouts and retry settings. Violates the idempotency claim (TC-040: "差分が `lastSyncedAt` のみ"). | Spread `existingConfig` first then override the fields init owns: `const newConfig: SpecRunnerConfig = { ...existingConfig, version: 1, anthropic: { apiKey }, agents, environment: {...}, github: existingConfig.github }`. Add a regression test that pre-populates `pipeline.maxRetries` / `specReview.timeoutMs` and asserts they survive a 2nd init. |
| 2 | HIGH | correctness | src/cli/init.ts:53-62 + src/config/migrate.ts:39 | `getStoredAgent` requires BOTH `agentId` AND a non-empty `definitionHash` to return a stored entry. `migrateConfig.normalizeAgentRecord` sets `definitionHash` to `""` when missing (e.g. legacy `agent.id` with no hash, or any imported config). With empty hash, `getStoredAgent` returns `undefined`; `AgentSyncer.syncAll` then takes the "no stored entry" branch and calls `createAgent` — leaking the existing Anthropic agent ID and creating a duplicate instead of `updateAgent`. Breaks TC-039 (legacy schema → migrate → reuse existing agent ID). | In `init.ts:storedConfig.getStoredAgent`, return `{ agentId, definitionHash: record.definitionHash ?? "" }` whenever `agentId` is set; the empty hash will correctly route through AgentSyncer's "hash differs → update" branch. Add a unit test covering: stored agentId present + empty definitionHash → AgentSyncer calls `updateAgent`, NOT `createAgent`. |
| 3 | MEDIUM | maintainability | src/core/agent-definition.ts (+ tests/agent-definition.test.ts) | Pre-existing module `src/core/agent-definition.ts` (note: hyphenated path, not `agent/definition.ts`) duplicates AgentDefinition shape, `canonicalJson`, and `computeDefinitionHash` from the new `src/core/agent/{definition,hash}.ts`. Only `tests/agent-definition.test.ts` (TC-070/TC-071) imports it; no production code does. Two parallel hashing implementations can drift and cause divergent definitionHash values across versions. | Delete `src/core/agent-definition.ts` and migrate `tests/agent-definition.test.ts` (TC-070/TC-071) onto `hashObject` from `src/core/agent/hash.ts`, using a representative `AgentDefinition` (e.g. `ProposeStep.agent`). |
| 4 | MEDIUM | architecture | src/cli/init.ts:152-199 | `buildSdkAdapter` in init.ts re-implements the same port that `AnthropicClientAdapter` (src/adapter/anthropic/anthropic-client.ts) already implements. The implementation-notes.md justification ("test mock chain works because vi.mock targets sdk/client.js") points to a fragility, not a design choice — two implementations of `AnthropicClient` will drift (e.g. version-fetch logic, tool conversion). | Replace `buildSdkAdapter(rawSdk)` with `new AnthropicClientAdapter(rawSdk)` (or expose a factory in `src/adapter/anthropic/` that takes the already-created SDK client instead of an apiKey). Update tests so `vi.mock` targets `adapter/anthropic` instead of (or in addition to) `sdk/client.js`. If the SDK-import-isolation requirement is real, document it as an ADR rather than duplicating code. |
| 5 | MEDIUM | architecture | src/cli/init.ts:100-117 | Environment-failure rollback path archives agents directly via `rawSdk.beta.agents.archive(...)`, bypassing the `AnthropicClient` port. AgentSyncer already encapsulates rollback semantics; init.ts now has its own copy. | Either reuse `AgentSyncer.rollback`-equivalent (expose a public `rollbackCreated(agentIds)` on AgentSyncer) or call `agentClient.archiveAgent(result.agentId)` so all archive calls go through the port. |
| 6 | MEDIUM | correctness | src/config/migrate.ts:40, 82 | `lastSyncedAt` falls back to `new Date().toISOString()` at every load when missing. Each `loadConfig` produces a fresh timestamp without persisting — visible diff in subsequent `saveConfig` calls even when nothing else changed. Couples migration to wall-clock and undermines "true idempotent" claim. | Use a sentinel (e.g. `""` or `"1970-01-01T00:00:00.000Z"`) in `normalizeAgentRecord` / legacy fallback, and let the next AgentSyncer.syncAll write a real timestamp. Or treat missing `lastSyncedAt` as "force re-sync" but keep migration deterministic. |
| 7 | MEDIUM | correctness | src/config/store.ts:104-108 | `updateConfig` shallow-merges `current` and `patch` with spread; if `patch.agents` is provided partially, it overwrites the entire `agents` map (loses other roles). Currently no callers in src/, but the helper is exported and is a foot-gun. | Either remove `updateConfig` (dead export), or deep-merge `agents` and document one-shot vs partial semantics. |
| 8 | MEDIUM | testing | openspec/changes/.../test-cases.md (TC-039, TC-041) | TC-039 ("旧 schema config を migration して spec-review Agent を新規作成") and TC-041 ("propose の 404 fallback で propose のみ再作成") are declared `must` in test-cases.md but no automated test references those IDs in `tests/`. Combined with finding #2, the legacy-migration end-to-end path is untested. | Add `tests/init.test.ts` cases for TC-039 (legacy `agent.id` + missing definitionHash → init reuses old agentId via update) and TC-041 (404 fallback at retrieve → only propose role re-created, others no-op). |
| 9 | LOW | maintainability | src/cli/init.ts:152-198 | 5× `// eslint-disable-next-line @typescript-eslint/no-explicit-any` plus duplicated cast pattern `(agent as any).id`/`.version`. Adapter file already does the cast cleanly with `(agent as unknown as { version?: number })`. | Apply the same `unknown as { id: string; version?: number }` pattern as in `adapter/anthropic/anthropic-client.ts:42`. Removes the eslint suppressions. (Resolves naturally if finding #4 is addressed.) |
| 10 | LOW | maintainability | src/core/tools/register-branch.ts:7 | Comment claims "ONLY place in the codebase where 'register_branch' appears", but the literal also appears in `src/core/step/propose.ts:46` (toolHandlers map key) and `src/adapter/anthropic/sse-stream.ts:96` (SSE event matching). Stale documentation. | Update the comment to: "the canonical Tool definition; the toolHandlers map key in propose.ts and the SSE matcher in sse-stream.ts intentionally reference this name." |
| 11 | LOW | maintainability | src/core/agent/syncer.ts:127-130 | `await this.rollback(...)` then `throw err;` re-throws the raw API error. Loses the role context (which step's create failed). | Wrap and re-throw: `throw Object.assign(new Error(\`Agent sync failed for role '\${role}': \${(err as Error).message}\`), { cause: err, role });`. Improves debug output during init failures. |
| 12 | LOW | correctness | src/config/schema.ts:104-133 | `validateConfig` returns `raw as SpecRunnerConfig` but never asserts `agents` is a plain object — relies on `applyMigration` always populating it. If `validateConfig` is ever called on un-migrated raw input (e.g., a future codepath), invalid `agents` shape passes silently. | Add a `typeof obj["agents"] === "object" && obj["agents"] !== null` guard, or rename `validateConfig` to `validateMigratedConfig` to make the precondition explicit. |
| 13 | LOW | maintainability | src/core/step/spec-review.ts:15 / executor.ts:108,619 / tests/unit/step/executor.test.ts | `STEP_AGENT_ROLE` is referenced only in comments now (good). The narrative comments are useful for migration but will become noise once D4-D6 ships. | After archive, simplify the comments to remove the historical "no STEP_AGENT_ROLE lookup" framing; just document the current behavior. |

## Iteration Comparison

(initial iteration — not applicable)

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.95 | needs-fix | initial review |

## Convergence

- **trend**: — (initial)
- **recommendation**: continue (apply finding #1 and #2 fixes; #3-#8 in scope; #9-#13 nice-to-have)

## Summary

- 277/277 tests PASS, 0 typecheck errors. The D4-D6 architecture (Step-owned AgentDefinition, AgentRegistry / AgentSyncer ports, schema migration) is well-structured and cohesive: ports are correctly placed in `core/port/`, the adapter is the only SDK consumer, and pure aggregation in AgentRegistry plus per-role rollback in AgentSyncer match the design.
- Two HIGH correctness bugs block approval. Both undermine the request's central goal — clean idempotent migration:
  1. `runInit` drops `pipeline` / `specReview` / `specFixer` settings on every run (config wipe).
  2. Empty `definitionHash` from legacy migration causes `init` to leak the old Anthropic agent and create duplicates instead of updating.
- Architectural debt remains (finding #3: stale `core/agent-definition.ts` + duplicate hashing; finding #4: parallel adapter implementations) — recommend cleanup before archive so the request lands without leftover D1-D3 artifacts.
- Scenario Coverage: 75/76 declared TCs are referenced in tests; TC-039 and TC-041 (legacy migration round-trip) are documented but not implemented — exactly the gap that finding #2 hides behind.
- Path forward: fixer should address findings #1, #2, #3, #8 at minimum to clear `needs-fix`. Findings #4-#7 are MEDIUM and worth addressing in this iteration if budget allows; #9-#13 can be deferred or batched with a follow-up.
