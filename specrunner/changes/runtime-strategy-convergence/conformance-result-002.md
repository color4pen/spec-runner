# Conformance Result — runtime-strategy-convergence — iter 2

## Evidence Summary

| Checked | Skipped | Unverified |
|---------|---------|------------|
| 23      | 0       | 0          |

---

## Normative Items Reviewed

### Spec: Provider readiness は副作用より前に無条件で実行される

**PASS**

- `CommandRunner.execute()` (runner.ts:111) calls `await this.runtime.assertProviderReadiness(process.env as Record<string, string | undefined>)` directly before `this.prepare()` is invoked.
- No `if (this.runtime.assertProviderReadiness)` existence check remains (grep: 0 hits in src/).
- `ProviderReadinessCapability` is a named required interface in `src/core/port/command-runtime.ts`; the method `assertProviderReadiness(env)` is required (no `?`).
- `CommandRunner` constructor accepts `ProviderReadinessCapability & ...`; passing a type without `assertProviderReadiness` is a compile-time error (type assertion verified in contract test).

### Spec: Duplicate live-job guard は bootstrapJob より前に無条件で実行される

**PASS**

- `PipelineRunCommand.prepare()` (pipeline-run.ts:142) calls `await this.pipelineRuntime.assertNoDuplicateLiveJob(cwd, slug)` without `?.`
- `bootstrapJob` is called at line 145, after `assertNoDuplicateLiveJob`.
- `JobBootstrapCapability` defines both `assertNoDuplicateLiveJob` and `bootstrapJob` as required methods.
- Old comment "Optional on the port (test fakes may omit it)" is absent from the file.

### Spec: setupWorkspace 後の state reload は skip 条件が維持されつつ無条件で呼ばれる

**PASS**

- runner.ts:193–195:
  ```typescript
  if (workspaceOpts.existingWorktreePath === undefined) {
    try {
      jobState = await this.runtime.reloadJobState(jobState.jobId, slug, workspace);
  ```
- The only guard is `workspaceOpts.existingWorktreePath === undefined` (run path condition). No method-existence check remains.
- `JobStatePersistenceCapability` defines `reloadJobState` as required.
- `ManagedRuntime.reloadJobState` throws `"reloadJobState not implemented for managed runtime"` (fail-closed), consistent with design Risk note and contract test TC-029.

### Spec: `canDeriveChangedFiles` は required method として直接呼ばれる

**PASS**

- `ChangedFilesCapability.canDeriveChangedFiles()` is defined without `?` in `runtime-strategy.ts:240`.
- `scope-check.ts:53`: `deps.changedFiles.canDeriveChangedFiles() === false` — no `?.` on the method.
- `executor.ts:279`: `deps.changedFiles?.canDeriveChangedFiles() !== false` — `?.` is on the `changedFiles` field (capability absence guard), NOT on the method. This is the "changedFilesフィールド自体が undefined の場合のガード" explicitly permitted by the spec.
- `runtime-capability-gate.ts:82`: `runtime.canDeriveChangedFiles() === false` — no `?.`.
- Architecture ratchet (TC in ratchet.test.ts) explicitly checks that `canDeriveChangedFiles?.` (method-level optional chaining) is 0 in production src.

### Spec: production コードは `RuntimeStrategy & PipelineDepsBuilder` を参照しない

**PASS**

- grep of `RuntimeStrategy & PipelineDepsBuilder` across `src/` production files: **0 hits**.
- `CommandRunner` uses `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder`.
- `PipelineRunCommand` and `ResumeCommand` use `RuntimeFacade` (typed alias).
- `factory.ts` returns `RuntimeFacade`.
- `BootstrapResult.runtime` is typed as `RuntimeFacade`.
- Architecture ratchet TC-008 asserts this remains 0 in CI.

### Spec: `RealRuntimeStrategy` は production から撤去される

**PASS**

