# Conformance Result — Iteration 008

**Change**: runtime-strategy-convergence  
**Iteration**: 8  
**Reviewer role**: conformance  
**Normative sources**: request.md (acceptance criteria), spec.md (Requirements + Scenarios)  
**Plan sources (non-binding)**: design.md (D1–D7), tasks.md (T-01 – T-14)

---

## Evidence Summary

| Checked | Skipped | Unverified |
|---------|---------|------------|
| 22      | 0       | 0          |

---

## Acceptance Criteria Verification

### AC-1: production に `RuntimeStrategy & PipelineDepsBuilder` が 0 件

**Status**: PASS  
**Evidence**: `grep -rn "RuntimeStrategy & PipelineDepsBuilder" src/ --include="*.ts"` (excluding `__tests__/`) returns 0 hits.

---

### AC-2: `CommandRunner` とsubclassがfull `RuntimeStrategy` に依存しない

**Status**: PASS  
**Evidence**:
- `runner.ts` constructor type: `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder` — no `RuntimeStrategy` reference.
- `pipeline-run.ts` constructor type: `RuntimeFacade` — no `RuntimeStrategy` reference.
- `resume.ts` constructor type: `RuntimeFacade` — no `RuntimeStrategy` reference.
- `grep -rn "RuntimeStrategy" src/core/command/` returns 0 hits.

---

### AC-3: productionのrequired lifecycle処理にoptional call/存在確認がない

**Status**: PASS  
**Evidence**:
- `runner.ts` line 113: `await this.runtime.assertProviderReadiness(...)` — direct call, no `if`/`?.` guard.
- `runner.ts` line 195: `if (workspaceOpts.existingWorktreePath === undefined)` — method existence check removed; only path condition remains.
- `pipeline-run.ts` line 142: `await this.pipelineRuntime.assertNoDuplicateLiveJob(cwd, slug)` — direct call, no `?.`.
- `runtime-capability-gate.ts` line 85: `runtime.canDeriveChangedFiles() === false` — direct call, no `?.`.
- `scope-check.ts` line 53: `deps.changedFiles.canDeriveChangedFiles() === false` — direct call.
- `executor.ts` line 279: `deps.changedFiles?.canDeriveChangedFiles()` — `?.` is on `changedFiles` (capability-absence guard, explicitly preserved per spec), not on `canDeriveChangedFiles` method itself.

---

### AC-4: `RealRuntimeStrategy` が 0 件

**Status**: PASS  
**Evidence**: `grep -rn "RealRuntimeStrategy" src/ tests/ --include="*.ts"` returns hits only in `runtime-strategy-ratchet.test.ts` (self-referential string literals in ratchet guard code). No production or other test file defines or references `RealRuntimeStrategy`.

---

### AC-5: `Pick` ベースの導出shimが 0 件

**Status**: PASS  
**Evidence**:
- `grep "deriveCommitInspectionCapability\|deriveRevisionContentCapability" src/` returns 0 hits (excluding ratchet test self-references).
- `grep "Pick<RuntimeStrategy" src/` returns 0 hits.

---

### AC-6: `as unknown as RuntimeStrategy` が 0 件

**Status**: PASS  
**Evidence**: `grep -rn "as unknown as RuntimeStrategy" tests/ src/ --include="*.ts"` returns 0 hits (excluding ratchet test self-references). `pipeline-sole-committer-e2e.test.ts` now uses typed `RoundGitEffectsCapability` and `StepIoValidationCapability` objects.

---

### AC-7: test fakeはtyped builder/helperで必要contractを満たす

**Status**: PASS  
**Evidence**: In `tests/pipeline-sole-committer-e2e.test.ts`, capability slots are constructed as:
- `roundGitEffectsImpl: RoundGitEffectsCapability` — typed directly against the capability interface.
- `stepIoImpl: StepIoValidationCapability` — typed directly against the capability interface.
No `as unknown as RuntimeStrategy` or `as never` on capability slots.

---

### AC-8: Local/Managed双方についてcommand lifecycleのcontract testがある

**Status**: PASS  
**Evidence**: `src/core/runtime/__tests__/command-lifecycle-contract.test.ts` exists and covers:
- TC-013: LocalRuntime satisfies RuntimeFacade (compile-time type assertion + runtime checks).
- TC-014: ManagedRuntime satisfies RuntimeFacade (compile-time type assertion + runtime checks).
- TC-027: assertProviderReadiness — local probe / managed no-op.
- TC-028: assertNoDuplicateLiveJob — local / managed both resolve for empty dir.
- TC-029: reloadJobState — local throws on missing store; managed throws "not implemented".
- TC-030: canDeriveChangedFiles — local returns boolean true; managed returns false.

---

### AC-9: full-port依存とfake都合optionalの再導入を防ぐarchitecture ratchetがある

