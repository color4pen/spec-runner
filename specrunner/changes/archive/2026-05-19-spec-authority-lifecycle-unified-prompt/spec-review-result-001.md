# Spec Review Result

- **change**: spec-authority-lifecycle-unified-prompt
- **verdict**: approved
- **date**: 2026-05-19
- **reviewer**: spec-reviewer

## Summary

request.md の 6 要件すべてが delta spec / design.md / tasks.md に網羅され、MODIFIED header は baseline (`specrunner/specs/prompt-fragment-registry/spec.md`) と完全一致。設計判断（4 セクション拡張・operational instructions と規律の分離・BUILD_FIXER / ADR_GEN 除外）は妥当で、scope も明示。実装可能・整合性良好。

## Findings

CRITICAL / HIGH / MEDIUM: なし

参考 (LOW・指摘のみ、修正不要):

| # | Severity | Category | File | Description |
|---|----------|----------|------|-------------|
| 1 | LOW | maintainability | delta spec (specs/prompt-fragment-registry/spec.md) | delta spec の Scenario が `#### Scenario:` 表記、baseline は `**Scenario**:` 表記。`mergeSpecsForChange` 実行時に表記揺れが残る可能性あり。本 request では対応不要。将来の別 request で baseline 全体を統一することを検討。 |

## Requirements Mapping

| # | request.md の要件 | delta spec の対応 | Status |
|---|------------------|------------------|--------|
| 1 | `AUTHORITY_SPEC_GUARD` 4 セクション拡張 (MUST NOT / 正規経路 / 書く側 / 見る側) | MODIFIED `Fragment 集約 export` + Scenario "AUTHORITY_SPEC_GUARD が 4 セクションを含む" | covered |
| 2 | `fragment-coverage.test.ts` EXPECTED に SPEC_REVIEW / CODE_REVIEW + AUTHORITY_SPEC_GUARD 必須化 | MODIFIED `Inject 漏れの構造的検出` + Scenario "reviewer 系 prompt に AUTHORITY_SPEC_GUARD が必須化されている" | covered |
| 3 | `spec-review-system.ts` / `code-review-system.ts` の `buildSystemPrompt` 呼び出しで fragments array に追加 | MODIFIED `System prompt の builder 経由構成` + Scenario (spec-review / code-review 各 1 件) | covered |
| 4 | 既存 base prompt の重複削除 (SHOULD) | tasks.md Task 4 に grep ベース手順 + design.md に保全対象明示 | covered |
| 5 | `bun run typecheck && bun run test` green | tasks.md Task 5 に全体検証 | covered |
| 6 | target capability = `prompt-fragment-registry` | delta path `specs/prompt-fragment-registry/spec.md` | covered |

## Delta Spec Header Consistency

| Delta MODIFIED Header | Baseline Header | 一致 |
|-----------------------|-----------------|------|
| `### Requirement: Fragment 集約 export` | `### Requirement: Fragment 集約 export` | ✓ |
| `### Requirement: Inject 漏れの構造的検出` | `### Requirement: Inject 漏れの構造的検出` | ✓ |
| `### Requirement: System prompt の builder 経由構成` | `### Requirement: System prompt の builder 経由構成` | ✓ |

## Checklist

- [x] request.md の全要件が delta spec / design / tasks に網羅されている
- [x] 既存仕様 (baseline) との整合性あり (header 完全一致・既存 Requirement の意味を壊さない)
- [x] Delta Spec Format 整合性: MODIFIED header が baseline と一致、Scenario / MUST 含有
- [x] tasks.md の分解が適切 (5 task、各 task に検証コマンド)
- [x] 境界条件考慮: BUILD_FIXER / ADR_GEN を不要と明示、保全対象 (operational instructions) を design.md で列挙
- [x] テスト戦略明確: fragment-coverage.test.ts の `toContain` で構造的検出、Scenario が test 駆動
- [x] スコープ適切: スコープ外セクションで #313 完了済み / executor staging cleanup / agent 判断ロジック自体を明示除外
- [x] セキュリティ観点: prompt 規律変更のみで攻撃面なし。fragment 内容に外部入力なし
- [x] patchwork 排除: #316 を本 request に吸収する方針が request.md §4 に明示
