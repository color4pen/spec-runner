# Design: spec-review delta spec presence check

## Summary

spec-review prompt の system prompt に「type=spec-change/new-feature のとき specs/ 配下に delta spec が 1 件以上必須」check 段を追加する。dsv (delta-spec-validation) と並列の 2 層目防衛として、prompt level で agent に独立判定させる。

## Architecture Decision

### D1: prompt-level 追加 (system prompt に check 段を挿入)

`SPEC_REVIEW_SYSTEM_PROMPT` 定数文字列に新セクション "Delta Spec Presence Check" を追加する。

**根拠**:
- dsv は機械的 check (= ファイル数を数える)、spec-review は意味的 check (= 要件カバレッジ含む) — 同じ「存在 check」でも責務が異なる
- spec-review agent は既に `{{REQUEST_TYPE}}` を初期メッセージで受け取っている (L85, L189) — 型判定の参照経路は確立済み
- prompt 追加のみでコード変更不要 (= リスク最小)

**不採用案**:
- spec-review が dsv 結果を参照 → 層間依存が増える、独立判定の原則に反する
- dsv 単独で十分 → dsv のバグ時に 4 層目まで突破する (= PR #282 の再発)

### D2: check の位置 — Baseline Spec Consistency Check の前

system prompt 内の既存 "Baseline Spec Consistency Check" セクション (L59-69) の前に配置する。

**根拠**:
- 「delta spec が存在するか」は「delta spec の中身が baseline と整合するか」の前提条件
- 存在 check → 中身 check の論理的な順序に合致

### D3: severity と verdict への影響

- severity: HIGH 固定
- category: completeness
- HIGH finding が 1 件でもあれば agent は verdict = needs-fix を返す (= 既存 Pipeline Rules に準拠)
- needs-fix verdict → spec-fixer に遷移 (= 既存パイプライン routing そのまま)

### D4: type 参照 — 既存経路で十分 (コード変更不要)

確認結果:
- `spec-review-system.ts:85`: `Request type: {{REQUEST_TYPE}}`
- `spec-review-system.ts:189`: `.replace(/{{REQUEST_TYPE}}/g, input.requestType)`
- `spec-review.ts:117`: `requestType: state.request.type`

→ prompt 内で request type を参照可能。コード変更不要。

### D5: テスト戦略 — grep test + 既存 pipeline routing test

- **grep test**: system prompt に "Delta spec presence" "no-specs-for-required-type" 等のキーワードが含まれることを検証
- **pipeline routing test**: 既存 TC-010 〜 TC-013 が spec-review verdict → fixer 遷移を証明済み。prompt 追加で routing は変わらないため新規 TC 不要
- **E2E**: 実 agent が prompt に従って HIGH severity を返すかは dogfood で検証

## Affected Files

| File | Change Type | Description |
|------|-------------|-------------|
| `src/prompts/spec-review-system.ts` | MODIFY | system prompt に Delta Spec Presence Check セクション追加 |
| `tests/prompts/spec-review-system.test.ts` | MODIFY | grep test 追加 (キーワード存在確認) |
| `specrunner/specs/spec-review-session/spec.md` | MODIFY | Requirement + Scenario 追加 |

## Constraints

- `SPEC_REVIEW_SYSTEM_PROMPT` は静的文字列定数 — テンプレート変数は初期メッセージ側 (`SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE`) のみ
- system prompt 内で `{{REQUEST_TYPE}}` は使えない — 代わりに「初期メッセージに記載された Request type を参照せよ」と指示する形式
- 既存の "Baseline Spec Consistency Check" (L59-69) は delta spec の中身整合のみ — 存在 check は含まれていない (= 今回追加)
