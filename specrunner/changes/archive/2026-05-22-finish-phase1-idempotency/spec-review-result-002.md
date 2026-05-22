# Spec Review Result 002: finish-phase1-idempotency

- **verdict**: approved
- **reviewer**: spec-reviewer
- **date**: 2026-05-22

---

## Summary

spec-review-001 で指摘した唯一の gap（TC-SM-070 の `exists` mock が Task 1 適用後にサイレント劣化する）が **Task 3.5** として tasks.md に追加されている。修正内容は指摘要求と完全一致。他の task（1〜4・5）は変更なし。全体として仕様違反バグの最小修正として問題なし。

---

## Findings

### spec-review-001 gap の解消確認

**Task 3.5** に以下が記述されており、001 の要求を満たす:

```typescript
exists: vi.fn().mockImplementation((p: string) => {
  if (p.endsWith("specs")) return Promise.resolve(false); // specs/ dir absent
  return Promise.resolve(true);                           // change folder present
}),
```

Task 1 適用後も TC-SM-070 が `readFile(request.md)` → specs/ 不在 skip のパスをカバーし続けることが保証される。

### 設計整合性

- **Task 1**: `changeFolderAbsPath` の `fs.exists` チェックを `readFile` の前に挿入。`archiveChangeFolder` と同一パターン。✓
- **Task 2 (TC-SM-069)**: `readFile` が呼ばれないことを `not.toHaveBeenCalled()` で担保。✓
- **Task 3 (TC-SM-068)**: `exists: true` + 不正 content → `parseRequestMdContent` が throw → catch → `spec-merge (request.md)` escalation。`parseRequestMdContent` は `requestMdInvalidError` を throw する実装（`src/parser/request-md.ts:44-45`）で動作が担保されている。✓
- **Task 4 (TC-103)**: integration test の `readFile` mock を ENOENT 返却に変更し、Task 1 修正前は fail・修正後は pass の red-green を構成する意図は正しい。実装時に `exists` mock との整合（`changeFolderExists = false` 時に `exists` も `false` を返しているか）を確認すること（minor、blocker ではない）。

### セキュリティ

純粋なファイルシステム存在チェックの追加。外部入力処理・認証・API 呼び出しに関与しない。OWASP Top 10 非該当。懸念なし。

---

## 実装への注意

Task 4 の `readFile` mock 修正は Task 1 適用後は `readFile` 自体が呼ばれないため、TC-103 の pass/fail を左右するのは `exists` mock の実装になる。実際の `makeStubFs` の `exists` mock が `changeFolderExists` フラグを参照していれば問題ないが、していない場合は `exists` mock の修正も必要。コード確認の上で適切に対処すること。
