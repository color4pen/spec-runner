# Conformance Result — Iteration 010

**Change**: runtime-strategy-convergence
**Iteration**: 10
**Reviewer role**: conformance

---

## Normative Sources

- **request.md** — 11 acceptance criteria (§受け入れ条件)
- **spec.md** — 10 Requirements, 18 Scenarios

---

## Evidence

### AC-1: production に `RuntimeStrategy & PipelineDepsBuilder` が 0 件

**PASS**

Direct grep on `src/` (excluding `__tests__/`):

```
grep -r "RuntimeStrategy & PipelineDepsBuilder" src/ --include="*.ts" -l
→ src/core/port/__tests__/runtime-strategy-ratchet.test.ts (only — in ratchet pattern strings)
```

No production file contains `RuntimeStrategy & PipelineDepsBuilder`. The only match is in the ratchet test itself (a string literal used in `findOccurrences()` calls). ✅

Architecture ratchet TC-008 asserts this pattern is 0-count in production sources.

---

### AC-2: `CommandRunner` とサブクラスが full `RuntimeStrategy` に依存しない

**PASS**

Verified that the following production files do not import `RuntimeStrategy` at all:

- `src/core/command/runner.ts` — imports `ProviderReadinessCapability`, `WorkspaceLifecycleCapability`, `JobStatePersistenceCapability` from `command-runtime.ts`; exports `CommandRunnerRuntime` type alias
- `src/core/command/pipeline-run.ts` — imports `CommandRunnerRuntime`, `JobBootstrapCapability`, `ChangedFilesCapability`; exports `PipelineRunRuntime`
- `src/core/command/resume.ts` — imports `CommandRunnerRuntime` from `runner.ts`

No `RuntimeStrategy` identifier appears in any of these files. ✅

**Spec Requirement: Provider readiness は副作用より前に無条件で実行される** (Scenario verified):

`runner.ts:134`:
```typescript
await this.runtime.assertProviderReadiness(process.env as Record<string, string | undefined>);
```

No `if (this.runtime.assertProviderReadiness)` existence guard. Called directly before `prepare()`. ✅

**Spec Requirement: Duplicate live-job guard は bootstrapJob より前に無条件で実行される** (Scenario verified):

`pipeline-run.ts:160`:
```typescript
await this.pipelineRuntime.assertNoDuplicateLiveJob(cwd, slug);
```

No `?.` optional chaining. Called before `bootstrapJob`. ✅

---

### AC-3: production の required lifecycle 処理に optional call/存在確認がない

**PASS**

Verified absence of:
- `if (this.runtime.assertProviderReadiness)` — removed from runner.ts ✅
- `assertNoDuplicateLiveJob?.()` — removed from pipeline-run.ts ✅
- `if (this.runtime.reloadJobState` — removed from runner.ts ✅
- `canDeriveChangedFiles?.` — removed from scope-check.ts, executor.ts, runtime-capability-gate.ts ✅

`runner.ts:216–218`:
```typescript
if (workspaceOpts.existingWorktreePath === undefined) {
  jobState = await this.runtime.reloadJobState(jobState.jobId, slug, workspace);
```

Method existence guard removed; skip condition (`existingWorktreePath === undefined`) maintained. ✅

**Note on executor.ts**: Line 279 reads `deps.changedFiles?.canDeriveChangedFiles() !== false`. The `?.` is on `changedFiles` (the outer capability field), not on `canDeriveChangedFiles`. This is explicitly allowed by spec: "`changedFiles` フィールド自体が `undefined` の場合のガード（capability absence）はこれとは別に維持される." The ratchet pattern `canDeriveChangedFiles?.` does not match this code. ✅

`runtime-capability-gate.ts:85`:
```typescript
if (runtime.canDeriveChangedFiles() === false) {
```
Called without `?.` on the method. ✅

`scope-check.ts:53`:
```typescript
if (deps.changedFiles.canDeriveChangedFiles() === false) {
```
No optional chaining on `canDeriveChangedFiles`. ✅

---

### AC-4: `RealRuntimeStrategy` が 0 件

**PASS**

