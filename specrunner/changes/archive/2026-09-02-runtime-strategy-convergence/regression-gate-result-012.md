# Regression Gate Result — Iteration 012

**Branch**: refactor/runtime-strategy-convergence-b0074b66  
**Date**: 2026-09-02  
**Ledger size**: 30 findings (HIGH: 3, MEDIUM: 9, LOW: 18)

## Summary

All 30 ledger findings were verified against the current code. **No regressions detected.**

## Per-Finding Verification

### [1] `74c57ebf` — HIGH: Risk 節の reloadJobState 推論が事実と逆
**File**: `specrunner/changes/runtime-strategy-convergence/design.md`  
**Status**: FIXED  
The Risk section at line 199-201 now correctly states: "なお従来の Risk 節の根拠「resume path では呼ばれない」は逆であり誤りだった。" The description accurately explains the managed new run / resume distinction and that T-04 is behavior-preserving.

### [2] `a3f334e5` — MEDIUM: ratchet に `canDeriveChangedFiles?.` 禁止パターンが欠落
**File**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts`  
**Status**: FIXED  
A dedicated ratchet block (lines 226–232) now asserts `canDeriveChangedFiles?.` is absent from all production source files: `findOccurrences(files, "canDeriveChangedFiles?.")`.

### [3] `bf648013` — HIGH: Architecture ratchet REPO_ROOT has off-by-one
**File**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts:117`  
**Status**: FIXED  
Line 138 now reads `path.resolve(import.meta.dirname, "..", "..", "..", "..")` (4 `..` segments), consistent with the comment "4 levels up from `__tests__`". SRC_DIR and TESTS_DIR correctly resolve to the repo root.

### [4] `3c2c274d` — MEDIUM: JobBootstrapCapability JSDoc says managed assertNoDuplicateLiveJob is no-op
**File**: `src/core/port/command-runtime.ts:50`  
**Status**: FIXED  
The JSDoc at lines 49-52 now reads: "- managed: assertNoDuplicateLiveJob also delegates to assertSlugUnoccupied (same guard as local)." The stale "no-op" claim is gone.

### [5] `9276fb21` — LOW: Stale JSDoc references removed concepts in managed.ts
**File**: `src/core/runtime/managed.ts:607`  
**Status**: FIXED  
The JSDoc for `reloadJobState` in managed.ts (lines 601-611) no longer references optional chaining in runner.ts or `RealRuntimeStrategy`. It correctly describes the fail-closed behavior and references JobStatePersistenceCapability.

### [6] `c13131e8` — LOW: Test fake still typed as `RuntimeStrategy & PipelineDepsBuilder`
**File**: `tests/unit/core/command/runner.test.ts:94`  
**Status**: FIXED  
`buildMockRuntime` now returns `CommandRunnerRuntime` (imported from `src/core/command/runner.ts`).

### [7] `dfde0782` — MEDIUM: Stale JSDoc in `src/core/types.ts:166`
**File**: `src/core/types.ts:166`  
**Status**: FIXED  
The JSDoc now reads "Composition-root types (CommandRunner, factory.ts) use the unified RuntimeFacade interface (see src/core/port/runtime-strategy.ts)." No reference to `RuntimeStrategy & PipelineDepsBuilder`.

### [8] `2312a149` — LOW: PipelineDepsBuilder JSDoc references old intersection type
**File**: `src/core/types.ts:166`  
**Status**: FIXED  
Same fix as [7] — the JSDoc now references `RuntimeFacade`, not the old intersection.

### [9] `57758a4f` — LOW: File-level JSDoc in runtime-strategy.ts stale
**File**: `src/core/port/runtime-strategy.ts:24`  
**Status**: FIXED  
Lines 22-24 now say "use the unified RuntimeFacade interface defined in this file." The stale `RuntimeStrategy & PipelineDepsBuilder` reference is gone.

### [10] `868d8ee7` — MEDIUM: TestCommand in runner-reload-egress-e2e.test.ts still uses whole-port type
**File**: `tests/unit/core/runtime/runner-reload-egress-e2e.test.ts:294`  
**Status**: FIXED  
`TestCommand` constructor parameter (line 295) is now typed as `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder`.

