# Regression Gate Result — Iteration 011

**Branch**: refactor/runtime-strategy-convergence-b0074b66  
**Date**: 2026-09-02  
**Ledger items**: 27  
**Regressions found**: 0

---

## Evidence Summary

All 27 ledger findings were verified against the current code. Each has been fixed and is no longer present.

---

## Per-Finding Verification

### [1] `74c57ebf` — design.md Risk section reversed rationale — FIXED
`specrunner/changes/runtime-strategy-convergence/design.md` lines 192–194 now correctly state: "managed 新規 run では `reloadJobState` が実装済み（throw する）かつ `existingWorktreePath === undefined` が true になるため、現行コードでは既に throw が発生する経路が存在する" and "なお従来の Risk 節の根拠「resume path では呼ばれない」は逆であり誤りだった." The inverted rationale is gone.

### [2] `a3f334e5` — ratchet missing canDeriveChangedFiles?. pattern — FIXED
`src/core/port/__tests__/runtime-strategy-ratchet.test.ts` lines 226–231 now contain a dedicated `Ratchet: canDeriveChangedFiles?.` describe block that scans production files (`collectProductionFiles(SRC_DIR)`) for the literal `canDeriveChangedFiles?.` and asserts 0 occurrences.

### [3] `bf648013` — REPO_ROOT off-by-one (5 `..` instead of 4) — FIXED
Line 138: `const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");` — exactly 4 `..` segments. Comment above (line 136-137) confirms "4 levels up". `SRC_DIR` and `TESTS_DIR` now resolve correctly into the repo.

### [4] `3c2c274d` — JobBootstrapCapability JSDoc "no-op" claim — FIXED
`src/core/port/command-runtime.ts` lines 50–52 now say "managed: assertNoDuplicateLiveJob also delegates to assertSlugUnoccupied (same guard as local)." The stale "no-op" claim is gone.

### [5] `9276fb21` — managed.ts:607 JSDoc stale references — FIXED
`src/core/runtime/managed.ts` lines 601–610 now say: "fail-closed: throws to prevent pipeline start…reloadJobState is required on JobStatePersistenceCapability; the safest production behavior for managed runtime is to throw rather than silently skip." No reference to optional chaining in runner.ts or RealRuntimeStrategy.

### [6] `c13131e8` — runner.test.ts fake typed as RuntimeStrategy & PipelineDepsBuilder — FIXED
`tests/unit/core/command/runner.test.ts` line 94: `buildMockRuntime(...)` now returns `RuntimeFacade`, not `RuntimeStrategy & PipelineDepsBuilder`.

### [7] `dfde0782` — types.ts PipelineDepsBuilder JSDoc stale reference — FIXED
`src/core/types.ts` lines 165–166 now say: "Composition-root types (CommandRunner, factory.ts) use the unified RuntimeFacade interface (see src/core/port/runtime-strategy.ts)." No mention of `RuntimeStrategy & PipelineDepsBuilder`.

### [8] `2312a149` — same as [7], PipelineDepsBuilder JSDoc — FIXED
Same fix as [7]; the comment was updated in types.ts.

### [9] `57758a4f` — runtime-strategy.ts file-level JSDoc stale — FIXED
`src/core/port/runtime-strategy.ts` lines 22–24 now say: "use the unified RuntimeFacade interface defined in this file." The old `RuntimeStrategy & PipelineDepsBuilder` reference is gone.

### [10] `868d8ee7` — TestCommand constructor uses old whole-port type — FIXED
`tests/unit/core/runtime/runner-reload-egress-e2e.test.ts` line 295: constructor parameter is now `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder`. Same for `runner-reload-after-setup.test.ts` line 198.

### [11] `50dac132` — TC-032 did not cover tests/unit/core/runtime/ — FIXED
TC-035c (line 277) now explicitly covers `tests/unit/core/runtime/` for `RuntimeStrategy & PipelineDepsBuilder`. TC-032 label is gone (renamed to TC-035).

### [12] `3630b474` — assertRuntimeSupportsScope uses Pick<ChangedFilesCapability> — FIXED
`src/core/pipeline/runtime-capability-gate.ts` line 74: parameter type is now `ChangedFilesCapability` (direct), not `Pick<ChangedFilesCapability, 'canDeriveChangedFiles'>`.

