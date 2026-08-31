# Review Feedback — runtime-mutation-lifecycle-capability-split — iter 7

## Summary

Iteration 7 correctly implements the R2b capability split. All four new capability interfaces (`StepArtifactLifecycleCapability`, `StepIoValidationCapability`, `TerminalStateCapability`, `RoundGitEffectsCapability`) are defined in their consumer-domain files, injected via `PipelineDeps`, and backed by derive helpers in both `LocalRuntime` and `ManagedRuntime`. All target `unknown` domain payloads are eliminated, the `as PipelineDeps` / `as CommitPushInfra` / egress-params restore casts are removed, and the DSM allowlist entry documents the `import type { PipelineDeps }` in `runtime-strategy.ts`. Verification is green (build, typecheck, test, lint all pass).

---

## Acceptance Criteria Checklist

| AC | Status | Notes |
|----|--------|-------|
| 対象 consumer が mutation/lifecycle 用に full RuntimeStrategy を要求しない | ✅ | executor.ts, pipeline.ts, parallel-review-round.ts, step-completion.ts all use capability fields |
| PipelineDeps が full runtime facade を mutation consumer 向け service locator として保持しない | ✅ | `runtimeStrategy?` field removed; 7 typed capability fields added |
| capability が use-case-specific な最小契約であり、新しい mega-interface を作っていない | ✅ | 4 separate narrow interfaces; no single MutationRuntimeStrategy |
| capability method は required で、能力不在は注入値で表現される | ✅ | Interface methods all required; PipelineDeps fields are `?` |
| snapshotMainCheckoutGuard? 以外の method は required | ✅ | Verified in step-capability.ts |
| buildDeps / finalizeStepArtifacts / commitFinalState / commitRoundArtifacts の domain-payload unknown が残らない | ✅ | All 4 target signatures have typed parameters |
| `as PipelineDeps`、`as CommitPushInfra`、egress params 復元 cast が除去される | ✅ | No occurrences found in src/ |
| 新たな `as unknown as RuntimeStrategy` を追加していない | ✅ | Only 2 pre-existing remain in tests/ (down from 4 baseline; net reduction is acceptable) |
| R2a read-only leaf consumer が full facade 依存へ戻っていない | ✅ | R2a capabilities unmodified; derive helpers pattern preserved |
| command lifecycle / step finalize / terminal commit / round-owned git effects の順序と失敗境界が executable test で固定される | ✅ | executor-lifecycle-ordering.test.ts (new); existing test suite passes |
| Local/Managed capability contract test がある | ✅ | local-runtime-capabilities.test.ts, managed-runtime-capabilities.test.ts (new) |
| architecture 文書が実装後の責務と依存方向に一致する | ✅ | components.md updated with R2a/R2b capability split description |
| SpecRunner verification が green | ✅ | build/typecheck/test/lint all pass per verification-result.md |
| 変更ファイルだけが commit され、scope 外の未追跡ファイルを含めない | ✅ |

---

## Findings

### F-01 (low, informational): TC-038 description count is stale

**Location**: `specrunner/changes/runtime-mutation-lifecycle-capability-split/test-cases.md`, TC-038

**Observation**: TC-038 states "exactly the 4 pre-existing occurrences in full-pipeline e2e test files remain". The actual post-R2b count in `tests/` is 2 (both in `tests/pipeline-sole-committer-e2e.test.ts`). Verification passed, meaning no automated test asserts the exact number 4. The reduction from 4 to 2 is a net improvement (T-13 e2e test migration cleaned up 2 more occurrences). The description should say "≤ 4 pre-existing occurrences" or "no new occurrences".

**Impact**: None on correctness or verification. The test case description is misleading for future readers who might expect exactly 4.

---

### F-02 (low, informational): Capability contract test fakes use `string | undefined` for `cwd` and omit `state` parameter

**Location**: `src/core/runtime/__tests__/local-runtime-capabilities.test.ts` line 42; `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts` line 58

**Observation**: `makeTerminalStateSource()` in both contract test files declares:
```typescript
async commitFinalState(_cwd: string | undefined, _slug: string): Promise<void> {}
```
whereas `TerminalStateCapability` requires `commitFinalState(cwd: string, slug: string, state: JobState)`. The fake has a wider `cwd` type (`string | undefined`) and omits the `state` parameter entirely.

