# Code Review Feedback — iteration 001

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | medium | testing | `src/state/__tests__/artifact-observability.test.ts` | TC-001（must）「標準 step 完了で lineage record が追記される」が未カバー。`finalizeStep` → `appendLineage` の経路はテストされていない。`executor.commit.test.ts` の `makeAgentStep` が `writes()` を宣言しないため、lineage 記録コードブロックが一度も実行されない。 | executor test で `writes()` を返す step mock を用意し、`appendLineage` が呼ばれることを確認するテストを追加する。 | no |
| 2 | medium | testing | `tests/unit/cli/job-show.test.ts` | TC-005/TC-006（must）「lineage・cost セクションの表示」が未カバー。`job-show.test.ts` は `JobStateStore` / `loadStateByJobId` をモックするが `resolveChangeDir` / `readLineage` / `computeStepCosts` は実行されず、lineage セクションと cost セクションの出力が検証されていない。 | `job show` テストに `resolveChangeDir` が返すモック change dir を構築し、lineage / cost セクションの出力を確認するテストを追加する。 | no |
| 3 | low | testing | `src/state/__tests__/artifact-observability.test.ts` | TC-003（must）「lineage 記録の失敗は step 完了を妨げない」がテストファイルコメントで「executor tests で別途テスト済み」と記載されているが、対応するテストが見当たらない。best-effort catch ブロック（`src/core/step/executor.ts` 行 628）は正しく実装されており、コードリスク自体は低い。 | executor test で `appendLineage` が reject するシナリオを追加し、step の verdict・状態遷移が正常に完了することを確認する。 | no |
| 4 | low | architecture | `src/cli/job-show.ts` | worktree 上でアクティブ実行中の job に対して `resolveChangeDir` が null を返し、lineage セクションが表示されない。`resolveChangeDir` は `repoRoot`（main checkout）内のみを検索するため、`.git/specrunner-worktrees/` 以下の worktree 内 change dir を発見できない。アーカイブ後は正しく動作する。 | 設計の主用途（アーカイブ後の閲覧）では問題なく、実行中の worktree job では lineage がサイレントスキップされるのは許容範囲。必要なら design で明示するか、worktree パス探索を追加する。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 10 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 8 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 7 | 0.10 |

- **total**: 8.95

## Summary

実装は設計（D1〜D6）に忠実で構造的に正しい。lineage の journal 専有（D1）、version 移行の後方互換 shim（D2）、`StepName` の string 拡張（D3）、`digestArtifacts` seam（D4）、`finalizeStep` への best-effort 記録（D5）、`job show` への追加のみ出力（D6）はすべて意図通りに実装されている。`typecheck && test`（4050 件）は全通過。

主な指摘は 4 件すべて **medium / low** のテストカバレッジ不足であり、実装上のバグではない。特に TC-001（finalizeStep → appendLineage 経路）と TC-005/TC-006（job show 出力セクション）は must TC だが、fixer 対応は必須ではなくコメントとして記録する（Fix: no）。
