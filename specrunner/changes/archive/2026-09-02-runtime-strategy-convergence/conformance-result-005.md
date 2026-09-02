# Conformance Result — Iteration 5

**Change**: runtime-strategy-convergence
**Reviewer role**: conformance (read-only)
**Normative sources**: request.md (acceptance criteria), spec.md (Requirements / Scenarios)
**Plan context**: design.md (D1–D7), tasks.md (T-01–T-14, all checked)

---

## Evidence Summary

| # | Normative Item | Result | Notes |
|---|---------------|--------|-------|
| 1 | `RuntimeStrategy & PipelineDepsBuilder` = 0 in production src/ | ✅ PASS | grep confirms 0 hits |
| 2 | `CommandRunner` doesn't depend on full `RuntimeStrategy` | ✅ PASS | Uses `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder` |
| 3 | `PipelineRunCommand` uses narrow type | ✅ PASS | Constructor takes `RuntimeFacade`; pipelineRuntime stored as `RuntimeFacade` |
| 4 | `ResumeCommand` uses narrow type | ✅ PASS | Constructor takes `RuntimeFacade` (no `RuntimeStrategy` import) |
| 5 | `assertProviderReadiness` called without existence check, before `prepare()` | ✅ PASS | runner.ts:111 `await this.runtime.assertProviderReadiness(...)` — no `if` guard |
| 6 | `assertNoDuplicateLiveJob` called without `?.` before `bootstrapJob` | ✅ PASS | pipeline-run.ts:142 `await this.pipelineRuntime.assertNoDuplicateLiveJob(...)` |
| 7 | `reloadJobState` called without method-existence guard; skip condition preserved | ✅ PASS | runner.ts:193–195 `if (workspaceOpts.existingWorktreePath === undefined)` → direct call |
| 8 | `canDeriveChangedFiles` is required (non-optional) in `ChangedFilesCapability` | ✅ PASS | runtime-strategy.ts:240 `canDeriveChangedFiles(): boolean;` — no `?` |
| 9 | `canDeriveChangedFiles()` called without `?.` in production | ✅ PASS | scope-check:53, runtime-capability-gate:82 direct calls; executor:279 outer `?.` on `changedFiles` field (not method) — preserved per spec |
| 10 | `RealRuntimeStrategy` = 0 everywhere | ✅ PASS | ratchet test TC-009/TC-031 + manual grep confirm 0 |
| 11 | Pick-based derive shims = 0 | ✅ PASS | `deriveCommitInspectionCapability` / `deriveRevisionContentCapability` not found in any src/ file |
| 12 | `as unknown as RuntimeStrategy` = 0 in test files | ✅ PASS | ratchet TC-012 + grep confirm 0 |
| 13 | Test fakes typed against capability interfaces (MUST) | ⚠️ PARTIAL | See Finding F-1 and F-2 |
| 14 | Local/Managed contract test exists | ✅ PASS | `src/core/runtime/__tests__/command-lifecycle-contract.test.ts` (TC-013/TC-014/TC-027–TC-030) |
| 15 | `RuntimeFacade` compile-time assertions for LocalRuntime and ManagedRuntime | ✅ PASS | Type-assignment assertions in command-lifecycle-contract.test.ts |
| 16 | Architecture ratchet exists and covers required forbidden patterns | ✅ PASS | `src/core/port/__tests__/runtime-strategy-ratchet.test.ts` covers TC-008 (production), TC-009/TC-031 (RealRuntimeStrategy), TC-010/TC-011 (shims), TC-012 (double cast), Ratchet: canDeriveChangedFiles?., TC-032 (command/runtime/step test dirs) |
| 17 | `BootstrapResult.runtime` typed as `RuntimeFacade` | ✅ PASS | bootstrap.ts:26 `runtime: RuntimeFacade` |
| 18 | `factory.ts` returns `RuntimeFacade` | ✅ PASS | factory.ts:38 `): RuntimeFacade` |
| 19 | `RuntimeFacade` = 4 lifecycle capabilities + PipelineDepsBuilder + ChangedFilesCapability | ✅ PASS | runtime-facade.ts:27–32 matches design D2 |
| 20 | Behavioral invariants: ordering of prepare/bootstrap/setup/reload/deps/cleanup/teardown unchanged | ✅ PASS | runner.ts execute() sequence matches spec; skip condition for resume path preserved |
| 21 | No optional methods remain in `RuntimeStrategy` interface | ✅ PASS | runtime-strategy.ts grep shows no `?:` method syntax |

---

## Findings

### F-1: `tests/unit/core/step/` still injects whole-port fake into capability slots via `as never`

