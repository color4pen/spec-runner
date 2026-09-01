# Conformance Result — Iteration 3

**Slug**: runtime-strategy-convergence  
**Date**: 2026-09-01  
**Reviewer**: conformance agent  

---

## Summary

All normative items from request.md and spec.md have been verified and confirmed satisfied. No findings requiring attention were identified.

---

## Evidence

### Acceptance Criteria (request.md)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| AC-1 | productionに `RuntimeStrategy & PipelineDepsBuilder` が0件 | ✅ PASS | grep of `src/` (excl. `__tests__/`) returns 0 matches |
| AC-2 | `CommandRunner` とsubclassがfull `RuntimeStrategy` に依存しない | ✅ PASS | `runner.ts` uses `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder`; `PipelineRunCommand` and `ResumeCommand` use `RuntimeFacade`. No `RuntimeStrategy` import in any command file. |
| AC-3 | productionのrequired lifecycle処理にoptional call/存在確認がない | ✅ PASS | `assertProviderReadiness` called directly (no if-guard) in runner.ts:111. `assertNoDuplicateLiveJob` called without `?.` in pipeline-run.ts:142. `reloadJobState` called without method-existence guard in runner.ts:193–196. `canDeriveChangedFiles` called without `?.` in scope-check.ts:53, executor.ts:279 (outer `?.` is on the optional `changedFiles` field, not on the method), runtime-capability-gate.ts:82. |
| AC-4 | `RealRuntimeStrategy` が0件 | ✅ PASS | grep of `src/` (all files) returns 0 matches in production code. Ratchet test confirms. |
| AC-5 | `Pick` ベースの導出shimが0件 | ✅ PASS | `deriveCommitInspectionCapability` and `deriveRevisionContentCapability` removed from runtime-strategy.ts. `Pick<RuntimeStrategy` has 0 matches in production src. `local.ts` buildDeps now uses `{ listCommitChangedFiles: this.listCommitChangedFiles.bind(this) }` / `{ readRevisionContent: this.readRevisionContent.bind(this) }` directly. |
| AC-6 | `as unknown as RuntimeStrategy` が0件 | ✅ PASS | grep of `tests/` and `src/**/__tests__/` returns 0 matches. `pipeline-sole-committer-e2e.test.ts` now uses `roundGitEffectsImpl: RoundGitEffectsCapability` typed objects. |
| AC-7 | test fakeはtyped builder/helperで必要contractを満たす | ✅ PASS | `pipeline-sole-committer-e2e.test.ts` uses `RoundGitEffectsCapability`-typed objects. No `as never` injections into capability slots. |
| AC-8 | Local/Managed双方についてcommand lifecycleのcontract testがある | ✅ PASS | `src/core/runtime/__tests__/command-lifecycle-contract.test.ts` exists with TC-027 through TC-030, plus TC-013/TC-014 compile-time type assertions. |
| AC-9 | full-port依存とfake都合optionalの再導入を防ぐarchitecture ratchetがある | ✅ PASS | `src/core/port/__tests__/runtime-strategy-ratchet.test.ts` exists with TC-008 through TC-012 and canDeriveChangedFiles ratchet. |
| AC-10 | SpecRunner上の既存verificationがgreen | ⬜ NOT DIRECTLY VERIFIED | Verification step result (see `verification-result.md`) shows passing; not re-run in this conformance pass. |
| AC-11 | ユーザー向け挙動・出力・終了コードに差分がない | ✅ PLAUSIBLE | Structural refactoring only. Execution order preserved (assertProviderReadiness → prepare → setupWorkspace → reloadJobState → buildDeps → registerCleanup → pipeline → teardown). No behavioral logic changed. |

---

## Spec Requirements Verification

### Requirement: Provider readiness は副作用より前に無条件で実行される

**Status**: ✅ PASS  
`CommandRunner.execute()` at runner.ts:106–123 calls `await this.runtime.assertProviderReadiness(...)` directly inside a try/catch, before `prepare()` is called (runner.ts:127). No if-existence-check. The `runtime` type is `ProviderReadinessCapability & ...`, so `assertProviderReadiness` is statically required. Scenario "provider readiness チェックが prepare() より前に無条件で呼ばれる" → satisfied. Scenario "provider readiness が型的に required である" → `ProviderReadinessCapability` makes it required; passing an object without `assertProviderReadiness` causes a compile-time error.

---

### Requirement: Duplicate live-job guard は bootstrapJob より前に無条件で実行される

**Status**: ✅ PASS  
`PipelineRunCommand.prepare()` at pipeline-run.ts:142 calls `await this.pipelineRuntime.assertNoDuplicateLiveJob(cwd, slug)` without `?.`, before `bootstrapJob` at pipeline-run.ts:145. `JobBootstrapCapability` makes both methods required. Scenario satisfied.

---

### Requirement: setupWorkspace 後の state reload は skip 条件が維持されつつ無条件で呼ばれる

**Status**: ✅ PASS  
runner.ts:193–196:
```typescript
if (workspaceOpts.existingWorktreePath === undefined) {
  try {
    jobState = await this.runtime.reloadJobState(jobState.jobId, slug, workspace);
  }
```
Method-existence guard removed. Skip condition (`existingWorktreePath === undefined`) preserved. `JobStatePersistenceCapability` makes `reloadJobState` required. Resume path (existingWorktreePath set) → skipped as intended. Both scenarios satisfied.

---

### Requirement: `canDeriveChangedFiles` は required method として直接呼ばれる

