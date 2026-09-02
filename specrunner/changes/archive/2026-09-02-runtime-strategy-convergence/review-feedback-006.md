# Code Review Feedback — iteration 006

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 1. 受け入れ条件の確認

**production に `RuntimeStrategy & PipelineDepsBuilder` が0件**
- `src/` 配下を grep: 0件。TC-008 ratchet が runtime-strategy-ratchet.test.ts にあり、CI で継続防衛。✅

**`CommandRunner` とsubclassがfull `RuntimeStrategy` に依存しない**
- `runner.ts:91`: `runtime: ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder`
- `pipeline-run.ts:68`: `RuntimeFacade` を受け取り
- `resume.ts:121`: `RuntimeFacade` を受け取り
- `RuntimeStrategy` の import が runner.ts / pipeline-run.ts / resume.ts に存在しない。✅

**productionのrequired lifecycle処理にoptional call/存在確認がない**
- runner.ts: `this.runtime.assertProviderReadiness(...)` — 直接呼び出し（`if (this.runtime.assertProviderReadiness)` ガード撤去済）
- runner.ts: `this.runtime.reloadJobState(...)` — 直接呼び出し（`if (this.runtime.reloadJobState &&...)` ガード撤去済）
- pipeline-run.ts: `this.pipelineRuntime.assertNoDuplicateLiveJob(...)` — 直接呼び出し（`?.` 撤去済）
- scope-check.ts: `deps.changedFiles.canDeriveChangedFiles()` — `if (!deps.changedFiles)` ガードの後、直接呼び出し ✅

**`RealRuntimeStrategy` が0件**
- `src/` 配下、`tests/` 配下 両方を grep: 0件。TC-009 / TC-031 ratchet が防衛。✅

**`Pick` ベースの導出shimが0件**
- `deriveCommitInspectionCapability`, `deriveRevisionContentCapability`: 0件。TC-010 ratchet が防衛。✅
- `Pick<RuntimeStrategy`: production ソースに0件。TC-011 ratchet が防衛。✅

**`as unknown as RuntimeStrategy` が0件（tests/）**
- `tests/` + `src/__tests__/` を grep: 直接形式 0件。TC-012 ratchet が防衛。✅
- **但し**: `tests/unit/step/unpushable-path-contract.test.ts:403` に修飾 import 形式の cast が存在する（詳細は Findings 詳細を参照）。

**Local/Managed contract test**
- `src/core/runtime/__tests__/command-lifecycle-contract.test.ts` を読了。
- TC-027〜TC-030 (assertProviderReadiness / assertNoDuplicateLiveJob / reloadJobState / canDeriveChangedFiles) が Local / Managed 双方について実装されている。✅

**Architecture ratchet**
- `src/core/port/__tests__/runtime-strategy-ratchet.test.ts` を読了。
- TC-008〜TC-012、TC-031〜TC-032 (計 11 describe) が定義されている。✅

**RuntimeFacade の構造的充足**
- `runtime-facade.ts`: `ProviderReadinessCapability & JobBootstrapCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder & ChangedFilesCapability` の intersection。
- LocalRuntime / ManagedRuntime が構造的に満たすことを TC-013 / TC-014 がコンパイル時 assertion で検証。✅

**RuntimeStrategy interface — optional メソッドの撤去**
- `runtime-strategy.ts:300-672` の `RuntimeStrategy` interface 全メソッドを確認。
- メソッド定義行に `?` 付きの optional が 0件（`?` は DTO パラメータや optional フィールドのみ）。TC-022 充足。✅

**Verification 結果**
- build / typecheck / test / lint / changed-line-coverage すべて passed。
- 834 test files、12621 tests 全 pass（1 skipped, 2 todo）。✅

### 2. 読んだファイル

- `src/core/port/command-runtime.ts` — 4 capability interface 定義
- `src/core/port/runtime-strategy.ts` — RuntimeStrategy interface (optional 撤去後)
- `src/core/runtime-facade.ts` — RuntimeFacade type alias
- `src/core/command/runner.ts` — CommandRunner, execute()
- `src/core/command/pipeline-run.ts` — PipelineRunCommand
- `src/core/command/resume.ts` — ResumeCommand
- `src/core/runtime/factory.ts` — createRuntime() 戻り値型
- `src/cli/bootstrap.ts` — BootstrapResult.runtime 型
- `src/core/pipeline/runtime-capability-gate.ts` — assertRuntimeSupportsScope
- `src/core/step/scope-check.ts` — canDeriveChangedFiles 直接呼び出し
- `src/core/step/executor.ts` — changedFiles 利用パターン
- `src/core/port/__tests__/runtime-strategy-ratchet.test.ts` — ratchet test 全件
- `src/core/runtime/__tests__/command-lifecycle-contract.test.ts` — contract test 全件
- `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts` — double optional chaining 確認
- `tests/unit/step/unpushable-path-contract.test.ts` — qualified import cast 確認
- `tests/unit/step/executor-input-validation.test.ts` — step fake パターン確認
- `tests/attach/attach-resume-e2e.test.ts` — attach fake パターン確認
- `specrunner/changes/runtime-strategy-convergence/design.md`
- `specrunner/changes/runtime-strategy-convergence/test-cases.md`
- `specrunner/changes/runtime-strategy-convergence/verification-result.md`

