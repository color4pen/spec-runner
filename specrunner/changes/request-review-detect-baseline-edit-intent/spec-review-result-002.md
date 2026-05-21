# Spec Review Result: request-review-detect-baseline-edit-intent

- **verdict**: needs-fix
- **reviewer**: spec-reviewer
- **date**: 2026-05-21

---

## Summary

前回 review (001) の 2 件の finding のうち、F-001（SHALL 欠落）は第 1 Requirement で解消済み、F-002（`Request Review Prompt Regression Test` の delta spec 欠落）は当該 Requirement の追加で対応済み。ただし追加された `Request Review Prompt Regression Test` の Requirement 本文に normative keyword (SHALL/MUST) が含まれていないため、rules.md rule 6 違反が残っている。修正 1 件のみ。

---

## Findings

### F-001 [HIGH] `Request Review Prompt Regression Test` requirement 本文に normative keyword がない

**対象**: `specrunner/changes/request-review-detect-baseline-edit-intent/specs/request-authoring-guard/spec.md`

**rules.md 該当箇所**:
> Requirement 本文（header 直後〜最初の Scenario の間）に英語の `SHALL` または `MUST` を少なくとも 1 つ含めること（normative keyword なしは validation error）

現在の Requirement 本文:
```
`tests/unit/command/request-review.test.ts` に、`REQUEST_REVIEW_SYSTEM_PROMPT` が intent 判定ルール・referential 除外節・3 分類定義・recommendation 文を含むことを確認する string contains assertion を追加する。
```

`SHALL` も `MUST` も含まれていない。

**修正**: 本文に `SHALL` または `MUST` を追加する。例:

```
`tests/unit/command/request-review.test.ts` に、`REQUEST_REVIEW_SYSTEM_PROMPT` が intent 判定ルール・referential 除外節・3 分類定義・recommendation 文を含むことを確認する string contains assertion を SHALL 追加する。
```

---

## Resolved Items (from 001)

- **F-001 (001)** `Request Review Prompt Authority Path Detection Rule` の SHALL 欠落 → 本文に `SHALL 定義する` が追加されており解消 ✓
- **F-002 (001)** `Request Review Prompt Regression Test` が delta spec に未記載 → `### Requirement: Request Review Prompt Regression Test` エントリが追加されており解消 ✓

---

## Passing Items

- **request.md 網羅性**: 要件 1–5 がすべて design.md / tasks.md / delta spec に対応 ✓
- **delta spec ヘッダー一致**: 両 Requirement の `### Requirement:` header が baseline と完全一致 → MODIFIED 自動分類 ✓
- **delta spec シナリオ数**: `Authority Path Detection Rule` 3 件・`Regression Test` 4 件 (TC-RR-011〜014)、Given/When/Then 形式 ✓
- **SHALL 第 1 Requirement**: `Request Review Prompt Authority Path Detection Rule` 本文に `SHALL` 含有 ✓
- **Intent 3 分類**: delta spec シナリオが「参照・言及 / 設計反映 / 直接操作」の 3 分類を明示 ✓
- **edit verb 非列挙 assertion**: TC-RR-013 で `MODIFIED, ADDED` 等の個別列挙が prompt に含まれないことを assert するシナリオが定義されている ✓
- **recommendation シナリオ**: TC-RR-014 が spec-merge 自動更新・baseline read-only・delta spec 経由を assert する設計 ✓
- **baseline 非編集規律**: delta spec は `specrunner/specs/` を編集していない。design.md に「PR 内では baseline read-only」を明示 ✓
- **セキュリティ**: 本変更はプロンプト文字列の書き換えのみ。認証・入力検証・外部 API 連携に影響なし。OWASP Top 10 該当項目なし ✓
- **tasks.md 完全性**: Task 1〜7 がすべて定義済み、Task 7 で typecheck + test green を確認する手順が明示 ✓

---

## Required Fixes

1. **delta spec `Request Review Prompt Regression Test` の Requirement 本文に `SHALL` または `MUST` を追加** (F-001)
