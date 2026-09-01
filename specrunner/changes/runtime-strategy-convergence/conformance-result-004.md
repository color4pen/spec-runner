# Conformance Result — Iteration 004

**Change**: runtime-strategy-convergence  
**Date**: 2026-09-01  
**Reviewer role**: conformance

---

## Evidence Summary

| Category | Checked | Result |
|----------|---------|--------|
| request.md acceptance criteria | 11 | All satisfied |
| spec.md Requirements (SHALL/MUST) | 9 | All satisfied |
| Normative Scenarios | 12 | All satisfied |
| Verification (tests/build/lint) | All phases | Green |

---

## Acceptance Criteria Verification

### AC-1: productionに `RuntimeStrategy & PipelineDepsBuilder` が0件

**PASS.** Grep across `src/` (excluding `__tests__/` dirs) returns 0 hits. The only occurrences are inside the ratchet test file itself (`src/core/port/__tests__/runtime-strategy-ratchet.test.ts`) where the string appears as a test pattern and comment, not as a production type reference.

### AC-2: `CommandRunner` とsubclassがfull `RuntimeStrategy` に依存しない

**PASS.**
- `runner.ts` constructor: `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder` — no `RuntimeStrategy` import.
- `pipeline-run.ts`: imports and uses `RuntimeFacade` — no `RuntimeStrategy` import.
- `resume.ts`: imports and uses `RuntimeFacade` — no `RuntimeStrategy` import.

### AC-3: productionのrequired lifecycle処理にoptional call/存在確認がない

**PASS.**
- `runner.ts:111`: `await this.runtime.assertProviderReadiness(...)` — direct call, no existence guard.
- `pipeline-run.ts:142`: `await this.pipelineRuntime.assertNoDuplicateLiveJob(cwd, slug)` — no `?.`.
- `runner.ts:193–213`: `if (workspaceOpts.existingWorktreePath === undefined)` then `await this.runtime.reloadJobState(...)` — skip condition maintained, method-existence guard removed.
- `scope-check.ts:53`: `deps.changedFiles.canDeriveChangedFiles() === false` — no `?.` on the method.
- `runtime-capability-gate.ts:82`: `runtime.canDeriveChangedFiles() === false` — no `?.`.

Note: `executor.ts:279` has `deps.changedFiles?.canDeriveChangedFiles()` — the `?.` is on the outer `changedFiles` field (field-absence guard, explicitly permitted by spec: "changedFiles フィールド自体が undefined の場合のガード（capability absence）はこれとは別に維持される"). The method `canDeriveChangedFiles` is called without `?.`. The ratchet guards against `canDeriveChangedFiles?.` (method-level optional chain) and correctly does not flag this pattern.

### AC-4: `RealRuntimeStrategy` が0件

**PASS.** Grep of `src/` and `tests/` (including `__tests__/`) returns 0 hits for `RealRuntimeStrategy`.

### AC-5: `Pick` ベースの導出shimが0件

**PASS.**
- `deriveCommitInspectionCapability` removed from `runtime-strategy.ts`; 0 occurrences anywhere.
- `deriveRevisionContentCapability` removed from `runtime-strategy.ts`; 0 occurrences anywhere.
- `Pick<RuntimeStrategy` 0 occurrences in production source.
- `local.ts` and `managed.ts` `buildDeps()` now directly construct capability objects: `{ listCommitChangedFiles: this.listCommitChangedFiles.bind(this) }` and `{ readRevisionContent: this.readRevisionContent.bind(this) }`.

### AC-6: `as unknown as RuntimeStrategy` が0件

**PASS.** `tests/pipeline-sole-committer-e2e.test.ts` no longer contains the double cast. The typed capability objects (`RoundGitEffectsCapability`, `StepIoValidationCapability`) are used directly. Ratchet test TC-012 confirms 0 occurrences in all test files.

### AC-7: test fakeはtyped builder/helperで必要contractを満たす

**PASS.** `tests/pipeline-sole-committer-e2e.test.ts` constructs typed objects directly against `RoundGitEffectsCapability` and `StepIoValidationCapability` interfaces, eliminating `as unknown as RuntimeStrategy` and `as never` casts.

### AC-8: Local/Managed双方についてcommand lifecycleのcontract testがある

**PASS.** `src/core/runtime/__tests__/command-lifecycle-contract.test.ts` contains:
- TC-013: LocalRuntime が RuntimeFacade を構造的に満たす（compile-time型代入アサーション）
- TC-014: ManagedRuntime が RuntimeFacade を構造的に満たす（compile-time型代入アサーション）
- TC-027: assertProviderReadiness の Local/Managed 差異
- TC-028: assertNoDuplicateLiveJob の Local/Managed 差異
- TC-029: reloadJobState の Local/Managed 差異（managed throws "not implemented"）
- TC-030: canDeriveChangedFiles の Local/Managed 差異

### AC-9: full-port依存とfake都合optionalの再導入を防ぐarchitecture ratchetがある

**PASS.** `src/core/port/__tests__/runtime-strategy-ratchet.test.ts` asserts 0 occurrences of all 7 forbidden patterns (TC-008 through TC-032). Ratchet test ran in verification and all 10 assertions passed.

