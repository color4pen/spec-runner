# Review Feedback 002 — dsv-format-rules-expansion

- **verdict**: approved
- **reviewer**: Claude code-reviewer
- **commit reviewed**: dba0b9f2 (HEAD on change/dsv-format-rules-expansion-ec5834bf)
- **iteration**: 2 (responding to review-feedback-001)

## 概要

review-feedback-001 の M1 (`extractSection` 隣接セクションバグ) が正しく修正されており、関連 regression test (TC-013b) も追加されている。全 2531 テスト green、typecheck 0 エラー。acceptance criteria は全件満たしている。

---

## review-feedback-001 対応状況

### M1 (MAJOR): `extractSection` が隣接 `##` セクションで誤検出

**status**: ✅ 修正済み

`spec-content-parser.ts:83` が以下のとおり修正されている:

```typescript
// before (buggy)
const nextSectionMatch = /\n## /g;
nextSectionMatch.lastIndex = sectionStart;

// after (fixed — review-feedback-001 option B)
const nextSectionMatch = /^## /gm;
nextSectionMatch.lastIndex = sectionStart;
```

`m` フラグによる `^` アンカーで、`sectionStart` が隣接セクション行頭を直接指す場合でも `\n` を経由せず確実に検出できる。

**動作確認** (手動トレース):
- `content = "## Removed\n## Renamed\n- \"x\" → \"y\"\n"`
- `sectionStart = 11` (position 11 is start of `## Renamed`)
- `/^## /gm` with `lastIndex = 11` → match at index 11
- `content.slice(11, 11)` = `""` ✓

### m4 (MINOR): 隣接セクション用 test 欠落

**status**: ✅ 追加済み

`spec-content-parser.test.ts` に TC-013b が 2 ケース追加されている:

```
TC-013b: extractSection — adjacent ## section returns empty string, not next section content
  ✓ returns empty string when section is immediately followed by another ## with no blank line
  ✓ does not include next section body when sections are adjacent
```

テスト数の増加 (2529 → 2531) と一致。

---

## 未対応 minor / nit (前回レビューのまま)

以下は前回 review-feedback-001 で minor/nit として挙げたもの。今回の scope 内修正として必須とは判断しない。

| ID | 内容 | 判断 |
|----|------|------|
| m1 | violation に行番号情報がない | future enhancement — 型変更を伴うため別 task |
| m2 | `baseline-header-match` の `suggested` に actual header 値が含まれない | future enhancement |
| m3 | `parseRequirementBlocks` body trailing newline が冗長 | 実害なし、変更不要 |
| n1-n5 | nit 各種 | 変更不要 |

---

## Acceptance Criteria の状態

| Criterion | Status |
|---|---|
| 6 rule files exist | ✅ |
| `createDeltaSpecRegistry()` が 9 rule 登録 | ✅ |
| `DeltaSpecRuleInput.baselineSpecLoader?` optional 追加 | ✅ |
| `DeltaSpecRuleName` union に 6 名追加 | ✅ |
| `DeltaSpecViolationReason` union に 6 reason 追加 | ✅ |
| PR #359 regression test green (TC-022) | ✅ |
| `bun run typecheck` 0 errors | ✅ |
| `bun run test` 2531 tests green | ✅ |
| 既存 archive 3 件で false positive なし | ✅ |
| Step が `baselineSpecLoader` を inject | ✅ |
| M1 バグ修正 + 隣接セクション test 追加 | ✅ |