**Severity**: medium  
**Files**: `tests/unit/core/step/verification-phase-outcome-executor.test.ts` (lines 171–173), `tests/unit/core/step/executor-cli-entry-oid.test.ts` (line 213, 251, 320)

**Normative source**: spec.md Requirement "テスト fake の double cast が typed capability object で置換される":  
> "Test fakes injected into `PipelineDeps` capability slots MUST be typed directly against the capability interface they satisfy"

**Observed**: Both files define `makeRuntimeStrategy(): RuntimeStrategy & PipelineDepsBuilder` and inject the fake into `stepArtifact`, `stepIo`, `changedFiles` slots via `as never`:
```typescript
stepArtifact: makeRuntimeStrategy() as never,
stepIo: makeRuntimeStrategy() as never,
changedFiles: makeRuntimeStrategy() as never,
```
This PR updated these fakes to satisfy the now-required optional methods (11 lines added each), but did not convert the injection pattern to typed capability objects. The `as never` cast bypasses TypeScript's structural check, and the fake is still typed as the whole-port intersection rather than the specific capability interface.

**Failure scenario**: A test assertion or stub that only satisfies `RuntimeStrategy & PipelineDepsBuilder` — not the specific capability interface — passes type-check via `as never`, masking potential interface mismatches. If `StepArtifactLifecycleCapability` gains or changes a member, the monolithic fake won't surface the mismatch at the call site.

**Required fix**: Replace `makeRuntimeStrategy() as never` injections with inline typed objects or builders scoped to the specific capability interface (e.g. `const artifact: StepArtifactLifecycleCapability = { ... }`).

**Fix target**: code-fixer

---

### F-2: `tests/attach/attach-resume-e2e.test.ts` injects whole-port fake via `as never` (known ratchet gap)

**Severity**: low  
**File**: `tests/attach/attach-resume-e2e.test.ts` (lines 323–325)

**Normative source**: Same spec MUST requirement as F-1.

**Observed**: `makeMachineAStrategy(): RuntimeStrategy & PipelineDepsBuilder` is injected via `as never` into `stepArtifact`, `stepIo`, `changedFiles` slots. The ratchet test comment explicitly notes "tests/attach/ remains outside scope (E2E tests — tracked as a known ratchet gap)," confirming intentional deferral.

**Failure scenario**: Same structural mismatch risk as F-1 in E2E context. Lower severity because: (1) E2E tests exercise more integration paths that would surface runtime errors; (2) the ratchet explicitly documents the gap.

**Required fix**: Convert to typed capability objects, same approach as F-1. Extend TC-032 ratchet to cover `tests/attach/` once converted.

**Fix target**: code-fixer

---

## Plan Divergences (non-findings)

- **tasks.md T-14**: All verification targets listed as checked. The PR verifies typecheck + tests green; no divergence from plan.
- **design.md D6 note**: "これにより `as unknown as RuntimeStrategy` も `as never` も不要になる" — design intended `as never` elimination; F-1/F-2 show partial implementation (design intent not fully realized in `tests/unit/core/step/` and `tests/attach/`).
- **TC-032 ratchet gap**: The ratchet's TC-032 covers `tests/unit/core/command/`, `tests/core/provider-readiness-gate.test.ts`, `tests/unit/core/runtime/`, and `tests/unit/step/`, but not `tests/unit/core/step/`. This is not a normative violation of the ratchet spec requirement (which requires checking forbidden patterns in production and double-casts in all tests), but means the `as never` pattern in Finding F-1 has no automated regression guard.

---

## Acceptance Criteria Verification

| Criterion | Status |
|-----------|--------|
| productionに `RuntimeStrategy & PipelineDepsBuilder` が0件 | ✅ |
| `CommandRunner` とsubclassがfull `RuntimeStrategy` に依存しない | ✅ |
| productionのrequired lifecycle処理にoptional call/存在確認がない | ✅ |
| `RealRuntimeStrategy` が0件 | ✅ |
| `Pick` ベースの導出shimが0件 | ✅ |
| `as unknown as RuntimeStrategy` が0件 | ✅ |
| test fakeはtyped builder/helperで必要contractを満たす | ⚠️ (F-1, F-2) |
| Local/Managed双方についてcommand lifecycleのcontract testがある | ✅ |
| full-port依存とfake都合optionalの再導入を防ぐarchitecture ratchetがある | ✅ |
| SpecRunner上の既存verificationがgreen | ✅ (per verification-result.md) |
| ユーザー向け挙動・出力・終了コードに差分がない | ✅ (structural-only refactor; behavioral invariants preserved in runner.ts) |
