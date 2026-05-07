# Code Review: worktree-branch-creation-and-request-commit (Iteration 1)

- **verdict**: approved
- **iteration**: 1
- **total-score**: 8.55
- **date**: 2026-05-08

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 9 | 0.30 | 2.70 |
| security | 9 | 0.25 | 2.25 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 9 | 0.10 | 0.90 |
| maintainability | 7 | 0.10 | 0.70 |
| testing | 8 | 0.10 | 0.80 |
| **Total** | | | **8.55** |

## Summary

Branch lifecycle の CLI 統一は正しく実装されている。local / managed 両パスで branch 作成 + request.md commit が setupWorkspace() に集約され、propose agent は既存 branch 上で作業するだけのシンプルなモデルになった。register_branch tool の削除も完全で、runtime コード・テスト・プロンプトから一貫して除去されている。1080 tests pass、typecheck clean。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | maintainability | src/errors.ts:148 | `branchNotSetError` の hint が "called register_branch before this step" と削除済み tool を参照している。ユーザーが resume 失敗時にこの hint を見ると混乱する | hint を `"Verify that CLI setup completed successfully before this step."` 等に更新する |
| 2 | MEDIUM | maintainability | src/core/port/agent-runner.ts:63 | `agentBranch` フィールドの JSDoc が "from register_branch tool" と記述しているが tool は削除済み | コメントを `"Agent-reported branch (fallback: unused when CLI pre-sets state.branch)"` 等に更新する |
| 3 | MEDIUM | maintainability | src/core/runtime/managed.ts:54-136 | ManagedRuntime.setupWorkspace() で `git checkout -b` 成功後に push / commit / 2nd push のいずれかが失敗した場合、ローカル branch や remote branch が残る。LocalRuntime は worktree + prune で cleanup しているのと対照的 | managed 環境は dogfooding 専用で影響小だが、少なくとも checkout -b 後の push 失敗時に `git checkout -` + `git branch -D <branchName>` でローカル branch を戻す cleanup を検討する |
| 4 | LOW | architecture | src/core/runtime/strategy.ts:43 | `WorkspaceOptions.requestType` が宣言され `PipelineRunCommand.prepare()` から渡されているが、LocalRuntime も ManagedRuntime も消費していない（branchName は prepare() で既に計算済み）。dead field | 現時点では無害。将来使わないなら削除する |
| 5 | LOW | maintainability | src/core/step/types.ts:50 | toolHandlers の JSDoc が `e.g. "register_branch"` を例示しているが tool は削除済み | 例を現存する tool 名に更新するか、例を削除する |

## Verification

- `bun run typecheck`: clean
- `bun run test`: 117 files, 1080 tests passed
- `register_branch` / `registerBranch` / `onBranchRegistered` の src/ 残存: runtime コードからの参照は全てコメント・JSDoc のみ（実行コードでの参照なし）
- test-cases.md: 未生成（Scenario Coverage 評価不可、testing スコアは実装テストの質から判定）
