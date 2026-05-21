# Spec Review Result: request-review-detect-baseline-edit-intent

- **verdict**: needs-fix
- **reviewer**: spec-reviewer
- **date**: 2026-05-21

---

## Summary

設計方向・タスク分解・delta spec の構造はいずれも妥当。ただし delta spec に rules.md 明示の validation error が 1 件あり、また baseline の `Request Review Prompt Regression Test` requirement が本 request 完了後に stale になる問題が 1 件ある。2 件の修正が必要。

---

## Findings

### F-001 [HIGH] delta spec の requirement body に normative keyword (SHALL/MUST) がない

**対象**: `specrunner/changes/request-review-detect-baseline-edit-intent/specs/request-authoring-guard/spec.md`

**rules.md 該当箇所**:
> Requirement 本文（header 直後〜最初の Scenario の間）に英語の `SHALL` または `MUST` を少なくとも 1 つ含めること（normative keyword なしは validation error）

現状の requirement 本文:
```
`src/prompts/request-review-system.ts` に、request body 内で authority path への言及を検出した場合に
reviewer agent が intent を判定し、直接操作 intent を HIGH severity finding として検出するルールを定義する。
検出は具体的な edit verb の列挙に依存せず、agent の intent 判定に委ねる。
```

`SHALL` も `MUST` も含まれていない。delta-spec-validation-result.md は path/format 層のみを検証しており、この content 制約は見落とされている。

**修正**: requirement 本文に `SHALL` または `MUST` を追加する（例: "… HIGH severity finding として検出するルールを **SHALL** 定義する。"）。

---

### F-002 [MEDIUM] `Request Review Prompt Regression Test` requirement が本 request 完了後に stale になる

**対象**: baseline `specrunner/specs/request-authoring-guard/spec.md` L41–53 / tasks.md Task 4–5

baseline の `Request Review Prompt Regression Test` requirement のシナリオは現在:

> **THEN** authority path と **編集動詞共起** を HIGH finding として検出する旨のテキストが含まれることを assert するテストケースが green になる

しかし本 request の実装後、prompt から「編集動詞共起」の検出条件が削除され intent 判定に置き換わる。tasks.md Task 4 は TC-RR-011/TC-RR-012 の assertion フレーズを新文言に更新することを指示しているが、**delta spec がこの requirement を MODIFIED としてカバーしていない**。

結果として baseline の `Request Review Prompt Regression Test` requirement は実装と矛盾した状態で残る。finish の spec-merge がその矛盾を baseline に書き込む前に delta で解消しておく必要がある。

**修正**: delta spec に `### Requirement: Request Review Prompt Regression Test` の MODIFIED エントリを追加し、intent 判定後の新しいテスト構造（TC-RR-011〜014 の観点）を反映したシナリオに書き換える。header は baseline と完全一致させること。

---

## Passing Items

- **request.md 網羅性**: 要件 1–5 がすべて design.md / tasks.md に対応するタスクにマッピングされている ✓
- **delta spec ヘッダー一致**: `### Requirement: Request Review Prompt Authority Path Detection Rule` が baseline と完全一致 → MODIFIED 自動分類 ✓
- **delta spec シナリオ数**: 3 シナリオすべてが Given/When/Then 形式で記述されており、AC の意図をカバー ✓
- **スコープ外の明示**: 既存 verb 列挙の物理的削除可否・過去観測ケース retrospective・issue #299 他手段を scope 外に明記 ✓
- **baseline 非編集規律**: request.md / design.md ともに「PR 内では baseline read-only」を明示し、規律遵守を宣言 ✓
- **テスト戦略**: LLM 呼び出しなし・static text assertion のみ（再現性・コスト両立） ✓
- **セキュリティ**: 本変更はプロンプト文字列の書き換えのみ。認証・入力検証・外部 API 連携に影響なし。OWASP Top 10 該当項目なし ✓

---

## Required Fixes

1. **delta spec requirement 本文に `SHALL` または `MUST` を追加** (F-001)
2. **delta spec に `Request Review Prompt Regression Test` の MODIFIED エントリを追加** (F-002)
