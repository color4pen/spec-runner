# Design: post-merge-worktree-cleanup

## Context

`job archive --with-merge` が PR merge 後に `runPostMergeCleanup` を呼ぶが、worktree が削除されず残る。
原因は `merge-then-archive.ts` Step 1 の worktreePath 解決が `state.worktreePath ?? null` の生読みで、
フォールバックがない点にある。local 実行では `state.worktreePath` はスキーマ上 optional（`src/state/schema.ts:273`）であり、
legacy state では書き込まれないため常に `null` → worktree 削除ブロックが黙ってスキップされる。

一方、archive 記録経路（`orchestrator.ts`）は `resolveWorktreePathForArchive`（state → liveness sidecar → 規約パスの三段フォールバック）
で worktree を発見できている。掃除経路だけがフォールバックを持たない非対称状態になっている。

症状の逆転：worktree 残存が根本原因だが、ユーザーに見えるのは「feature ブランチ削除失敗」の警告のみ。
worktree がチェックアウト中のため `git branch -D` が拒否されるため。

関連コード：
- `src/core/archive/merge-then-archive.ts:151` — `state.worktreePath ?? null`（問題箇所）
- `src/core/archive/orchestrator.ts:65–89` — `resolveWorktreePathForArchive`（三段フォールバック）
- `src/core/archive/post-merge-cleanup.ts:56` — `if (worktreePath && !noWorktree)`（null で黙殺）

## Goals / Non-Goals

**Goals**:
- `merge-then-archive.ts` の worktreePath 解決を `resolveWorktreePathForArchive` と対称化し、
  `state.worktreePath` 欠如時も sidecar / 規約パスから解決できるようにする
- `post-merge-cleanup.ts` で worktreePath が解決できなかった場合に警告を出す
- 原因（worktree 残存）と症状（ブランチ削除失敗）の逆転を防ぐ

**Non-Goals**:
- `--no-worktree` モードの意味論変更
- `resolveWorktreePathForArchive` 自体のフォールバック段の変更
- merge / archive の状態遷移そのものの変更

## Decisions

### D1: worktreePath 解決を resolveWorktreePathForArchive で対称化する

`merge-then-archive.ts` Step 1（state load ブロック）で `state.worktreePath ?? null` を
`await resolveWorktreePathForArchive(state, cwd)` に置き換える。

**Rationale**: 記録経路（orchestrator）と掃除経路（merge-then-archive）が同じ三段フォールバックを使うことで、
「記録できたのに掃除できない」という非対称が解消される。
フォールバック関数は既に `orchestrator.ts` で定義・テスト済みであり、重複実装は不要。

**代替案**:
- フォールバック関数を `post-merge-cleanup.ts` の中で再実装 → コード重複・保守負担増のため却下
- `resolveWorktreePathForArchive` を専用共有モジュールに抽出 → ファイル増加・変更量増のため、
  `orchestrator.ts` からの再エクスポートで十分と判断

**フォールバック順序（既存の resolveWorktreePathForArchive と同一）**:
1. `state.worktreePath`（state に直接書かれている場合）
2. liveness sidecar（`.specrunner/local/<slug>/liveness.json` の `worktreePath` フィールド）
3. 規約パス（`buildWorktreePath(cwd, slug, jobId)` で導出）

### D2: 解決は liveness sidecar 削除より前に行う

D1 の変更により、解決は Step 1（状態ロード）で行われる。`runPostMergeCleanup` は Step 6（merge 後）または
「既に MERGED + archived」パスで呼ばれる。いずれも sidecar 削除（cleanup 内部）より前に解決が完了するため、
順序制約は自動的に満たされる。

### D3: worktreePath 未解決時の警告

`post-merge-cleanup.ts` の worktree 削除ブロック（`if (worktreePath && !noWorktree)`）で、
`worktreePath` が null かつ `--no-worktree` モードでない場合に `stderrWrite` で警告を出す。

**警告文**（案）:
```
Warning: worktree path could not be resolved for <slug>. Worktree may remain on disk.
Run 'git worktree list' to check and 'git worktree prune' to clean up if needed.
```

**Rationale**: フォールバック三段で解決できなかった場合（slug が null 等の異常状態）にも、
ユーザーへ手動対処の手がかりを提供する。黙殺は根本原因を隠す。

## Risks / Trade-offs

- **[Risk] `buildWorktreePath` は存在確認をしない**: 規約パスが返っても実際に worktree が存在するかは不明。
  → Mitigation: `WorktreeManager.remove` の try/catch が既に存在するため、存在しない場合は無警告で通過する（最悪 ENOENT は無視）。
  存在確認を追加すると先行する sidecar 削除との競合が生じる可能性があるため、現行の best-effort 方針を維持する。

- **[Risk] merge-then-archive.test.ts の orchestrator モックへの影響**:
  現在のモックは `runArchiveOrchestrator` のみ返す factory mock。
  `resolveWorktreePathForArchive` を `merge-then-archive.ts` から import すると、
  モック factory に `resolveWorktreePathForArchive: vi.fn()` を追加しないと `undefined` になる。
  → Mitigation: tasks.md で既存モック更新を明示。

## Open Questions

なし
