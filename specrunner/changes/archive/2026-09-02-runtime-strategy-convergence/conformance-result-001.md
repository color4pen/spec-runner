# Conformance Result — runtime-strategy-convergence / Iteration 1

## Evidence Summary

**Checked**: 11 normative items  
**Skipped**: 0  
**Unverified**: 0

---

## Normative Items Reviewed

### AC-1: production に RuntimeStrategy & PipelineDepsBuilder が 0 件

**Spec Scenario**: `src/` 配下のファイルを text grep → 一致が 0 件  
**Ratchet**: TC-008 (`findOccurrences(files, "RuntimeStrategy & PipelineDepsBuilder")` on production files)

**Result: FAIL**

`src/core/port/command-runtime.ts` contains the forbidden text in JSDoc comments:
- Line 4: `* R2c: Command-layer contracts that replace the whole-port RuntimeStrategy & PipelineDepsBuilder`
- Line 129: `` * Replaces `RuntimeStrategy & PipelineDepsBuilder` as the type for factory.ts, ``

The ratchet test (`runtime-strategy-ratchet.test.ts`) uses `content.indexOf(pattern)` — a plain text search that matches occurrences in comments. The test's REPO_ROOT off-by-one bug was fixed by code-fixer (regression-gate finding [3]), meaning the ratchet now scans the actual `src/` directory. With real scanning active, TC-008 would find 2 hits in `command-runtime.ts` and fail.

Production type-level usage: confirmed 0 occurrences (the pattern does not appear as a type in any production code). The violation is confined to JSDoc comments.

---

### AC-2: CommandRunner とsubclassがfull RuntimeStrategy に依存しない

**Result: PASS**

- `src/core/command/runner.ts`: constructor type is `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder` — no `RuntimeStrategy` import
- `src/core/command/pipeline-run.ts`: constructor accepts `RuntimeFacade` — no `RuntimeStrategy` import
- `src/core/command/resume.ts`: constructor accepts `RuntimeFacade` — no `RuntimeStrategy` import

---

### AC-3: productionのrequired lifecycle処理にoptional call/存在確認がない

**Result: PASS**

- `runner.ts:111`: `await this.runtime.assertProviderReadiness(...)` — direct call, no existence check ✓
- `runner.ts:193`: `if (workspaceOpts.existingWorktreePath === undefined)` — condition-only guard (method existence check removed) ✓
- `pipeline-run.ts:142`: `await this.pipelineRuntime.assertNoDuplicateLiveJob(cwd, slug)` — direct call, no `?.` ✓
- `runtime-capability-gate.ts:82`: `if (runtime.canDeriveChangedFiles() === false)` — direct call ✓
- `scope-check.ts:53`: `if (deps.changedFiles.canDeriveChangedFiles() === false)` — direct call ✓
- `executor.ts:279`: `deps.changedFiles?.canDeriveChangedFiles()` — outer `?.` is on the `changedFiles` field (capability absence guard, explicitly permitted by spec); inner `canDeriveChangedFiles()` has no `?.` ✓

---

### AC-4: RealRuntimeStrategy が 0 件

**Result: PASS**

Grep for `RealRuntimeStrategy` in `src/`: 0 hits in production files.  
Grep in `tests/`: 0 hits.

---

### AC-5: Pick ベースの導出shimが 0 件

**Result: PASS**

- `deriveCommitInspectionCapability`: 0 hits in `src/` (only in ratchet test as literal string pattern)
- `deriveRevisionContentCapability`: 0 hits in `src/` (same)
- `Pick<RuntimeStrategy`: 0 hits in production `src/` (only in ratchet test as literal string pattern)
- Note: `Pick<ChangedFilesCapability, "canDeriveChangedFiles">` in `runtime-capability-gate.ts:71` is a function parameter narrowing — not a RuntimeStrategy derive shim; not forbidden by spec

---

### AC-6: as unknown as RuntimeStrategy が 0 件

**Result: PASS**