```
grep -r "RealRuntimeStrategy" src/ tests/ --include="*.ts" -l
→ src/core/port/__tests__/runtime-strategy-ratchet.test.ts (only — in ratchet pattern strings)
```

No file outside the ratchet test contains `RealRuntimeStrategy`. ✅

Ratchet TC-009 and TC-031 assert this at 0-count in both `src/` and `tests/`. ✅

---

### AC-5: `Pick` ベースの導出 shim が 0 件

**PASS**

```
grep -r "deriveCommitInspectionCapability|deriveRevisionContentCapability" src/ --include="*.ts"
→ src/core/port/__tests__/runtime-strategy-ratchet.test.ts (only — ratchet pattern strings)

grep -r "Pick<RuntimeStrategy" src/ --include="*.ts" (excluding __tests__)
→ (no output)
```

Both shim functions removed from `runtime-strategy.ts`. `buildDeps()` in `local.ts` and `managed.ts` constructs capabilities directly. ✅

Ratchet TC-010, TC-011 assert these patterns are 0-count. ✅

---

### AC-6: `as unknown as RuntimeStrategy` が 0 件

**PASS**

```
grep -r "as unknown as RuntimeStrategy" tests/ src/ --include="*.ts"
→ src/core/port/__tests__/runtime-strategy-ratchet.test.ts (only — ratchet string literals)
```

`tests/pipeline-sole-committer-e2e.test.ts` verified: no `RuntimeStrategy` references, no `as unknown as RuntimeStrategy`. ✅

Ratchet TC-012 asserts this at 0-count in test files. ✅

---

### AC-7: test fake は typed builder/helper で必要 contract を満たす

**PASS**

**executor tests (T-15 scope)**:

`executor-activation.test.ts`:
- Imports `ChangedFilesCapability` (not `RuntimeStrategy` itself)
- `makeMinimalDeps()` uses `noopStepArtifact`, `noopStepIo` from `noop-capabilities.js`
- `changedFiles` slot receives a `ChangedFilesCapability` typed object built by `makeChangedFiles()` / `makeRuntimeStrategy()` (deprecated name, but returns `ChangedFilesCapability`)
- No `as never` slot injections ✅

`executor-drift-detection.test.ts`: Uses `StepArtifactLifecycleCapability`, `noopStepArtifact`, `noopStepIo`. No `RuntimeStrategy` import, no `as never`. ✅

`executor-verdict.test.ts`: Uses `StepIoValidationCapability`, `noopStepArtifact`. No `RuntimeStrategy` import, no `as never`. ✅

**command tests (T-17 scope)**:

- `tests/unit/core/command/runner.test.ts` imports `CommandRunnerRuntime` from `src/core/command/runner.ts` ✅
- `tests/unit/core/command/resume.test.ts` imports `CommandRunnerRuntime` from `src/core/command/runner.ts` ✅
- `tests/unit/core/command/pipeline-run.test.ts` imports `PipelineRunRuntime` from `src/core/command/pipeline-run.ts` ✅
- `tests/unit/core/command/pipeline-run-duplicate-guard.test.ts` imports `PipelineRunRuntime` ✅
- `tests/unit/core/command/pipeline-run-gate.test.ts` imports `PipelineRunRuntime` ✅

Ratchet TC-037a, TC-037b, TC-039a, TC-039b, TC-039c assert all fake patterns are clean. ✅

---

### AC-8: Local/Managed 双方について command lifecycle の contract test がある

**PASS**

`src/core/runtime/__tests__/command-lifecycle-contract.test.ts` exists and contains:

- **TC-013**: `const _facade: RuntimeFacade = makeLocalRuntime()` — compile-time type assertion ✅
- **TC-014**: `const _facade: RuntimeFacade = makeManagedRuntime()` — compile-time type assertion ✅
- **TC-027**: `assertProviderReadiness` Local vs Managed difference verified ✅
- **TC-028**: `assertNoDuplicateLiveJob` Local vs Managed verified ✅
- **TC-029**: `reloadJobState` Local reads from store / Managed throws ✅
- **TC-030**: `canDeriveChangedFiles()` Local returns boolean / Managed returns false ✅

Spec Requirement: LocalRuntime と ManagedRuntime は `RuntimeFacade` を構造的に満たす — satisfied. ✅

