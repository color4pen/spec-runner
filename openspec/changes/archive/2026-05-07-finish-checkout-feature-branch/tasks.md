# Tasks: finish Phase 0 で feature branch に checkout して validate を実行する

## T1: preflight.ts にヘルパー関数を追加

**File**: `src/core/finish/preflight.ts`

**Changes**:
1. `checkoutForValidation()` 関数を追加: 現在の branch を記録し、feature branch に checkout する
2. `restoreBranch()` 関数を追加: 元の branch に checkout で戻る

**Detailed steps**:

`checkoutForValidation`:
- `git rev-parse --abbrev-ref HEAD` で現在の branch 名を取得
- `git fetch origin <branch>` で最新を取得
- `git checkout <branch>` を試行。失敗した場合は `git checkout -b <branch> origin/<branch>` でローカル tracking branch を作成
- 成功時は `{ ok: true, originalBranch }` を返す
- 失敗時は `formatEscalation()` で escalation を返す

`restoreBranch`:
- `git checkout <originalBranch>` を実行
- 失敗時は `process.stderr.write` で warning 出力（escalation にはしない）

---

## T2: runPreflight の Check 5+6 を checkout で囲む

**File**: `src/core/finish/preflight.ts`

**Location**: Check 4 完了後 ~ Check 8 の前（Line 103-130 付近）

**Changes**:
1. Check 5 の前に `checkoutForValidation({ branch: target.branch, cwd, spawn })` を呼ぶ
2. Check 5+6 を try ブロック内に移動
3. finally ブロックで `restoreBranch()` を実行
4. Check 5/6 が失敗しても、restore 後に escalation を返す

**Expected structure**:
```typescript
// Checkout feature branch for validation (Check 5+6)
const checkoutResult = await checkoutForValidation({
  branch: target.branch, cwd, spawn,
});
if (!checkoutResult.ok) {
  return { ok: false, escalation: checkoutResult.escalation };
}

let validationError: PreflightResult | null = null;
try {
  // Check 5: openspec/changes/<slug>/ existence (既存コード)
  // Check 6: openspec validate (既存コード)
  // ↑ 失敗時は validationError に格納
} finally {
  await restoreBranch({ originalBranch: checkoutResult.originalBranch, cwd, spawn });
}
if (validationError) {
  return validationError;
}
```

---

## T3: PreflightInput に branch 情報が渡されることを確認

**File**: `src/core/finish/preflight.ts`, `src/core/finish/types.ts`

**Verification**:
- `PreflightInput.target` は `ResolvedTarget` 型で、`branch: string` フィールドを持つ（確認済み）
- `runPreflight` 内で `target.branch` にアクセス可能

**Changes**: なし（既存の型で対応可能）。ただし `target.branch` が空文字の場合のガード条件を追加:
```typescript
if (!target.branch) {
  return {
    ok: false,
    escalation: formatEscalation({
      failedStep: "Phase 0 (branch checkout for validation)",
      detectedState: "target.branch is empty",
      recommendedAction: "state.branch が未設定です。pipeline が正常に完走していない可能性があります。",
      resumeCommand: `specrunner finish ${target.slug}`,
    }),
  };
}
```

---

## T4: テスト修正

**File**: `tests/unit/core/finish/preflight.test.ts`

**Changes**:

1. 既存テストの spawn mock に git コマンドのレスポンスを追加:
   - `git rev-parse --abbrev-ref HEAD` → `{ exitCode: 0, stdout: "main" }`
   - `git fetch origin <branch>` → `{ exitCode: 0 }`
   - `git checkout <branch>` → `{ exitCode: 0 }`
   - `git checkout main` (restore) → `{ exitCode: 0 }`

2. 新規テストケース:
   - **TC-CHECKOUT-1**: checkout 成功 → validate 成功 → restore 成功 → `{ ok: true }`
   - **TC-CHECKOUT-2**: checkout 成功 → validate 失敗 → restore 実行 → escalation
   - **TC-CHECKOUT-3**: checkout 失敗 → escalation（validate 未実行、restore 不要）
   - **TC-CHECKOUT-4**: validate 成功 → restore 失敗 → warning 出力のみ、`{ ok: true }`

---

## T5: 型チェックとテスト実行

**Command**: `bun run typecheck && bun run test`

**Expected outcome**:
- 型エラーなし
- 全テスト green

**Verification checklist**:
- [ ] `bun run typecheck` が exit 0
- [ ] `bun test tests/unit/core/finish/preflight.test.ts` が green
- [ ] `bun test` 全体が green

---

## タスク依存関係

```
T1 (ヘルパー関数追加)
  ↓
T2 (runPreflight に checkout 統合) ← T3 (型確認) と並行可
  ↓
T4 (テスト修正)
  ↓
T5 (typecheck + test)
```

---

## 受け入れ基準の検証手順

### AC1: local mode で `specrunner finish` が Phase 0 check 6 を通過する

- T2 の実装により、Phase 0 で feature branch に checkout してから validate を実行する
- TC-CHECKOUT-1 で検証

### AC2: finish 完了後に元の branch に戻っている

- T2 の finally パターンにより、成功/失敗問わず restore が実行される
- TC-CHECKOUT-2 で失敗時の restore も検証

### AC3: `bun run typecheck && bun run test` が green

- T5 で検証

---

## 完了条件

- [x] T1: `checkoutForValidation` / `restoreBranch` ヘルパー追加
- [x] T2: `runPreflight` の Check 5+6 を checkout で囲む
- [x] T3: `target.branch` 空文字ガード追加
- [x] T4: テスト修正・追加
- [x] T5: `bun run typecheck && bun run test` が green
