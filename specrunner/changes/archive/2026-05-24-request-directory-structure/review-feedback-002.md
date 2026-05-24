# Review Feedback — request-directory-structure — iter 2

## Summary

iter 1 の 3 件の指摘（F-001〜F-003）がすべて修正されている。typecheck + test green（2761 tests pass）。

- **verdict**: approved

---

## iter 1 指摘の解消確認

| 指摘 | 内容 | 解消状況 |
|------|------|----------|
| F-001 (major) | `draftPathLegacy()` が paths.ts に存在しない | ✅ `src/util/paths.ts` に実装済み |
| F-002 (minor) | TC-PATHS-001 / TC-PATHS-003 の直接テストが不在 | ✅ `tests/unit/util/paths.test.ts` が追加済み |
| F-003 (minor) | TC-ST-LIST-004 の明示的テストが不在 | ✅ `store.test.ts` に deduplication テスト追加済み |

---

## 追加確認 (must TCs 網羅)

| TC | 内容 | 状況 |
|----|------|------|
| TC-PATHS-001 | `draftPath()` が新形式パス | ✅ paths.test.ts |
| TC-PATHS-003 | `draftPathLegacy()` が旧形式パス | ✅ paths.test.ts |
| TC-ST-RESOLVE-001 | `resolve()` が新形式パスを返す | ✅ store.test.ts |
| TC-ST-FBK-001〜004 | `resolveWithFallback()` 全4ケース | ✅ store.test.ts |
| TC-ST-LIST-001〜004 | `list()` ディレクトリ/フラット/混在/重複排除 | ✅ store.test.ts |
| TC-ST-READ-001〜002 | `read()` 新形式・旧形式 | ✅ store.test.ts |
| TC-ST-WRITE-001 | `write()` がディレクトリを自動作成 | ✅ store.test.ts |
| TC-ST-COL-001〜003 | `checkSlugCollision()` ディレクトリ・フラット両対応 | ✅ store.test.ts |
| TC-PIPELINE-001〜004 | CANONICAL_PATTERN 新形式・旧形式フォールバック | ✅ pipeline-run-canonical.test.ts |
| TC-BUILD-001〜002 | typecheck + test green | ✅ verification-result.md |

---

## 情報レベルの観察（ブロック対象外）

### N-001: `job-start-file-path.test.ts` に stale な mock が残存

**場所**: `tests/unit/cli/job-start-file-path.test.ts`

`run.ts` は `resolveWithFallback` を import しているが、このテストのモックは旧来の `resolve` をモックしている:

```typescript
vi.mock("../../../src/core/request/store.js", () => ({
  resolve: vi.fn().mockReturnValue("/nonexistent/path"),
}));
```

テストは「既存ファイルパスが指定された場合」のみをカバーしているため slug lookup 分岐を通らず、stale なモックが影響しないまま通過している。動作上の問題はないが、後で slug lookup のテストを追加する際に混乱の原因になりうる。

---

## Confirmed OK

| 項目 | 確認結果 |
|------|----------|
| `command-registry.ts` が `resolveWithFallback as storeResolve` に切り替え済み | ✅ |
| `run.ts` が `resolveWithFallback as storeResolve` に切り替え済み | ✅ |
| `manager.ts` が `store.resolveWithFallback()` に切り替え済み | ✅ |
| `pipeline-run.ts` に CANONICAL_PATTERN + CANONICAL_PATTERN_LEGACY の両パターン | ✅ |
| `changes/` 構造は変更なし (TC-NOCHANGE-001) | ✅ スコープ外確認済み |
| 2761 tests pass | ✅ |
