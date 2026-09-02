# Conformance Result — runtime-strategy-convergence — iter 6

## Normative Sources

- **request.md** acceptance criteria (11 items)
- **spec.md** Requirements (9 Requirements, 15 Scenarios)

## Plan Context (non-binding)

- **design.md** decisions D1–D7 — all implemented as designed
- **tasks.md** — all tasks T-01 through T-14 are checked ✅

---

## Evidence Summary

### AC-1: `RuntimeStrategy & PipelineDepsBuilder` が production に 0 件

**PASS** — grep of `src/` (excluding `__tests__/`) finds 0 occurrences. The only occurrences are inside the ratchet test (`runtime-strategy-ratchet.test.ts`) which explicitly checks for this pattern.

### AC-2: `CommandRunner` とsubclassがfull `RuntimeStrategy` に依存しない

**PASS** — `src/core/command/runner.ts` imports from `../port/command-runtime.js` and `../types.js`. The constructor type is `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder`. No `RuntimeStrategy` import in any command file.

`PipelineRunCommand` uses `RuntimeFacade` (the named intersection alias). `ResumeCommand` also uses `RuntimeFacade`. No command file references `RuntimeStrategy` directly.

### AC-3: productionのrequired lifecycle処理にoptional call/存在確認がない

**PASS** — Verified in production source:

- `runner.ts:113`: `await this.runtime.assertProviderReadiness(...)` — direct call, no `if` guard
- `runner.ts:195–197`: `if (workspaceOpts.existingWorktreePath === undefined) { jobState = await this.runtime.reloadJobState(...) }` — method existence guard removed; only the skip condition remains
- `pipeline-run.ts:142`: `await this.pipelineRuntime.assertNoDuplicateLiveJob(cwd, slug)` — no `?.`
- `runtime-capability-gate.ts:82`: `runtime.canDeriveChangedFiles() === false` — no `?.`
- `scope-check.ts:53`: `deps.changedFiles.canDeriveChangedFiles() === false` — no `?.`
- `executor.ts:279`: `deps.changedFiles?.canDeriveChangedFiles() !== false` — the outer `?.` guards against `changedFiles` being `undefined` (capability absence, per spec), not against `canDeriveChangedFiles` being optional. Compliant.

### AC-4: `RealRuntimeStrategy` が 0 件

**PASS** — grep of `src/` and `tests/` finds 0 occurrences (excluding ratchet test).

### AC-5: `Pick` ベースの導出shimが 0 件

**PASS** — `deriveCommitInspectionCapability` and `deriveRevisionContentCapability` absent from all files (excluding ratchet test). `Pick<RuntimeStrategy` absent from production src.

### AC-6: `as unknown as RuntimeStrategy` が 0 件

**PASS** — `tests/pipeline-sole-committer-e2e.test.ts` now uses typed capability objects: `roundGitEffectsImpl: RoundGitEffectsCapability` and `stepIoImpl: StepIoValidationCapability`. No `as unknown as RuntimeStrategy` anywhere in test files (verified).

### AC-7: test fakeはtyped builder/helperで必要contractを満たす

**PASS** — The e2e test constructs `RoundGitEffectsCapability` and `StepIoValidationCapability` typed objects directly and injects them into the corresponding `roundGitEffects` and `stepIo` slots. No `as never` re-cast on capability slots. Command test fakes use narrow capability stubs matching the production constructor type.

### AC-8: Local/Managed双方についてcommand lifecycleのcontract testがある

**PASS** — `src/core/runtime/__tests__/command-lifecycle-contract.test.ts` exists with:
- TC-013: `LocalRuntime` is assignable to `RuntimeFacade` (compile-time type assertion)
- TC-014: `ManagedRuntime` is assignable to `RuntimeFacade` (compile-time type assertion)
- TC-027: `assertProviderReadiness` behavior for both runtimes
- TC-028: `assertNoDuplicateLiveJob` behavior for both runtimes
- TC-029: `reloadJobState` behavior (Local: reads store; Managed: throws → RELOAD_FAILED)
- TC-030: `canDeriveChangedFiles` behavior (Local: boolean; Managed: false)

