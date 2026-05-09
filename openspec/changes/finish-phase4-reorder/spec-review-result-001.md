# Spec Review Result: finish-phase4-reorder

- **iteration**: 1
- **verdict**: approved
- **date**: 2026-05-09
- **type**: bug-fix

## Summary

仕様は request.md の 5 要件を網羅しており、proposal → design → tasks → delta spec の一貫性が高い。canTransition / transitionJob の既存 API 参照も正確。delta spec が既存 spec の 2 シナリオを更新していない点を MEDIUM で指摘するが、承認阻止には至らない。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | consistency | specs/cli-finish-command/delta.md | 既存 spec の「feature PR が既に MERGED（resume）」シナリオが「Phase 4 のみ実行（markJobArchived + main pull --ff-only）」と記述されている。delta で Phase 4 の定義が cleanup only に変更されたが、このシナリオの THEN 句が未更新のまま残り、適用後に矛盾する | delta に resume シナリオの更新を追加: THEN を「markJobArchived 実行後、Phase 4 (cleanup) を実行」に書き換える |
| 2 | MEDIUM | consistency | specs/cli-finish-command/delta.md | 同様に「archive folder 不在で commit skip」シナリオの THEN 句「Phase 4 で markJobArchived のみ実行」も旧 Phase 4 定義を参照している | delta に当該シナリオの THEN 句更新を追加: 「markJobArchived 実行後、Phase 4 (cleanup) を実行」 |
| 3 | LOW | completeness | specs/cli-finish-command/delta.md | STATUS_HINTS に `success` ステータスの hint がない。fallback の汎用メッセージで動作するが、他ステータスと比べ情報量が落ちる | `success: "Job completed but PR not yet created. Run 'specrunner finish' after PR creation."` 等を追加する |

## Checklist

| Axis | Result |
|------|--------|
| request.md 要件の網羅 | 5/5 全要件が proposal → design → tasks → delta に反映 |
| proposal ↔ design 整合 | OK — markJobArchived 移動、Phase 4 best-effort 化、canTransition 導入が一致 |
| design ↔ tasks 整合 | OK — T1-T6 が D1-D4 を順に実装。依存グラフも明示 |
| tasks ↔ delta spec 整合 | OK — delta の requirement/scenario 変更が tasks の実装内容と対応 |
| delta ↔ 既存 spec 整合 | MEDIUM — 2 シナリオの THEN 句が旧 Phase 4 定義のまま（Finding #1, #2） |
| テスト計画 | OK — TC-124 順序逆転、TC-FIN-P4-FAIL-001/002 追加、TC-126 影響なし確認 |
| セキュリティ | N/A — state 管理の順序変更のみ。認証・入力検証・外部入力の変更なし |
| 実現可能性 | OK — canTransition, transitionJob は lifecycle.ts に実在。行番号も一致 |
| スコープ外の明示 | OK — pipeline.ts / resume stale detection / 永続化一元化を明示的に除外 |