---

## 検証できなかった項目

- **TC-016 (ユーザー向け挙動に差分がない)**: manual テストのため検証不可。振る舞い不変条件はコードレビューで確認済みだが runtime 実行は行っていない。

---

## Findings 詳細

### F-1: `as unknown as import("...").RuntimeStrategy` が TC-012 ratchet の検索対象外

**ファイル**: `tests/unit/step/unpushable-path-contract.test.ts:403`
**コード**:
```typescript
const strategy = makePipelineDeps({ pushCapability: declaringCapability }).stepIo! as unknown as import("../../../src/core/port/runtime-strategy.js").RuntimeStrategy;
vi.spyOn(strategy, "validateStepOutputs").mockResolvedValue({ violations: [] });

const deps = makePipelineDeps({
  pushCapability: declaringCapability,
  stepIo: strategy as never,
});
```

TC-012 ratchet は `as unknown as RuntimeStrategy` というリテラル文字列を検索する。このコードは修飾 import 形式 `as unknown as import("...").RuntimeStrategy` を使っており、ratchet の検索にヒットしない。

さらに `strategy as never` で capability slot へ再キャストしており、これは design D6 が除去を求めた `as never` パターンそのものである。

ratchet は文字列一致のため、この形式を見逃す。文字列パターンを `as unknown as` + 末尾 `RuntimeStrategy` を分割して OR 検索するか、または `as unknown as import` を追加することで防衛できる。

**severity**: medium — 受け入れ条件「`as unknown as RuntimeStrategy` が0件」の実質的な違反（形式が異なるが意味は同じ）かつ ratchet gap。ただし step-layer テストに閉じており production コードへの影響はない。

---

### F-2: `tests/unit/step/` および `tests/attach/` でのモノリシック fake パターン継続

**ファイル**:
- `tests/unit/step/unpushable-path-contract.test.ts:203`
- `tests/unit/step/executor-input-validation.test.ts:88`
- `tests/unit/step/executor-lifecycle-ordering.test.ts:340`
- `tests/attach/attach-resume-e2e.test.ts:154`
- `tests/unit/core/step/executor-cli-entry-oid.test.ts:83`
- `tests/unit/core/step/verification-phase-outcome-executor.test.ts:87`

これらのファイルで `makeRuntimeStrategy(...): RuntimeStrategy & PipelineDepsBuilder` 形式のモノリシック fake builder が継続使用されている。TC-032 ratchet は `tests/unit/core/command/`・`tests/core/`・`tests/unit/core/runtime/` のみを対象とし、step-layer テストは対象外。

R2c のスコープは Command 層であり、step-level テストへの対応は R3 以降の作業として意図的に除外されている可能性が高い。但し、ratchet のカバレッジに空白があることで、将来 step-layer テストがモノリシック fake を再拡大するリスクが残る。

**severity**: low — R2c スコープ外の step-layer テストに限定。production コードの健全性には影響しない。

---

### F-3: `managed-runtime-capabilities.test.ts:290` でのダブル optional chaining

**ファイル**: `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts:290`
**コード**:
```typescript
expect(deps.changedFiles?.canDeriveChangedFiles?.()).toBe(false);
```

`canDeriveChangedFiles` は `ChangedFilesCapability` 上で required（D5 で `?` 除去済）。`deps.changedFiles` は `PipelineDeps` 上で optional なので外側の `?.` は正当だが、`canDeriveChangedFiles?.()` の `?.` は不要であり、メソッドが再び optional かのような誤解を招く。

ratchet はこのファイルを対象外（production source のみ）とするため CI で検出されない。テスト品質上の小さな誤りであり、正確には `deps.changedFiles?.canDeriveChangedFiles()` であるべき。

**severity**: low — コスメティックな問題。テスト動作は正しく、production への影響なし。

---

### F-4: TC-018 の記述と実際の RuntimeFacade の差異

**ファイル**: `specrunner/changes/runtime-strategy-convergence/test-cases.md:212`

TC-018 は RuntimeFacade が「`ProviderReadinessCapability & JobBootstrapCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder` の intersection」と記述するが、実際の `runtime-facade.ts` は `ChangedFilesCapability` も含む 6 capability の intersection である。`ChangedFilesCapability` の追加は `assertRuntimeSupportsScope` への `this.pipelineRuntime` 渡しに必要であり設計上正しいが、test-case ドキュメントに記載がない。

**severity**: low — ドキュメントギャップ。実装・動作・型チェックに影響なし。