- grep of `RealRuntimeStrategy` across `src/` (all files including `__tests__/`): 0 hits in production code.
- `runtime-strategy.ts` no longer contains the `RealRuntimeStrategy` type alias.
- Architecture ratchet TC-009 asserts 0 hits in `src/`.
- Architecture ratchet TC-031 asserts 0 hits in `tests/`. (Note: `tests/unit/architecture/core-invariants.test.ts` B-11 section references `RealRuntimeStrategy` as string literals in grep expressions / comments while verifying its absence — verification result confirms all 8 ratchet tests passed.)

### Spec: Pick-based derive shim が production から撤去される

**PASS**

- grep of `deriveCommitInspectionCapability` across `src/`: 0 production hits (only in ratchet test checking for absence).
- grep of `deriveRevisionContentCapability` across `src/`: 0 production hits (only in ratchet test checking for absence).
- `local.ts:636–637` and `managed.ts:344–345` now construct capabilities directly:
  ```typescript
  commitInspection: { listCommitChangedFiles: this.listCommitChangedFiles.bind(this) },
  revisionContent: { readRevisionContent: this.readRevisionContent.bind(this) },
  ```
- grep of `Pick<RuntimeStrategy` across production `src/`: 0 hits.
- Note: `runtime-capability-gate.ts` uses `Pick<ChangedFilesCapability, "canDeriveChangedFiles">` — this is `Pick<ChangedFilesCapability`, not `Pick<RuntimeStrategy`, and is not forbidden by the spec or ratchet.

### Spec: テスト fake の double cast が typed capability object で置換される

**PASS**

- grep of `as unknown as RuntimeStrategy` across `tests/` and `src/**/__tests__/`: **0 hits**.
- `tests/pipeline-sole-committer-e2e.test.ts` now uses:
  ```typescript
  const roundGitEffectsImpl: RoundGitEffectsCapability = { ... }
  const stepIoImpl: StepIoValidationCapability = { ... }
  ```
  both typed directly against their capability interfaces.
- Architecture ratchet TC-012 asserts 0 hits in CI.

### Spec: LocalRuntime と ManagedRuntime は `RuntimeFacade` を構造的に満たす

**PASS**

- `src/core/runtime/__tests__/command-lifecycle-contract.test.ts` contains compile-time type-assignment assertions for both runtimes:
  ```typescript
  const _facade: RuntimeFacade = runtime; // TC-013 (LocalRuntime), TC-014 (ManagedRuntime)
  ```
- Both assignments compile without error (typecheck phase passed).
- Functional assertions confirm `assertProviderReadiness`, `assertNoDuplicateLiveJob`, `bootstrapJob`, `setupWorkspace`, `reloadJobState`, `buildDeps`, and `canDeriveChangedFiles` are functions on both instances.

### Spec: architecture ratchet が禁止パターンの再導入を防ぐ

**PASS**

- `src/core/port/__tests__/runtime-strategy-ratchet.test.ts` exists and asserts 0 occurrences of:
  1. `RuntimeStrategy & PipelineDepsBuilder` (production src)
  2. `RealRuntimeStrategy` (src/, tests/)
  3. `deriveCommitInspectionCapability` (src/)
  4. `deriveRevisionContentCapability` (src/)
  5. `Pick<RuntimeStrategy` (production src)
  6. `canDeriveChangedFiles?.` (production src)
  7. `as unknown as RuntimeStrategy` (test files)
- All 8 ratchet tests passed per verification result.
- The ratchet runs as part of `bun run test` and provides CI regression detection.

### Spec: 振る舞い不変条件が維持される

**PASS**

- Lifecycle ordering in `CommandRunner.execute()` is preserved:
  1. `assertProviderReadiness` → 2. `prepare()` → 3. `setupWorkspace` → 4. `reloadJobState` (run path only) → 5. `buildDeps` → 6. `registerCleanup` → 7. pipeline → 8. `teardown`