**Status**: PASS  
**Evidence**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts` exists and asserts 0 occurrences of:
- `RuntimeStrategy & PipelineDepsBuilder` in production source (TC-008).
- `RealRuntimeStrategy` in all src/ files (TC-009) and tests/ (TC-031).
- `Pick<RuntimeStrategy` in production source (TC-011).
- `deriveCommitInspectionCapability` and `deriveRevisionContentCapability` in all src/ files (TC-010).
- `as unknown as RuntimeStrategy` in test files (TC-012).
- `as any as RuntimeStrategy` in test files (TC-012b).
- `canDeriveChangedFiles?.` in production source.
- TC-035 variants guard command/runtime/step/attach/pipeline/root-level test directories against whole-port re-introduction.

---

### AC-10: SpecRunner上の既存verificationがgreen

**Status**: PASS (per verification-result.md on branch)  
**Evidence**: `specrunner/changes/runtime-strategy-convergence/verification-result.md` records a passed verification run. Tasks T-14 checkbox is checked (`bun run typecheck`, `bun run test`, `bun run lint` all green).

---

### AC-11: ユーザー向け挙動・出力・終了コードに差分がない

**Status**: PASS (structural verification)  
**Evidence**: The refactoring is purely structural — only type signatures and internal guards changed. The execution sequences are preserved:
- `assertProviderReadiness` still fires before `prepare()`.
- `assertNoDuplicateLiveJob` still fires before `bootstrapJob`.
- `reloadJobState` skip condition (`existingWorktreePath === undefined`) is preserved identically.
- teardown execution path, error status recording, and exit codes are unchanged.
- No new I/O, log output, or error message changes introduced.

---

## Spec Requirement Verification

### Requirement: Provider readiness は副作用より前に無条件で実行される

**Status**: PASS  
**Evidence**: `runner.ts` lines 112–125 call `await this.runtime.assertProviderReadiness(...)` unconditionally before `prepare()` (Step 1). No existence check. TypeScript type `ProviderReadinessCapability` makes the method required at compile time.

---

### Requirement: Duplicate live-job guard は bootstrapJob より前に無条件で実行される

**Status**: PASS  
**Evidence**: `pipeline-run.ts` line 142 calls `await this.pipelineRuntime.assertNoDuplicateLiveJob(cwd, slug)` before `bootstrapJob` (line 145). No optional chaining.

---

### Requirement: setupWorkspace 後の state reload は skip 条件が維持されつつ無条件で呼ばれる

**Status**: PASS  
**Evidence**: `runner.ts` lines 195–215: condition is `if (workspaceOpts.existingWorktreePath === undefined)` (path condition only; no method existence check). `reloadJobState` is called directly within the block. Resume path (`existingWorktreePath` set) skips the reload.

---

### Requirement: `canDeriveChangedFiles` は required method として直接呼ばれる

**Status**: PASS  
**Evidence**:
- `scope-check.ts`: `deps.changedFiles.canDeriveChangedFiles()` — direct call.
- `runtime-capability-gate.ts`: `runtime.canDeriveChangedFiles()` — direct call.
- `executor.ts`: `deps.changedFiles?.canDeriveChangedFiles()` — `?.` is on the `changedFiles` field (capability-absence guard), not on the method. The method itself is called without `?.`.
- `ChangedFilesCapability` interface has `canDeriveChangedFiles(): boolean` (no `?`).

---

### Requirement: production コードは `RuntimeStrategy & PipelineDepsBuilder` を参照しない

**Status**: PASS  
**Evidence**: All five previously identified production sites (`CommandRunner`, `PipelineRunCommand`, `ResumeCommand`, `factory.ts`, `BootstrapResult`) now use `RuntimeFacade` or narrow capability intersections. Grep confirms 0 occurrences.

---

### Requirement: `RealRuntimeStrategy` は production から撤去される

**Status**: PASS  
**Evidence**: `runtime-strategy.ts` no longer exports `RealRuntimeStrategy`. Grep on src/ (excluding ratchet test self-references) returns 0 hits.

---

### Requirement: Pick-based derive shim が production から撤去される

**Status**: PASS  
**Evidence**: `deriveCommitInspectionCapability` and `deriveRevisionContentCapability` are absent from all source files. `buildDeps()` in `local.ts` and `managed.ts` constructs capabilities directly via bound methods.

---

### Requirement: テスト fake の double cast が typed capability object で置換される

**Status**: PASS  
**Evidence**: `pipeline-sole-committer-e2e.test.ts` uses `roundGitEffectsImpl: RoundGitEffectsCapability` and `stepIoImpl: StepIoValidationCapability` typed objects. No `as unknown as RuntimeStrategy` remains.

---

### Requirement: LocalRuntime と ManagedRuntime は `RuntimeFacade` を構造的に満たす

**Status**: PASS  
**Evidence**: `command-lifecycle-contract.test.ts` TC-013/TC-014 contain compile-time type assignments `const _facade: RuntimeFacade = runtime` for both `LocalRuntime` and `ManagedRuntime`. These would be TypeScript compile errors if either class failed to satisfy `RuntimeFacade`.

---

### Requirement: architecture ratchet が禁止パターンの再導入を防ぐ

**Status**: PASS  
**Evidence**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts` exists with comprehensive TC-008 through TC-035h coverage. Runs as part of `bun run test`.

---

### Requirement: 振る舞い不変条件が維持される

**Status**: PASS  
**Evidence**: All execution order, skip conditions, error-handling paths, teardown sequences, and Local/Managed behavioral differences are preserved unchanged. The refactoring is purely type-level restructuring with no semantic changes to control flow.

---

## Plan Divergence Notes (non-binding)

- **D3 note**: `RuntimeStrategy` itself is not deleted from `runtime-strategy.ts`; `LocalRuntime` and `ManagedRuntime` still `implements RuntimeStrategy`. This is aligned with D3 rationale: "clean にした上で import されなくなるのを ratchet で保証する方が安全". No production command-layer code imports `RuntimeStrategy` as a type parameter; ratchet guards against regression. No spec violation.
- **TC-035 extensions**: The ratchet test grew beyond D7's original 7 assertions to include TC-035b through TC-035h covering command/runtime/step/attach/pipeline/root-level test directories. This is additive and does not violate any requirement.
- **TC-012b addition**: The ratchet guards `as any as RuntimeStrategy` in addition to `as unknown as RuntimeStrategy`. Additive; no violation.

---

## Findings

No normative violations found. All acceptance criteria and spec Requirements/Scenarios are satisfied.
