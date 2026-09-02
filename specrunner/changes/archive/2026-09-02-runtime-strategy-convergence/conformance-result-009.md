# Conformance Result — Iteration 009

## Summary

All normative requirements from `request.md` and `spec.md` are met. The implementation removes the `RuntimeStrategy & PipelineDepsBuilder` whole-port dependency from Command-layer code, eliminates optional-method guards in production paths, deletes migration shims, and replaces test double-casts with typed capability objects. One low-severity gap was identified in the architecture ratchet: only 3 of the 7 capability slot names are checked for `as never` injection, whereas the design (D7) and tasks (T-16) specify all 7 slots.

---

## Checked Items

### Acceptance Criteria: Production `RuntimeStrategy & PipelineDepsBuilder` = 0

**PASS.** Grep of `src/` (excluding `__tests__/`) returns 0 hits. The ratchet TC-008 asserts this at CI time.

### Acceptance Criteria: `CommandRunner` and subclasses do not depend on full `RuntimeStrategy`

**PASS.**
- `CommandRunner` constructor accepts `CommandRunnerRuntime` (= `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder`). No `RuntimeStrategy` import in `runner.ts`.
- `PipelineRunCommand` accepts `PipelineRunRuntime` (= `CommandRunnerRuntime & JobBootstrapCapability & ChangedFilesCapability`). No `RuntimeStrategy` import in `pipeline-run.ts`.
- `ResumeCommand` accepts `CommandRunnerRuntime`. No `RuntimeStrategy` import in `resume.ts`.

### Acceptance Criteria: No optional call / existence guard for required lifecycle operations

**PASS.**
- `runner.ts` line 134: `await this.runtime.assertProviderReadiness(...)` — direct call, no `if (this.runtime.assertProviderReadiness)` guard.
- `runner.ts` line 216: `if (workspaceOpts.existingWorktreePath === undefined)` — skip condition preserved, but no `if (this.runtime.reloadJobState &&)` method-existence guard.
- `pipeline-run.ts` line 160: `await this.pipelineRuntime.assertNoDuplicateLiveJob(cwd, slug)` — no `?.`.
- `scope-check.ts` line 53: `deps.changedFiles.canDeriveChangedFiles()` — direct call; outer `deps.changedFiles` guard for capability absence is maintained separately (per spec allowance).
- `runtime-capability-gate.ts` line 85: `runtime.canDeriveChangedFiles()` — direct call.
- `executor.ts` line 279: `deps.changedFiles?.canDeriveChangedFiles() !== false` — `?.` is on the outer `changedFiles` field (capability-absence guard), NOT on `canDeriveChangedFiles` itself. The spec explicitly preserves this guard.

### Acceptance Criteria: `RealRuntimeStrategy` = 0

**PASS.** Grep of all files in `src/` returns 0 hits. Ratchet TC-009 and TC-031 assert this.

### Acceptance Criteria: `Pick`-based derive shims = 0

**PASS.**
- `deriveCommitInspectionCapability`: 0 hits across all files in `src/`.
- `deriveRevisionContentCapability`: 0 hits across all files in `src/`.
- `Pick<RuntimeStrategy`: 0 hits in production `src/` files.
- `buildDeps()` in `local.ts` and `managed.ts` construct capability objects directly from bound methods.
- Ratchet TC-010 and TC-011 assert these at CI time.

### Acceptance Criteria: `as unknown as RuntimeStrategy` = 0

**PASS.**
- `tests/pipeline-sole-committer-e2e.test.ts` (formerly 2 casts at lines 382 and 541) now constructs typed `RoundGitEffectsCapability` and `StepIoValidationCapability` objects directly.
- No test file outside the ratchet has a `RuntimeStrategy` named import.
- Ratchet TC-012 and TC-012b assert this (also covers `as any as RuntimeStrategy`).

### Acceptance Criteria: test fakes use typed builder/helper

