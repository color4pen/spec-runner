# Review Feedback — finish-phase1-idempotency — iter 1

- **verdict**: approved

---

## Summary

実装・テスト・検証いずれも AC を満たしている。must TC は全件カバー。

---

## Findings

### [info] TC-SM-096/097/098 のモックが change folder absent パスを踏む

**場所**: `tests/finish-spec-merge.test.ts` — TC-SM-096, TC-SM-097, TC-SM-098

**事象**: 3 テストの `exists` mock が `mockResolvedValue(false)` のままになっている。Task 1 のガード追加後、`mergeSpecsForChange` が先頭で `changeFolderAbsPath` を `exists` チェックするため、これら 3 テストは設計意図（"bug-fix/refactoring/chore で specs/ 不在→skip"）ではなく "change folder 不在→skip" パスを実際には実行している。

- テストは `ok:true skipped:true` を期待しており、どちらのパスでも真なので全件 green を維持している
- "type ごとの specs/ optional 判定" パスは TC-SM-070 がカバーしているため、カバレッジ上の実質的な欠損はない
- ただし説明文と実際に通るコードパスが乖離しており、将来の保守で混乱を招く可能性がある

**ブロッカーではない**。次の機会に `exists` mock を path-discriminated 実装（TC-SM-070 と同パターン）に揃えれば十分。

---

## AC チェックリスト

| # | 受け入れ基準 | 結果 |
|---|---|---|
| AC1 | change folder 不在時に `mergeSpecsForChange` が `skipped: true` を返す（unit test） | ✅ TC-SM-069 |
| AC2 | Phase 1-2 完了済みで再実行 → Phase 1 skip → Phase 3 merge | ✅ TC-103 (orchestrator integration) |
| AC3 | request.md parse 不能 → 従来どおり escalation | ✅ TC-SM-068 |
| AC4 | `bun run typecheck && bun run test` が green | ✅ verification-result.md (2596 passed) |

---

## コード正確性

`mergeSpecsForChange` の先頭ガード（L540-549）は `archiveChangeFolder` のパターンと対称であり、設計文書の意図に一致している。既存の try/catch を変更しないため、change folder が存在するが request.md が壊れているケースは従来どおり escalation になる。orchestrator 側の変更が不要なことも design.md の分析通りに確認した。
