# Code Review Feedback — runtime-strategy-convergence — iter 10

## Verdict: approved (no blocking findings)

---

## Summary

This is the R2c refactoring that narrows the Command layer's dependency from the monolithic
`RuntimeStrategy & PipelineDepsBuilder` whole-port to purpose-scoped capability interfaces.
The implementation is structurally correct, all acceptance criteria are met per code inspection,
and the verification pipeline reports full green (build / typecheck / test / lint / coverage).

One **medium** finding (test-case numbering collision) and one **low** observation (traceability gap
for new ratchet scope) do not block the PR but should be resolved before the next iteration.

---

## Acceptance Criteria Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| production に `RuntimeStrategy & PipelineDepsBuilder` 0 件 | ✅ | Grep confirms 0 hits in src/; TC-008 ratchet enforces it |
| `CommandRunner` / subclass が full `RuntimeStrategy` に依存しない | ✅ | runner.ts imports only command-runtime.ts capabilities + PipelineDepsBuilder; no RuntimeStrategy import |
| production required lifecycle処理に optional call/存在確認なし | ✅ | No `assertNoDuplicateLiveJob?.`, `assertProviderReadiness?.`, `reloadJobState?.` in src/ |
| `RealRuntimeStrategy` 0 件 | ✅ | TC-009 / TC-031 ratchet; grep confirms 0 hits |
| `Pick` ベースの導出 shim 0 件 | ✅ | TC-010 / TC-011 ratchet; grep confirms 0 hits |
| `as unknown as RuntimeStrategy` 0 件 | ✅ | TC-012 ratchet; grep confirms 0 hits |
| test fake は typed builder/helper で必要 contract を満たす | ✅ | pipeline-sole-committer-e2e uses RoundGitEffectsCapability / StepIoValidationCapability typed objects |
| Local/Managed 双方の command lifecycle contract test | ✅ | command-lifecycle-contract.test.ts (TC-027 to TC-030) |
| architecture ratchet が再導入を防ぐ | ✅ | runtime-strategy-ratchet.test.ts — 7 top-level describe blocks |
| SpecRunner verification green | ✅ | verification-result.md: all 5 phases passed |
| ユーザー向け挙動・出力・終了コードに差分なし | ✅ | Lifecycle order, teardown, error paths unchanged in runner.ts |

---

## Behavioral Invariant Check

Execution order in `CommandRunner.execute()` — verified against runner.ts:

```
0. assertProviderReadiness()        (line 113, before prepare())
1. prepare()                        (line 129)
2. setupWorkspace()                 (line 171)
3. reloadJobState()  [run-path only] (line 197, skip when existingWorktreePath !== undefined)
4. buildDeps()                      (line 222)
5. registerCleanup()                (line 247)
6. pipeline.run()                   (line 346)
7. teardown()                       (line 374 on error, line 391 on success)
```

All invariants from the request are maintained:
- Provider readiness fires unconditionally before any persistent side effect ✓
- `assertNoDuplicateLiveJob` fires before `bootstrapJob` in `PipelineRunCommand.prepare()` (lines 142 / 145) ✓
- Resume path skips `reloadJobState` (`existingWorktreePath !== undefined` guard) ✓
- Setup failure persists failed state before returning 1 (line 174-186) ✓
- Teardown is always called after `handle` is initialized — gate-halt path reaches line 391 via `finalState = haltState` ✓

---

## Findings

### F-001 · Medium · Test-case numbering collision

**File**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts`  
**Lines**: 228–319 (describe block labeled `TC-032`)

`runtime-strategy-ratchet.test.ts` uses `TC-032` as the label for its "Command テストに
`RuntimeStrategy & PipelineDepsBuilder` が存在しない" suite (6 sub-checks:
`tests/unit/core/command/`, `tests/core/`, `tests/unit/core/runtime/`, `tests/unit/step/`,
`tests/unit/core/step/`, `tests/attach/`, `tests/unit/pipeline/`).

`test-cases.md` allocates `TC-032` to a different scenario: **"typecheck が全エラー 0 件"**
(Group 11: Gate Checks). The two entries describe completely different behaviors with the
same identifier.

**Impact**:
- Coverage audits against `test-cases.md` associate TC-032 with the typecheck gate, not the
  command-test ratchet — the 6 sub-checks have no matching entry in the authoritative TC list.
- The `test-cases.md` Summary correctly says `total: 34` (TC-001 through TC-034), confirming
  that the ratchet's TC-032 is a new scope that was numbered without checking for collisions.

**Fix**: Assign the command-test ratchet block a new number (e.g. `TC-035`), add a corresponding
entry to `test-cases.md`, and update the Summary total accordingly.

---

### F-002 · Low · Ratchet coverage gap for root-level e2e tests

**File**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts`

`TC-032` (the Command test ratchet) guards 7 specific test directories but does **not** cover
root-level `tests/` files outside those directories (e.g., `tests/custom-reviewers-e2e.test.ts`,
`tests/pipeline-sole-committer-e2e.test.ts`, `tests/attach/…` is covered but other root files
are not).

A future contributor could introduce `RuntimeStrategy & PipelineDepsBuilder` in a new root-level
e2e test without triggering a CI failure. The `as unknown as RuntimeStrategy` check (TC-012)
**does** cover all test files, so the double-cast vector is already guarded.

**Impact**: Low — root-level e2e tests are integration/smoke tests, not fakes that constrain
the production contract. The most dangerous vector (unit-test fakes) is already covered.