**PASS.**
- `src/core/step/noop-capabilities.ts` exports typed singletons (`noopStepArtifact`, `noopStepIo`, `noopTerminalState`, `noopRoundGitEffects`) implemented against specific capability interfaces.
- Executor test files (`executor-activation.test.ts`, `executor-resume-context.test.ts`, `executor-verdict.test.ts`, `executor-no-op.test.ts`, `executor-drift-detection.test.ts`) all import from `noop-capabilities.js` and assign to typed slots directly — no `as never` slot injections in checked slots (`stepArtifact`, `stepIo`, `changedFiles`).
- `tests/pipeline-integration.test.ts` uses typed `StepArtifactLifecycleCapability` and `StepIoValidationCapability` objects; no `RuntimeStrategy` import.

### Acceptance Criteria: Contract tests for Local/Managed command lifecycle

**PASS.**
- `src/core/runtime/__tests__/command-lifecycle-contract.test.ts` provides:
  - TC-013: compile-time type assertion `const _facade: RuntimeFacade = localRuntimeInstance`.
  - TC-014: compile-time type assertion `const _facade: RuntimeFacade = managedRuntimeInstance`.
  - TC-027: `assertProviderReadiness` — Local calls probe; Managed is no-op.
  - TC-028: `assertNoDuplicateLiveJob` — both runtimes resolve on empty directory.
  - TC-029: `reloadJobState` — Local reads store; Managed throws.
  - TC-030: `canDeriveChangedFiles` — Local returns boolean; Managed returns false.

### Acceptance Criteria: Architecture ratchet exists and is comprehensive

**PASS (with minor gap noted below).**
- `src/core/port/__tests__/runtime-strategy-ratchet.test.ts` exists and asserts:
  - TC-008: `RuntimeStrategy & PipelineDepsBuilder` 0件 in production src.
  - TC-009/TC-031: `RealRuntimeStrategy` 0件 in src/ and tests/.
  - TC-010: `deriveCommitInspectionCapability` and `deriveRevisionContentCapability` 0件.
  - TC-011: `Pick<RuntimeStrategy` 0件 in production src.
  - TC-012/TC-012b: `as unknown as RuntimeStrategy` and `as any as RuntimeStrategy` 0件 in test files.
  - Ratchet: `canDeriveChangedFiles?.` 0件 in production src.
  - TC-035 (a–h): `RuntimeStrategy & PipelineDepsBuilder` 0件 across all test subtrees.
  - TC-037a: `RuntimeStrategy` named imports 0件 in test files (except ratchet and lifecycle contract).
  - TC-037b: `as never` slot injections 0件 in `tests/unit/step/` for slots `stepArtifact`, `stepIo`, `changedFiles`.

**Gap (low severity):** TC-037b checks only 3 of 7 capability slot names (`stepArtifact`, `stepIo`, `changedFiles`). Design D7 and tasks T-16 specify all 7 slots: `roundGitEffects`, `terminalState`, `commitInspection`, `revisionContent` are not checked. A regression via `roundGitEffects: fake as never` would not trigger a CI failure. This reduces future regression detection coverage but does not represent a current violation (no such patterns exist in the codebase). TC-037a (no `RuntimeStrategy` named imports) provides a primary defense for the most common regression path.

### Acceptance Criteria: `RuntimeFacade` used in composition root

**PASS.**
- `src/core/runtime/factory.ts`: `createRuntime()` returns `RuntimeFacade`.
- `src/cli/bootstrap.ts`: `BootstrapResult.runtime` is `RuntimeFacade`.
- No `RuntimeStrategy` references in these files.

### Spec Requirement: `ChangedFilesCapability.canDeriveChangedFiles` is required

**PASS.**
- `ChangedFilesCapability` in `runtime-strategy.ts` line 240: `canDeriveChangedFiles(): boolean` — no `?` operator.
- Ratchet asserts `canDeriveChangedFiles?.` 0件 in production src.

### Spec Requirement: RuntimeStrategy interface optional methods all required

