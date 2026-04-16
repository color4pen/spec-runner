# Pipeline Context

Step 1 で生成される共有メタデータ。各エージェントはこのファイルを読んで
パス情報・影響チェック結果・構成を取得する。

## Paths

- **request-md**: requests/active/2026-04-16-phase2-auth-and-app-foundation/request.md
- **request-path**: requests/active/2026-04-16-phase2-auth-and-app-foundation
- **change-folder**: openspec/changes/phase2-auth-and-app-foundation/
- **slug**: phase2-auth-and-app-foundation

## Type

- **type**: new-feature
- **branch**: feat/2026-04-16-phase2-auth-and-app-foundation

## Impact Checks

- **spec**: yes
- **security**: yes
- **data-model**: yes
- **public-api**: yes

## Spec Review Configuration

- **agents**: architect, spec-reviewer, security-reviewer
- **emphasis**: 既存 spec との整合性・後方互換性、認証フロー・認可チェック・入力バリデーション、データ整合性・マイグレーション戦略、後方互換性・バージョニング
- **result**: requests/active/2026-04-16-phase2-auth-and-app-foundation/spec-review-result-{NNN}.md

## Test Case Generation

- **must-areas**: セキュリティ境界（認証バイパス、権限昇格、入力検証）、データ整合性（一意制約、外部キー、トランザクション境界）、API 契約検証（レスポンス形状、エラーレスポンス、ステータスコード）

## Code Review Configuration

- **emphasis**: クエリ安全性・トランザクション処理・N+1問題、API契約安定性・破壊的変更検出、認証・認可の正確性

## Shared Resources

- **constraints**: docs/constraints.md（存在する場合）
- **review-lessons**: docs/review-lessons.md（存在する場合）

## Notes

- 影響チェック全 yes: 全ステップ実行（スキップなし）
