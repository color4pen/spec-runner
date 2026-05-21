# Spec Review Result

- **change**: validation-rule-name-typesafe
- **reviewer**: spec-reviewer
- **date**: 2026-05-19
- **verdict**: approved

## Summary

TypeScript generic 拡張（`TName extends string = string`）による compile-time typo 検知の強化。設計が健全で、全ドキュメント間の整合性も取れている。

## Checks

### 1. Delta spec header 一致

baseline の Requirement ヘッダーとの比較:

| baseline header | delta MODIFIED header | 一致 |
|---|---|---|
| "ValidationRule interface SHALL declare name, severity, and check" | 同一 | ✓ |
| "RuleRegistry SHALL collect rules and aggregate violations" | 同一 | ✓ |

ADDED requirement ("Parser layer SHALL define RequestMdRuleName union type for compile-time name safety") は baseline に存在しない新規要件として適切に分類されている。

### 2. request.md 要件の網羅性

| 要件 | delta spec / design / tasks での対応 | 状態 |
|---|---|---|
| RequestMdRuleName union 定義 (MUST) | ADDED requirement + T-01 | ✓ |
| ValidationRule TName 型パラメータ追加 (MUST) | MODIFIED requirement + T-02 | ✓ |
| RuleRegistry TName 型パラメータ追加 (MUST) | MODIFIED requirement + T-03 | ✓ |
| parser 7 rule file の specialize (MUST) | ADDED requirement + T-04 | ✓ |
| createRequestMdRegistry 返り型明示 (MUST) | ADDED requirement scenario + T-05 | ✓ |
| 後方互換保証 (MUST) | MODIFIED requirement + D1 + T-02/T-03 | ✓ |
| DSV layer 無修正 (MUST) | T-07 + Non-Goals | ✓ |
| typo で tsc error になる type-level test (SHOULD) | T-06 で実装タスク化（delta spec には非掲載） | 許容 |

type-level test は SHOULD のため delta spec に要件化されていなくても問題なし。

### 3. ドキュメント間整合性

- **request.md ↔ design.md**: D1–D4 の決定が request の設計判断セクションと整合。
- **design.md ↔ tasks.md**: T-01〜T-07 が D1–D4 を完全にカバー。`createRequestMdRegistry` の型引数更新（T-05）、type-level test（T-06）まで網羅。
- **tasks.md ↔ delta spec**: delta spec の MODIFIED/ADDED が tasks の変更対象ファイルと対応。

### 4. 設計の健全性

`TName extends string = string` の default 設定により既存の `ValidationRule<X, Y>` / `RuleRegistry<X, Y>` 形式の呼び出し箇所が無修正で通る。core 層が parser 固有の union 型（`RequestMdRuleName`）に依存しない構造（D2）も正しい依存方向を保っている。

### 5. スコープ規律

DSV layer（B 種）の除外が request.md・design.md・tasks.md の全箇所で一貫して明示されている。

### 6. セキュリティ考慮

純粋な TypeScript 型レベルの変更であり、ランタイム動作・認証・入力バリデーション・外部 API に影響しない。OWASP Top 10 の該当なし。

## 指摘事項

なし。

## 判断根拠

全 MUST 要件が delta spec / tasks に対応付けられており、実装に進む上での仕様上の曖昧さがない。
