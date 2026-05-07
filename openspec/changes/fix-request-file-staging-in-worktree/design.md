## Context

worktree-based-job-execution（D3）の設計で、run.ts は以下の手順を踏む:

1. `WorktreeManager.create(cwd, slug, jobId)` — detached HEAD の worktree 作成
2. `fs.cp(absolutePath, worktreeRequestPath)` — request file を worktree にコピー
3. pipeline 実行（propose agent が worktree 内で `git checkout -b <branch>` → commit → push）

ステップ 2 の `fs.cp` は filesystem copy のみで git index を更新しない。propose agent が branch を作成して commit しても、request file は untracked のまま残る。finish の `git mv` は tracked file にしか作用しないため失敗する。

現在の run.ts（L235-239）:

```typescript
const relativeRequestPath = path.relative(cwd, absolutePath);
const worktreeRequestPath = path.join(worktreePath, relativeRequestPath);
await fs.mkdir(path.dirname(worktreeRequestPath), { recursive: true });
await fs.cp(absolutePath, worktreeRequestPath);
```

## Goals / Non-Goals

**Goals:**

- request file を worktree の git index に staging し、propose agent の最初の commit に含まれるようにする
- finish の `git mv` が成功する状態を保証する

**Non-Goals:**

- request file 以外の追加ファイル（openspec change folder 等）の staging（propose agent が自身で commit する）
- `git add` 失敗時のリカバリフロー設計（fail-fast で十分）

## Decisions

### D1: `fs.cp` 直後に `spawnCommand("git", ["add", relativeRequestPath], { cwd: worktreePath })` を実行

**Decision**: `fs.cp` の直後、pipeline 実行前に `git add` を呼ぶ。

staging 対象は `relativeRequestPath`（`specrunner/requests/active/<slug>/request.md` 相当）。cwd は worktree path を指定する。`git -C` ではなく `spawnCommand` の `cwd` option で worktree を指定する（run.ts 内の他の操作と一貫）。

`git add` が非ゼロ exit で返った場合は stderr にエラーを出力し exit 1 で終了する（fail-fast）。worktree 内の `git add` が失敗する状況はリカバリ不能であり、pipeline を開始しても意味がない。

**Rationale**: detached HEAD 状態でも `git add` は正常に動作する（git の index は HEAD の attach 状態に依存しない）。propose agent が後続で `git checkout -b <branch>` を実行すると、index に staged された file がそのまま引き継がれる。agent の最初の `git commit` で request file が commit に含まれる。

**Alternatives considered**:

- **A. propose agent の prompt に `git add` 指示を追加**: agent の行動に依存するため確実性が低い。prompt injection で解決すべき問題ではない
- **B. `git add .` で worktree 全体を staging**: 不要なファイル（`node_modules` 等）を巻き込むリスク
- **C. finish の `git mv` 前に `git add` を追加**: 根本原因の修正にならない。propose agent の commit に request file が含まれないという問題が残る

### D2: `spawnCommand` を run.ts に import して使用

**Decision**: `src/util/spawn.ts` の `spawnCommand` を import する。

run.ts は現在 `spawnCommand` を使用していないが、worktree manager 等の他モジュールでは標準的に使用されている。`child_process.execSync` や `Bun.spawn` は使用しない（プロジェクト規約: `node:child_process.spawn` のみ）。
