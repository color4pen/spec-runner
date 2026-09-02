# Code Review Feedback — iteration 002

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 受け入れ条件チェック

| 条件 | 結果 | 確認方法 |
|------|------|---------|
| production に `RuntimeStrategy & PipelineDepsBuilder` が 0 件 | ⚠️ コメント残存あり | grep + 各ファイル読み込み |
| `CommandRunner` と subclass が full `RuntimeStrategy` に依存しない | ✅ | runner.ts, pipeline-run.ts, resume.ts 読み込み |
| production の required lifecycle 処理に optional call/存在確認がない | ✅ | runner.ts 読み込み |
| `RealRuntimeStrategy` が 0 件 | ✅ | grep |
| `Pick` ベースの導出 shim が 0 件 | ✅ | grep |
| `as unknown as RuntimeStrategy` が 0 件 | ✅ | grep (tests/ および src/__tests__/) |
| test fake は typed builder/helper で必要 contract を満たす | ✅ | pipeline-sole-committer-e2e.test.ts 読み込み |
| Local/Managed 双方について contract test がある | ✅ | command-lifecycle-contract.test.ts 読み込み |
| architecture ratchet がある | ✅ | runtime-strategy-ratchet.test.ts 読み込み |
| verification green | ✅ | verification-result.md 確認（build/typecheck/test/lint 全 passed） |

### ファイル別確認内容

**`src/core/port/command-runtime.ts`**  
4 つの named lifecycle capability interface（`ProviderReadinessCapability`、`JobBootstrapCapability`、`WorkspaceLifecycleCapability`、`JobStatePersistenceCapability`）がすべて required メソッドのみで定義されている（`?` なし）。`RuntimeFacade` が 4 capability + `PipelineDepsBuilder` + `ChangedFilesCapability` の intersection として定義されていることを確認。

**`src/core/command/runner.ts`**  
コンストラクタ引数が `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder` に更新されている。`RuntimeStrategy` の import が存在しない。`assertProviderReadiness` は条件なし直接呼び出し（`if` ガードなし）。`reloadJobState` は `if (this.runtime.reloadJobState && ...)` ガードなし（`existingWorktreePath` 条件のみ維持）。

**`src/core/command/pipeline-run.ts`**  
`RuntimeFacade` 型で `runtime` を受け取っている。`RuntimeStrategy` の import なし。`assertNoDuplicateLiveJob` を直接呼び出し（`?.` なし）。

**`src/core/command/resume.ts`**  
`RuntimeFacade` 型で `runtime` を受け取っている。`RuntimeStrategy` の import なし。

**`src/core/runtime/factory.ts`**  
戻り値型が `RuntimeFacade`。`RuntimeStrategy & PipelineDepsBuilder` 参照なし。

**`src/cli/bootstrap.ts`**  
`BootstrapResult.runtime` が `RuntimeFacade` 型に更新されている。

**`src/core/pipeline/runtime-capability-gate.ts`**  
`canDeriveChangedFiles()` を直接呼び出し（`?.` なし）。パラメーター型は `Pick<ChangedFilesCapability, "canDeriveChangedFiles">` — `Pick<RuntimeStrategy` ではなく `ChangedFilesCapability` から絞り込んでいるため、禁止された `Pick<RuntimeStrategy` パターンには該当しない。

**`src/core/port/runtime-strategy.ts`**  
`RuntimeStrategy` interface の全メソッドが required（`?` なし）。`canDeriveChangedFiles`、`assertNoDuplicateLiveJob`、`assertProviderReadiness`、`reloadJobState` すべて required として定義されていることを確認。

**`src/core/port/__tests__/runtime-strategy-ratchet.test.ts`**  
TC-008〜TC-012、TC-031、canDeriveChangedFiles?. ratchet の 8 テストが実装されている。`collectProductionFiles`（`__tests__/` を除外）と `collectTestFiles` の両方を用途別に使い分けている。verification-result.md で 8 tests passed を確認。

