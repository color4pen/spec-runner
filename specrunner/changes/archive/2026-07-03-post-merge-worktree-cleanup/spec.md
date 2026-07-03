# Spec: post-merge-worktree-cleanup

## Requirements

### Requirement: post-merge cleanup は worktreePath を三段フォールバックで解決する

`job archive --with-merge` の post-merge cleanup 経路は、worktree パスを
state → liveness sidecar → 規約パス の順に解決しなければならない（SHALL）。
`state.worktreePath` が null / 未設定であっても、sidecar または規約パスから
解決できた場合は worktree 削除を実行しなければならない（MUST）。

#### Scenario: state.worktreePath が null だが sidecar に記録されている

**Given** local ジョブが pr-create まで完走し、liveness sidecar に `worktreePath` が記録されている
**When** `job archive <slug> --with-merge` を実行する
**Then** sidecar から worktreePath が解決され、worktree と feature ブランチが削除される

#### Scenario: state.worktreePath が null で sidecar もないが規約パスが存在する

**Given** `state.worktreePath` が null かつ liveness sidecar が存在しない
**When** `job archive <slug> --with-merge` を実行する
**Then** `buildWorktreePath(cwd, slug, jobId)` で導出した規約パスを worktreePath として cleanup が実行される

---

### Requirement: worktreePath が解決できない場合は警告を出す

worktree モード（`--no-worktree` でない）で worktreePath が null のまま
post-merge cleanup に到達した場合、`runPostMergeCleanup` は警告を stderr に
出力しなければならない（MUST）。黙殺してはならない（MUST NOT）。

#### Scenario: フォールバック三段が全て失敗して worktreePath が null

**Given** `state.worktreePath` が null かつ sidecar が存在しない / jobId 不一致
**Given** `--no-worktree` モードではない
**When** `runPostMergeCleanup` が `worktreePath: null` で呼ばれる
**Then** 「worktree パスが解決できなかった」旨の警告が stderr に出力される
**Then** 手動クリーンアップ手順（`git worktree list` / `git worktree prune`）がガイドとして含まれる

#### Scenario: --no-worktree モードでは警告は出ない

**Given** `noWorktree: true`（`--no-worktree` モードのジョブ）
**Given** `worktreePath: null`
**When** `runPostMergeCleanup` が呼ばれる
**Then** worktree 未解決に関する警告は出ない

---

### Requirement: フォールバック解決は liveness sidecar 削除より前に行う

worktreePath の解決（`resolveWorktreePathForArchive` 呼び出し）は、
liveness sidecar を削除する `runPostMergeCleanup` の呼び出しより前に
完了していなければならない（MUST）。

#### Scenario: 解決後に cleanup が sidecar を削除しても解決済みパスは保持される

**Given** `resolveWorktreePathForArchive` が Step 1（state load）で呼ばれ、パスを返す
**When** `runPostMergeCleanup` が sidecar ファイルを削除する
**Then** 解決済み worktreePath は既に変数として保持されており、削除の影響を受けない
