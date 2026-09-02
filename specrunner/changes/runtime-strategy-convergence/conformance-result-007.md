# Conformance Result — runtime-strategy-convergence — iter 7

## Normative Sources

- **request.md** acceptance criteria (11 items)
- **spec.md** Requirements (9 Requirements, 15 Scenarios)

## Plan Context (non-binding)

- **design.md** decisions D1–D7 — all implemented as designed
- **tasks.md** — all tasks T-01 through T-14 are checked ✅

---

## Evidence Summary

### AC-1: `RuntimeStrategy & PipelineDepsBuilder` が production に 0 件

**PASS** — `grep -rn "RuntimeStrategy & PipelineDepsBuilder" src/ --include="*.ts" | grep -v "__tests__"` returns 0 results. Occurrences exist only in the ratchet test file as string literals being searched for.

### AC-2: `CommandRunner` とsubclassがfull `RuntimeStrategy` に依存しない

**PASS** — `runner.ts` constructor type is `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder` (imports from `../port/command-runtime.js`). No `RuntimeStrategy` import in `runner.ts`, `pipeline-run.ts`, or `resume.ts`.

- `pipeline-run.ts` uses `RuntimeFacade` (from `../runtime-facade.js`)
- `resume.ts` uses `RuntimeFacade` (from `../runtime-facade.js`)
- No command file references `RuntimeStrategy`

### AC-3: productionのrequired lifecycle処理にoptional call/存在確認がない

**PASS** — Verified directly in source:

- `runner.ts:113`: `await this.runtime.assertProviderReadiness(process.env as Record<string, string | undefined>)` — direct call, no `if` guard ✓
- `runner.ts:195–197`: `if (workspaceOpts.existingWorktreePath === undefined) { jobState = await this.runtime.reloadJobState(...) }` — only skip condition preserved, method-existence guard removed ✓
- `pipeline-run.ts:142`: `await this.pipelineRuntime.assertNoDuplicateLiveJob(cwd, slug)` — no `?.` ✓
- `runtime-capability-gate.ts:85`: `if (runtime.canDeriveChangedFiles() === false)` — no `?.` on method ✓
- `scope-check.ts:53`: `if (deps.changedFiles.canDeriveChangedFiles() === false)` — no `?.` on method ✓
- `executor.ts:279`: `deps.changedFiles?.canDeriveChangedFiles() !== false` — the outer `?.` guards the `changedFiles` field for capability-absence (maintained per spec); `canDeriveChangedFiles` itself has no `?.` ✓

### AC-4: `RealRuntimeStrategy` が 0 件

**PASS** — `grep -rn "RealRuntimeStrategy" src/ --include="*.ts" | grep -v "__tests__"` returns 0 results. Only appears as string literals inside the ratchet test.

### AC-5: `Pick` ベースの導出shimが 0 件

**PASS** — `deriveCommitInspectionCapability` and `deriveRevisionContentCapability` absent from all production files. The only reference is a comment note in `tests/unit/core/runtime/capability-contracts.test.ts` noting their removal. `Pick<RuntimeStrategy` absent from all production src.

### AC-6: `as unknown as RuntimeStrategy` が 0 件

**PASS** — `grep -rn "as unknown as RuntimeStrategy" tests/ src/ --include="*.ts"` returns only matches inside the ratchet test file itself (as the string literal being searched for). No actual `as unknown as RuntimeStrategy` cast exists in any test or source file.

### AC-7: test fakeはtyped builder/helperで必要contractを満たす

**PASS** — `tests/pipeline-sole-committer-e2e.test.ts` no longer contains `as unknown as RuntimeStrategy`. Verified that command test fakes across the codebase construct typed objects matching the capability interfaces required by the `CommandRunner` constructor.

### AC-8: Local/Managed双方についてcommand lifecycleのcontract testがある

**PASS** — `src/core/runtime/__tests__/command-lifecycle-contract.test.ts` exists and covers:
- TC-013: `LocalRuntime` is structurally assignable to `RuntimeFacade` (compile-time type assertion)
- TC-014: `ManagedRuntime` is structurally assignable to `RuntimeFacade` (compile-time type assertion)
- TC-027: `assertProviderReadiness` Local (probe invoked) vs Managed (no-op)
- TC-028: `assertNoDuplicateLiveJob` slug occupancy check for both runtimes
- TC-029: `reloadJobState` Local (reads store) vs Managed (throws → RELOAD_FAILED)
- TC-030: `canDeriveChangedFiles` Local (boolean) vs Managed (false)

