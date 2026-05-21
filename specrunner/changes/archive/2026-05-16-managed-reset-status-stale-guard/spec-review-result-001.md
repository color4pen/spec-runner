# Spec Review Result: managed-reset-status-stale-guard

- **reviewer**: spec-reviewer (Claude)
- **date**: 2026-05-16
- **verdict**: approved

## Summary

request.md → design.md → tasks.md → delta-spec の一貫性は高く、受け入れ基準を全てカバーしている。セキュリティ面も問題なし。1 件の minor finding あり（非 blocking）。

## Findings

### F-01: stale path で `runtime` フィールドを削除している (minor)

- **場所**: tasks.md T-03 擬似コード L140
- **内容**: `delete (newConfig as unknown as Record<string, unknown>)["runtime"]` が stale path にも含まれている。request.md 要件 3 は「agents / environment.id を clear する」、design.md Data Flow は「config 更新: agents={}, environment 削除」と記述しており、`runtime` の削除は stated scope に含まれない。`runtime` が `"local"` や `undefined` のときに削除しても機能的には無害（local がデフォルト）だが、「stale managed fields only をリセットする」という意図と齟齬がある。
- **推奨**: stale path では `runtime` を温存する（既存の managed path のコードからの copy-paste と思われる）。implementer が判断してよい。

## Checklist

| 観点 | 結果 | 備考 |
|------|------|------|
| request ↔ design 整合 | ✓ | D1-D4 が request の設計判断 1-4 に 1:1 対応 |
| request ↔ tasks 整合 | ✓ | 全要件が T-01〜T-07 でカバー |
| request ↔ delta-spec 整合 | ✓ | ADDED の Requirement / Scenario が request の spec authority セクションと一致 |
| design ↔ tasks 整合 | ✓ | 擬似コードが design Data Flow と一致（F-01 の minor 差異を除く） |
| 既存 spec への影響 | ✓ | `managed-agent-runtime/spec.md` と `cli-commands/spec.md` は変更対象外。実際に両 spec を確認し、managed CLI コマンドの記述がないことを検証済み |
| テストカバレッジ | ✓ | 要件 5 の 7 パターン全てが T-05 で定義。既存 regression は TC-MR-001/002/003 + TC-MST-001 で担保 |
| 二重確認防止 | ✓ | design D2 の分岐構造が明確。runtime !== managed → 新 prompt 1 本、managed → 既存 prompt 1 本 |
| non-TTY 安全策 | ✓ | `rm/runner.ts` の既存パターンに準拠。CI で --force なしは即中断 |
| セキュリティ | ✓ | API key 不在時の graceful degradation（warning + SDK delete skip）は既存パターン踏襲。新たな入力経路なし、OWASP 該当なし |
| スコープ逸脱 | ✓ | request のスコープ外 3 項目に触れていない |