`tests/pipeline-sole-committer-e2e.test.ts`: 0 hits for `as unknown as RuntimeStrategy`.  
The remaining `as unknown as Step` and `as unknown as StepExecutor` in that file are unrelated types.

---

### AC-7: test fakeはtyped builder/helperで必要contractを満たす

**Result: PASS**

- `tests/unit/core/command/runner.test.ts`: `buildMockRuntime()` returns `RuntimeFacade`; `TestCommand` accepts `RuntimeFacade`
- `tests/pipeline-sole-committer-e2e.test.ts`: capability slots filled with typed objects (no `as unknown as RuntimeStrategy`)

---

### AC-8: Local/Managed双方についてcommand lifecycleのcontract testがある

**Result: PASS**

`src/core/runtime/__tests__/command-lifecycle-contract.test.ts` covers:
- TC-013: `const _facade: RuntimeFacade = localRuntimeInstance` — compile-time type assertion ✓
- TC-014: `const _facade: RuntimeFacade = managedRuntimeInstance` — compile-time type assertion ✓
- TC-027: `assertProviderReadiness` Local (probe-call) / Managed (no-op) ✓
- TC-028: `assertNoDuplicateLiveJob` Local / Managed ✓
- TC-029: `reloadJobState` Local (store-read) / Managed (throw) ✓
- TC-030: `canDeriveChangedFiles` Local (true) / Managed (false) ✓

---

### AC-9: full-port依存とfake都合optionalの再導入を防ぐarchitecture ratchetがある

**Result: PASS (ratchet structure is correct, but see AC-1 finding)**

`src/core/port/__tests__/runtime-strategy-ratchet.test.ts` asserts 8 patterns across production/test files. The test structure is correct. The REPO_ROOT off-by-one was fixed by code-fixer (regression-gate finding [3]), making real file scanning active. However, this now exposes the TC-008 failure described in AC-1.

---

### AC-10: SpecRunner上の既存verificationがgreen

**Result: PASS (at time of verification step)**

Verification ran and all tests passed. The ratchet REPO_ROOT bug caused TC-008 to trivially pass (scanning wrong/empty directory). Post code-fixer, the ratchet now scans real files — re-verification would be needed to confirm the current code is still green.

---

### AC-11: ユーザー向け挙動・出力・終了コードに差分がない

**Result: PASS**

This is a structural refactoring only. Execution ordering is preserved:
- `assertProviderReadiness` → `prepare()` ordering maintained ✓
- `assertNoDuplicateLiveJob` → `bootstrapJob` ordering maintained ✓
- workspace setup → reload → deps build → registerCleanup → pipeline → teardown ordering unchanged ✓
- resume path reload-skip condition (`existingWorktreePath !== undefined`) maintained ✓

---

## Findings

### Finding F-1 [HIGH]: ratchet TC-008 would fail CI due to forbidden text in JSDoc comments

**File**: `src/core/port/command-runtime.ts`  
**Lines**: 4, 129

After the ratchet REPO_ROOT fix (regression-gate finding [3]) made file scanning real, TC-008 uses plain-text `indexOf` search on production source files. `command-runtime.ts` is a production file (not in `__tests__/`) and contains the text `RuntimeStrategy & PipelineDepsBuilder` in two JSDoc comments. TC-008 would find 2 hits and fail, causing CI to be red.

The acceptance criterion "productionに RuntimeStrategy & PipelineDepsBuilder が0件" is interpreted as a text grep (per spec Scenario: "grep する → 一致が 0 件"). Comments are included in the text search.

**Fix target**: code-fixer  
**Fix**: Rephrase the two JSDoc comments in `command-runtime.ts` so they do not contain the exact text `RuntimeStrategy & PipelineDepsBuilder`. For example:
- Line 4: replace with "whole-port RuntimeStrategy-and-PipelineDepsBuilder dependency" or similar
- Line 129: replace with "the whole-port facade previously used in factory.ts,"