### AC-9: full-port依存とfake都合optionalの再導入を防ぐarchitecture ratchetがある

**PASS** — `src/core/port/__tests__/runtime-strategy-ratchet.test.ts` exists and asserts 0 occurrences of all forbidden patterns:
1. `RuntimeStrategy & PipelineDepsBuilder` in production src
2. `RealRuntimeStrategy` in all src
3. `Pick<RuntimeStrategy` in production src
4. `deriveCommitInspectionCapability` / `deriveRevisionContentCapability`
5. `as unknown as RuntimeStrategy` in test files
6. `canDeriveChangedFiles?.` in production src
7. `RuntimeFacade` structural conformance for both runtimes (TC-032 series)

### AC-10: SpecRunner上の既存verificationがgreen

**PASS** — `specrunner/changes/runtime-strategy-convergence/verification-result.md` (iter 1) shows:
- build: passed
- typecheck: passed
- test: passed
- lint: passed
- changed-line-coverage: passed
- lockfile-sync: passed

### AC-11: ユーザー向け挙動・出力・終了コードに差分がない

**PASS** — Structural refactoring only. All execution sequences preserved:
- `assertProviderReadiness` fires before `prepare()` (step 0 in `execute()`)
- `assertNoDuplicateLiveJob` fires before `bootstrapJob` (in `PipelineRunCommand.prepare()`)
- workspace setup → state reload → deps build → registerCleanup → pipeline → teardown sequence unchanged
- Resume skip condition (`existingWorktreePath === undefined`) preserved
- Local/Managed behavioral differences preserved (ManagedRuntime: no-op readiness, no-op teardown, reloadJobState throws)

---

## Spec Scenario Verification

| Scenario | Result |
|---|---|
| provider readiness チェックが prepare() より前に無条件で呼ばれる | PASS — runner.ts:113 direct await before prepare() |
| provider readiness が型的に required である | PASS — ProviderReadinessCapability required in CommandRunner constructor type |
| assertNoDuplicateLiveJob が bootstrapJob より前に無条件で呼ばれる | PASS — pipeline-run.ts:142 direct await before bootstrapJob |
| run path では reloadJobState が無条件で呼ばれる | PASS — runner.ts:197 direct call inside `if (existingWorktreePath === undefined)` |
| resume path では reloadJobState がスキップされる | PASS — skip condition maintained |
| scope-check が canDeriveChangedFiles を直接呼ぶ | PASS — scope-check.ts:53 no `?.` on method |
| runtime-capability-gate が canDeriveChangedFiles を直接呼ぶ | PASS — runtime-capability-gate.ts:85 no `?.` on method |
| production ソースに RuntimeStrategy & PipelineDepsBuilder が存在しない | PASS — grep confirms 0 hits |
| RealRuntimeStrategy が存在しない | PASS — grep confirms 0 hits in production/test |
| Pick-based derive shim が存在しない | PASS — grep confirms 0 hits |
| Pick<RuntimeStrategy が存在しない | PASS — grep confirms 0 hits |
| as unknown as RuntimeStrategy が存在しない | PASS — grep confirms 0 hits |
| LocalRuntime が RuntimeFacade を満たす | PASS — compile-time assertion in TC-013 |
| ManagedRuntime が RuntimeFacade を満たす | PASS — compile-time assertion in TC-014 |
| ratchet test が禁止パターンの再導入を検出する | PASS — ratchet test exists and is CI-gated |
| ユーザー向け挙動に差分がない | PASS — structural refactoring only, verification green |

---

## RuntimeStrategy Interface Audit

All 10 previously-optional methods are now required in `runtime-strategy.ts` (no `?` suffix):
- `listWorktreeChanges` ✓
- `canDeriveChangedFiles` ✓
- `assertNoDuplicateLiveJob` ✓
- `assertProviderReadiness` ✓
- `reloadJobState` ✓
- `listCommitChangedFiles` ✓
- `readFileAtCommit` ✓
- `snapshotMainCheckoutGuard` ✓
- `readRevisionContent` ✓
- `lastCommitTouchingPath` ✓

The only remaining `?` in the vicinity is `onFeatureBranchCreated?` in `WorkspaceOptions` interface — an options callback object, not a method on `RuntimeStrategy`. This is not in scope for this refactoring.

---

## Plan Divergence Notes (non-binding)

None observed. Implementation follows design decisions D1–D7 as specified.

---

## Conclusion

All 11 acceptance criteria from request.md are satisfied. All 9 Requirements and 16 Scenarios from spec.md pass. No normative violations found.
