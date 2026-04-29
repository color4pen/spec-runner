# Implementation Notes: 2026-04-29-d4-d6-agent-migration

## Summary

- **result**: completed
- **tasks_completed**: 62/70 (Groups 1-8 complete; Groups 9-10 partially done — 9.2-9.5, 9.7-9.8, 10.1-10.3 are manual/environment-dependent checks)
- **test_count**: 277 pass, 0 fail

## Files Modified

### New Files

| Path | Operation | Notes |
|------|-----------|-------|
| `src/core/agent/definition.ts` | CREATE | AgentDefinition / AgentCapabilities / ToolSpec / AgentToolsetSpec / CustomToolSpec types |
| `src/core/agent/hash.ts` | CREATE | canonicalJson + hashObject (SHA-256 with "sha256:" prefix) |
| `src/core/agent/registry.ts` | CREATE | AgentRegistry.fromSteps / get / list / hashOf |
| `src/core/agent/syncer.ts` | CREATE | AgentSyncer.syncAll with rollback / SyncResult / SyncRoleResult / AgentSyncerConfig |
| `src/core/agent/index.ts` | CREATE | Re-exports for all agent module types |
| `src/core/port/anthropic-client.ts` | CREATE | AnthropicClient port interface (createAgent/retrieveAgent/updateAgent/archiveAgent) |
| `src/core/port/config-store.ts` | CREATE | ConfigStore port interface (load/save/getAgentId/upsertAgent) |
| `src/adapter/anthropic/anthropic-client.ts` | CREATE | AnthropicClientAdapter implementing AnthropicClient port via SDK |
| `src/config/migrate.ts` | CREATE | migrateConfig + applyMigration (3 migration operations: legacy→propose, camelCase→kebab, gaps remain absent) |
| `tests/unit/agent/registry.test.ts` | CREATE | TC-024/025/026/027/028/029/045/071 |
| `tests/unit/agent/syncer.test.ts` | CREATE | TC-015/016/017/018/019/023/055 |
| `tests/unit/agent/syncer-rollback.test.ts` | CREATE | TC-020/021/022 |
| `tests/unit/config/migrate.test.ts` | CREATE | TC-001/002/003/004/005/006/007/008/010 |
| `tests/unit/step/agent-definition.test.ts` | CREATE | TC-032/033/034/035/036/037/047/052 |
| `tests/unit/step/executor.test.ts` | CREATE | TC-030/031 |

### Modified Files

| Path | Operation | Notes |
|------|-----------|-------|
| `src/config/schema.ts` | MODIFY | New AgentRecord (agentId field), SpecRunnerConfig.agents as Record<string,AgentRecord>, RawConfig added, legacy agent field removed from canonical type |
| `src/config/store.ts` | MODIFY | loadConfig uses applyMigration before validate; saveConfig strips legacy agent field; FileConfigStore class added |
| `src/config/getAgentId.ts` | MODIFY | Takes StepName (kebab-case), reads agents[role].agentId only — no legacy fallback |
| `src/core/step/types.ts` | MODIFY | Step.agent is now AgentDefinition (full) not {agentId: string} |
| `src/core/step/propose.ts` | MODIFY | Full AgentDefinition with role:"propose", name, model, system, tools |
| `src/core/step/spec-review.ts` | MODIFY | Dedicated AgentDefinition with role:"spec-review", own system prompt |
| `src/core/step/spec-fixer.ts` | MODIFY | Full AgentDefinition with role:"spec-fixer", tools |
| `src/prompts/spec-review-system.ts` | MODIFY | SPEC_REVIEW_SYSTEM_PROMPT exported (was unexported) |
| `src/core/step/executor.ts` | MODIFY | STEP_AGENT_ROLE Map removed; uses step.agent.role directly via getAgentId |
| `src/adapter/anthropic/index.ts` | MODIFY | Added AnthropicClientAdapter export |
| `src/cli/init.ts` | MODIFY | Replaced per-agent manual sync with AgentRegistry.fromSteps + AgentSyncer.syncAll; saves new canonical schema |
| `tests/config/getAgentId.test.ts` | MODIFY | Updated for new schema (agentId field, kebab-case keys) |
| `tests/pipeline.test.ts` | MODIFY | Config fixtures updated to new schema |
| `tests/pipeline-integration.test.ts` | MODIFY | Config fixtures updated to new schema |
| `tests/spec-review-step.test.ts` | MODIFY | Config fixtures updated to new schema |
| `tests/core/steps/spec-review.test.ts` | MODIFY | Config fixtures updated to new schema |
| `tests/core/step/step-interface.test.ts` | MODIFY | Mock Steps use full AgentDefinition |
| `tests/cli-stdout-snapshot.test.ts` | MODIFY | Mock Steps use full AgentDefinition |
| `tests/init.test.ts` | MODIFY | TC-057/058/059/060/061 updated for new schema; uses AgentRegistry for hash computation |
| `tests/cli.test.ts` | MODIFY | Fixed vi.mock("node:child_process") factory function (Vitest 4.x syntax) |
| `openspec/changes/2026-04-29-d4-d6-agent-migration/tasks.md` | MODIFY | Tasks 1.1-8.4 marked complete |

