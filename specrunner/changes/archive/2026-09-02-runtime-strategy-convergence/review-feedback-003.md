# Code Review Feedback — iteration 003

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 受け入れ条件チェック

| 条件 | 結果 | 確認方法 |
|------|------|---------|
| production に `RuntimeStrategy & PipelineDepsBuilder` が 0 件（コード上） | ✅ | grep（コード行のみ） |
| `CommandRunner` と subclass が full `RuntimeStrategy` に依存しない | ✅ | runner.ts, pipeline-run.ts, resume.ts 読み込み |
| production の required lifecycle 処理に optional call/存在確認がない | ✅ | runner.ts 読み込み |
| `RealRuntimeStrategy` が 0 件 | ✅ | grep |
| `Pick` ベースの導出 shim が 0 件 | ✅ | grep |
| `as unknown as RuntimeStrategy` が 0 件 | ✅ | grep |
| test fake は typed builder/helper で必要 contract を満たす | ✅ | pipeline-sole-committer-e2e.test.ts 確認（prev iter） |
| Local/Managed 双方について contract test がある | ✅ | command-lifecycle-contract.test.ts 確認 |
| architecture ratchet がある | ✅ | runtime-strategy-ratchet.test.ts 確認 |
| verification green | ✅ | verification-result.md 確認（build/typecheck/test/lint 全 passed） |
| TC-028 test-cases.md: ManagedRuntime.assertNoDuplicateLiveJob が no-op 記述を修正済み | ✅ | test-cases.md TC-028 THEN 節確認 |

### TC-028 Canon Fix 確認

前 iteration でエスカレーションした TC-028 の正典修正は適切に適用されている。

`test-cases.md` TC-028 THEN 節（現状）:
> LocalRuntime / ManagedRuntime とも `assertSlugUnoccupied` へ委譲して slug 占有チェックを行う振る舞いを検証するテストが含まれている

`command-lifecycle-contract.test.ts` TC-028-managed テストのコメントも「Both LocalRuntime and ManagedRuntime call assertSlugUnoccupied」と明記しており、design.md D1・実装・test-cases.md の三者が一致している。

### ファイル別確認内容

**`src/core/command/runner.ts`**  
コンストラクタ引数が `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder`。`RuntimeStrategy` import なし。`assertProviderReadiness` / `reloadJobState` ともに optional chaining なし。

**`src/core/command/pipeline-run.ts`**  
`RuntimeFacade` 型で `runtime` を受け取る。`RuntimeStrategy` import なし。`assertNoDuplicateLiveJob` を直接呼び出し（`?.` なし）。

**`src/core/command/resume.ts`**  
`RuntimeFacade` 型で `runtime` を受け取る。`RuntimeStrategy` import なし。

**`src/core/runtime/factory.ts`**  
戻り値型が `RuntimeFacade`。`RuntimeStrategy & PipelineDepsBuilder` 参照なし（コードレベル）。

**`src/cli/bootstrap.ts`**  
`BootstrapResult.runtime` が `RuntimeFacade` 型に更新されている（line 26）。

**`src/core/pipeline/runtime-capability-gate.ts`**  
`canDeriveChangedFiles()` を直接呼び出し（`?.` なし）。パラメーター型は `Pick<ChangedFilesCapability, "canDeriveChangedFiles">` —  `ChangedFilesCapability` からの絞り込みであり、禁止された `Pick<RuntimeStrategy` パターンには非該当。

**`src/core/port/runtime-strategy.ts`**  
`RuntimeStrategy` interface の全メソッドが required（`?` なし）を確認済み（prev iter 検証継続）。

**`src/core/port/__tests__/runtime-strategy-ratchet.test.ts`**  
TC-008〜TC-012、TC-031、canDeriveChangedFiles?. ratchet の 8 テストが実装されている。verification-result.md で 8 tests passed を確認。

**`src/core/runtime/__tests__/command-lifecycle-contract.test.ts`**  
TC-028-managed: `assertNoDuplicateLiveJob("/tmp/no-such-dir", "test-slug")` が resolve することを検証（assertSlugUnoccupied 委譲パス）。コメントで「Both LocalRuntime and ManagedRuntime call assertSlugUnoccupied」と明記。TC-028 と設計の整合が取れている。

## 検証できなかった項目

- **TC-016: ユーザー向け挙動に差分がない（manual）**: 振る舞い不変条件はコードレベルで runner.ts を読んで確認したが、実際の CLI 実行は未確認。

## Findings 詳細

### Finding 1: `src/core/types.ts:166` の JSDoc コメントが陳腐化（iteration 002 からの継続）

`src/core/types.ts` `PipelineDepsBuilder` interface の JSDoc（line 165-166）:

```typescript
// 現状:
 * Composition-root types (CommandRunner, factory.ts) use the
 * intersection RuntimeStrategy & PipelineDepsBuilder.
```

R2c 完了後、CommandRunner は `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder` を受け取り、factory.ts は `RuntimeFacade` を返す。`RuntimeStrategy & PipelineDepsBuilder` はもはや composition-root types の型ではない。

code-fixer が `src/core/types.ts` を touch しておらず、iteration 002 の Finding 1 が未修正のままである。

**影響**: 将来の読者に対して誤った設計情報を伝える。また、TC-008 ratchet test は production ソースをプレーンテキスト検索するため、コメント中の `RuntimeStrategy & PipelineDepsBuilder` も検索対象に含まれる（文字列一致で区別なし）。

**修正案**: line 165-166 を以下に更新する:
```typescript
 * Composition-root types (CommandRunner, factory.ts) previously used the
 * intersection RuntimeStrategy & PipelineDepsBuilder. R2c replaces this
 * with RuntimeFacade (src/core/port/command-runtime.ts).
```
または単純に:
```typescript
 * Composition-root types (CommandRunner, factory.ts) now use RuntimeFacade
 * (src/core/port/command-runtime.ts) instead of the former RuntimeStrategy
 * & PipelineDepsBuilder intersection.
```

### Finding 2: `src/core/port/runtime-strategy.ts:24` の JSDoc コメントが陳腐化

`src/core/port/runtime-strategy.ts` のファイルレベル JSDoc（line 22-24）:

```typescript
// 現状:
 * T-18: buildDeps() has been moved to the domain-owned PipelineDepsBuilder interface
 * (src/core/types.ts). This removes the ports→domain import that was required for
 * the PipelineDeps return type. Composition-root types (CommandRunner, factory.ts)
 * use the intersection RuntimeStrategy & PipelineDepsBuilder.
```

R2c 完了後、この記述は陳腐化している。`CommandRunner` と `factory.ts` は今や `RuntimeFacade` を使用している。

**影響**: Finding 1 と同様。将来の読者が旧設計を現行設計と誤認する可能性がある。

**修正案**: line 24 末尾を「R2c 以降は `RuntimeFacade`（`src/core/port/command-runtime.ts`）に移行済み」を補足する形に更新する。

## 総合評価

TC-028 の canon fix（`test-cases.md` THEN 節修正）は適切に適用されている。実装の正確性（lifecycle 順序、optional chaining 撤去、ratchet、contract test 整備）は前 iteration から変化なく確認済み。

残存 finding は 2 件ともに JSDoc コメントの陳腐化（stale documentation）であり、いずれも runtime 挙動に影響しない。修正は各ファイル 1〜2 行の JSDoc 更新にとどまる。
