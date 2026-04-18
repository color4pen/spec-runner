# Pipeline Context

## Paths

- **request-md**: requests/active/2026-04-18-bootstrap-session-lifecycle/request.md
- **request-path**: requests/active/2026-04-18-bootstrap-session-lifecycle
- **change-folder**: openspec/changes/2026-04-18-bootstrap-session-lifecycle/
- **slug**: 2026-04-18-bootstrap-session-lifecycle

## Type

- **type**: new-feature
- **branch**: feat/2026-04-18-bootstrap-session-lifecycle

## Impact Checks

- **spec**: yes
- **security**: yes
- **data-model**: yes
- **public-api**: yes

## Step Execution

| Step | Execute | Reason |
|------|---------|--------|
| 1 初期化 | yes | 常に実行 |
| 2 設計 | yes | 常に実行 |
| 3 仕様レビュー | yes | spec=yes, security=yes |
| 3.5 テストケース生成 | yes | 全項目 yes |
| 4 実装 | yes | 常に実行 |
| 5a 仕様整合性検証 | yes | spec=yes |
| 5b 品質検証 | yes | 常に実行 |
| 6 コードレビュー | yes | 常に実行 |
| 7 ADR生成 | yes | new-feature かつ全項目 yes |
| 8 アーカイブ | yes | spec=yes |
| 9 PR作成 | yes | 常に実行 |

## Spec Review Configuration

- **agents**: architect, spec-reviewer, security-reviewer
- **emphasis**: 構造的アーキテクチャレビュー（request type / session role の設計、セッション完了ハンドラの汎用性、SSE route からの責務分離）、既存 spec との整合性（spec=yes）、認証フロー・Vault トークン管理・IDOR防止（security=yes）、データ整合性・マイグレーション（data-model=yes）、API 契約（public-api=yes）
- **result**: requests/active/2026-04-18-bootstrap-session-lifecycle/spec-review-result-{NNN}.md

## Test Case Generation

- **must-areas**: セキュリティ境界（Vault トークン書き込み専用、認証バイパス、IDOR）（security=yes）、データ整合性（状態遷移ルール、FK制約、マイグレーション冪等性）（data-model=yes）、API 契約検証（ステータスAPI レスポンス形状）（public-api=yes）

## Code Review Configuration

- **emphasis**: 構造的レビュー（SSE route に bootstrap 固有ロジックがないこと、GitHub API が lib に集約されていること、role ベースの分岐が汎用的であること）、クエリ安全性・トランザクション（data-model=yes）、認証フロー・IDOR（security=yes）、API 契約安定性（public-api=yes）

## Shared Resources

- **constraints**: docs/constraints.md
- **review-lessons**: docs/review-lessons.md
- **learned-patterns**: docs/learned-patterns.md

## Notes

- PR #4 の応急処置（SSE route へのべた書き、title ハードコード判定）を構造的に解消するリクエスト
- depends-on の前フェーズ（2026-04-17-bootstrap-for-managed-agents）の review-feedback が存在
- 設計の重点: request type + session role による既存ライフサイクルへの統合、将来の execute-request 対応への拡張性
- レビュー重点: SSE route の責務分離が達成されているか、GitHub API lib の網羅性、セッション完了ハンドラの汎用性
