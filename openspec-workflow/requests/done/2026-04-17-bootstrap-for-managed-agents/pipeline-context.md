# Pipeline Context

## Paths

- **request-md**: requests/active/2026-04-17-bootstrap-for-managed-agents/request.md
- **request-path**: requests/active/2026-04-17-bootstrap-for-managed-agents
- **change-folder**: openspec/changes/2026-04-17-bootstrap-for-managed-agents/
- **slug**: 2026-04-17-bootstrap-for-managed-agents

## Type

- **type**: new-feature
- **branch**: feat/2026-04-17-bootstrap-for-managed-agents

## Impact Checks

- **spec**: yes
- **security**: no
- **data-model**: yes
- **public-api**: no

## Step Execution

| Step | Execute | Reason |
|------|---------|--------|
| 1 初期化 | yes | 常に実行 |
| 2 設計 | yes | 常に実行 |
| 3 仕様レビュー | yes | spec=yes |
| 3.5 テストケース生成 | yes | spec=yes, data-model=yes |
| 4 実装 | yes | 常に実行 |
| 5a 仕様整合性検証 | yes | spec=yes |
| 5b 品質検証 | yes | 常に実行 |
| 6 コードレビュー | yes | 常に実行 |
| 7 ADR生成 | yes | new-feature かつ spec=yes, data-model=yes |
| 8 アーカイブ | yes | spec=yes |
| 9 PR作成 | yes | 常に実行 |

## Spec Review Configuration

- **agents**: architect, spec-reviewer, security-reviewer
- **emphasis**: 既存 spec との整合性・後方互換性（spec=yes）、データ整合性・マイグレーション戦略・外部キー・制約（data-model=yes）
- **result**: requests/active/2026-04-17-bootstrap-for-managed-agents/spec-review-result-{NNN}.md

## Test Case Generation

- **must-areas**: データ整合性（一意制約、外部キー、トランザクション境界）（data-model=yes）

## Code Review Configuration

- **emphasis**: クエリ安全性、トランザクション処理、N+1 問題（data-model=yes）

## Shared Resources

- **constraints**: docs/constraints.md
- **review-lessons**: docs/review-lessons.md
- **learned-patterns**: docs/learned-patterns.md

## Notes

- depends-on の前フェーズ（2026-04-16-phase1-managed-agents-poc）に implementation-notes.md / review-feedback は存在しなかった
- learned-patterns.md から Phase 2 の教訓を読み込み済み: IDOR パターン、N+1 クエリ、リスト API ページネーション、状態遷移ルール明記