**PASS.**
- All 10 formerly-optional methods (`listWorktreeChanges`, `canDeriveChangedFiles`, `assertNoDuplicateLiveJob`, `assertProviderReadiness`, `reloadJobState`, `listCommitChangedFiles`, `readFileAtCommit`, `snapshotMainCheckoutGuard`, `readRevisionContent`, `lastCommitTouchingPath`) are now required in `RuntimeStrategy`.
- `RealRuntimeStrategy` type alias deleted.

### Spec Requirement: `LocalRuntime` and `ManagedRuntime` structurally satisfy `RuntimeFacade`

**PASS.**
- Both import `RuntimeStrategy` for `implements RuntimeStrategy` (design D3 explicitly permits this).
- Compile-time type assignments in `command-lifecycle-contract.test.ts` TC-013/TC-014 verify `RuntimeFacade` structural conformance.

### Behavioral invariants

**PASS (static analysis).**
- Provider readiness fires at runner.ts line 134, before `prepare()` at line 150.
- Duplicate-job guard at pipeline-run.ts line 160, before `bootstrapJob` at line 163.
- `reloadJobState` skip condition (`existingWorktreePath === undefined`) preserved at runner.ts line 216.
- Workspace setup → reloadJobState → buildDeps → registerCleanup → pipeline → teardown ordering unchanged.
- Setup failure → state recorded and exit 1 (no cleanup handle path), confirmed in runner.ts lines 191–207.

---

## Evidence

| Check | Method | Result |
|-------|--------|--------|
| `RuntimeStrategy & PipelineDepsBuilder` in production src | grep | 0 hits |
| `RealRuntimeStrategy` in src/ | grep | 0 hits |
| `Pick<RuntimeStrategy` in production src | grep | 0 hits |
| `deriveCommitInspectionCapability` in src/ | grep | 0 hits |
| `deriveRevisionContentCapability` in src/ | grep | 0 hits |
| `canDeriveChangedFiles?.` in production src | grep | 0 hits |
| `as unknown as RuntimeStrategy` in test files | grep | 0 hits |
| `RuntimeStrategy` named imports in test files | grep | 0 hits (excl. ratchet, lifecycle contract) |
| `as never` slot injections (stepArtifact, stepIo, changedFiles) | grep | 0 hits |
| `assertProviderReadiness` called directly (no if-guard) | code read | ✅ |
| `assertNoDuplicateLiveJob` called directly (no `?.`) | code read | ✅ |
| `reloadJobState` skip condition preserved | code read | ✅ |
| `CommandRunnerRuntime` / `PipelineRunRuntime` exported types | code read | ✅ |
| `RuntimeFacade` in factory.ts and bootstrap.ts | code read | ✅ |
| Contract test TC-013/TC-014 (type assignment) | file read | ✅ |
| Ratchet test file exists with all required assertions | file read | ✅ |
| noop-capabilities typed helpers exist | file read | ✅ |
| executor tests use noop-capabilities (no as-never slots) | grep + file read | ✅ |

---

## Findings

### Finding 1 (low): Ratchet TC-037b checks only 3 of 7 capability slot names

- **Location**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts`, TC-037b
- **Normative reference**: Spec Requirement "architecture ratchet が禁止パターンの再導入を防ぐ" — "SHALL also assert... zero `as never` injections into capability slots under `tests/unit/step/`"
- **Design reference**: D7 item 9, Tasks T-16
- **Description**: TC-037b's regex pattern `/(stepArtifact|stepIo|changedFiles)\s*:\s*[^,\n]* as never/` covers 3 of the 7 capability slots specified in design D7 and tasks T-16. Slots `roundGitEffects`, `terminalState`, `commitInspection`, and `revisionContent` are not checked. A regression injecting `roundGitEffects: fakeStrategy as never` would pass the ratchet.
- **Current impact**: No active violations exist for the unchecked slots. TC-037a (no `RuntimeStrategy` named imports) provides primary regression defense.
- **Fixability**: fixable — extend the regex to include all 7 slot names.
