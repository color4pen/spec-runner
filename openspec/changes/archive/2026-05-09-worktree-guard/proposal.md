# Proposal: worktree-guard

## Why

`specrunner finish` を worktree 内から実行すると、Phase 4 の `git worktree prune` が自分自身の worktree を削除しようとして ENOENT が発生する（PR #142, #145, #147）。`run` / `resume` も worktree 内から実行すると worktree の中に worktree を作るという構造的に壊れた状態になる。

worktree のライフサイクルは main worktree が管理すべきであり、worktree 内のプロセスが自分の足元を操作するのは根本的に危険。現状 `run` / `finish` / `resume` は全て `ps` で取得できる情報を参照するだけなので、worktree 内にいる必要がない。

## What Changes

- `src/core/worktree/detection.ts` を新規作成: `.git` がファイル（worktree）かディレクトリ（main）かで判定するユーティリティ
- `bin/specrunner.ts` のコマンドディスパッチに worktree ガードを追加: `run` / `finish` / `resume` が worktree 内から実行された場合、エラーメッセージで拒否
- `ps` / `doctor` など読み取り専用コマンドは制限しない

## Capabilities

### New Capabilities

なし

### Modified Capabilities

- **cli-commands**: `run` / `finish` / `resume` に worktree 内実行の拒否ガードを追加

## Impact

- **src/core/worktree/detection.ts**: 新規作成 — worktree 検出ユーティリティ
- **bin/specrunner.ts**: worktree ガードチェックの呼び出しを追加
- **src/errors.ts**: `WORKTREE_GUARD` エラーコードを追加
- **tests/**: worktree ガードのユニットテスト追加
- 破壊的変更なし — worktree 内からの不正な実行を拒否するだけ
