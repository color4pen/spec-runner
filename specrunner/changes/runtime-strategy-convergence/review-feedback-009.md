# Code Review Feedback — Iteration 009

**Branch**: refactor/runtime-strategy-convergence  
**Scope**: R2c — RuntimeStrategy whole-port 依存と移行 shim の撤去

---

## Summary

実装の品質は全体的に高い。主要なリファクタリング目標（whole-port 依存の撤去、optional メソッドの required 化、shim の削除、double cast の置換）はすべて達成されている。ただし、ratchet に 1 件のカバレッジギャップが確認されたため報告する。

---

## Findings

### F-1 [medium] Ratchet が `as any as RuntimeStrategy` を検出しない

**File**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts`  
**Reference**: TC-012 / TC-032

**問題**:  
`tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts`（本 PR では未変更）が `as any as RuntimeStrategy`（行 191）を使用している。
TC-012 の ratchet は `"as unknown as RuntimeStrategy"` のリテラル文字列のみを検索しており、`"as any as RuntimeStrategy"` を検出しない。`as any` は `as unknown` と同等の型安全バイパスだが、ratchet が素通りするため、将来の regression vector となる。

加えて TC-032（command テストの `RuntimeStrategy & PipelineDepsBuilder` 再導入防止）は `tests/unit/pipeline/` ディレクトリをカバーしていない。この未カバー領域にも `RuntimeStrategy` 型の full fake（`makeRuntimeStrategyMock`）が残存している。

```
tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts:37
  import type { RuntimeStrategy } from "../../../src/core/port/runtime-strategy.js";

tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts:191
  } as any as RuntimeStrategy;
```

**影響**:  
`as any as RuntimeStrategy` 形式の double cast は ratchet を素通りするため、R2c で排除したはずのパターンが同ファイル内で検出されない。

**修正案**:
1. TC-012 に `"as any as RuntimeStrategy"` の検索を追加する  
2. TC-032 に `tests/unit/pipeline/` を対象とする subtestを追加する  
3. `pipeline-sole-committer-round-guard.test.ts` の fake を typed capability object で置き換える（acceptance 条件: "test fakeはtyped builder/helperで必要contractを満たす"）

---

### F-2 [low] `command-runtime.ts` のコメントが実際の定義場所と乖離している

**File**: `src/core/port/command-runtime.ts` (line 15–17)

**問題**:  
コメントに "RuntimeFacade ... is defined in `src/core/runtime/factory.ts`" と記載されているが、実際の一次定義は `src/core/runtime-facade.ts` にある。`factory.ts` は `export type { RuntimeFacade }` で再エクスポートしているに過ぎない。この記述は将来の読者を誤った場所に誘導する。

**修正案**:  
コメントを以下のように修正する:
```
 * RuntimeFacade (the full composition-root aggregate that includes PipelineDepsBuilder
 * and ChangedFilesCapability) is defined in src/core/runtime-facade.ts to avoid a
 * ports→domain import edge (command-runtime.ts cannot import from ../types.js).
 * Consumers import RuntimeFacade from runtime-facade.ts, factory.ts, or runtime/index.ts.
