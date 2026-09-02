# Regression Gate Result — Iteration 004

## Summary

19 findings from the ledger were verified. 1 regression confirmed (LOW severity). 18 findings have been fixed.

---

## Verified Findings

### [1] `74c57ebf` — [HIGH] design.md Risk 節の reloadJobState 推論が逆
**Status: FIXED**
`design.md` line 181 now correctly states: `workspaceOpts.existingWorktreePath === undefined` is the new-run condition, and that managed new run already has a throw path. The text explicitly notes the former Risk section's reasoning was reversed ("なお従来の Risk 節の根拠「resume path では呼ばれない」は逆であり誤りだった").

### [2] `a3f334e5` — [MEDIUM] ratchet に `canDeriveChangedFiles?.` 禁止パターンが欠落
**Status: FIXED**
`src/core/port/__tests__/runtime-strategy-ratchet.test.ts` lines 197–203 now include a dedicated ratchet asserting `canDeriveChangedFiles?.` is 0 in production sources.

### [3] `bf648013` — [HIGH] REPO_ROOT off-by-one: 5 `..` segments instead of 4
**Status: FIXED**
Line 117 now reads: `path.resolve(import.meta.dirname, "..", "..", "..", "..")` — exactly 4 `..` segments, correctly reaching the repo root from `src/core/port/__tests__/`. The comment also confirms "4 levels up".

### [4] `3c2c274d` — [MEDIUM] JobBootstrapCapability JSDoc says managed assertNoDuplicateLiveJob is no-op
**Status: FIXED**
`src/core/port/command-runtime.ts` line 51 now correctly reads: "managed: assertNoDuplicateLiveJob also delegates to assertSlugUnoccupied (same guard as local)." The stale "no-op" phrasing is gone.

### [5] `9276fb21` — [LOW] Stale JSDoc references removed concepts in managed.ts and provider-readiness.ts
**Status: FIXED**
`src/core/runtime/managed.ts` lines 601–607 no longer reference "optional-chaining call in runner.ts" or "RealRuntimeStrategy". `src/core/port/provider-readiness.ts` line 5 now says "Consumed by ProviderReadinessCapability (required) in command-runtime.ts", removing the stale "required on RealRuntimeStrategy" text.

### [6] `c13131e8` — [LOW] Test fake still typed as `RuntimeStrategy & PipelineDepsBuilder`
**Status: FIXED**
`tests/unit/core/command/runner.test.ts` lines 94 and 139 now use `RuntimeFacade` as the return/parameter type for the test fake and TestCommand constructor.

### [7] `dfde0782` — [MEDIUM] Stale JSDoc in types.ts still references `RuntimeStrategy & PipelineDepsBuilder`
**Status: FIXED**
`src/core/types.ts` line 165–166 now reads: "Composition-root types (CommandRunner, factory.ts) use the unified RuntimeFacade interface (see src/core/port/runtime-strategy.ts)."

### [8] `2312a149` — [LOW] PipelineDepsBuilder JSDoc still references `RuntimeStrategy & PipelineDepsBuilder`
**Status: FIXED**
Same fix as [7] above — types.ts line 165–166 updated to reference RuntimeFacade.

### [9] `57758a4f` — [LOW] File-level JSDoc in runtime-strategy.ts still says composition-root types use `RuntimeStrategy & PipelineDepsBuilder`
**Status: FIXED**
`src/core/port/runtime-strategy.ts` line 22–24 now reads: "Composition-root types (CommandRunner, factory.ts) use the unified RuntimeFacade interface defined in this file."

### [10] `868d8ee7` — [MEDIUM] TestCommand constructor still accepts `RuntimeStrategy & PipelineDepsBuilder`
**Status: FIXED**
`tests/unit/core/runtime/runner-reload-egress-e2e.test.ts` line 295 now uses `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder` — the narrow contract. `tests/unit/core/runtime/runner-reload-after-setup.test.ts` also shows no `RuntimeStrategy & PipelineDepsBuilder` hits.

### [11] `50dac132` — [MEDIUM] Ratchet TC-032 does not cover `tests/unit/core/runtime/`
**Status: FIXED**
TC-032c at lines 248–256 now scans `tests/unit/core/runtime/` for `RuntimeStrategy & PipelineDepsBuilder`.

### [12] `3630b474` — [LOW] assertRuntimeSupportsScope uses `Pick<ChangedFilesCapability, 'canDeriveChangedFiles'>`
**Status: REGRESSION — STILL PRESENT**
`src/core/pipeline/runtime-capability-gate.ts` line 71 still declares `runtime: Pick<ChangedFilesCapability, "canDeriveChangedFiles">` instead of accepting the full `ChangedFilesCapability` type. `ChangedFilesCapability` is narrow (2 methods: `canDeriveChangedFiles` and `listChangedFiles`), and the design principle forbids Pick-based extraction. The TC-011 ratchet only guards `Pick<RuntimeStrategy`, so this `Pick<ChangedFilesCapability` is not caught automatically.

### [13] `7884d0f9` — [LOW] Test helpers return `Pick<RuntimeStrategy, 'canDeriveChangedFiles'>`
**Status: FIXED**
`tests/unit/core/pipeline/resolve-scope.test.ts` lines 310 and 317 now use `ChangedFilesCapability` as the return type for `makeIncapableRuntime()` and `makeCapableRuntime()`.

### [14] `fb43706d` — [MEDIUM] Qualified import `as unknown as RuntimeStrategy` in unpushable-path-contract.test.ts
**Status: FIXED**
Grep for `as unknown as import(` in tests/ shows no RuntimeStrategy occurrences in unpushable-path-contract.test.ts. The file has been refactored to typed capability stubs.

### [15] `39e34e9c` — [LOW] step-layer tests using monolithic `RuntimeStrategy & PipelineDepsBuilder` fake
**Status: FIXED**
Grep for `RuntimeStrategy & PipelineDepsBuilder` in `tests/unit/step/` returns no matches. TC-032d (lines 263–271) now asserts this for the step-layer test directory.

### [16] `adfd236f` — [LOW] Double optional chaining `canDeriveChangedFiles?.()` in managed-runtime-capabilities.test.ts
**Status: FIXED**
`src/core/runtime/__tests__/managed-runtime-capabilities.test.ts` line 290 now uses `deps.changedFiles?.canDeriveChangedFiles()` — the outer `?.` is valid (changedFiles is optional on PipelineDeps) but the inner `?.` on the required `canDeriveChangedFiles` method has been removed.

### [17] `fb1f1c44` — [MEDIUM] Qualified import `as unknown as RuntimeStrategy` cast — duplicate of [14]
**Status: FIXED**
Same file/pattern as finding [14]; no occurrences remain.

### [18] `bb562fd0` — [LOW] Required method `canDeriveChangedFiles` with unnecessary optional chaining — duplicate of [16]
**Status: FIXED**
Same location as finding [16]; inner `?.` removed.

### [19] `ec2aa9e0` — [LOW] TC-032 ratchet does not cover step-layer tests
**Status: FIXED**
TC-032d (lines 263–271) now covers `tests/unit/step/`, with a comment noting tests/attach/ remains outside scope as a known E2E ratchet gap.

---

## Evidence

- Checked: 19 ledger entries
- Skipped: 0
- Unverified: 0

## Regressions

| # | Ledger Ref | Severity | File | Line | Status |
|---|-----------|----------|------|------|--------|
| 12 | `3630b474` | LOW | src/core/pipeline/runtime-capability-gate.ts | 71 | REGRESSION |