**Impact**: TypeScript's method bivariance for interface methods allows this to compile without error (method parameters are checked bivariantly, and a function with fewer parameters is assignable). The test still proves the derive helper wires the method correctly. However, the fake does not faithfully mirror the real `TerminalStateSource` shape required by `deriveTerminalStateCapability`. If strict function type checking is ever enforced here, these fakes would need to be updated.

**Recommendation**: Align the test fake signatures with the actual interface (add `state: JobState` parameter, change `string | undefined` to `string`) for accuracy:
```typescript
async commitFinalState(_cwd: string, _slug: string, _state: JobState): Promise<void> {}
```

---

### F-03 (low, informational): `runtimeStrategy` property name in internal param objects (pre-existing R2a naming artifact)

**Location**: `src/core/step/post-fix-context.ts` line 226; `src/core/step/prior-round-context.ts` line 131; `src/core/step/custom-reviewer-round-context.ts` line 244

**Observation**: These internal function parameter interfaces use the property name `runtimeStrategy: CommitInspectionCapability | undefined`. Callers in `adr-gen.ts`, `custom-reviewer.ts`, `spec-review.ts` now correctly pass `runtimeStrategy: commitInspection` (the `CommitInspectionCapability` value), which is type-correct.

**Impact**: None on correctness — the property is properly typed as `CommitInspectionCapability | undefined`. The naming is a carry-over from R2a (when the property was typed as `RuntimeStrategy | undefined`). This is out of scope for R2b, as R2a capability redesign is explicitly a Non-Goal.

---

## Positive Observations

- **Derive helper placement (D5)**: All four derive helpers are co-located with their capability interfaces (`step-capability.ts`, `pipeline-capability.ts`). No helpers in `local.ts` or `managed.ts`.
- **snapshotMainCheckoutGuard optional handling**: The conditional spread `...(runtime.snapshotMainCheckoutGuard ? { ... } : {})` in `deriveStepArtifactLifecycleCapability` is the correct pattern for the sole optional method.
- **cwd guard pattern**: Both `pipeline.ts` and `runner.ts` guard `deps.cwd` with `if (deps.cwd)` before passing to `commitFinalState(cwd: string, ...)`. This is correct and consistent.
- **RoundEgressParams DTO**: The domain-neutral DTO cleanly replaces the `unknown`-typed egress params, carrying `synthesizedCommits`, `pushCapability`, and `excludeWorktreePatterns` with correct types.
- **DSM allowlist entry**: The `import type { PipelineDeps }` in `runtime-strategy.ts` is correctly documented with the T-05/T-12 tracking identifier and a clear explanation of why it is safe.
- **Test coverage**: The new `executor-lifecycle-ordering.test.ts` covers must-priority lifecycle ordering invariants (TC-T15-01, TC-T15-02, TC-T15-06) that were previously untested. The capability contract tests for both Local and Managed runtimes provide compile-time and runtime proofs.
- **`as unknown as RuntimeStrategy` count reduced**: Went from 4 to 2 (T-13 cleaned up 2 e2e test fakes). Net improvement over baseline.

---

## 検証した項目