## Key Design Decisions

1. **AgentSyncer in core/agent/**: Placed in core (not adapter/) because AnthropicClient is a port interface — AgentSyncer is testable with fake implementations.

2. **init.ts uses AnthropicClientAdapter directly**: `buildSdkAdapter` has been removed. init.ts now imports `AnthropicClientAdapter` from `adapter/anthropic/index.js` and calls `new AnthropicClientAdapter(rawSdk)`. The test mock chain continues to work because `vi.mock("sdk/client.js")` replaces `createAnthropicClient` to return a mock object — `AnthropicClientAdapter` is constructed with that mock object and delegates through it, so `sdk.beta.agents.*` calls resolve against the mock. The previous concern about pulling in the real SDK via import is not a problem: Vitest module mocking operates at the module boundary for `sdk/client.js`, not for `adapter/anthropic/anthropic-client.ts`. PR review re-raised this as an architecture invariant violation (dead code + drift risk) and the constructor-injection path has been verified to work with the existing mock setup.

3. **SyncRoleResult.lastSyncedAt**: AgentSyncer sets this at sync time; init.ts uses it directly when writing config.

4. **Environment rollback responsibility**: AgentSyncer handles rollback within syncAll() failures. Post-syncAll environment creation failure is rolled back by init.ts iterating syncResult.results for action:"create" entries.

5. **Migration is non-destructive**: `migrateConfig` never overwrites an already-present agents[role] — it only fills gaps. The 3 operations (legacy→propose, camelCase→kebab, gaps remain absent) are independent.

## Blocked Tasks

None. All implementation tasks in Groups 1-8 are complete.

Tasks 9.2-9.5, 9.7-9.8, and 10.1-10.3 are manual/environment checks (self-hosting required for E2E, openspec CLI tool required for validate) — these are acceptance criteria verification steps, not implementation tasks.

## Fix History (code-fixer iteration 1)

Applied after review-feedback-001.md (score 6.95, needs-fix).

| Finding | Severity | Files Modified | Summary |
|---------|----------|----------------|---------|
| #1 | HIGH | `src/cli/init.ts:131-140` | Spread `existingConfig` before init-owned fields so `pipeline`/`specReview`/`specFixer` survive re-init |
| #2 | HIGH | `src/cli/init.ts:53-62` | `getStoredAgent` returns `{ agentId, definitionHash: record.definitionHash ?? "" }` whenever `agentId` is set; empty hash routes to updateAgent |
| #3 | MEDIUM | `src/core/agent-definition.ts` (DELETE), `tests/agent-definition.test.ts` | Deleted stale pre-D4 module; TC-070/TC-071 migrated to `hashObject` from `core/agent/hash.ts` |
| #6 | MEDIUM | `src/config/migrate.ts:40,82` | `lastSyncedAt` fallback changed from `new Date().toISOString()` to `""` sentinel |
| #7 | MEDIUM | `src/config/store.ts:94-110` | Removed dead `updateConfig` export (no callers) |
| #8 | MEDIUM | `tests/init.test.ts` | Added TC-039 (legacy migration → reuse agentId via updateAgent) and TC-041 (404 fallback → propose only re-created) |
| #10 | LOW | `src/core/tools/register-branch.ts:7` | Updated stale "ONLY place" comment |
| #11 | LOW | `src/core/agent/syncer.ts:127-130` | Rollback re-throw wraps with role context; `cause` preserves original error |

Findings skipped:
- #4 (MEDIUM): `buildSdkAdapter` duplication — deferred at the time; see Fix History (code-fixer iteration 2) below where this was resolved as a PR review HIGH finding.
- #5 (MEDIUM): Environment rollback via rawSdk — kept as-is; init.ts rollback path handles post-syncAll environment failures independently from AgentSyncer.rollback. (Note: rollback now routes through agentClient.archiveAgent per iteration 2 fix.)
- #9 (LOW): eslint-disable suppressions — resolved naturally by iteration 2 deletion of buildSdkAdapter.
- #12 (LOW): validateConfig plain-object guard — low risk; no un-migrated callers exist.
- #13 (LOW): STEP_AGENT_ROLE narrative comments — deferred to archive cleanup.

## Fix History (code-fixer iteration 2)

Applied after PR #28 review re-raised finding #4 as a HIGH architecture invariant violation.

| Finding | Severity | Files Modified | Summary |
|---------|----------|----------------|---------|
| PR#28 #1 | HIGH | `src/cli/init.ts` | Deleted `buildSdkAdapter`; replaced with `new AnthropicClientAdapter(rawSdk)` (import from `adapter/anthropic/index.js`). Rollback path changed from `rawSdk.beta.agents.archive(id)` to `agentClient.archiveAgent(id)`. Unused `AgentDefinition` import removed. 5 eslint-disable suppressions removed as a natural consequence. |
