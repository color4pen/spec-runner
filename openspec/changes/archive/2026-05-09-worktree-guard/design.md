# Design: worktree-guard

## Context

specrunner は `run` コマンドで git worktree を作成し、その中でエージェントを実行する。worktree 内から `finish` を実行すると `git worktree prune` が自分自身を削除しようとして ENOENT になる。`run` / `resume` も worktree 内から実行すると二重 worktree になり壊れる。

検出は単純: git worktree では `.git` がファイル（`gitdir: ...` を含む）であり、main worktree では `.git` がディレクトリ。

## Goals / Non-Goals

**Goals:**
- `run` / `finish` / `resume` が worktree 内から実行された場合、早期に拒否する
- エラーメッセージで main worktree パスを案内する
- `ps` / `doctor` など読み取り専用コマンドは制限しない
- テストで検出ロジックとガードの動作を検証する

**Non-Goals:**
- `finish` の `worktree prune` ロジック自体の修正
- 新規コマンドの追加
- worktree 自体の管理改善

## Decisions

### D1: 検出ロジックの配置

`src/core/worktree/detection.ts` に純粋関数として実装する。既存の `src/core/worktree/manager.ts` とは責務が異なる（manager は worktree の作成・削除、detection は現在の実行環境の判定）。

**理由**: worktree/ ディレクトリに集約することで発見しやすく、manager.ts とは独立してテスト可能。

### D2: ガードの挿入箇所

`bin/specrunner.ts` のコマンドディスパッチ直前でガードする。ガード対象コマンドを `Set` で管理し、対象コマンドの handler 呼び出し前にチェックする。

**代替案**: 各コマンド（run.ts, finish.ts, resume.ts）の冒頭でチェックする案。しかしコマンドごとに同じチェックを書くのは DRY 違反であり、新しいガード対象コマンドの追加時に漏れるリスクがある。エントリポイントで一元管理する方が安全。

### D3: `.git` の判定方法

`fs.stat()` で `.git` パスを確認し、`isFile()` なら worktree、`isDirectory()` なら main worktree と判定する。`.git` ファイルの中身（`gitdir: <path>`）をパースして main worktree のパスを取得し、エラーメッセージに含める。

**理由**: git の仕様で worktree の `.git` は必ずファイルであり、この判定は堅牢。`gitdir:` の行をパースすれば main worktree のパスも案内できる。

### D4: エラーコードとメッセージ

`src/errors.ts` に `WORKTREE_GUARD` エラーコードを追加。SpecRunnerError で投げ、既存のエラーハンドリングに乗せる。

```
Error: This command cannot be run from inside a worktree.
Hint: Run from the main worktree: cd <main-worktree-path>
```

## Risks / Trade-offs

- **Risk**: `.git` が存在しない環境での誤動作 → `stat` が ENOENT を返す場合は「main worktree 扱い」にしてガードしない。既存の `NOT_GIT_REPO` チェック（preflight）が後段で拾う
- **Risk**: シンボリックリンク等で `.git` の形態が変わるケース → git の仕様上 worktree の `.git` は必ずファイル。symlink の場合は stat が follow するので問題ない
