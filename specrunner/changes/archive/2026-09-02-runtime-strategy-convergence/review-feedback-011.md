# Code Review Feedback — runtime-strategy-convergence — iter 11

## Summary

The implementation is behaviorally correct and meets all acceptance criteria. All ratchets pass, verification is green (build / typecheck / test / lint), and the lifecycle invariants are maintained. One low-severity defect was found in the ratchet's whitelist configuration.

---

## Findings

### F-001 [low / fixable] Ratchet TC-037a has a stale whitelist path for `command-lifecycle-contract.test.ts`

**File**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts`  
**Line**: 383

**Observed**

```typescript
const ALLOWED_FILES = new Set([
  path.join(REPO_ROOT, "src/core/port/__tests__/runtime-strategy-ratchet.test.ts"),
  path.join(REPO_ROOT, "tests/core/command-lifecycle-contract.test.ts"),  // ← wrong path
]);
```

The actual file is at `src/core/runtime/__tests__/command-lifecycle-contract.test.ts` (a `src/**/__tests__/` file collected by `collectTestFiles` via `srcTestFiles`). The whitelisted path `tests/core/command-lifecycle-contract.test.ts` does not exist.

**Impact**

Design D7 explicitly intended to exempt `command-lifecycle-contract.test.ts` from the TC-037a named-import check: "ratchet test 自身と `command-lifecycle-contract.test.ts` は除外". The stale path means:

1. The intended exemption is silently inoperative — the real file IS checked, not exempted.
2. If `command-lifecycle-contract.test.ts` ever needs to add `import type { RuntimeStrategy }` (e.g., for compile-time structural contract assertions), the ratchet would block it erroneously.

**Currently benign** because `command-lifecycle-contract.test.ts` does not import `RuntimeStrategy` today (it uses `RuntimeFacade`). The TC-037a test passes correctly. This is a latent correctness issue in the ratchet, not a production bug.

**Fix**

Replace the stale path:

```diff
-  path.join(REPO_ROOT, "tests/core/command-lifecycle-contract.test.ts"),
+  path.join(REPO_ROOT, "src/core/runtime/__tests__/command-lifecycle-contract.test.ts"),
```

---

## Acceptance Criteria Verification

| Criteria | Status | Evidence |
|---|---|---|
| production に `RuntimeStrategy & PipelineDepsBuilder` が0件 | ✅ | TC-008 ratchet passes; runner.ts, pipeline-run.ts, factory.ts, bootstrap.ts all use CommandRunnerRuntime / PipelineRunRuntime / RuntimeFacade |
| `CommandRunner` とsubclassがfull `RuntimeStrategy` に依存しない | ✅ | `runner.ts` imports `CommandRunnerRuntime`; `pipeline-run.ts` imports `PipelineRunRuntime`; `resume.ts` imports `CommandRunnerRuntime` |
| productionのrequired lifecycle処理にoptional call/存在確認がない | ✅ | `assertProviderReadiness` called without guard (runner.ts:134); `assertNoDuplicateLiveJob` called directly (pipeline-run.ts:160); `reloadJobState` called without existence guard (runner.ts:218); `canDeriveChangedFiles()` is required on `ChangedFilesCapability` interface; ratchet prevents `canDeriveChangedFiles?.` |
| `RealRuntimeStrategy` が0件 | ✅ | TC-009 / TC-031 ratchet passes |
| `Pick` ベースの導出shimが0件 | ✅ | TC-010 / TC-011 ratchet passes |
| `as unknown as RuntimeStrategy` が0件 | ✅ | TC-012 ratchet passes; `pipeline-sole-committer-e2e.test.ts` uses `RoundGitEffectsCapability` / `StepIoValidationCapability` typed objects with imports from capability modules |
| test fakeはtyped builder/helperで必要contractを満たす | ✅ | executor-resume-context / executor-verdict use `noopStepArtifact` / `noopStepIo` / `noopRoundGitEffects`; TC-037b ratchet prevents slot `as never` injections |
| Local/Managed双方についてcommand lifecycleのcontract testがある | ✅ | `src/core/runtime/__tests__/command-lifecycle-contract.test.ts` covers TC-027–TC-030, TC-013–TC-014 |
| full-port依存とfake都合optionalの再導入を防ぐarchitecture ratchetがある | ✅ | `runtime-strategy-ratchet.test.ts` with 19 passing assertions |
| SpecRunner上の既存verificationがgreen | ✅ | verification-result.md: build / typecheck / test / lint / changed-line-coverage all passed |
| ユーザー向け挙動・出力・終了コードに差分がない | ✅ | Template Method execution order unchanged; provider readiness → prepare() → setupWorkspace → reloadJobState → buildDeps → registerCleanup → pipeline → teardown preserved |

---

## Behavioral Invariants Verification

| Invariant | Verified |
|---|---|
| provider readiness は副作用より前に実行される | ✅ `runner.ts` execute() first awaits `assertProviderReadiness()`, then calls `prepare()` |
| duplicate live-job guard は bootstrapJob より前に実行される | ✅ `pipeline-run.ts` calls `assertNoDuplicateLiveJob()` at line 160, `bootstrapJob()` at line 163 |
| resume path の reloadJobState skip 条件が維持される | ✅ `runner.ts` guard `if (workspaceOpts.existingWorktreePath === undefined)` unchanged |
| setup 失敗時の state 記録と cleanup handle の扱い | ✅ `setupWorkspace` failure calls `persistJobState` with `null` workspace and returns 1 (no teardown handle created yet) |
| teardown の実行回数・例外時挙動 | ✅ `teardown` is always called exactly once after pipeline (success, exception, or soft error paths) |
| Local / Managed 間の既存差異 | ✅ `reloadJobState` for managed throws as before; `assertProviderReadiness` for managed is no-op as before; contract test TC-029 explicitly documents managed-runtime throw |

---

## Observations

- **Variable naming in `executor-activation.test.ts`**: The local helper function is named `makeRuntimeStrategy` (line 140) but returns a `ChangedFilesCapability` typed object. The naming is slightly misleading but the type is correct and tests pass. This is cosmetic only.

- **`deps.changedFiles?.canDeriveChangedFiles()` in `executor.ts` (line 279)**: The `?.` here is on the capability slot (`deps.changedFiles`), not on the method. `PipelineDeps.changedFiles` is intentionally optional (`changedFiles?: ChangedFilesCapability`) per design D5: "Absence of this capability is expressed at the injection site as `ChangedFilesCapability | undefined`". The ratchet correctly guards `canDeriveChangedFiles?.` (method-level optional chain) and does not prohibit `changedFiles?.canDeriveChangedFiles()` (slot-level optional chain). This is consistent and correct.

- **TC-037a whitelist path**: As described in F-001. The current `collectTestFiles` implementation would correctly include `src/core/runtime/__tests__/command-lifecycle-contract.test.ts` in `srcTestFiles`, making it subject to the RuntimeStrategy import check. Since the file uses `RuntimeFacade` (not `RuntimeStrategy`), the test passes despite the wrong whitelist path.

---

## 検証した項目

- `src/core/port/command-runtime.ts`: 4 named lifecycle capability interfaces (`ProviderReadinessCapability`, `JobBootstrapCapability`, `WorkspaceLifecycleCapability`, `JobStatePersistenceCapability`) — all methods required, no `?` suffixes
- `src/core/runtime-facade.ts`: `RuntimeFacade` type alias is the intersection of all 4 lifecycle capabilities + `PipelineDepsBuilder` + `ChangedFilesCapability`
- `src/core/command/runner.ts`: `CommandRunnerRuntime` exported as `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder`; `CommandRunner` constructor takes `CommandRunnerRuntime`; `assertProviderReadiness` called unconditionally before `prepare()`; `reloadJobState` called without existence guard, skipped only when `existingWorktreePath !== undefined`
- `src/core/command/pipeline-run.ts`: `PipelineRunRuntime` exported as `CommandRunnerRuntime & JobBootstrapCapability & ChangedFilesCapability`; `assertNoDuplicateLiveJob` called before `bootstrapJob`; no `RuntimeStrategy` import
- `src/core/command/resume.ts`: constructor takes `CommandRunnerRuntime`; no `JobBootstrapCapability` or `RuntimeFacade`; no `RuntimeStrategy` import
- `src/core/runtime/factory.ts`: `createRuntime()` return type is `RuntimeFacade`; no `RuntimeStrategy & PipelineDepsBuilder`
- `src/cli/bootstrap.ts`: `BootstrapResult.runtime` typed as `RuntimeFacade`; no `RuntimeStrategy & PipelineDepsBuilder`
- `src/core/pipeline/runtime-capability-gate.ts`: `assertRuntimeSupportsScope` accepts `ChangedFilesCapability`; `canDeriveChangedFiles()` called directly (no `?.`)
- `src/core/port/runtime-strategy.ts`: `RuntimeStrategy` interface — all 10 formerly-optional methods are now required (no `?` suffixes): `listWorktreeChanges`, `canDeriveChangedFiles`, `assertNoDuplicateLiveJob`, `assertProviderReadiness`, `reloadJobState`, `listCommitChangedFiles`, `readFileAtCommit`, `snapshotMainCheckoutGuard`, `readRevisionContent`, `lastCommitTouchingPath`; `ChangedFilesCapability.canDeriveChangedFiles()` required
- `src/core/port/__tests__/runtime-strategy-ratchet.test.ts`: 19 ratchet assertions covering TC-008, TC-009, TC-010, TC-011, TC-012, TC-031, TC-035 (a–h), TC-037 (a–b)
- `src/core/runtime/__tests__/command-lifecycle-contract.test.ts`: TC-013/TC-014 compile-time structural assertions; TC-027–TC-030 behavioral assertions for Local and Managed runtimes
- `tests/pipeline-sole-committer-e2e.test.ts`: imports `RoundGitEffectsCapability` and `StepIoValidationCapability`; no `as unknown as RuntimeStrategy`; no `as never` on capability slots
- `tests/unit/step/executor-activation.test.ts`: imports `ChangedFilesCapability` from `runtime-strategy.js`; no `RuntimeStrategy` import; typed `ChangedFilesCapability` objects injected
- `tests/unit/step/executor-resume-context.test.ts`: uses `noopStepArtifact`, `noopStepIo`, `noopRoundGitEffects`, `noopTerminalState`; no `RuntimeStrategy` import
- `tests/unit/step/executor-verdict.test.ts`: uses `noopStepArtifact`, `noopStepIo`, `StepIoValidationCapability`; no `RuntimeStrategy` import
- `specrunner/changes/runtime-strategy-convergence/verification-result.md`: all phases passed (build, typecheck, test, lint, changed-line-coverage)
- Grep for `RuntimeStrategy & PipelineDepsBuilder` across `src/`: 0 hits in production files
- Grep for `RealRuntimeStrategy` across all `.ts` files: 0 hits outside ratchet test
- Grep for `as unknown as RuntimeStrategy` across `tests/` and `src/__tests__/`: 0 hits
- Grep for `canDeriveChangedFiles?.` in production `src/`: 0 hits

---

## 検証できなかった項目

- **TC-016 (manual): ユーザー向け挙動に差分がない** — End-to-end CLI behavior (actual pipeline run output, exit codes, stderr messages) was not verified by running the CLI. The structural review confirms the Template Method execution order is unchanged and no behavioral branching was modified, but live CLI output was not observed.
- **ManagedRuntime `reloadJobState` throw path in real managed run** — The contract test confirms `ManagedRuntime.reloadJobState` throws; whether this propagates to `RELOAD_FAILED` and the job fails correctly in a real managed run was not verified end-to-end (managed runtime requires live Anthropic API credentials).
