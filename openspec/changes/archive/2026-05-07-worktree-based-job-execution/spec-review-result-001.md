# Spec Review Result — worktree-based-job-execution

- **iteration**: 1
- **date**: 2026-05-07
- **verdict**: needs-fix
- **reviewed**: proposal.md, design.md, tasks.md

## Summary

設計の方向性は正しく、既存コードベースの問題を的確に捉えている。しかし D1/D3 の worktree 作成コマンドに git の制約上動作しない記述があり、interface 定義にもパラメータ不足がある。これらは実装を阻害する。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | correctness | design.md:40, tasks.md:4 | `git worktree add -B main <path> origin/main` は main が既に checkout 済みのため失敗する。git は同一 branch を複数 worktree で checkout できない | 初期 worktree は `git worktree add --detach <path> HEAD` で作成し、propose step が `git checkout -B <feature-branch>` で切り替える方式に統一する。D1 の create() も branch=null 時は detach モードを使う分岐を明記する |
| 2 | HIGH | consistency | design.md:74-76 | D3 が 2 つの解決策を「または」で併記し未決定。tasks.md:16 は前者を選択済みだが design.md が未更新 | design.md の D3 を tasks.md と整合させ、選択した方式（main HEAD detach → propose 完了後に branch 切り替え）を唯一の方式として記述する |
| 3 | MEDIUM | completeness | design.md:33-37, tasks.md:4 | D1 の `create(repoRoot, branch, jobId)` に slug パラメータがないが、worktree path は `<slug>-<jobId-short>` を使う。slug の供給元が未定義 | `create` の signature に `slug: string` を追加するか、jobId から slug を導出する方法を明記する |
| 4 | MEDIUM | completeness | design.md:103-106, tasks.md:49 | D6 の managed mode fallback（worktreePath=null 時に temp worktree 作成）は既存 managed mode フロー（main cwd checkout）と異なる新規コードパス。managed mode のテスト戦略が tasks.md に不足 | tasks.md Phase 4 に managed mode の finish が worktreePath=null で既存動作を維持するテストケースを追加する。fallback が新規 temp worktree ではなく既存フローの維持であることを設計で明確化する |
| 5 | MEDIUM | feasibility | design.md:143 | disk 使用量リスクに `bun install --frozen-lockfile` の所要時間が未記載。プロジェクト規模によっては 10-30 秒の pipeline 遅延が発生する | Risks に時間コストの見積もりを追記し、許容範囲であることを明示する（または warm cache 前提の実測値） |
| 6 | LOW | completeness | tasks.md:17 | Task 2.1 の「request file を worktree にコピー」の対象が曖昧。request.md 単体か、openspec/changes/\<slug\>/ 全体か、specrunner/requests/ も含むか | コピー対象のファイル/ディレクトリを具体的に列挙する |

## Verdict Rationale

Finding #1 は `git worktree add -B main` が git の制約で確実に失敗するため HIGH。Finding #2 は設計文書と実装タスクの不整合で実装者が判断に迷うため HIGH。CRITICAL: 0, HIGH: 2 により verdict は **needs-fix**。
