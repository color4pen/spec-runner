# Review Feedback — request-directory-structure — iter 1

## Summary

実装は全体的に正しく、verification (typecheck + test) も green。
ただし `paths.ts` に `draftPathLegacy()` が実装されておらず、TC-PATHS-003 (must) が未充足。

- **verdict**: needs-fix

---

## Findings

### F-001: `draftPathLegacy()` が paths.ts に存在しない [severity: major]

**場所**: `src/util/paths.ts`

**問題**:
design.md D1 と tasks.md task#1-1 で `draftPathLegacy(slug)` の追加が明示されているが、実装されていない。

```
// 期待: paths.ts に存在するはず
export function draftPathLegacy(slug: string): string {
  return `${DRAFTS_DIR}/${slug}.md`;
}
```

test-cases.md の TC-PATHS-003 (priority: must) が未充足。

なお、後方互換の実動作は `store.ts` の `resolveWithFallback()` が直接 `slug + ".md"` を組んでいるため機能している。問題は公開 API として `draftPathLegacy()` が欠けていること。

**修正**: `src/util/paths.ts` に以下を追加する。

```typescript
/**
 * Returns the relative path to a draft request file in legacy flat-file format.
 * Example: draftPathLegacy("my-change") → "specrunner/drafts/my-change.md"
 */
export function draftPathLegacy(slug: string): string {
  return `${DRAFTS_DIR}/${slug}.md`;
}
```

---

### F-002: TC-PATHS-001 / TC-PATHS-003 の直接テストが不在 [severity: minor]

**場所**: `tests/unit/` 配下

**問題**:
`draftPath()` (TC-PATHS-001 must) と `draftPathLegacy()` (TC-PATHS-003 must) に対する直接ユニットテストが存在しない。`draftPath()` は `request-new.test.ts` で間接的に検証されているが、`paths.ts` 単体のテストファイルがない。

F-001 の修正時に合わせてテストを追加することが望ましい。

---

### F-003: TC-ST-LIST-004 の明示的テストが不在 [severity: minor]

**場所**: `tests/unit/core/request/store.test.ts`

**問題**:
TC-ST-LIST-004 (must) — 同名のディレクトリ (`both/request.md`) とフラットファイル (`both.md`) が共存するとき、`list()` の結果に `"both"` が 1 度だけ現れることを確認するテストが存在しない。

実装ロジック（Set による重複排除）は正しい。明示的テストの追加が必要。

---

## Confirmed OK

| 項目 | 確認結果 |
|------|----------|
| `resolve()` が新形式パスを返す (TC-ST-RESOLVE-001) | ✅ |
| `resolveWithFallback()` 3ケース (TC-ST-FBK-001~004) | ✅ テストあり・実装正しい |
| `list()` ディレクトリ + フラットファイル混在 (TC-ST-LIST-001~003, 005, 006) | ✅ |
| `write()` がディレクトリを自動作成 (TC-ST-WRITE-001) | ✅ |
| `checkSlugCollision()` ディレクトリ・フラット両対応 (TC-ST-COL-001~002) | ✅ |
| `CANONICAL_PATTERN` 新形式・旧形式フォールバック (TC-PIPELINE-001~004) | ✅ |
| `command-registry.ts` が `resolveWithFallback` に切り替え済み | ✅ |
| `run.ts` が `resolveWithFallback` に切り替え済み | ✅ |
| `manager.ts` が `resolveWithFallback` に切り替え済み | ✅ |
| `request-new.test.ts` がディレクトリ構造を検証 (TC-NEW-001) | ✅ |
| typecheck + test green (TC-BUILD-001, TC-BUILD-002) | ✅ verification passed |
| changes/ 構造は変更なし (TC-NOCHANGE-001) | ✅ スコープ外確認済み |

---

## 修正箇所まとめ

1. `src/util/paths.ts`: `draftPathLegacy()` を追加（F-001）
2. `tests/unit/` に TC-PATHS-001, TC-PATHS-003 の直接テストを追加（F-002）
3. `tests/unit/core/request/store.test.ts` に TC-ST-LIST-004 のテストを追加（F-003）