### AC-9: full-port依存とfake都合optionalの再導入を防ぐarchitecture ratchetがある

**PASS** — `src/core/port/__tests__/runtime-strategy-ratchet.test.ts` exists with guards for:
1. `RuntimeStrategy & PipelineDepsBuilder` in production src — 0 hits required
2. `RealRuntimeStrategy` in src and tests — 0 hits required
3. `deriveCommitInspectionCapability` / `deriveRevisionContentCapability` — 0 hits required
4. `Pick<RuntimeStrategy` in production src — 0 hits required
5. `as unknown as RuntimeStrategy` in test files — 0 hits required
6. `canDeriveChangedFiles?.` in production src — 0 hits required
7. `RuntimeStrategy & PipelineDepsBuilder` in command, step, runtime, attach test directories (TC-032a–f)

### AC-10: SpecRunner上の既存verificationがgreen

**PASS** — `verification-result.md` (iter 1) shows:
- build: passed
- typecheck: passed
- test: passed
- lint: passed
- changed-line-coverage: passed

### AC-11: ユーザー向け挙動・出力・終了コードに差分がない

**PASS** — The change is a structural refactoring only. All execution sequences are preserved:
- `assertProviderReadiness` still fires before `prepare()` (step 0 in `execute()`)
- `assertNoDuplicateLiveJob` still fires before `bootstrapJob` (in `PipelineRunCommand.prepare()`)
- workspace setup → state reload → deps build → registerCleanup → pipeline → teardown sequence unchanged
- resume skip condition (`existingWorktreePath === undefined`) preserved
- Local/Managed runtime behavior differences preserved (ManagedRuntime: no-op readiness, no-op teardown, reloadJobState throws)

---

## Spec Scenario Verification

| Scenario | Result |
|---|---|
| provider readiness チェックが prepare() より前に無条件で呼ばれる | PASS — runner.ts:113 direct await |
| provider readiness が型的に required である | PASS — TypeScript compilation passes; constructor type requires ProviderReadinessCapability |
| assertNoDuplicateLiveJob が bootstrapJob より前に無条件で呼ばれる | PASS — pipeline-run.ts:142 direct await before bootstrapJob |
| run path では reloadJobState が無条件で呼ばれる | PASS — runner.ts:197 inside `if (existingWorktreePath === undefined)` |
| resume path では reloadJobState がスキップされる | PASS — skip condition maintained |
| scope-check が canDeriveChangedFiles を直接呼ぶ | PASS — scope-check.ts:53 no `?.` on method |
| runtime-capability-gate が canDeriveChangedFiles を直接呼ぶ | PASS — runtime-capability-gate.ts:82 no `?.` on method |
| production ソースに RuntimeStrategy & PipelineDepsBuilder が存在しない | PASS — grep confirms 0 hits |
| RealRuntimeStrategy が存在しない | PASS — grep confirms 0 hits |
| Pick-based derive shim が存在しない | PASS — grep confirms 0 hits |
| Pick<RuntimeStrategy が存在しない | PASS — grep confirms 0 hits |
| as unknown as RuntimeStrategy が存在しない | PASS — grep confirms 0 hits |
| LocalRuntime が RuntimeFacade を満たす | PASS — compile-time assertion in TC-013 |
| ManagedRuntime が RuntimeFacade を満たす | PASS — compile-time assertion in TC-014 |
| ratchet test が禁止パターンの再導入を検出する | PASS — ratchet test exists and is CI-gated |
| ユーザー向け挙動に差分がない | PASS — structural refactoring only, verification green |

---

## Plan Divergence Notes (non-binding)

None observed. Implementation follows design decisions D1–D7 as specified.

The `command-runtime.ts` file JSDoc comment says "RuntimeFacade ... is defined in src/core/runtime/factory.ts" but it is actually defined in `src/core/runtime-facade.ts`. This is a stale comment within the file but does not affect normative conformance.

---

## Conclusion

All 11 acceptance criteria from request.md are satisfied. All 9 Requirements and 15 Scenarios from spec.md pass. No normative violations found.