| 項目 | 結果 | 根拠 |
|---|---|---|
| `buildDeps()` がポートインターフェースで `PipelineDeps` を返す | ✓ | `runtime-strategy.ts:395`; DSM allowlist エントリ (`arch-allowlist.ts:300`) |
| `runner.ts` から `as PipelineDeps` キャストが除去された | ✓ | `runner.ts:222` — キャストなしで直接代入 |
| `PipelineDeps.runtimeStrategy` が `types.ts` から除去された | ✓ | R2b コメントのみ（フィールド定義なし）; 7 capability フィールド追加済み |
| `finalizeStepArtifacts`・`commitFinalState`・`commitRoundArtifacts` が `RuntimeStrategy` インターフェースから除去された | ✓ | `runtime-strategy.ts:332–` — 3 メソッド不在; JSDoc のみ言及 |
| `StepArtifactLifecycleCapability` の全メソッドが required（`snapshotMainCheckoutGuard?` のみ例外） | ✓ | `step-capability.ts:36–94` |
| `StepIoValidationCapability` の全メソッドが required | ✓ | `step-capability.ts:108–139` |
| `TerminalStateCapability.commitFinalState` が具体型（`unknown` なし） | ✓ | `pipeline-capability.ts:64`; `cwd: string`, `slug: string`, `state: JobState` |
| `RoundGitEffectsCapability` の全 5 メソッドが required | ✓ | `pipeline-capability.ts:81–143` |
| `RoundEgressParams` が typed DTO（`unknown` なし） | ✓ | `pipeline-capability.ts:34–38` |
| `executor.ts` に `deps.runtimeStrategy` 参照がゼロ | ✓ | grep 確認: 0 件; `deps.stepArtifact`・`deps.stepIo`・`deps.changedFiles` を使用 |
| `pipeline.ts` が `deps.terminalState?.commitFinalState(cwd, slug, state)` を使用 | ✓ | `pipeline.ts:400`, `625` |
| `parallel-review-round.ts` が `deps.roundGitEffects` を使用 | ✓ | grep 確認: `runtimeStrategy` 参照ゼロ |
| `local.ts` の対象メソッドに `as CommitPushInfra`・egress params 復元 cast なし | ✓ | grep 確認: `src/` 配下で 0 件 |
| derive helpers が capability interface と同ファイルに配置（D5） | ✓ | `step-capability.ts:161–199`、`pipeline-capability.ts:148–196` |
| capability 不在を field presence で表現、optional method ではない（D6） | ✓ | 全 consumer 呼び出しが `deps.stepArtifact?.method()` パターン |
| `LocalRuntime.buildDeps` が全 7 capability フィールドを注入 | ✓ | `local.ts:631–641` |
| `ManagedRuntime.buildDeps` が全 7 capability フィールドを注入 | ✓ | `managed.ts:337–346` |
| 新たな `as unknown as RuntimeStrategy` の追加なし | ✓ | `src/` 配下で 0 件; `tests/` に残存 2 件は e2e mock（旧 4 件からの net 減） |
| R2a capabilities（`changedFiles`・`commitInspection`・`revisionContent`）が退行していない | ✓ | `PipelineDeps` に全フィールド存在; derive helpers 呼び出し確認 |
| TC-T15-01: `finalizeStepArtifacts` が `cwd:string`・`slug:string` primitive を受け取る | ✓ | `executor-lifecycle-ordering.test.ts:131–171` |
| TC-T15-02: `roundOwnsGitEffects=true` 時に `finalizeStepArtifacts` が呼ばれない | ✓ | `executor-lifecycle-ordering.test.ts:173–207` |
| LocalRuntime capability contract テスト（T-14） | ✓ | `local-runtime-capabilities.test.ts` |
| ManagedRuntime capability contract テスト（T-14） | ✓ | `managed-runtime-capabilities.test.ts` |
| TC-028: ManagedRuntime.buildDeps が R2b capability フィールドを注入 | ✓ | `managed-runtime-capabilities.test.ts:255–265` |
| DSM allowlist エントリが `runtime-strategy.ts` の type-only import cycle を文書化 | ✓ | `arch-allowlist.ts:300–313` |
| `step-completion.ts` が `deps.stepIo?.verifyFindingRefs` を使用（`deps.runtimeStrategy` なし） | ✓ | `step-completion.ts:243`, `256`, `274` |
| `commit-orchestrator.ts` が `deps.stepArtifact?.digestArtifacts` / `deps.revisionContent` を使用 | ✓ | `commit-orchestrator.ts:344`, `365` |
| `no-op-detect.ts` が `ChangedFilesCapability` を直接受け取る | ✓ | `no-op-detect.ts:36` |
| architecture doc が R2b 後の責務・依存方向に一致 | ✓ | `components.md:170–183` |
| 検証: build / typecheck / test / lint すべて pass | ✓ | `verification-result.md` — iter 1 |

---

## 検証できなかった項目

| 項目 | 理由 |
|---|---|
| TC-042: `architecture/components.md` の手動レビュー（manual TC） | manual TC のため自動検証不可。内容は `components.md:170–183` で目視確認済み（R2a/R2b セクション・PipelineDeps 説明更新済み） |
| TC-038 の「exactly 4」アサーション有無 | 自動テストが exact count を assert しているか不明。verification pass のため問題なし（F-01 参照） |
