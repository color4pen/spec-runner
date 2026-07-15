# Cross-Boundary Invariants Review — changed-files-derivation-fail-closed — iter 1

- **verdict**: approved

## Summary

変更が触れていないコードの暗黙の前提を、新しい挙動（`listChangedFiles` DU 化）が黙って破っていないかを検査した。以下の主要な不変条件をすべて確認し、いずれも保全されていることを確認した。

| 検査対象不変 | 結果 |
|---|---|
| B-11: `canDeriveChangedFiles()` が `RealRuntimeStrategy` 必須 | ✓ 無傷 |
| `canDeriveChangedFiles()===false` → scope-check / activation gate が `listChangedFiles` を呼ばない短絡 | ✓ 保全 |
| `evaluateActivation` の `changedFilesDerivable:false` 分岐 → paths reviewer を活性化 | ✓ 保全 |
| `synthesizeScopeUnverifiableFinding` が canDerive===false と unavailable の両経路で同一 finding を生成 | ✓ 保全 |
| resume 経路は capability gate を持たない → back（scope-check）が per-call 失敗を捕捉 | ✓ 正しく機能 |
| managed の round-invalidation 不発（Non-Goal）: unavailable → `[]` 写像で保全 | ✓ 保全 |
| no-op-detect: unavailable → `[]` → source 0 → needs-fix（安全側）が保全 | ✓ 保全 |
| `listChangedFiles` は throw しない | ✓ LocalRuntime=try-catch、ManagedRuntime=同期返却 |

## Findings

### F-01 — `parallel-review-round.ts` にステイルコメントが 2 箇所残存

**Severity**: LOW  
**File**: `src/core/pipeline/parallel-review-round.ts`  
**Lines**: 74, 104

tasks.md T-05 に「コメント（`:104` の managed fail-safe 説明）を DU 表現に更新する」と明記されていたが、更新が不完全。

**Line 74**（JSDoc `process()` メソッド説明）:
```
Managed runtime: listChangedFiles returns [] → invalidation not fired (fail-safe).
```

**Line 104**（インラインコメント）:
```
// Managed runtime: listChangedFiles returns [] → invalidation not fired (fail-safe).
```

どちらも managed が `[]` を返すという旧挙動を記述している。実際は managed は `{kind:"unavailable"}` を返し、line 126 の `result.kind === "success" ? result.files : []` で `[]` に写像される。行動的正しさは line 122–126 の新コメントと実装で担保されているが、line 74 / 104 は将来の読者に誤解を与えうる。

**修正**: 両行のコメントを「managed runtime returns `{kind:"unavailable"}` → mapped to `[]` → invalidation not fired (fail-safe)」に更新する。

---

### F-02 — `scope.ts:synthesizeScopeUnverifiableFinding` のユーザー向け rationale 文言がステイル

**Severity**: LOW  
**File**: `src/core/pipeline/scope.ts`  
**Line**: 176

`synthesizeScopeUnverifiableFinding` の rationale 文字列（人間が UNKNOWN finding を見たときに表示される）:

```ts
" listChangedFiles が [] を返すのは構造的な制約であり、変更なしを意味しない。";
```

この文はもともと「managed（構造的非導出）= canDerive===false」の場合のみを想定して書かれた。今回の変更後、本関数は以下の 2 経路から呼ばれる:

1. `canDeriveChangedFiles()===false`（managed）: この経路では `listChangedFiles` を**呼ばない**。「listChangedFiles が [] を返す」という記述は現状でも厳密には不正確（呼んでいないので返さない）。
2. `result.kind !== "success"`（per-call 導出失敗）: `listChangedFiles` は `{kind:"unavailable"}` を返す。`[]` を返すわけでも構造的制約でもなく、git diff の実行時失敗。ユーザーは Option A「local runtime で実行し直す」を見るが、per-call 失敗の場合はすでに local runtime で実行中であるため指示が的外れになる可能性がある。

**行動への影響**: finding の生成・escalation・decision-ledger の蒸し返し封殺はすべて正しく動く。severity=high, resolution=decision-needed, options≥2 は正確。**挙動上のリグレッションはない**。

**修正（optional）**: per-call 導出失敗時に rationale を分岐させるか、呼び出し元（scope-check.ts）で `reason` を `synthesizeScopeUnverifiableFinding` に渡して文言を動的化する。ただし現行 options（「local で再実行」「permissionScope を外す」）はどちらの経路でも有効な対処法であるため、LOW として処理可能。

---

## 検査した主要な境界

### 1. `canDeriveChangedFiles()===false` 短絡 vs per-call unavailable

`scope-check.ts:49-51` の canDerive===false 短絡は不変。その後 `result.kind !== "success"` の新分岐が追加された。両分岐とも同じ `synthesizeScopeUnverifiableFinding` を呼ぶ。相補関係が正しく実現されている。

### 2. `evaluateActivation` の `changedFilesDerivable` フラグ伝播

```ts
// executor.ts
let changedFilesDerivable = structurallyDerivable;
if (deps.runtimeStrategy && structurallyDerivable) {
  const result = await deps.runtimeStrategy.listChangedFiles(...);
  if (result.kind === "success") changedFiles = result.files;
  else changedFilesDerivable = false;  // unavailable → fail-closed
}
evaluateActivation(..., { changedFiles, changedFilesDerivable });
```

`activation.ts:83-85` の `changedFilesDerivable===false → activated:true` 分岐は変更なし。per-call unavailable が正しくこの分岐へ流れることを `executor-activation.test.ts:475-537` が固定している。

### 3. `parallel-review-round.ts` が `canDeriveChangedFiles()` を呼ばずに直接 `listChangedFiles` を呼ぶ

round-invalidation は managed でも `listChangedFiles` を呼ぶ（capability gate の短絡なし）。managed が `unavailable` を返し、それが `[]` に写像されることで invalidation 不発（Non-Goal）が保全される。行動は旧 `[]` 返却と同一。ただし F-01 のコメントが旧挙動を記述したまま。

### 4. `no-op-detect.ts` の `unavailable → []` 写像

LOCAL runtime で transient git 失敗が起きると `no-op-detect` は `unavailable → []` → source 0 → needs-fix と判定する可能性がある。これは「安全側」（escalate 方向）であり、旧コードでの `[]` fold（非ゼロ終了 → `[]` → needs-fix）と同じ方向。行動は保全されている。

### 5. `RealRuntimeStrategy` と B-11

`RealRuntimeStrategy` の交差型は `canDeriveChangedFiles(): boolean` を必須化（B-11）。`listChangedFiles` は base `RuntimeStrategy` の必須メソッドであり `RealRuntimeStrategy` が `&` で合成するため型でも保証される。`LocalRuntime` / `ManagedRuntime` ともに実装済み。typecheck green で確認。

### 6. resume 経路の back 依存

`ResumeCommand` は `assertRuntimeSupportsScope`（capability gate）を呼ばない。resume 経路で LOCAL runtime が per-call unavailable になっても、scope-check が UNKNOWN finding を合成して escalation となる。これは設計の意図どおり（dynamic-model.md:61 に明記済み）。
