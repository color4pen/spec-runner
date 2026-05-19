# Spec Review Result: prevent-authority-path-in-request-body

- **verdict**: approved
- **date**: 2026-05-19
- **reviewer**: spec-reviewer agent

---

## Findings Summary

| # | Severity | Category | Description | Location | Recommendation |
|---|----------|----------|-------------|----------|----------------|
| 1 | LOW | clarity | `request.md` の `## architect 評価済みの設計判断` セクションが TBD のまま。`design.md` に DJ-1〜DJ-3 が記述されており実質的な空白はないが、request.md 単体で読む場合に完結しない | request.md L60-62 | `design.md` の設計判断要旨を 1 行で backfill するか、「設計判断は design.md 参照」と明記する。実装ブロッカーではない |
| 2 | LOW | test-coverage | Task 4 の `toContain` アサーションに使う具体フレーズが spec 段階では未確定。実装後フレーズが弱すぎると regression 検知能力が下がる | tasks.md Task 4 | 実装時に「authority path + 編集動詞」「policy 言及は HIGH finding にしない」の文言を含む具体フレーズを選定し、テストコメントに記録する |

---

## Verdict

No HIGH severity findings. Requirements 1〜3 はそれぞれ tasks.md のタスクと spec.md のシナリオに 1:1 でマッピングされており、受け入れ基準はすべてテスト可能。設計判断 DJ-1〜DJ-3 は妥当で、スコープ外の明示も適切。LOW 所見 2 件は実装ブロッカーでない。

---

## Review Notes

### 網羅性

- Req 1 (request-generate prompt MUST 化) → Task 1 + spec.md Scenario "MUST ルールが prompt に存在する" ✓
- Req 2 (scaffold template guidance) → Task 2 + spec.md Scenario "scaffold に delta spec guidance が含まれる" ✓
- Req 3 (request review 検出ルール) → Task 3 + spec.md Scenario "検出ルールが prompt に存在する" / "referential 除外節が prompt に存在する" ✓
- Req 4 (tests green) → Task 4 + Task 5 ✓

### 設計判断の妥当性

- **DJ-1 (直接埋め込み)**: `AUTHORITY_SPEC_GUARD` は executor 側 agent 用フラグメント。request 作成側の文脈は別関心事であり、YAGNI として直接埋め込みは妥当。
- **DJ-2 (LLM 判断)**: request-review が LLM agent であることを前提とすると、prompt ルールによる判断は既存フローに最もコスト低く乗れる。正規表現ベースの静的検出はスコープ外として分離済み。
- **DJ-3 (string contains assertion)**: 既存の TC-RR-009/010 パターンを踏襲。prompt 変更による regression を最小コストで検知できる。

### セキュリティ考慮

変更対象はすべて prompt テキストと scaffold テンプレートの文字列定数。入力受け付け・認証・外部 API の変更なし。OWASP Top 10 の適用対象外。

### スコープ整合性

スコープ外 5 項目（dsv 拡張 / 遡及修正 / AUTHORITY_SPEC_GUARD 変更 / executor 側防衛 / path 正規化）はいずれも要件・tasks.md に混入していない。