---

### AC-9: full-port 依存と fake 都合 optional の再導入を防ぐ architecture ratchet がある

**PASS**

`src/core/port/__tests__/runtime-strategy-ratchet.test.ts` asserts 0-count for:

- TC-008: `RuntimeStrategy & PipelineDepsBuilder` in production src ✅
- TC-009/TC-031: `RealRuntimeStrategy` in src/ and tests/ ✅
- TC-010: `deriveCommitInspectionCapability` / `deriveRevisionContentCapability` ✅
- TC-011: `Pick<RuntimeStrategy` in production src ✅
- TC-012: `as unknown as RuntimeStrategy` / `as any as RuntimeStrategy` in test files ✅
- Ratchet: `canDeriveChangedFiles?.` in production src ✅
- TC-035a–h: `RuntimeStrategy & PipelineDepsBuilder` across all test directories ✅
- TC-037a: `RuntimeStrategy` named imports in test files (except ratchet + contract test) ✅
- TC-037b: `as never` slot injections in `tests/unit/step/` ✅
- TC-039a: `RuntimeFacade` named imports in test files (except `command-lifecycle-contract.test.ts`) ✅
- TC-039b: `as never` in runtime (first) argument of `ResumeCommand`/`PipelineRunCommand`/`CommandRunner` subclass constructors ✅
- TC-039c: local `type CommandRunnerRuntime =` re-definitions in test files ✅

---

### AC-10: SpecRunner 上の既存 verification が green

**PASS**

From `verification-result.md`:
```
Verdict: passed
| 1 | build       | passed | 0.6s   | 0 |
| 2 | typecheck   | passed | 15.1s  | 0 |
| 3 | test        | passed | 99.0s  | 0 |
| 4 | lint        | passed | 15.8s  | 0 |
| 5 | changed-line-coverage | passed | 128.5s | 0 |
Test Files  834 passed (834)
      Tests  12631 passed | 1 skipped | 2 todo (12634)
```

All 834 test files pass, 12631 tests pass. ✅

---

### AC-11: ユーザー向け挙動・出力・終了コードに差分がない

**PASS** (structural refactoring only)

The change is purely structural: interface definitions, type alias extraction, capability composition. No behavior changes to:
- `CommandRunner.execute()` — same sequence, same error paths
- `PipelineRunCommand.prepare()` — same flow
- `ResumeCommand.prepare()` — same flow
- `LocalRuntime` / `ManagedRuntime` — methods unchanged (only `?` removed from interface declarations, implementations already existed)

Behavioral invariant tests (runner-reload-after-setup, runner-reload-egress-e2e, provider-readiness-gate, pipeline-integration) all pass. ✅

---

## Spec Requirement Summary

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Provider readiness called before prepare(), no existence guard | PASS | runner.ts:134 direct call, no `if` guard |
| Duplicate live-job guard before bootstrapJob, no `?.` | PASS | pipeline-run.ts:160 direct call |
| reloadJobState after setupWorkspace on run path, no method guard | PASS | runner.ts:216–218 |
| canDeriveChangedFiles is required method, called directly | PASS | runtime-capability-gate.ts:85, scope-check.ts:53, executor.ts:279 (outer `?.` on field allowed) |
| Production uses named capability intersections, not RuntimeStrategy & PipelineDepsBuilder | PASS | grep 0-count |
| RealRuntimeStrategy removed | PASS | grep 0-count |
| Pick-based shims removed | PASS | grep 0-count |
| Double casts replaced with typed objects | PASS | grep 0-count |
| LocalRuntime / ManagedRuntime satisfy RuntimeFacade | PASS | contract test TC-013/TC-014 |
| Architecture ratchet exists and runs in CI | PASS | runtime-strategy-ratchet.test.ts |
| Behavioral invariants maintained | PASS | all 12631 tests pass |

---

## Plan Divergences (non-findings)

None. All design decisions D1–D7 were implemented as designed. All tasks T-01 through T-18 are checked.

---

## Summary

All 11 acceptance criteria from request.md are satisfied. All 10 spec Requirements and 18 Scenarios are conformant. Verification is green (834 test files, 12631 tests). No findings.