### [13] `7884d0f9` — test helpers return Pick<RuntimeStrategy, 'canDeriveChangedFiles'> — FIXED
`tests/unit/core/pipeline/resolve-scope.test.ts` lines 310 and 317: `makeIncapableRuntime()` and `makeCapableRuntime()` now declare return type `ChangedFilesCapability`.

### [14] `fb43706d` — qualified import `as unknown as import(...)RuntimeStrategy` bypasses TC-012 — FIXED
`tests/unit/step/unpushable-path-contract.test.ts` no longer contains `RuntimeStrategy` anywhere (only a comment noting the spy approach). Grep confirms no `as unknown as import.*RuntimeStrategy` patterns exist in any test source file.

### [15] `39e34e9c` — step-layer tests using monolithic RuntimeStrategy & PipelineDepsBuilder — FIXED
TC-035d (lines 291–299) now guards `tests/unit/step/`. Grep of `executor-input-validation.test.ts` confirms no `RuntimeStrategy & PipelineDepsBuilder` pattern.

### [16] `adfd236f` — double optional chaining canDeriveChangedFiles?.() — FIXED
`src/core/runtime/__tests__/managed-runtime-capabilities.test.ts` line 290: now `deps.changedFiles?.canDeriveChangedFiles()` — inner `?.` removed. Outer `?.` on `deps.changedFiles` remains valid (optional slot).

### [17] `fb1f1c44` — qualified import form `as unknown as import(...)RuntimeStrategy` — FIXED
Same as [14]; the cast in `unpushable-path-contract.test.ts` has been replaced with a narrow typed spy approach.

### [18] `bb562fd0` — same as [16], double optional chaining — FIXED
Same fix as [16].

### [19] `ec2aa9e0` — TC-032 gap: tests/unit/step/ not covered — FIXED
TC-035d now explicitly covers `tests/unit/step/`.

### [20] `64d3a5b3` — tests/unit/core/step/ outside ratchet scope — FIXED
TC-035e (lines 305–313) now covers `tests/unit/core/step/`. Grep confirms no `RuntimeStrategy & PipelineDepsBuilder` in `executor-cli-entry-oid.test.ts` or `verification-phase-outcome-executor.test.ts`.

### [21] `e3c7d9fb` — tests/attach/ outside ratchet scope — FIXED
TC-035f (lines 318–326) now covers `tests/attach/`. Grep of `attach-resume-e2e.test.ts` confirms no `RuntimeStrategy & PipelineDepsBuilder`.

### [22] `d7765b54` — runner.ts JSDoc missing Step 0 — FIXED
`src/core/command/runner.ts` lines 8–23: execution sequence now starts at "0. assertProviderReadiness() — before prepare()…" and Error handling includes the readiness failure path.

### [23] `70bd6bc9` — `as any as RuntimeStrategy` bypasses TC-012 — FIXED
TC-012b (lines 213–218) now checks for `as any as RuntimeStrategy` in addition to `as unknown as RuntimeStrategy`. Grep confirms `tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts` no longer contains the old cast.

### [24] `6f18b58e` — command-runtime.ts JSDoc misdirects to factory.ts — FIXED
`src/core/port/command-runtime.ts` lines 14–16 now say: "RuntimeFacade…is defined in src/core/runtime-facade.ts to avoid a ports→domain import edge". No mention of factory.ts as primary definition.

### [25] `df1ed004` — TC-032 label collision with test-cases.md — FIXED
TC-032 no longer exists in the ratchet file. The block is now labeled TC-035 throughout (describe at line 257, sub-tests TC-035 through TC-035h). No label collision with test-cases.md typecheck gate.

### [26] `322e1864` — ratchet gap: root-level tests/ files not guarded — FIXED
TC-035h (lines 341–368) now explicitly reads root-level `tests/` `.ts` files and asserts 0 occurrences of `RuntimeStrategy & PipelineDepsBuilder`.

### [27] `a0bc89ba` — TC-037a whitelist has stale path for command-lifecycle-contract.test.ts — FIXED
`src/core/port/__tests__/runtime-strategy-ratchet.test.ts` lines 380–383: ALLOWED_FILES now contains `path.join(REPO_ROOT, "src/core/runtime/__tests__/command-lifecycle-contract.test.ts")` — the correct actual path.

---

## Verdict

No regressions detected. All 27 ledger findings are resolved in the current iteration.