### [11] `50dac132` — MEDIUM: TC-035c covers tests/unit/core/runtime/ (was TC-032 gap)
**File**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts:229`  
**Status**: FIXED  
TC-035c (lines 277-285) now asserts `RuntimeStrategy & PipelineDepsBuilder` is absent from `tests/unit/core/runtime/`.

### [12] `3630b474` — LOW: assertRuntimeSupportsScope uses Pick<ChangedFilesCapability>
**File**: `src/core/pipeline/runtime-capability-gate.ts:71`  
**Status**: FIXED  
The parameter type is now `ChangedFilesCapability` directly (line 74), with an inline comment confirming Pick-based extraction is forbidden.

### [13] `7884d0f9` — LOW: Test helpers return Pick<RuntimeStrategy, 'canDeriveChangedFiles'>
**File**: `tests/unit/core/pipeline/resolve-scope.test.ts:310`  
**Status**: FIXED  
`makeIncapableRuntime()` and `makeCapableRuntime()` now return `ChangedFilesCapability` (lines 310, 317).

### [14] `fb43706d` — MEDIUM: Qualified import form `as unknown as RuntimeStrategy` in TC-012 gap
**File**: `tests/unit/step/unpushable-path-contract.test.ts:403`  
**Status**: FIXED  
No `as unknown as` or `as never` cast to `RuntimeStrategy` remains in this file. The test now uses typed narrow stubs.

### [15] `39e34e9c` — LOW: Monolithic fakes in step-layer tests (TC-035 gap)
**File**: `tests/unit/step/executor-input-validation.test.ts:88`  
**Status**: FIXED  
`RuntimeStrategy & PipelineDepsBuilder` is absent from `tests/unit/step/`. TC-035d (lines 291-299) now guards this directory.

### [16] `adfd236f` — LOW: Double optional chaining `canDeriveChangedFiles?.()` in test
**File**: `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts:290`  
**Status**: FIXED  
Line 290 now reads `deps.changedFiles?.canDeriveChangedFiles()` — the inner `?.` is removed.

### [17] `fb1f1c44` — MEDIUM: Qualified import `as unknown as RuntimeStrategy` TC-012 gap (duplicate of [14])
**File**: `tests/unit/step/unpushable-path-contract.test.ts:403`  
**Status**: FIXED  
Same fix as [14] — the qualified import form cast is gone. Additionally TC-012b now guards `as any as RuntimeStrategy`.

### [18] `bb562fd0` — LOW: Inner `?.` on required `canDeriveChangedFiles` (duplicate of [16])
**File**: `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts:290`  
**Status**: FIXED  
Same fix as [16].

### [19] `ec2aa9e0` — LOW: TC-032 ratchet didn't cover step-layer tests
**File**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts:228`  
**Status**: FIXED  
TC-035d (lines 291-299) now covers `tests/unit/step/`.

### [20] `64d3a5b3` — HIGH: Monolithic fakes in tests/unit/core/step/ outside TC-035 scope
**File**: `tests/unit/core/step/executor-cli-entry-oid.test.ts:83`  
**Status**: FIXED  
`RuntimeStrategy & PipelineDepsBuilder` is absent from `tests/unit/core/step/`. TC-035e (lines 305-313) now guards this directory.

### [21] `e3c7d9fb` — MEDIUM: Monolithic fake in tests/attach/ (known ratchet gap)
**File**: `tests/attach/attach-resume-e2e.test.ts:154`  
**Status**: FIXED  
`RuntimeStrategy & PipelineDepsBuilder` is absent from `tests/attach/`. TC-035f (lines 316-326) now guards this directory.

### [22] `d7765b54` — LOW: CommandRunner JSDoc missing Step 0 (assertProviderReadiness)
**File**: `src/core/command/runner.ts:9`  
**Status**: FIXED  
The JSDoc execution sequence now starts with "0. assertProviderReadiness() — before prepare(); readiness failures have no side effects" (line 8), and the Error handling section includes "- assertProviderReadiness() failure → return 1 (no job state created)" (line 18).

### [23] `70bd6bc9` — MEDIUM: Ratchet misses `as any as RuntimeStrategy` pattern
**File**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts:187`  
**Status**: FIXED  
TC-012b (lines 212-218) now asserts `as any as RuntimeStrategy` is absent from all test files. The cast in `tests/unit/pipeline/` is also gone.

### [24] `6f18b58e` — LOW: Comment says RuntimeFacade is defined in factory.ts
**File**: `src/core/port/command-runtime.ts:15`  
**Status**: FIXED  
Lines 14-16 now correctly say "RuntimeFacade ... is defined in src/core/runtime-facade.ts to avoid a ports→domain import edge." factory.ts is no longer named as the primary definition file.

### [25] `df1ed004` — MEDIUM: TC-032 label collision with test-cases.md
**File**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts:236`  
**Status**: FIXED  
The Command test ratchet suite is now labeled TC-035 (lines 257-368), no longer colliding with TC-032.

### [26] `322e1864` — LOW: Root-level tests/ files not guarded for RuntimeStrategy & PipelineDepsBuilder
**File**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts:236`  
**Status**: FIXED  
TC-035h (lines 341-368) now explicitly guards all root-level `tests/*.ts` files.

### [27] `a0bc89ba` — LOW: TC-037a whitelist has stale path for command-lifecycle-contract.test.ts
**File**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts:383`  
**Status**: FIXED  
The ALLOWED_FILES set (lines 380-383) now contains only the correct path `src/core/runtime/__tests__/command-lifecycle-contract.test.ts`; the stale `tests/core/command-lifecycle-contract.test.ts` entry is gone.

### [28] `d2a5ab31` — LOW: Local CommandRunnerRuntime re-definition in provider-readiness-gate.test.ts
**File**: `tests/core/provider-readiness-gate.test.ts:80`  
**Status**: FIXED  
No `type CommandRunnerRuntime =` local re-definition remains in the file.

### [29] `dbb0da6e` — LOW: Local CommandRunnerRuntime re-definition in runner-fidelity-gate.test.ts
**File**: `tests/unit/core/command/runner-fidelity-gate.test.ts:64`  
**Status**: FIXED  
No `type CommandRunnerRuntime =` local re-definition remains in the file.

### [30] `f296fbb6` — LOW: TC-039 missing guard for local CommandRunnerRuntime re-definitions
**File**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts`  
**Status**: FIXED  
TC-039c (lines 532-547) now asserts `type CommandRunnerRuntime =` re-definitions are absent from all test files.

## Evidence

- **Checked**: 30 findings
- **Regressions**: 0
- **Skipped**: 0
