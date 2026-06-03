---
name: rebase-finish
description: >-
  完走済 request を順次 archive して main にマージする。各 archive の前に worktree 内で手動 rebase が必要。
  「rebase しながら archive」「順次 merge」「3 件 archive」と言われたら使うこと。
  spec-runner project 専用 (= `bun ./bin/specrunner.ts job archive` 前提)。
---

# rebase-finish — 順次 archive + 手動 rebase + merge

`parallel-request-workflow` で完走させた複数 PR を、main の進行に追随して順次 archive する。
**`archive` は内部で rebase を行わない**。各 archive の前に worktree 内で `git fetch origin main` + `git rebase origin/main` を手動で実行する必要がある。

## When to Activate

- 「rebase しながら archive」「順次 merge」「複数 PR を片付けて」等の依頼
- `parallel-request-workflow` 完走 → `acceptance-and-issue-audit` 通過後の次フェーズ

## 前提条件チェック

```bash
# cwd が main worktree であることを確認 (= worktree 内では archive 不可)
git rev-parse --show-toplevel
# → spec-runner ルートであること、.git/specrunner-worktrees/ 配下でないこと

# 対象 PR の状態を確認
gh pr list --state open --json number,title,headRefName
```

## ワークフロー

### 1. 各 PR の archive 直前に worktree 内で rebase

`archive` は rebase しないため、各 PR の archive 前に **手動で main の最新を取り込む必要がある**。

```bash
# 該当 worktree に移動
cd .git/specrunner-worktrees/<slug>-<job-id>

# main 最新を取り込む
git fetch origin main
git rebase origin/main

# 衝突あれば解消 → git rebase --continue
# 衝突なければそのまま push
git push --force-with-lease origin HEAD:<branch-name>

# main worktree に戻る
cd ~/Documents/GitHub/spec-runner
```

これを怠ると **squash merge 時に PR branch の古い状態がそのまま main に取り込まれ、後続 PR の変更を踏み潰す or build 壊れる**。

### 2. PR の merge（GitHub 上または --with-merge オプション）

GitHub 上で PR を merge するか、`--with-merge` オプションを使う:

```bash
# --with-merge: CLEAN になるまで待って merge → archive を一気通貫で実行
bun ./bin/specrunner.ts job archive --with-merge <slug>
```

merge 済みの PR に対して archive のみ実行する場合:

```bash
bun ./bin/specrunner.ts job archive <slug>
```

`job archive` の内部処理:
1. Phase 0 pre-flight (= job state load + finishable gate)
2. Phase 1 main checkout → change folder を archive へ移動、archive commit → git push origin main
3. Phase 2 worktree 撤去 + feature branch 削除（best-effort）
4. Phase 3 job status を archived に更新

`--with-merge` 指定時は上記の前に merge フェーズが追加される:
1. PR status 確認 → 既に MERGED なら archive のみ実行
2. mergeStateStatus polling → CLEAN なら squash merge
3. BLOCKED / UNSTABLE / DIRTY なら escalation で停止

成功時の出力:
```
PR #<num> merged successfully.   # --with-merge 時のみ
Phase 1: archiving on main...
Pushed main to origin.
Phase 2: cleaning up worktree...
Phase 3: updating job status...
Job <jobId> marked as archived.
```

### 3. 次の PR の archive 前に main 最新化 + rebase

1 件完了後、`git pull --ff-only` で main 最新化 → 次の PR の worktree で **再度 rebase** → archive。

```bash
git pull --ff-only

# 次の worktree で rebase
cd .git/specrunner-worktrees/<next-slug>-<next-id>
git fetch origin main
git rebase origin/main
git push --force-with-lease origin HEAD:<branch-name>
cd ~/Documents/GitHub/spec-runner

# 次の archive
bun ./bin/specrunner.ts job archive <next-slug>
```

### 4. 失敗時の対応

#### 4.1 rebase 衝突

worktree 内で衝突解消 → `git add` + `git rebase --continue` → `git push --force-with-lease origin HEAD:<branch>` → main worktree に戻って archive 再実行。

衝突解消は openspec-workflow の `conflict-resolver` skill 起動も検討可。

#### 4.2 BLOCKED / UNSTABLE でエスカレーション

`--with-merge` 指定時に `mergeStateStatus was BLOCKED` の場合は branch protection 要件未充足。required check が通るまで待ってから再実行。

### 5. 全件完了後の後処理

```bash
# main 最新化
git pull --ff-only

# build 通過確認
bun run build
```

## 重要規律

- **archive は main worktree からのみ実行可能**: worktree 内で実行すると `Error: This command cannot be run from inside a worktree.` で halt
- **archive は rebase を行わない**: 並列 PR の順次 archive では **手動 rebase が必須**、これを怠ると後続 PR が前の PR の変更を踏み潰す or main で build 壊れる
- merge 自体は本 skill 起動時点でユーザー明示承認済の前提だが、escalation 中は判断仰ぐ

## Escalation

- rebase 衝突で意味的に矛盾 (= 両側の意図が両立しない) → 報告 + 判断仰ぐ
- PR の CI 失敗で merge 不能 → 報告 + 判断仰ぐ
- ユーザーが「待って」「確認したい」と言った → 即停止

## Related

- skill `parallel-request-workflow` (= 本 skill の前フェーズ)
- skill `acceptance-and-issue-audit` (= archive 前後の事後監査)
- memory `reference_specrunner_run_runbook` (= run / archive の標準手順詳細)
- memory `feedback_explicit_merge_approval`
- memory `feedback_no_naive_hotfix`
- memory `feedback_review_after_rebase`
