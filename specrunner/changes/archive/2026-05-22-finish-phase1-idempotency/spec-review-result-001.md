# Spec Review Result: finish-phase1-idempotency

- **verdict**: needs-fix
- **reviewer**: spec-reviewer
- **date**: 2026-05-22

---

## Summary

Root cause diagnosis は正確で、修正方針（`archiveChangeFolder` の skip パターンに揃える）も正しい。Task 1〜3 は実装・テストとも問題なし。ただし **Task 4（TC-103 mock 修正）に記述がなく、TC-SM-070 が Task 1 適用後にサイレントにテスト対象を誤る** という gap がある。

---

## Findings

### ✅ 正しいところ

**根本原因の特定**
`spec-merge.ts:543-558` の `readFile` → `catch` → escalation が change folder 不在を区別しない実装バグ。`archiveChangeFolder.ts:35-43` の `fs.exists` パターンとの非対称が起点。コード確認済み。

**修正方針**
`mergeSpecsForChange` 先頭に `fs.exists(changeFolderAbsPath)` ガードを追加し、不在なら `{ ok: true, skipped: true }` を返す。最小変更。

**orchestrator 変更不要の判断**
`runPhase1Archive`（`orchestrator.ts:261-273`）は spec-merge → archive → commit 各ステップの `ok/skipped` を既にチェックしており、spec-merge が `skipped: true` を返せば archive（自前の不在チェックで skip）→ commit（staging empty で skip）と自然に連鎖する。追加修正が不要という判断は正しい。

**TC-SM-069（新規）・TC-SM-068（regression guard）**
`readFile` が呼ばれないことを `expect(fs.readFile).not.toHaveBeenCalled()` で担保する TC-SM-069 は適切。parse error が引き続き escalation になることを確認する TC-SM-068 も正しい。

**セキュリティ**
変更は pure なファイルシステム存在チェック追加。外部入力処理・認証・API 呼び出しに一切触れない。セキュリティ上の懸念なし。

---

### ❌ gap（needs-fix）

**TC-SM-070 の `exists` mock が Task 1 適用後にサイレント劣化する**

`tests/finish-spec-merge.test.ts:762-763` の TC-SM-070:
```typescript
const fs = makeFs({
  exists: vi.fn().mockResolvedValue(false),  // 全パスに false を返す
  readFile: vi.fn().mockImplementation((p: string) => {
    if (p.endsWith("request.md")) return Promise.resolve(requestMdContent);
    ...
  }),
});
```

Task 1 適用後、`mergeSpecsForChange` は最初に `fs.exists(changeFolderAbsPath)` を呼ぶ。mock は `false` を返すため、新しいガードが発火して即 `{ ok: true, skipped: true, message: "spec-merge skipped: change folder not found" }` を返す。

**影響**:
- TC-SM-070 のアサーション（`result.ok === true`, `result.skipped === true`, `spawn.calls.length === 0`）は全て **pass し続ける**（assertion failure なし）
- しかし `readFile` は一度も呼ばれなくなり、TC-SM-070 が本来テストしていた「change folder が存在するが `specs/` ディレクトリ不在 → skip」のコードパスがノーカバーになる
- tasks.md はこの修正を記述していない

**必要な追加修正**:
TC-SM-070 の `exists` mock を path で分岐させ、change folder は `true`、specs/ は `false` を返すようにする:

```typescript
exists: vi.fn().mockImplementation((p: string) => {
  if (p.endsWith("specs")) return Promise.resolve(false); // specs/ dir absent
  return Promise.resolve(true);                           // change folder present
}),
```

これにより TC-SM-070 は Task 1 のガードを通過し、引き続き `readFile(request.md)` → specs/ 不在 skip のパスを検証する。

---

## 必要な修正

tasks.md に以下のタスクを追加する（Task 2/3 の間、または Task 5 の前）:

> **Task N: TC-SM-070 の `exists` mock を path 分岐に更新**
>
> `tests/finish-spec-merge.test.ts` の TC-SM-070 `exists` mock を `mockResolvedValue(false)` から path 判別実装に変更し、change folder = `true`、specs/ = `false` とする。Task 1 適用後も TC-SM-070 が specs/-absent skip パスをカバーし続けることを保証する。
