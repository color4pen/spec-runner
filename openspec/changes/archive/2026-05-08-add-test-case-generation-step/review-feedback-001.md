# Code Review — add-test-case-generation-step — Iteration 1

## Summary

TestCaseGenStep の実装は既存の AgentStep パターン（implementer, propose）に忠実に従っており、新規ファイル 2 本（step 定義 + system prompt）と遷移テーブル変更の構成が明確。system prompt のセキュリティノート（`<user-request>` injection 防止）、`buildGitPushInstruction` の共通関数利用、completionVerdict パターンの採用など、設計判断はいずれも妥当。テストは buildMessage / parseResult / 遷移テーブル / パイプライン統合の全層をカバーしている。

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 9 | 0.30 | 2.70 |
| security | 9 | 0.25 | 2.25 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 8 | 0.10 | 0.80 |
| **Total** | | | **8.70** |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | maintainability | tests/finish-orchestrator.test.ts:201,690 | `baseBranch` 行の挿入後、`flags: {}` 行のインデントが崩れている（余分なスペース） | `flags:` 行のインデントを周囲と揃える（6 spaces → 6 spaces、現状は 8 spaces） |
| 2 | LOW | maintainability | tests/test-case-gen-step.test.ts:62,98 | 2 つの describe ブロックに同一ラベル `TC-001` が付与されている。構造検証と buildMessage 検証は異なるシナリオ | 2 番目の describe を `TC-001b` または別の TC 番号（例: `TC-001-msg`）にリネーム |
| 3 | LOW | maintainability | src/prompts/test-case-gen-system.ts:49 | `per implemented task` の "implemented" が曖昧（pipeline 上この時点で実装はまだない）。tasks.md に定義されたタスクを指す意図 | `per task defined in tasks.md` に変更 |

## Scenario Coverage

test-cases.md は本 change が生成するファイルであるため、change folder に存在しない（想定通り）。tasks.md の受け入れ基準に対するテストカバレッジを手動評価した。

| 受け入れ基準 | テスト |
|-------------|--------|
| spec-review:approved → test-case-gen | TC-004 (test-case-gen-step.test.ts:166) + pipeline.test.ts:483 |
| test-cases.md が生成される | 設計上エージェントが直接書く。unit test 対象外（適切） |
| test-case-gen → implementer | TC-005 (test-case-gen-step.test.ts:183) |
| error → escalation | TC-006 (test-case-gen-step.test.ts:195) |
| typecheck && test green | verification-result.md: passed (126 files, 1221 tests) |

## Iteration Comparison

N/A (iteration 1)

- **verdict**: approved