```

---

## 検証した項目

| 条件 | 結果 |
|------|------|
| `RuntimeStrategy & PipelineDepsBuilder` が production に 0 件 | ✅ |
| `CommandRunner` とサブクラスが full `RuntimeStrategy` に依存しない | ✅ |
| production の required lifecycle 処理に optional call/存在確認がない | ✅ |
| `RealRuntimeStrategy` が 0 件 | ✅ |
| `Pick` ベースの導出 shim が 0 件 | ✅ |
| `as unknown as RuntimeStrategy` が 0 件 | ✅ |
| test fake は typed builder/helper で必要 contract を満たす | ⚠️ `pipeline-sole-committer-round-guard.test.ts` が未対応 |
| Local/Managed 双方の command lifecycle contract test が存在する | ✅ |
| full-port 依存と fake 都合 optional の再導入を防ぐ architecture ratchet がある | ⚠️ `as any as RuntimeStrategy` と `tests/unit/pipeline/` がギャップ |
| 振る舞い不変条件が維持される | ✅ (behavioral invariants are structurally preserved) |

- `src/core/port/command-runtime.ts`: 4 capability interface がすべて required メソッドのみで定義されていることを確認
- `src/core/runtime-facade.ts`: `RuntimeFacade` が 6 capability の intersection として正しく定義されていることを確認
- `src/core/command/runner.ts`: `CommandRunner` コンストラクタが `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder` を要求することを確認（`RuntimeStrategy` import なし）
- `src/core/command/pipeline-run.ts`: `PipelineRunCommand` が `RuntimeFacade` を受け取り、`assertNoDuplicateLiveJob` を直接呼ぶことを確認
- `src/core/command/resume.ts`: `ResumeCommand` が `RuntimeFacade` を受け取ることを確認（`RuntimeStrategy` import なし）
- `src/core/runtime/factory.ts`: `createRuntime()` が `RuntimeFacade` を返すことを確認
- `src/cli/bootstrap.ts`: `BootstrapResult.runtime` が `RuntimeFacade` 型であることを確認
- `src/core/port/runtime-strategy.ts`: `RuntimeStrategy` 全メソッドが required（`?` なし）であることを確認
- `src/core/pipeline/runtime-capability-gate.ts`: `canDeriveChangedFiles?.` が存在せず、直接呼び出されていることを確認
- `src/core/step/scope-check.ts`: `canDeriveChangedFiles()` が直接呼ばれていることを確認
- `src/core/runtime/__tests__/command-lifecycle-contract.test.ts`: Local/Managed 双方の contract test が存在し、TC-013/014/027/028/029/030 をカバーしていることを確認
- `src/core/port/__tests__/runtime-strategy-ratchet.test.ts`: TC-008〜TC-012・TC-031・TC-032 の ratchet が実装されていることを確認
- `tests/pipeline-sole-committer-e2e.test.ts`: `as unknown as RuntimeStrategy` と `as never` が除去され、typed capability object が使われていることを確認
- `src/core/runtime/managed.ts`: `reloadJobState` が required 実装（throw）であることを確認、`buildDeps()` が shim なしで直接 capability を構築していることを確認

---

## 検証できなかった項目

- **TC-016（ユーザー向け挙動に差分がない）**: manual 検証が必要。SpecRunner 上の既存 verification が green であることは verification-result.md から確認できるが、実際の CLI 出力・終了コードの差分は本レビューでは実行確認していない。
- **`tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts` の full fake 残存**: 本 PR の touched-files 外であるため変更の有無の確認のみ実施（未変更を確認）。typed capability object への置き換えが完了しているかは本 PR のスコープ外だが、F-1 として報告する。

---

## Observations (非問題)

- `CommandRunner.execute()` の実行順序（provider readiness → prepare → setupWorkspace → buildDeps → registerCleanup → pipeline → teardown）は仕様の振る舞い不変条件と一致している。
- `ManagedRuntime.reloadJobState` が managed 新規 run で throw する挙動は TC-029-managed によって明示されており、design の Risk 節とも整合している。
- `runtime-capability-gate.ts` の `Pick<ChangedFilesCapability, "canDeriveChangedFiles">` は production コードでの `Pick<RuntimeStrategy, ...>` 禁止に抵触しない（`RuntimeStrategy` を対象としていないため）。ratchet も `Pick<RuntimeStrategy` のみを禁止しており、このパターンは検出対象外で正しい。
- `executor.ts` 内の `deps.changedFiles?.canDeriveChangedFiles()` は `changedFiles` プロパティ自体が optional であることを示す `?.` であり、ratchet が禁止する `canDeriveChangedFiles?.()` とは異なる。production では `changedFiles` は常に注入されるため実害はない。