**Fix** (optional): Extend TC-032 (or TC-035 after renumbering) to include a check against
`tests/` root-level files, or add an explicit carve-out comment explaining why root-level e2e
tests are intentionally excluded from this ratchet.

---

## Observations (non-blocking)

### O-1 · `RuntimeStrategy` retention documentation

`LocalRuntime` and `ManagedRuntime` still declare `implements RuntimeStrategy`.  
The acceptance criterion says: *"RuntimeStrategy が外部公開型として互換維持を必要とする場合のみ、
deprecatedなboundary-only compatibility typeとして残してよい。その場合も内部で使用せず、
PR本文に根拠と削除候補releaseを記載する。"*

The PR body should document:
- Why `RuntimeStrategy` is retained (backward compat for external consumers, if any)
- Target release for removal

This is a process check — no code change required if the PR body includes the rationale.

### O-2 · `RuntimeFacade` in `ResumeCommand` includes more than used

`ResumeCommand.prepare()` uses `RuntimeFacade` but does not directly invoke
`ChangedFilesCapability` or `JobBootstrapCapability` methods (no `assertNoDuplicateLiveJob`,
no `bootstrapJob`, no `canDeriveChangedFiles` / `listChangedFiles` in its prepare() body).
It only passes `runtime` to `super()` (CommandRunner), which uses the narrow 4-capability
intersection.

This is architecturally acceptable — `ResumeCommand` takes `RuntimeFacade` as its declared
type for consistency with `PipelineRunCommand` and the composition root. No change needed;
noted for documentation purposes.

---

## 検証した項目

- `CommandRunner` コンストラクタ型 (`runner.ts`): `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder` — `RuntimeStrategy` import なし
- `PipelineRunCommand` / `ResumeCommand` コンストラクタ型: `RuntimeFacade` (named composition) — `RuntimeStrategy & PipelineDepsBuilder` なし
- `RuntimeFacade` 定義 (`runtime-facade.ts`): 6 capability intersection — `RuntimeStrategy` 参照なし
- `runtime-capability-gate.ts`: `ChangedFilesCapability` を直接受け取り、optional chaining なし
- `factory.ts` 戻り値型: `RuntimeFacade` ✓
- `bootstrap.ts` の `BootstrapResult.runtime`: `RuntimeFacade` ✓
- Grep: `RuntimeStrategy & PipelineDepsBuilder` in src/ → 0 件
- Grep: `assertNoDuplicateLiveJob?.` / `assertProviderReadiness?.` / `reloadJobState?.` in src/ → 0 件
- Grep: `canDeriveChangedFiles?.` in src/ production → ratchet test の自己参照のみ (production 0 件)
- Grep: `RuntimeStrategy & PipelineDepsBuilder` in tests/ → 0 件
- `LocalRuntime implements RuntimeStrategy` / `ManagedRuntime implements RuntimeStrategy` を確認
- `command-lifecycle-contract.test.ts`: TC-027〜TC-030 (assertProviderReadiness / assertNoDuplicateLiveJob / reloadJobState / canDeriveChangedFiles の Local/Managed 差異)
- `runtime-strategy-ratchet.test.ts`: TC-008〜TC-012, TC-031, TC-032 系 ratchet 群
- `pipeline-sole-committer-e2e.test.ts`: `as unknown as RuntimeStrategy` → 0, typed capability objects 使用を確認
- `runner.ts` 実行順序: assertProviderReadiness(0) → prepare(1) → setupWorkspace(2) → reloadJobState(3) → buildDeps(4) → registerCleanup(5) → pipeline.run(6) → teardown(7)
- resume path の reloadJobState skip 条件 (`existingWorktreePath !== undefined`) を確認
- setup 失敗時の state 記録と cleanup handle の扱いを確認
- gate-halt path が teardown を呼ぶことを確認
- `verification-result.md`: build / typecheck / test / lint / coverage 全 pass
- `test-cases.md` の TC 総数 (34件) と Summary 数値の整合性を確認

## 検証できなかった項目

- **Local/Managed 間の実際の実行差異**: `LocalRuntime` / `ManagedRuntime` の全 24 メソッド実装詳細は読んでいない。contract test (TC-027〜030) と型チェック通過を信頼する
- **CLIユーザー向け挙動の実動作**: `specrunner run` / `specrunner resume` の実端末出力は手動テスト (TC-016) で確認が必要。verification phase は passed だがユーザー向け出力の回帰は手動確認が正典
- **`RuntimeStrategy` の外部公開 API 依存**: 外部 consumer が `RuntimeStrategy` 型を使っているかどうかは、本リポジトリ外を確認できないため不明
- **TC-032 ratchet の網羅対象ディレクトリの完全性**: `collectTsFiles` の実際の走査結果を実行せずに検証することは困難。ファイルシステム上の実 .ts ファイル一覧との突合は未実施

---

## Structural Metrics (post-change)

| Metric | Before | After |
|--------|--------|-------|
| `RuntimeStrategy` methods | 24 (some optional) | 24 (all required) |
| `RuntimeStrategy & PipelineDepsBuilder` in production src | 5 systems | 0 |
| `CommandRunner` dependency | `RuntimeStrategy & PipelineDepsBuilder` | 4 capability interfaces |
| `as unknown as RuntimeStrategy` in tests | 2 | 0 |
| Architecture ratchet coverage | 0 | 7 directories (TC-032 suite) |
| Contract tests (Local/Managed lifecycle) | 0 | 4 describe blocks (TC-027–030) |
