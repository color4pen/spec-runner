# git worktree add の retry で branch already exists に陥る bug を修正

## Meta

- **type**: bug-fix
- **slug**: worktree-retry-branch-fix
- **base-branch**: main
- **adr**: false

## 背景

並列 run 時に `git worktree add -b <branch> <path> <ref>` が lock contention で fail すると、**branch だけ作成されて worktree dir が作成されない**状態になる。retry logic が同じ `-b` option で再試行するため「branch already exists」で永続 fail する。

### 再現経路

```
run A: git worktree add -b branch-A path-A ref → .git/index.lock 取得 → 成功
run B: git worktree add -b branch-B path-B ref → lock 競合 → fail
  ↓
  git 内部: branch-B は作成済 (= rollback されない)、worktree dir は未作成
  ↓
  retry: git worktree add -b branch-B path-B ref → 「branch already exists」 → fail
  ↓
  全 retry 失敗 → WORKSPACE_SETUP_FAILED
```

### 該当箇所

`src/core/worktree/manager.ts:74-94`:

```typescript
const wtArgs = branchName
  ? ["worktree", "add", "-b", branchName, worktreePath, ref]
  : ["worktree", "add", "--detach", worktreePath, ref];

const MAX_RETRIES = 3;
for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
  const wtResult = await spawn("git", wtArgs, { cwd: repoRoot });
  if (wtResult.exitCode === 0) break;
  // ... retry with same wtArgs (= same -b flag)
}
```

## 要件

### 1. retry 時に branch 存在を考慮する

retry の前に branch が既に存在するか確認し、存在すれば `-b` (= 新規作成) ではなく既存 branch を使って worktree を追加する。

具体的な実装方法は **design step で確定**する。

### 2. fail 時の branch cleanup

`git worktree add` が全 retry 失敗した場合、作成済の branch を cleanup する (= 次回 run で衝突しない)。

## スコープ外

- **並列 run の lock contention 自体を防ぐ** — git の排他制御は git の仕様、spec-runner 側で回避するのは別軸
- **worktree manager の全面リファクタリング** — 本 request は retry logic の bug fix のみ

## 受け入れ基準

- [ ] 並列 run で lock contention → retry 時に「branch already exists」で詰まらない
- [ ] 全 retry 失敗後に作成済 branch が cleanup される
- [ ] 既存の単独 run (= lock contention なし) に regression なし
- [ ] branch-already-exists retry path の unit test が存在する
- [ ] 全 retry 失敗後の branch cleanup の unit test が存在する
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **retry 前の branch 存在チェック**: git の `worktree add -b` が branch 作成と worktree dir 作成を atomic に行わない (= branch だけ rollback されない) ことへの workaround。git 仕様の制約なので spec-runner 側で吸収する
