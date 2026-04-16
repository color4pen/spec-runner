# Pipeline Context

## Paths

- **request-md**: requests/active/2026-04-16-db-schema-redesign/request.md
- **request-path**: requests/active/2026-04-16-db-schema-redesign
- **change-folder**: openspec/changes/db-schema-redesign/
- **slug**: db-schema-redesign

## Type

- **type**: spec-change
- **branch**: change/2026-04-16-db-schema-redesign

## Impact Checks

- **spec**: yes
- **security**: yes
- **data-model**: yes
- **public-api**: yes

## Spec Review Configuration

- **agents**: architect, spec-reviewer, security-reviewer, pattern-reviewer
- **emphasis**: 既存 spec との整合性・後方互換性、マイグレーション戦略・データ整合性、リクエスト所有権の認可チェック、Server Actions インターフェースの破壊的変更
- **result**: requests/active/2026-04-16-db-schema-redesign/spec-review-result-{NNN}.md

## Test Case Generation

- **must-areas**: セキュリティ境界（リクエスト所有権、セッションアクセス経路）、データ整合性（外部キー、マイグレーション冪等性、カスケード削除）、API 契約検証（Server Actions の引数・戻り値変更）

## Code Review Configuration

- **emphasis**: マイグレーションの安全性、所有権検証の一貫性（IDOR 再発防止）、外部 API + DB 操作のロールバック

## Shared Resources

- **constraints**: docs/constraints.md
- **review-lessons**: docs/review-lessons.md

## Notes

- 影響チェック全 yes: 全ステップ実行（スキップなし）
- Step 1a: cleanup-stale-knowledge 実行済み（更新 8 ファイル）
- spec-change: consistency weight 増加（0.25→0.30）
