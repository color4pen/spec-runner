# Conformance Result — runtime-strategy-convergence — iter 3

## Evidence Summary

| Item | Checked | Result |
|------|---------|--------|
| Normative items from request.md (acceptance criteria) | 11 | All satisfied |
| Normative requirements from spec.md (SHALL/MUST) | 9 requirements, 15 scenarios | All satisfied |
| Plan divergences (design/tasks) noted | 1 minor | Not a spec violation |

---

## Normative Verification

### AC-1: production に `RuntimeStrategy & PipelineDepsBuilder` が0件

**Result: SATISFIED**

Grep of `src/` production files (excluding `__tests__/`) returns 0 hits. The only occurrences are in the ratchet test itself (`runtime-strategy-ratchet.test.ts`) as comments and pattern-match strings, which is expected and correct. The architecture ratchet (TC-008) also asserts this.

Files verified:
- `src/core/command/runner.ts` — uses `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder` (line 91)
- `src/core/command/pipeline-run.ts` — uses `RuntimeFacade`
- `src/core/command/resume.ts` — uses `RuntimeFacade`
- `src/core/runtime/factory.ts` — returns `RuntimeFacade`
- `src/cli/bootstrap.ts` — `BootstrapResult.runtime: RuntimeFacade`

### AC-2: `CommandRunner` とsubclassがfull `RuntimeStrategy` に依存しない

**Result: SATISFIED**

None of `runner.ts`, `pipeline-run.ts`, `resume.ts`, `factory.ts`, or `bootstrap.ts` import or reference `RuntimeStrategy`.

`LocalRuntime` and `ManagedRuntime` still `implements RuntimeStrategy` (self-assertion), which is explicitly permitted by design D3. These are not subclasses of CommandRunner.

### AC-3: productionのrequired lifecycle処理にoptional call/存在確認がない

**Result: SATISFIED**

All four previously optional-guarded calls have been converted:

| Old guard | New form | File |
|-----------|----------|------|
| `if (this.runtime.assertProviderReadiness)` | direct `await this.runtime.assertProviderReadiness(...)` | runner.ts:111 |
| `await this.runtime.assertNoDuplicateLiveJob?.(...)` | direct `await this.pipelineRuntime.assertNoDuplicateLiveJob(...)` | pipeline-run.ts:142 |
| `if (this.runtime.reloadJobState && existingWorktreePath === undefined)` | `if (workspaceOpts.existingWorktreePath === undefined)` | runner.ts:193 |
| `runtime.canDeriveChangedFiles?.()` | `runtime.canDeriveChangedFiles()` | runtime-capability-gate.ts:82 |
| `deps.changedFiles.canDeriveChangedFiles?.()` | `deps.changedFiles.canDeriveChangedFiles()` | scope-check.ts:53 |
| `deps.changedFiles?.canDeriveChangedFiles?.()` (inner `?.`) | `deps.changedFiles?.canDeriveChangedFiles()` | executor.ts:279 |

Note on executor.ts: the outer `?.` on `deps.changedFiles` (the capability itself may be absent) is explicitly maintained per spec: "`changedFiles` フィールド自体が `undefined` の場合のガード（capability absence）はこれとは別に維持される。" The method `canDeriveChangedFiles()` is called directly (no inner `?.`). ✓

### AC-4: `RealRuntimeStrategy` が0件

**Result: SATISFIED**

Grep of all `src/` `.ts` files returns 0 hits for `RealRuntimeStrategy`. Ratchet test TC-009 and TC-031 assert this for both `src/` and `tests/`.

### AC-5: `Pick` ベースの導出shimが0件

**Result: SATISFIED**

`deriveCommitInspectionCapability` and `deriveRevisionContentCapability` are absent from all `src/` files. Ratchet test TC-010a and TC-010b assert this.

`buildDeps()` in `local.ts` now constructs capabilities directly:
- `commitInspection: { listCommitChangedFiles: this.listCommitChangedFiles.bind(this) }` (line 636)
- `revisionContent: { readRevisionContent: this.readRevisionContent.bind(this) }` (line 637)

Same pattern in `managed.ts` (lines 344-345).

Ratchet test TC-011 asserts `Pick<RuntimeStrategy` is absent from production src.

### AC-6: `as unknown as RuntimeStrategy` が0件

**Result: SATISFIED**

