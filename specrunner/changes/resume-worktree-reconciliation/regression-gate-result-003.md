# Regression Gate Result — Iteration 003

## Ledger Verification

### Finding: [LOW] staged-new removal kind に実 git テストカバレッジなし

**Status**: FIXED — no regression

**Evidence**:

`tests/resume-worktree-reconciliation-e2e.test.ts` の TC-013 に `staged-new` (X='A') ケースのテストが追加されている（L543–607）。

追加されたテストケースは以下を実施する:
- 実 git リポジトリを作成し、`git add` 済み・未コミットのアーティファクトを残す（commit-push.ts が `git add` 後に kill された状況を再現）
- 前提条件として `git status` が `"A "` を返すことを `assert`
- `reconcileWorktreeArtifacts` 呼び出し後:
  - `result.reconciled` に対象パスが含まれること
  - ワークツリーからファイルが削除されていること
  - `git status` がエントリを報告しないこと（インデックスとワークツリー両方 clean）
  - quarantine evidence に内容が保存されていること

いずれも実 git 操作による検証（モックなし）。
