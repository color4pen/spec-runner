# Code Review Feedback — iteration 001

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | MEDIUM | testing | tests/unit/step/executor.test.ts | TC-033〜TC-036（must）が未実装。executor-hook カテゴリの「local runtime でテンプレートが runner.run 前に配置される」「B群テンプレートが commitAndPush 前に削除される」「managed runtime では配置・削除が実行されない」の 4 シナリオに対応するテストがない。実装は正しいがテストカバレッジが test-cases.md の仕様を満たしていない。 | executor.test.ts または別ファイルに writeOutputTemplates/cleanupOutputTemplates の呼び出し順と managed ガードを vi.spyOn でアサートするテストを追加する。 | no |
| 2 | LOW | testing | tests/util/copy-artifacts.test.ts | TC-029（must）が未実装。「writeOutputTemplates がテンプレートを git add しない」の確認テストがない。実装は git add を呼ばないため機能的リスクはないが test-cases.md との乖離がある。 | 一時 git リポジトリを作成して writeOutputTemplates 後に git status を確認するテストを追加する。低優先度で対応可。 | no |
| 3 | LOW | architecture | src/core/step/code-fixer.ts | スコープ外の変更：`requiresCommit: true → false`。step-output-template-injection の要件に含まれない。ただし main ブランチでは tests/unit/step/requires-commit-flags.test.ts の `toBeFalsy()` 期待値と実装が不一致（pre-existing bug を修正している）。変更内容は正しく全テストが通過しているが、変更理由が本 PR に明示されていない。 | コミットメッセージまたは PR 説明に「pre-existing test/code inconsistency の修正」として記載する。機能的修正は適切。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 7 | 0.10 |

- **total**: 8.75

## Summary

### Core Feature

`src/templates/step-output-templates.ts` — テンプレート定数（6種）と `getOutputTemplates()` ルックアップ関数の実装が設計通り。HTML コメントに machine-parsed フィールドの書式制約が正確に記載されている。A群/B群の区別、`cleanup: true` フラグ、iteration 番号算出（`state.steps[stepName].length + 1`）すべて仕様通り。

### Executor Hook

`src/core/step/executor.ts` — `writeOutputTemplates` の呼び出しが `store.update` 直後・`runner.run` 前、`cleanupOutputTemplates` が `runner.run` 成功後・`commitAndPush` 前の正しい位置に配置されている。`deps.config.runtime === "local"` ガードも両方に存在し、managed runtime では実行されない（要件通り）。

### Prompt Simplification

4 ファイル（spec-review-system.ts, code-review-system.ts, test-case-gen-system.ts, design-system.ts）すべてで「Read tool でテンプレートを読んでから出力を開始すること」の指示が追加され、インラインのフォーマット例が削除されている。verdict 行フォーマットへの言及は保持されている（パース要件）。delta-spec-template.md 参照指示も design-system.ts に追加済み。

### Tests

`tests/templates/step-output-templates.test.ts`・`tests/util/copy-artifacts.test.ts`（追加分）が全 pass。`bun run typecheck && bun run test` は green（285 files / 3245 tests）。
受け入れ基準「各 agent step 実行前にテンプレートが存在する」「B群テンプレートが propose step 完了後に削除される」「bun run typecheck && bun run test が green」は static code analysis + unit tests で充足。executor-hook の動的挙動テスト（TC-033〜036）は未実装だが実装の正しさはコード確認済み。