### AC-10: SpecRunner上の既存verificationがgreen

**PASS.** Verification result shows all test phases passing: typecheck, test suite (all TC-* tests pass), lint (0 warnings), changed-line-coverage passed.

### AC-11: ユーザー向け挙動・出力・終了コードに差分がない

**PASS.** This is a structural refactoring only. The execution sequence in `CommandRunner.execute()` is unchanged: assertProviderReadiness → prepare() → setupWorkspace → reloadJobState (run path only) → buildDeps → registerCleanup → runPipeline → handleResult → teardown. Error codes and log outputs are unchanged.

---

## Spec Requirements Verification

### Requirement: Provider readiness は副作用より前に無条件で実行される

**SATISFIED.** `runner.ts:110–123` calls `await this.runtime.assertProviderReadiness(...)` in a try/catch before `prepare()` at line 127. No existence guard. TypeScript type of `runtime` requires `ProviderReadinessCapability`, making omission a compile-time error.

### Requirement: Duplicate live-job guard は bootstrapJob より前に無条件で実行される

**SATISFIED.** `pipeline-run.ts:142` calls `await this.pipelineRuntime.assertNoDuplicateLiveJob(cwd, slug)` before `bootstrapJob(...)` at line 145. No `?.`. `RuntimeFacade` requires `JobBootstrapCapability` (both methods required).

### Requirement: setupWorkspace 後の state reload は skip 条件が維持されつつ無条件で呼ばれる

**SATISFIED.** `runner.ts:193–213`: `if (workspaceOpts.existingWorktreePath === undefined)` then `await this.runtime.reloadJobState(...)`. Resume path (existingWorktreePath set) skips reload. Method-existence guard removed. `JobStatePersistenceCapability` requires both `persistJobState` and `reloadJobState`.

### Requirement: `canDeriveChangedFiles` は required method として直接呼ばれる

**SATISFIED.** `ChangedFilesCapability.canDeriveChangedFiles(): boolean` (no `?`) at runtime-strategy.ts:240. `RuntimeStrategy.canDeriveChangedFiles(): boolean` (no `?`) at runtime-strategy.ts:538. Direct calls in scope-check.ts:53 and runtime-capability-gate.ts:82 without `?.`.

### Requirement: production コードは `RuntimeStrategy & PipelineDepsBuilder` を参照しない

**SATISFIED.** 0 occurrences in command-layer files. Factory returns `RuntimeFacade`. `BootstrapResult.runtime` is typed `RuntimeFacade`.

### Requirement: `RealRuntimeStrategy` は production から撤去される

**SATISFIED.** `runtime-strategy.ts` no longer contains `RealRuntimeStrategy`. 0 occurrences anywhere.

### Requirement: Pick-based derive shim が production から撤去される

**SATISFIED.** Both shim functions deleted. `Pick<RuntimeStrategy` 0 in production. `buildDeps()` directly constructs capability objects.

### Requirement: テスト fake の double cast が typed capability object で置換される

**SATISFIED.** `tests/pipeline-sole-committer-e2e.test.ts` 0 occurrences of `as unknown as RuntimeStrategy`. Typed objects against `RoundGitEffectsCapability` and `StepIoValidationCapability`.

### Requirement: LocalRuntime と ManagedRuntime は `RuntimeFacade` を構造的に満たす

**SATISFIED.** `command-lifecycle-contract.test.ts` TC-013/TC-014 provide compile-time type-assignment assertions (`const _facade: RuntimeFacade = runtime`). These assertions pass without error.

### Requirement: architecture ratchet が禁止パターンの再導入を防ぐ

**SATISFIED.** `src/core/port/__tests__/runtime-strategy-ratchet.test.ts` exists and all 10 assertions pass in CI. Guards all 7 forbidden patterns.

### Requirement: 振る舞い不変条件が維持される

**SATISFIED.** Structural refactoring only — no execution order changes. All ordering constraints (readiness → prepare, duplicate-guard → bootstrap, setup → reload → deps → cleanup → pipeline → teardown) preserved. Resume-path skip condition preserved. Setup failure handling unchanged.

---

## Plan Divergences (Design / Tasks — Informational Only)

No normative violations from design/tasks divergences were found.

- **D3 (optional methods)**: All 10 optional methods in `RuntimeStrategy` have been made required (confirmed: no `?` suffix on any method in the interface). ✅
- **RuntimeFacade location**: Design D2 mentioned the alias would be in `command-runtime.ts`; it was instead placed in `src/core/runtime-facade.ts` to avoid a ports→domain import edge. This is a valid implementation adaptation not in conflict with any spec requirement.
- **RuntimeFacade includes `ChangedFilesCapability`**: The implemented `RuntimeFacade` intersects `ChangedFilesCapability` in addition to the four lifecycle capabilities and `PipelineDepsBuilder`. This is consistent with `PipelineRunCommand` needing `assertRuntimeSupportsScope` (which takes `ChangedFilesCapability`). No spec requirement is violated.
- **tasks.md**: All checkboxes are ticked (T-01 through T-14). Treated as plan context only.

---

## Conclusion

All normative items (11 acceptance criteria, 9 spec requirements, 12 scenarios) are satisfied. Verification is green. No findings.
