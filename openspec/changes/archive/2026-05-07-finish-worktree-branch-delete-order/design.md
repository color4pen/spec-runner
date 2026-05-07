# Design: finish Phase 3 の branch 削除を worktree 削除後に移動する

## 設計方針

merge と branch 削除を分離し、branch 削除を worktree が解放された Phase 4 に移動する。

**設計原則**:
1. **関心の分離**: Phase 3 は merge のみ、Phase 4 は cleanup（worktree + branch）
2. **Best-effort branch 削除**: branch 削除失敗は finish 全体を fail させない（merge は成功済み）
3. **両モード対応**: local runtime（worktree あり）と managed mode（worktree なし）の両方で動作

## コンポーネント設計

### 1. Phase 3: mergeFeaturePrPhase3() の修正

**File**: `src/core/finish/orchestrator.ts` (L394)

```typescript
// Before
const mergeArgs = ["pr", "merge", String(prNumber), "--squash", "--delete-branch"];

// After
const mergeArgs = ["pr", "merge", String(prNumber), "--squash"];
```

merge のみに専念。branch 削除は Phase 4 に委譲。

### 2. Phase 4: branch 削除の追加

**File**: `src/core/finish/orchestrator.ts` (Phase 4 セクション)

worktree 削除後、markJobArchived 前に branch 削除を実行。

```typescript
// After worktree remove (local) or after checkout main + pull (managed)
// Delete feature branch — best-effort, don't fail finish
try {
  await spawn("git", ["branch", "-D", target.branch], { cwd });
} catch {
  // Branch may already be deleted by gh or by remote
}
try {
  await spawn("git", ["push", "origin", "--delete", target.branch], { cwd });
} catch {
  // Remote branch may already be deleted
}
```

**best-effort の理由**:
- merge は Phase 3 で成功済み。branch 削除は cleanup 操作
- remote branch は GitHub が merge 時に自動削除する設定の場合がある
- local branch は worktree prune 後に存在しない可能性がある

**エラーハンドリング**: `spawn` の exitCode が non-zero でも escalation にしない。stderr に warning を出力するのみ。

### 3. Phase 4 での branch 削除位置（local runtime vs managed）

| mode | 実行順 |
|------|-------|
| local runtime (worktreePath set) | worktree remove → prune → **branch delete** → markJobArchived |
| managed (worktreePath null, on main) | checkout main → pull → **branch delete** → markJobArchived |
| managed (linked worktree, not main) | skip checkout/pull → **branch delete** → markJobArchived |

branch 削除は `markJobArchived` の直前に統一的に配置する。両モードの分岐の後、共通パスとして実行。

### 4. dry-run 出力の更新

**File**: `src/core/finish/orchestrator.ts` (L429)

```typescript
// Before
const mergeStrategy = "gh pr merge --squash --delete-branch";

// After
const mergeStrategy = "gh pr merge --squash";
```

spec の `merge-strategy` field も `squash` に変更（`squash+delete-branch` → `squash`）。

### 5. MERGED resume path への影響

PR が MERGED 状態で resume する場合、Phase 1-3 skip で Phase 4 のみ実行される。この場合 branch は既に存在しない可能性が高いが、best-effort で削除を試みるので問題なし。

## テスト設計

### 既存テストへの影響

- `makeHappyPathSpawn` に `git branch -D` と `git push origin --delete` のレスポンスを追加
- TC-123（normal success flow）: branch 削除コマンドが Phase 4 で呼ばれることを検証
- TC-WT-FIN-001: worktree remove 後に branch 削除が呼ばれることを検証

### 新規テストケース

- **TC-FIN-BD-001**: Phase 3 の merge args に `--delete-branch` が含まれないことを検証
- **TC-FIN-BD-002**: Phase 4 で `git branch -D` と `git push origin --delete` が呼ばれることを検証
- **TC-FIN-BD-003**: branch 削除失敗時に finish が exit 0 で完走することを検証（best-effort）

## リスク分析

| リスク | 影響度 | 対策 |
|--------|--------|------|
| GitHub の auto-delete branch 設定との重複 | なし | best-effort なので remote 削除が先行しても問題なし |
| managed mode で checkout main 後に branch -D 実行 | なし | main に切り替え済みなので branch は free |
| MERGED resume で branch が既に不在 | なし | best-effort で失敗を無視 |
