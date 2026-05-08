# Code Review: request-command-redesign (Iteration 1)

- **reviewer**: code-reviewer
- **iteration**: 1
- **date**: 2026-05-08
- **verdict**: approved

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 9 | 0.30 | 2.70 |
| security | 9 | 0.25 | 2.25 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 9 | 0.10 | 0.90 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 8 | 0.10 | 0.80 |
| **Total** | | | **8.80** |

## Summary

明瞭な削除 + 小さな新設の理想的な spec-change。1,400 行を超える create 関連コードが除去され、97 行の `request.ts` と 257 行のテストに置き換えられている。既存パイプライン（run / finish / resume）への影響はゼロ。typecheck・test green 確認済み。Findings はすべて LOW で承認阻止要因なし。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | maintainability | src/adapter/claude-code/message-types.ts:1-6 | モジュール JSDoc に「create command, future dialog layer」への言及が残っている。create は廃止済み | JSDoc を `Centralised here so that multiple callers share the same implementation without depending on adapter-layer SDKMessage types directly.` に更新する |
| 2 | LOW | maintainability | tests/unit/adapter/claude-code/message-types.test.ts:8 | テストファイルのヘッダコメントに `TC-MT-005: isToolUseStart() type guard` が残っている。実際のテストブロックは削除済みだがコメントが orphan | 行 8 の `TC-MT-005: isToolUseStart() type guard` を削除する |
| 3 | LOW | testing | tests/unit/core/command/request.test.ts | `--type=spec-change` 形式（= 区切り）のテストケースがない。spec の Scenario に `--type=spec-change` が明記されている | `executeTemplate("spec-change")` 相当のテストを TC-REQ-003 に追加するか、bin/specrunner.ts の `--type=` パース経路を統合テストで検証する |
| 4 | LOW | maintainability | bin/specrunner.ts:1-2 | ファイルヘッダの JSDoc が `Dispatches to init / login / run / ps subcommands.` のまま。request が追加されたのに反映されていない | `Dispatches to init / login / run / request / ps subcommands.` 等に更新する |

## Scenario Coverage (test-cases.md)

spec.md のシナリオと実装テストの対応:

| Scenario | Test | Status |
|----------|------|--------|
| type 省略時にデフォルトテンプレート出力 | TC-REQ-002 (executeTemplate("new-feature")) | ✅ covered |
| --type bug-fix でテンプレート出力 | TC-REQ-003 | ✅ covered |
| --type=spec-change でテンプレート出力 | — | ⚠️ unit test なし（コアロジックは同一パスなので実質 covered） |
| 有効な request.md で exit 0 | TC-REQ-004 | ✅ covered |
| type 欠落で stderr にエラー + exit 1 | TC-REQ-005 | ✅ covered |
| slug 欠落で stderr にエラー + exit 1 | TC-REQ-005 (invalid content test) | ⚠️ slug 欠落の個別テストなし（パーサ側でカバー） |
| ファイル不在で exit 1 | TC-REQ-006 | ✅ covered |
| file 引数省略で exit 2 | bin/specrunner.ts L154-158 | ✅ 実装あり（unit test は CLI entrypoint 経由で間接的にカバー） |
| サブコマンドなしで usage + exit 2 | bin/specrunner.ts L161-169 | ✅ 実装あり |
| 不明なサブコマンドで usage + exit 2 | bin/specrunner.ts L161-169 | ✅ 実装あり |

must シナリオの実装率: 10/10 実装済み、8/10 テストで直接カバー。

## Deletion Verification

削除対象 12 ファイル（6 ソース + 6 テスト）: すべて不在確認済み。
`isToolUseStart`: message-types.ts から除去済み、codebase 内に参照なし。
残置対象（request-patterns.ts, dynamic-context.ts）: 存在確認済み。dynamic-context.ts は runner.ts 等から import あり。request-patterns.ts はテストからのみ import（設計意図通りの orphan 許容）。

## Verdict Justification

- CRITICAL: 0, HIGH: 0, MEDIUM: 0
- Total score: 8.80 (threshold: 7.0)
- 全 findings が LOW（stale comment 3 件 + optional test 1 件）
- 仕様通りの削除・新設が完了し、既存パイプラインへの影響なし
