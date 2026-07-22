# Regression Gate Result — bootstrap-commit-egress-ledger — iter 3

## Ledger Item Verification

### F-001 (LOW): R2 テストのコメントが誤りで台帳永続化失敗の destruction coverage が不完全
**File**: `tests/unit/core/runtime/bootstrap-egress-ledger-wm.test.ts`

### F-002 (LOW): git commit と updateJobState(appendSynthesizedCommit) 間の原子性ギャップ（クラッシュウィンドウ）
**File**: `src/core/runtime/workspace-materializer.ts:226`

---

## 調査方法

1. `git diff main...HEAD --stat` で変更ファイルを確認
2. `tests/unit/core/runtime/bootstrap-egress-ledger-wm.test.ts` の R2 describe ブロックを精読
3. `src/core/runtime/workspace-materializer.ts` の new-run アームを精読
4. `events.jsonl` で code-fixer の対応履歴を確認（F-002 の扱い）

---

## F-001 確認：R2 テストのモック修正

### 修正の存否

`tests/unit/core/runtime/bootstrap-egress-ledger-wm.test.ts` の
`describe("R2: updateJobState (ledger persistence) failure aborts bootstrap")` ブロック内:

```typescript
// updateJobState call order in new-run arm:
//   1. worktreePath recording (line 176)
//   2. request.path update   (line 208)
//   3. appendSynthesizedCommit — ledger append (lines 238-242) ← fail this one
//   4. branch recording      (lines 248-252, only reached if 3 passes)
// Using ordered one-time values so calls 1-2 succeed and call 3 rejects.
updateJobState: vi.fn()
  .mockResolvedValueOnce(undefined)   // call 1: worktreePath
  .mockResolvedValueOnce(undefined)   // call 2: request.path
  .mockRejectedValueOnce(new Error("ledger persistence failed")), // call 3: ledger append
```

iteration 002 で指摘されていた誤り（全呼び出し一律 reject）は解消されている：
- 呼び出し 1（worktreePath）・呼び出し 2（request.path）は `mockResolvedValueOnce` で成功
- 呼び出し 3（`appendSynthesizedCommit` — 台帳追記）のみ `mockRejectedValueOnce` で失敗
- コメントも正しく呼び出し順を記述している

`appendSynthesizedCommit` の呼び出しのみを `.catch(() => {})` で囲む改変を行うと
テストは reject を受け取れなくなり fail → destruction coverage として機能する。

**✅ F-001 修正は現在のコードに存在する。退行なし。**

---

## F-002 確認：原子性ギャップ（クラッシュウィンドウ）

### code-fixer の対応履歴（events.jsonl より）

iteration 2 の regression-gate が F-002（atomicity gap）を LOW/fixable として報告した後、
code-fixer は以下の判断を返した（events.jsonl, line 124）：

```json
{
  "reason": "All findings are LOW severity. Per instructions, LOW findings are ignored. No changes required.",
  "status": "success"
}
```

F-002 に対応するコード変更は一切適用されていない。

### 現在の実装状態

`workspace-materializer.ts` lines 238–242:
```typescript
await this.host.updateJobState(
  jobId,
  (s) => appendSynthesizedCommit(s, bootstrapOid),
  slugOpts,
);
```

`local.ts` lines 424–428、`managed.ts` lines 254–257 も同様。
`src/core/resume/`・`src/core/lifecycle/exit-guard.ts` は本 branch で無変更。

修正方針として提示された 2 案（resume 経路での git log 走査補完 / updateJobState 失敗時の terminated 遷移）はいずれも未実装のまま。

### 退行判断

F-002 は code-fixer が意図的にスキップ（LOW severity = 対応不要）したものであり、
修正が適用されたことは一度もない。「適用済み修正が消えた」状態ではないため
退行（regression）には該当しない。

---

## Evidence Summary

- **checked**: 2（F-001 の修正存否確認、F-002 の実装状態と events 履歴確認）
- **skipped**: 0
- **unverified**: 0

F-001 の修正は現在のコードに存在し退行なし。F-002 はcode-fixer が LOW 判定でスキップした未修正項目であり退行に非ず。
