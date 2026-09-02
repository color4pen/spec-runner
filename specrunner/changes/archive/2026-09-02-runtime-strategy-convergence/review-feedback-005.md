# Review Feedback 005 — RuntimeStrategy whole-port 依存撤去 (R2c)

**Iteration**: 5
**Reviewer**: code-review (iteration 5)
**Scope**: implementation files changed in refactor/runtime-strategy-convergence-b0074b66

---

## Overall Assessment

Core objective は達成されている。production src から `RuntimeStrategy & PipelineDepsBuilder` が 0 件になり、`CommandRunner` は narrow capability intersection を受け取るよう更新された。`RuntimeStrategy` の optional メソッドはすべて required に変換され、`RealRuntimeStrategy`・Pick-based shim・`as unknown as RuntimeStrategy` も撤去された。Architecture ratchet・contract test も追加されており、主要な受け入れ条件は満たされている。

ただし、以下の 4 件の問題が残存する。

---

## Findings

### Finding 1 [Medium] — TestCommand in runner runtime tests still uses RuntimeStrategy & PipelineDepsBuilder

**File**: `tests/unit/core/runtime/runner-reload-egress-e2e.test.ts` (line 294–297)  
**File**: `tests/unit/core/runtime/runner-reload-after-setup.test.ts` (line 189, 195)

`CommandRunner` のコンストラクタ型は `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder` に変更されたが、これらのファイルにある `TestCommand extends CommandRunner` は:

```ts
class TestCommand extends CommandRunner {
  constructor(
    runtime: RuntimeStrategy & PipelineDepsBuilder,  // ← 旧 whole-port 型のまま
    ...
  ) {
    super(runtime, new EventBus());
  }
}
```

というように旧型を受け付け続けている。`super()` 呼び出しは structurally compatible なので TypeScript はエラーを出さないが、`TestCommand` のパブリック API が旧 whole-port 型を露出させており、acceptance criterion「test fake はtyped builder/helperで必要contractを満たす」に反する。

**Fix**: `TestCommand` コンストラクタの型を `RuntimeFacade` または `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder` に変更し、fake オブジェクトの `as RuntimeStrategy & PipelineDepsBuilder` キャストを除去する。

---

### Finding 2 [Medium] — Ratchet gap: tests/unit/core/runtime/ is not covered by TC-032

**File**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts` (line 229–230)

TC-032 ratchet の対象ディレクトリは:
```ts
const commandTestDir = path.join(TESTS_DIR, "unit", "core", "command");
```
であり、`tests/unit/core/runtime/` は対象外となっている。Finding 1 に該当する2ファイルが ratchet に保護されていないため、今後の regression 検出が困難になる。

acceptance criterion「full-port 依存と fake 都合 optional の再導入を防ぐ architecture ratchet がある」の主旨に照らすと、CommandRunner を subclass するテスト用クラスが含まれる `tests/unit/core/runtime/` も同様に保護すべきである。

**Fix**: TC-032 の対象に `tests/unit/core/runtime/` ディレクトリ（または少なくとも runner-reload-egress-e2e.test.ts と runner-reload-after-setup.test.ts）を追加する。

---

### Finding 3 [Low] — assertRuntimeSupportsScope parameter uses Pick<ChangedFilesCapability, ...>

**File**: `src/core/pipeline/runtime-capability-gate.ts` (line 71)

```ts
export function assertRuntimeSupportsScope(
  descriptor: PipelineDescriptor,
  runtime: Pick<ChangedFilesCapability, "canDeriveChangedFiles">,  // ← Pick 使用
): void {
```

`ChangedFilesCapability` には `canDeriveChangedFiles` と `listChangedFiles` の 2 メソッドしかなく、`Pick<ChangedFilesCapability, "canDeriveChangedFiles">` は `ChangedFilesCapability` 全体を受け取っても型的に問題ない（consumer は `canDeriveChangedFiles` しか使わない）。TC-011 ratchet は `Pick<RuntimeStrategy` を guard するため、この `Pick<ChangedFilesCapability>` は検出されない。

これは `Pick` で切り出さないという設計方針（`命名やファイル分割は実装判断とするが、Pick で切り出さないこと`）と不一致であり、将来のコード読者に誤解を与える可能性がある。

**Fix**: `runtime: Pick<ChangedFilesCapability, "canDeriveChangedFiles">` を `runtime: ChangedFilesCapability` または `runtime: { canDeriveChangedFiles(): boolean }` に変更する。

---

### Finding 4 [Low] — resolve-scope.test.ts uses Pick<RuntimeStrategy, "canDeriveChangedFiles"> in test helpers

**File**: `tests/unit/core/pipeline/resolve-scope.test.ts` (lines 310, 314)

```ts
function makeIncapableRuntime(): Pick<RuntimeStrategy, "canDeriveChangedFiles"> {
  return { canDeriveChangedFiles: () => false };
}

function makeCapableRuntime(): Pick<RuntimeStrategy, "canDeriveChangedFiles"> {
  return { canDeriveChangedFiles: () => true };
}
```

TC-011 ratchet は production src のみを対象とするため、test ファイル内のこの `Pick<RuntimeStrategy, ...>` は検出されない。Test helper は `ChangedFilesCapability` または `{ canDeriveChangedFiles(): boolean }` 型を返すべきである（`RuntimeStrategy` への残存依存を避けるため）。

**Fix**: 戻り値型を `{ canDeriveChangedFiles(): boolean }` または `ChangedFilesCapability` に変更する。

---

## 検証した項目

| # | Criterion | Status |
|---|-----------|--------|
| 1 | production に `RuntimeStrategy & PipelineDepsBuilder` が 0 件 | ✅ |
| 2 | `CommandRunner` と subclass が full `RuntimeStrategy` に依存しない | ✅ |
| 3 | production の required lifecycle 処理に optional call/存在確認がない | ✅ |
| 4 | `RealRuntimeStrategy` が 0 件 | ✅ |
| 5 | `Pick` ベースの導出 shim が 0 件（src/ 全体） | ✅ |
| 6 | `as unknown as RuntimeStrategy` が 0 件（tests 含む） | ✅ |
| 7 | test fake は typed builder/helper で必要 contract を満たす | ⚠️ F1 参照 |
| 8 | Local/Managed 双方について command lifecycle の contract test がある | ✅ |
| 9 | full-port 依存と fake 都合 optional の再導入を防ぐ architecture ratchet がある | ⚠️ F2 参照 |
| 10 | SpecRunner 上の既存 verification が green | ✅ |
| 11 | ユーザー向け挙動・出力・終了コードに差分がない | ✅ |

---

## 検証できなかった項目

| # | Item | Reason |
|---|------|--------|
| - | ユーザー向け挙動の実機確認 | TC-016 (manual) — ローカル実行環境が利用できないため目視確認不可。verification-result.md の全テスト green 通過をもって代替とする。 |

---

## Summary

- **Critical**: 0 件
- **Medium**: 2 件（F1: TestCommand old type in runtime tests、F2: Ratchet gap for tests/unit/core/runtime/）
- **Low**: 2 件（F3: Pick<ChangedFilesCapability in gate、F4: Pick<RuntimeStrategy in test helpers）

F1・F2 は関連しており、一括修正可能。F3・F4 は独立した小規模修正。
