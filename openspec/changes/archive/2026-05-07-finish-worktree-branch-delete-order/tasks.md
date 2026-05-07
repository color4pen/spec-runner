# Tasks: finish Phase 3 の branch 削除を worktree 削除後に移動する

## T1: Phase 3 から `--delete-branch` を除去

**File**: `src/core/finish/orchestrator.ts`

**Changes**:
1. L394: `mergeArgs` から `"--delete-branch"` を削除

```typescript
// Before (L394)
const mergeArgs = ["pr", "merge", String(prNumber), "--squash", "--delete-branch"];

// After
const mergeArgs = ["pr", "merge", String(prNumber), "--squash"];
```

---

## T2: Phase 4 に branch 削除を追加

**File**: `src/core/finish/orchestrator.ts`

**Location**: Phase 4 の `markJobArchived` 呼び出し（L284-286）の直前

**Changes**:
1. local runtime パス（L226-238）の後、managed mode パス（L239-282）の後、`markJobArchived` の前に branch 削除を追加
2. `target.branch` を使って local + remote branch を削除
3. best-effort: exitCode non-zero でも escalation にしない

```typescript
// Delete feature branch (best-effort, after worktree is freed)
const localDelResult = await spawn("git", ["branch", "-D", target.branch], { cwd });
if (localDelResult.exitCode !== 0) {
  process.stderr.write(`Warning: failed to delete local branch ${target.branch}\n`);
}
const remoteDelResult = await spawn("git", ["push", "origin", "--delete", target.branch], { cwd });
if (remoteDelResult.exitCode !== 0) {
  process.stderr.write(`Warning: failed to delete remote branch ${target.branch}\n`);
}
```

**注意**: `target.branch` は `ResolvedTarget` 型に含まれる。orchestrator の `runFinishOrchestrator` 内で `target` から参照可能。

---

## T3: dry-run 出力を更新

**File**: `src/core/finish/orchestrator.ts`

**Changes**:
1. L429: `mergeStrategy` 文字列を更新

```typescript
// Before (L429)
const mergeStrategy = "gh pr merge --squash --delete-branch";

// After
const mergeStrategy = "gh pr merge --squash";
```

---

## T4: テスト修正

**File**: `tests/finish-orchestrator.test.ts`

**Changes**:

1. `makeHappyPathSpawn` に `git branch -D` と `git push origin --delete` のレスポンス追加:
   - `cmd === "git" && args[0] === "branch" && args[1] === "-D"` → `{ exitCode: 0 }`
   - `cmd === "git" && args[0] === "push" && args[1] === "origin" && args[2] === "--delete"` → `{ exitCode: 0 }`

2. 新規テスト **TC-FIN-BD-001**: Phase 3 の merge コマンドに `--delete-branch` が含まれないことを検証
   ```typescript
   // calls を capture して gh pr merge の args を検証
   const mergeCalls = calls.filter(([c, a]) => c === "gh" && a[0] === "pr" && a[1] === "merge");
   expect(mergeCalls.length).toBe(1);
   expect(mergeCalls[0][1]).not.toContain("--delete-branch");
   ```

3. 新規テスト **TC-FIN-BD-002**: Phase 4 で branch 削除コマンドが呼ばれることを検証
   ```typescript
   const branchDelCalls = calls.filter(([c, a]) => c === "git" && a[0] === "branch" && a[1] === "-D");
   expect(branchDelCalls.length).toBe(1);
   const remoteBranchDelCalls = calls.filter(([c, a]) => c === "git" && a[0] === "push" && a[2] === "--delete");
   expect(remoteBranchDelCalls.length).toBe(1);
   ```

4. 新規テスト **TC-FIN-BD-003**: branch 削除失敗時も exit 0
   - `git branch -D` を `exitCode: 1` で mock
   - `git push origin --delete` を `exitCode: 1` で mock
   - `result.exitCode` が `0` であることを検証

---

## T5: 型チェックとテスト実行

**Command**: `bun run typecheck && bun run test`

**Expected outcome**:
- 型エラーなし
- 全テスト green

---

## タスク依存関係

```
T1 (Phase 3 修正) + T3 (dry-run 修正)  ← 並行可
  ↓
T2 (Phase 4 branch 削除追加)
  ↓
T4 (テスト修正)
  ↓
T5 (typecheck + test)
```

---

## 受け入れ基準の検証手順

### AC1: finish が worktree ありの job で 1 回の実行で完走する
- T1 + T2 の実装により、merge と branch 削除が分離される
- TC-FIN-BD-002 で worktree パスでの branch 削除を検証

### AC2: feature branch が Phase 4 で削除される
- T2 の実装により、worktree 削除後に branch が削除される
- TC-FIN-BD-002 で検証

### AC3: delta spec が `openspec validate` を pass する
- T1-T3 に影響する spec 記述を delta spec で更新済み

### AC4: `bun run typecheck && bun run test` が green
- T5 で検証

---

## 完了条件

- [x] T1: Phase 3 から `--delete-branch` を除去
- [x] T2: Phase 4 に branch 削除を追加
- [x] T3: dry-run 出力を更新
- [x] T4: テスト修正・追加
- [x] T5: `bun run typecheck && bun run test` が green