Grep of `tests/` and `src/**/__tests__/` returns 0 hits for `as unknown as RuntimeStrategy` (excluding the ratchet test's own assertion strings).

`tests/pipeline-sole-committer-e2e.test.ts` now uses typed capability objects:
- `const roundGitEffectsImpl: RoundGitEffectsCapability = { ... }` (lines 368, 539)
- `const stepIoImpl: StepIoValidationCapability = { ... }` (lines 383, 546)

Remaining `as unknown` casts in that file are for `Step` and `StepExecutor` types (not RuntimeStrategy).

### AC-7: test fakeはtyped builder/helperで必要contractを満たす

**Result: SATISFIED**

The e2e test uses typed capability objects that directly satisfy the capability interfaces. No `as never` casts for capability slots remain.

### AC-8: Local/Managed双方についてcommand lifecycleのcontract testがある

**Result: SATISFIED**

`src/core/runtime/__tests__/command-lifecycle-contract.test.ts` exists and contains:
- TC-013: LocalRuntime compile-time type assertion (`const _facade: RuntimeFacade = runtime`)
- TC-014: ManagedRuntime compile-time type assertion
- TC-027: assertProviderReadiness behavior (local calls probe / managed is no-op)
- TC-028: assertNoDuplicateLiveJob behavior (both delegate to assertSlugUnoccupied)
- TC-029: reloadJobState behavior (local reads store / managed throws)
- TC-030: canDeriveChangedFiles behavior (local returns boolean / managed returns false)

### AC-9: full-port依存とfake都合optionalの再導入を防ぐarchitecture ratchetがある

**Result: SATISFIED**

`src/core/port/__tests__/runtime-strategy-ratchet.test.ts` exists and asserts 0 occurrences of all 7 forbidden patterns. Runs as part of `bun run test`.

### AC-10: SpecRunner上の既存verificationがgreen

**Result: SATISFIED**

From `verification-result.md`:
- build: passed (exit 0)
- typecheck: passed (exit 0) — `tsc --noEmit` with 0 errors
- test: passed (exit 0)
- lint: passed (exit 0)
- changed-line-coverage: passed (exit 0)

### AC-11: ユーザー向け挙動・出力・終了コードに差分がない

**Result: SATISFIED (structural)**

The refactoring is purely structural (type signatures, optional→required promotion, shim removal). The execution order in `CommandRunner.execute()` is unchanged:
1. `assertProviderReadiness` (before prepare, before any side effects)
2. `prepare()` (subclass override)
3. `setupWorkspace()`
4. `reloadJobState` (run path only, `existingWorktreePath === undefined`)
5. `buildDeps()` + `registerCleanup()`
6. pipeline run
7. `teardown()`

Resume path skip condition for `reloadJobState` is preserved. The `if (workspaceOpts.existingWorktreePath === undefined)` condition is the same logical check as the former `if (this.runtime.reloadJobState && workspaceOpts.existingWorktreePath === undefined)` — the only change is removal of the method-existence guard.

---

## Spec Requirements Verification

### Requirement: Provider readiness は副作用より前に無条件で実行される

**SATISFIED**

`runner.ts:111`: `await this.runtime.assertProviderReadiness(process.env as Record<string, string | undefined>);`
— Direct await, no `if` guard, placed before `prepare()` (which is where all side effects begin).

`CommandRunner` constructor type includes `ProviderReadinessCapability`, making it a TypeScript compile-time error to pass an object without `assertProviderReadiness`. ✓

### Requirement: Duplicate live-job guard は bootstrapJob より前に無条件で実行される

**SATISFIED**

`pipeline-run.ts:142`: `await this.pipelineRuntime.assertNoDuplicateLiveJob(cwd, slug);`
— At line 145: `bootstrapJob` is called after.
No `?.`. `JobBootstrapCapability` includes both methods as required. ✓

### Requirement: setupWorkspace 後の state reload は skip 条件が維持されつつ無条件で呼ばれる

**SATISFIED**

`runner.ts:193-195`:
```typescript
if (workspaceOpts.existingWorktreePath === undefined) {
  jobState = await this.runtime.reloadJobState(jobState.jobId, slug, workspace);
```
Run path (undefined): reload called directly, no method-existence guard. ✓
Resume path (`existingWorktreePath` set): skipped. ✓

### Requirement: `canDeriveChangedFiles` は required method として直接呼ばれる

**SATISFIED**

`ChangedFilesCapability` interface in `runtime-strategy.ts:240`: `canDeriveChangedFiles(): boolean;` (required, no `?`). ✓

Callers:
- `scope-check.ts:53`: `deps.changedFiles.canDeriveChangedFiles()` (direct) ✓
- `executor.ts:279`: `deps.changedFiles?.canDeriveChangedFiles()` — `?.` is on `changedFiles` (outer capability absence guard), NOT on `canDeriveChangedFiles` ✓
- `runtime-capability-gate.ts:82`: `runtime.canDeriveChangedFiles()` (direct) ✓

### Requirement: production コードは `RuntimeStrategy & PipelineDepsBuilder` を参照しない

**SATISFIED** (see AC-1, AC-2 above)

The new capability types used are `ProviderReadinessCapability`, `JobBootstrapCapability`, `WorkspaceLifecycleCapability`, `JobStatePersistenceCapability`, `PipelineDepsBuilder`, and `RuntimeFacade` (their intersection). ✓

### Requirement: `RealRuntimeStrategy` は production から撤去される

**SATISFIED** (see AC-4 above)

### Requirement: Pick-based derive shim が production から撤去される

**SATISFIED** (see AC-5 above)

`Pick<RuntimeStrategy` is absent from production src. Ratchet TC-011 asserts this. ✓

### Requirement: テスト fake の double cast が typed capability object で置換される

**SATISFIED** (see AC-6, AC-7 above)

### Requirement: LocalRuntime と ManagedRuntime は `RuntimeFacade` を構造的に満たす

**SATISFIED**

Both `LocalRuntime` and `ManagedRuntime` implement `RuntimeStrategy` (which is a superset of `RuntimeFacade`). The contract tests TC-013 and TC-014 provide compile-time type assertion proofs. ✓

### Requirement: architecture ratchet が禁止パターンの再導入を防ぐ

**SATISFIED**

`src/core/port/__tests__/runtime-strategy-ratchet.test.ts` exists, asserts 7 forbidden patterns at 0 occurrences, and runs in CI via `bun run test`. ✓

### Requirement: 振る舞い不変条件が維持される

**SATISFIED (structural)**

The execution order is preserved (see AC-11 above). No runtime behavior changes. The `ManagedRuntime.reloadJobState` continues to throw (design Risk section documents this as behavior-preserving, and TC-029 in the contract test explicitly records it). ✓

---

## Plan Context (design/tasks)

### D1–D7 Decisions: All implemented

| Decision | Status |
|----------|--------|
| D1: 4 named lifecycle capability interfaces in `command-runtime.ts` | Implemented: `ProviderReadinessCapability`, `JobBootstrapCapability`, `WorkspaceLifecycleCapability`, `JobStatePersistenceCapability` |
| D2: CommandRunner intersection type | Implemented |
| D3: RuntimeStrategy optional→required; RealRuntimeStrategy removed | Implemented |
| D4: Pick-based shims removed; buildDeps() direct construction | Implemented |
| D5: ChangedFilesCapability.canDeriveChangedFiles required | Implemented |
| D6: as unknown as RuntimeStrategy replaced with typed objects | Implemented |
| D7: Architecture ratchet test | Implemented |

### T-01 through T-14: All tasks completed (all checkboxes checked)

### Plan Divergence: `runtime-capability-gate.ts` parameter type

The `assertRuntimeSupportsScope()` function uses `Pick<ChangedFilesCapability, "canDeriveChangedFiles">` as the `runtime` parameter type (line 71) rather than the full `ChangedFilesCapability`. This is a minor divergence from the spirit of "Pick で切り出さないこと" in requirement §1.

**Assessment: Not a spec violation.** The normative spec prohibition is specifically `Pick<RuntimeStrategy, ...>`, which this is not. The method is called directly (`runtime.canDeriveChangedFiles()`) without optional chaining. The ratchet test TC-011 checks `Pick<RuntimeStrategy` specifically and does not flag `Pick<ChangedFilesCapability`. The function could simply use `ChangedFilesCapability` as the parameter type for a marginally more idiomatic signature, but the current form has no conformance impact.

---

## Evidence Counts

- **Checked**: 11 acceptance criteria + 9 spec requirements + 15 scenarios = 35 normative items
- **Skipped**: 0
- **Unverified**: 0 (dynamic behavior invariants inferred from structural code review + green verification result)