**`src/core/runtime/__tests__/command-lifecycle-contract.test.ts`**  
TC-013/014（LocalRuntime/ManagedRuntime が RuntimeFacade を構造的に満たすコンパイル時検証）、TC-027/028/029/030（lifecycle 差異の contract test）を確認。

**`tests/pipeline-sole-committer-e2e.test.ts`**  
`as unknown as RuntimeStrategy` および `as never` のキャストが除去されていることを grep で確認。`RoundGitEffectsCapability` と `StepIoValidationCapability` の typed オブジェクトとして直接構築されていることを確認。

**`src/core/types.ts`**  
`PipelineDepsBuilder` の JSDoc コメント（line 166）に陳腐化した記述を発見（Finding 詳細参照）。

## 検証できなかった項目

- **TC-016: ユーザー向け挙動に差分がない（manual）**: manual テストのため未実施。振る舞い不変条件（provider readiness → prepare の順序、duplicate guard → bootstrap の順序、reload のスキップ条件など）はコードレベルで runner.ts を読んで確認したが、実際の CLI 実行は未確認。

## Findings 詳細

### Finding 1: `src/core/types.ts` の JSDoc コメントが陳腐化

`src/core/types.ts` の `PipelineDepsBuilder` interface の JSDoc コメント（line 166）が R2c 実施後も更新されておらず、旧設計を記述している。

```
// 現状（line 166）:
 * Composition-root types (CommandRunner, factory.ts) use the
 * intersection RuntimeStrategy & PipelineDepsBuilder.
```

R2c 完了後、CommandRunner と factory.ts は `RuntimeFacade` を使用しており、`RuntimeStrategy & PipelineDepsBuilder` の intersection は使用していない。

**影響**:
1. 将来の読者に対して誤った設計情報を伝える
2. ratchet test TC-008 は `collectProductionFiles(SRC_DIR)` でこのファイルを含め、plain text search で `RuntimeStrategy & PipelineDepsBuilder` を検索する。このコメントはその文字列を含むため、論理上は TC-008 がこのファイルを検出するはずであるが、verification では passed（8/8 tests）となっている。ratchet test に false-negative が発生している可能性がある（コメント文字列のみの検出を避ける仕組みがないため）。

同様に `src/core/port/command-runtime.ts` の line 4 と line 129 にも `RuntimeStrategy & PipelineDepsBuilder` の言及があるが、こちらは「何を置き換えたか」の歴史的な説明コメントであり、types.ts とは性格が異なる。

**修正案**: `src/core/types.ts` line 163-166 のコメントを更新して、`RuntimeFacade` への移行を反映する。

### Finding 2: TC-028 の test-cases.md 記述が実装と不一致

`test-cases.md` の TC-028 THEN 節:
> ManagedRuntime は no-op を検証するテストが含まれている

しかし `src/core/runtime/managed.ts` の `assertNoDuplicateLiveJob` 実装は no-op ではなく、`assertSlugUnoccupied` を呼び出す（LocalRuntime と同じ guard を実行）。`design.md` D1 も「managed: assertNoDuplicateLiveJob also delegates to assertSlugUnoccupied (same guard as local)」と明記している。

`command-lifecycle-contract.test.ts` の TC-028-managed テストもコメントで「Both LocalRuntime and ManagedRuntime call assertSlugUnoccupied」と記述しており、no-op ではないことを認識している。

**影響**: test-cases.md と design.md・実装の間に矛盾があり、将来の読者が誤解する可能性がある。TC-028 テスト自体は正しく実装されており、コードの正確性には問題はない。

**修正案**: `test-cases.md` TC-028 の THEN 節を「ManagedRuntime も assertSlugUnoccupied を呼び出すことを検証するテストが含まれている（no-op ではなく、LocalRuntime と同一の guard を実行）」に更新する。
