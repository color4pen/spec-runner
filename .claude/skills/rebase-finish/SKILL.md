---
name: rebase-finish
description: >-
  完走済 request を順次 finish して main にマージする。各 finish の前に worktree 内で手動 rebase が必要。
  「rebase しながら finish」「順次 merge」「3 件 finish」と言われたら使うこと。
  spec-runner project 専用 (= `bun ./bin/specrunner.ts finish` 前提)。
---

# rebase-finish — 順次 finish + 手動 rebase + merge

`parallel-request-workflow` で完走させた複数 PR を、main の進行に追随して順次 finish + merge する。
**`finish` は内部で rebase を行わない**。各 finish の前に worktree 内で `git fetch origin main` + `git rebase origin/main` を手動で実行する必要がある。

## When to Activate

- 「rebase しながら finish」「順次 merge」「複数 PR を片付けて」等の依頼
- `parallel-request-workflow` 完走 → `acceptance-and-issue-audit` 通過後の次フェーズ

## 前提条件チェック

```bash
# cwd が main worktree であることを確認 (= worktree 内では finish 不可)
git rev-parse --show-toplevel
# → spec-runner ルートであること、.git/specrunner-worktrees/ 配下でないこと

# 対象 PR の状態を確認
gh pr list --state open --json number,title,headRefName
```

## ワークフロー

### 1. 各 PR の finish 直前に worktree 内で rebase

`finish` は rebase しないため、各 PR の finish 前に **手動で main の最新を取り込む必要がある**。

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

### 2. finish 実行

```bash
bun ./bin/specrunner.ts finish <slug>
```

finish の内部処理:
1. Phase 0 pre-flight checks (= mergeable / PR status)
2. Phase 1 archive on feature branch (= delta spec を baseline に merge、archive 移動)
3. Phase 2 git push (= feature branch を origin に push)
4. Phase 3 PR merge (= squash merge)
5. Phase 4 finalize (= job state を archived に更新)

成功時の出力:
```
PR #<num> merged successfully.
Job <jobId> marked as archived.
```

### 3. 次の PR の finish 前に main 最新化 + rebase

1 件完了後、`git pull --ff-only` で main 最新化 → 次の PR の worktree で **再度 rebase** → finish。

```bash
git pull --ff-only

# 次の worktree で rebase
cd .git/specrunner-worktrees/<next-slug>-<next-id>
git fetch origin main
git rebase origin/main
git push --force-with-lease origin HEAD:<branch-name>
cd ~/Documents/GitHub/spec-runner

# 次の finish
bun ./bin/specrunner.ts finish <next-slug>
```

### 4. 失敗時の対応

#### 4.1 spec-merge escalation

```
=== specrunner finish: escalation ===
Failed Step:    spec-merge
Detected State: [<capability>] MODIFIED: Requirement "..." cannot apply to non-existent baseline
```

原因の典型例:

- 新規 capability に MODIFIED Requirements (= 全 Requirement を ADDED に統合)
- 既存 capability の MODIFIED header が baseline と不一致 (= baseline と完全一致するよう header 修正)
- REMOVED Requirements の対象が baseline に不在 (= 該当 Requirement を REMOVED から外す)
- RENAMED の old → new が baseline と不整合 (= old name を baseline の実 header と一致させる)
- **self-referential format incompatibility** (= delta spec format を変える PR で、main の spec-merge が PR の format を読めない / 逆も)

手動修正手順:

```bash
# 1. worktree 内で delta spec を編集
cd .git/specrunner-worktrees/<slug>-<job-id>
# 該当ファイル: specrunner/changes/<slug>/specs/<capability>/spec.md を編集

# 2. commit + push
git add specrunner/changes/<slug>/specs/<capability>/spec.md
git commit -m "<修正内容を簡潔に>"
git push --force-with-lease origin HEAD:<branch-name>

# 3. main worktree に戻って finish 再実行
cd ~/Documents/GitHub/spec-runner
bun ./bin/specrunner.ts finish <slug>
```

#### 4.2 rebase 衝突

worktree 内で衝突解消 → `git add` + `git rebase --continue` → `git push --force-with-lease origin HEAD:<branch>` → main worktree に戻って finish 再実行。

衝突解消は openspec-workflow の `conflict-resolver` skill 起動も検討可。

#### 4.3 PR status UNKNOWN retry

`mergeStateStatus was UNKNOWN (attempt 1/3)` は GitHub 側メタデータ計算待ち。finish が内部で自動 retry (= 最大 3 回) するのでそのまま待つ。

### 5. 全件完了後の後処理

```bash
# active 配下の残骸削除 (= finish が active/<slug>/ を merged/ に move するが、ローカル untracked が残ることがある)
ls specrunner/requests/active/
# 残骸があれば
rm -rf specrunner/requests/active/<slug>

# main 最新化
git pull --ff-only

# build 通過確認
bun run build
```

## 重要規律

- **finish は main worktree からのみ実行可能**: worktree 内で実行すると `Error: This command cannot be run from inside a worktree.` で halt
- **finish は rebase を行わない**: 並列 PR の順次 finish では **手動 rebase が必須**、これを怠ると後続 PR が前の PR の変更を踏み潰す or main で build 壊れる
- merge 自体は本 skill 起動時点でユーザー明示承認済の前提だが、escalation 中は判断仰ぐ

## Escalation

- spec-merge escalation で原因が典型例に該当しない → 報告 + 判断仰ぐ
- rebase 衝突で意味的に矛盾 (= 両側の意図が両立しない) → 報告 + 判断仰ぐ
- PR の CI 失敗で merge 不能 → 報告 + 判断仰ぐ
- ユーザーが「待って」「確認したい」と言った → 即停止

## Related

- skill `parallel-request-workflow` (= 本 skill の前フェーズ)
- skill `acceptance-and-issue-audit` (= finish 前後の事後監査)
- memory `reference_specrunner_run_runbook` (= run / finish の標準手順詳細)
- memory `feedback_explicit_merge_approval`
- memory `feedback_no_naive_hotfix`
- memory `feedback_review_after_rebase`