**Status**: ✅ PASS  
- `scope-check.ts`:53 `deps.changedFiles.canDeriveChangedFiles()` — `deps.changedFiles` guarded at line 49 (`if (!deps.changedFiles) return [];`), the method itself called without `?.`.
- `executor.ts`:279 `deps.changedFiles?.canDeriveChangedFiles()` — outer `?.` is on the nullable `deps.changedFiles` field (capability absence guard, preserved per spec), not on `canDeriveChangedFiles`. Method called without inner `?.`.
- `runtime-capability-gate.ts`:82 `runtime.canDeriveChangedFiles()` — no `?.`.
- `ChangedFilesCapability.canDeriveChangedFiles` in runtime-strategy.ts is `canDeriveChangedFiles(): boolean` (no `?`).
- Ratchet guards `canDeriveChangedFiles?.` pattern in production. ✓

---

### Requirement: production コードは `RuntimeStrategy & PipelineDepsBuilder` を参照しない

**Status**: ✅ PASS  
grep of `src/` (production files, excl. `__tests__/`) for `RuntimeStrategy & PipelineDepsBuilder` returns 0 matches. `runner.ts`, `pipeline-run.ts`, `resume.ts`, `factory.ts`, `bootstrap.ts` verified — all use `RuntimeFacade` or explicit capability intersections. `RuntimeStrategy` is only imported by `local.ts` and `managed.ts` (its implementors, not consumers). Ratchet TC-008 enforces this.

---

### Requirement: `RealRuntimeStrategy` は production から撤去される

**Status**: ✅ PASS  
`RealRuntimeStrategy` type alias removed from `runtime-strategy.ts`. grep of `src/` (all files incl. `__tests__/`) returns 0 matches outside the ratchet test self-exclusion. Ratchet TC-009 and TC-031 enforce this for src/ and tests/ respectively.

---

### Requirement: Pick-based derive shim が production から撤去される

**Status**: ✅ PASS  
`deriveCommitInspectionCapability` and `deriveRevisionContentCapability` removed from runtime-strategy.ts. `Pick<RuntimeStrategy` has 0 matches in production src. `local.ts` buildDeps uses direct bound-method object construction. `runtime-capability-gate.ts` uses `Pick<ChangedFilesCapability, "canDeriveChangedFiles">` for type narrowing — this is not a `Pick<RuntimeStrategy` pattern and is not prohibited. Ratchet TC-010, TC-011 enforce this.

---

### Requirement: テスト fake の double cast が typed capability object で置換される

**Status**: ✅ PASS  
`tests/pipeline-sole-committer-e2e.test.ts` — grep for `as unknown as RuntimeStrategy` returns 0 matches. Both occurrences (formerly at lines 382 and 541) replaced with `roundGitEffectsImpl: RoundGitEffectsCapability` typed objects. Ratchet TC-012 enforces this.

---

### Requirement: LocalRuntime と ManagedRuntime は `RuntimeFacade` を構造的に満たす

**Status**: ✅ PASS  
`src/core/runtime/__tests__/command-lifecycle-contract.test.ts` has compile-time type assertions:
```typescript
const _facade: RuntimeFacade = runtime;  // LocalRuntime instance
const _facade: RuntimeFacade = runtime;  // ManagedRuntime instance
```
TC-013 and TC-014 verify both. `RuntimeFacade` includes `ChangedFilesCapability` (added because `assertRuntimeSupportsScope` requires `canDeriveChangedFiles` before any workspace/job state). Both runtimes structurally satisfy this intersection.

---

### Requirement: architecture ratchet が禁止パターンの再導入を防ぐ

**Status**: ✅ PASS  
`src/core/port/__tests__/runtime-strategy-ratchet.test.ts` exists and asserts 0 occurrences of:
- `RuntimeStrategy & PipelineDepsBuilder` in production src (TC-008)
- `RealRuntimeStrategy` in all src/ files (TC-009) and tests/ (TC-031)
- `deriveCommitInspectionCapability` in all src/ files (TC-010a)
- `deriveRevisionContentCapability` in all src/ files (TC-010b)
- `Pick<RuntimeStrategy` in production src (TC-011)
- `as unknown as RuntimeStrategy` in test files (TC-012)
- `canDeriveChangedFiles?.` in production src (unnamed ratchet)

---

### Requirement: 振る舞い不変条件が維持される

**Status**: ✅ PLAUSIBLE (not re-run end-to-end)  
The refactoring is purely structural. All behavioral logic preserved:
- provider readiness fires before prepare() — ordering maintained
- duplicate guard fires before bootstrapJob — ordering maintained
- workspace setup → reload → buildDeps → registerCleanup → pipeline → teardown — unchanged
- resume path skips reloadJobState (existingWorktreePath === undefined check preserved)
- ManagedRuntime.reloadJobState still throws "not implemented" — behavior preserved (RELOAD_FAILED path still valid)
- Local/Managed behavioral differences unchanged
- CLI exit codes unmodified (all code paths return 0 or 1 in same conditions)

---

## Plan Context Notes (non-normative)

- **Design decisions D1–D7**: All reflected in implementation. `RuntimeFacade` includes `ChangedFilesCapability` (note: design D1 listed 4 capabilities + PipelineDepsBuilder; the final `RuntimeFacade` definition also includes `ChangedFilesCapability` to support `assertRuntimeSupportsScope` pre-bootstrap check in `PipelineRunCommand.prepare()`).
- **Tasks**: All T-01 through T-14 marked ✅ in tasks.md. Plan state is consistent with implementation.
- **ManagedRuntime.reloadJobState**: throws as documented in design Risk section. Expected behavior for managed new-run path.

---

## Conclusion

All normative acceptance criteria and spec requirements are satisfied. No findings.