- Duplicate guard (`assertNoDuplicateLiveJob`) precedes `bootstrapJob` in `PipelineRunCommand.prepare()`.
- `reloadJobState` skip condition (`existingWorktreePath === undefined`) unchanged.
- Setup failure → state persist → return 1 path unchanged.
- Teardown called in all paths (success, soft-error, exception).
- Local/Managed behavior differences unchanged (ManagedRuntime `reloadJobState` throws, `canDeriveChangedFiles` returns false).
- Verification phase passed (all build/typecheck/test/lint phases green).

---

## Request Acceptance Criteria Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| production に `RuntimeStrategy & PipelineDepsBuilder` が 0 件 | ✅ PASS | grep: 0 hits in src/ production files; ratchet TC-008 enforces |
| `CommandRunner` とsubclassがfull `RuntimeStrategy` に依存しない | ✅ PASS | runner.ts uses capability intersection; pipeline-run.ts and resume.ts use RuntimeFacade |
| productionのrequired lifecycle処理にoptional call/存在確認がない | ✅ PASS | assertProviderReadiness: direct call; reloadJobState: direct call (path-conditioned only); assertNoDuplicateLiveJob: no `?.` |
| `RealRuntimeStrategy` が 0 件 | ✅ PASS | Removed from runtime-strategy.ts; ratchet TC-009/TC-031 enforces |
| `Pick` ベースの導出shimが 0 件 | ✅ PASS | shims removed; local.ts and managed.ts use direct construction |
| `as unknown as RuntimeStrategy` が 0 件 | ✅ PASS | Removed from e2e test; replaced with typed capability objects |
| test fakeはtyped builder/helperで必要contractを満たす | ✅ PASS | pipeline-sole-committer-e2e.test.ts uses `RoundGitEffectsCapability` and `StepIoValidationCapability` typed fakes |
| Local/Managed双方についてcommand lifecycleのcontract testがある | ✅ PASS | command-lifecycle-contract.test.ts covers TC-027–030 + TC-013/TC-014 |
| full-port依存とfake都合optionalの再導入を防ぐarchitecture ratchetがある | ✅ PASS | runtime-strategy-ratchet.test.ts with 8 assertions, all passing |
| SpecRunner上の既存verificationがgreen | ✅ PASS | Verification result: build✅ typecheck✅ test✅ lint✅ changed-line-coverage✅ |
| ユーザー向け挙動・出力・終了コードに差分がない | ✅ PASS | Structural refactoring only; lifecycle ordering preserved; no CLI behavior changes |

---

## Plan Divergences (design/tasks — non-findings)

### D2: RuntimeFacade includes ChangedFilesCapability beyond the 4+1 specified

Design D2 specifies `RuntimeFacade = ProviderReadinessCapability & JobBootstrapCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder`. The actual implementation adds `& ChangedFilesCapability`.

**Rationale** (per command-runtime.ts comment): `PipelineRunCommand.prepare()` calls `assertRuntimeSupportsScope()` which requires `canDeriveChangedFiles()` before any workspace or job state is created. Including `ChangedFilesCapability` in `RuntimeFacade` avoids a separate capability cast and keeps the type cohesive. Both `LocalRuntime` and `ManagedRuntime` already implement `canDeriveChangedFiles`, so no new burden is placed on implementors.

This diverges from D2's specification but does NOT violate any normative spec requirement. All spec requirements referring to RuntimeFacade (LocalRuntime/ManagedRuntime structural satisfaction, compile-time assertion) are met. No finding raised.

### arch-allowlist.ts: DSM entry for command-runtime.ts → core/types.ts import

`src/core/port/command-runtime.ts` (ports layer) imports `PipelineDepsBuilder` from `core/types.ts` (domain layer). This creates a ports→domain edge that violates the DSM closure rule (§3 of architecture/model.md). An entry `R2c-command-runtime-dsm` was added to `arch-allowlist.ts` to track this known divergence.

This is a tracked architectural debt introduced by this changeset, not a spec violation. The design document (D1) acknowledges this by specifying that `PipelineDepsBuilder` is imported into `command-runtime.ts`. No finding raised per the normative scope.
