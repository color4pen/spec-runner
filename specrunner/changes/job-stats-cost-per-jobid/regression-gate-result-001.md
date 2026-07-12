# Regression Gate Result — Iteration 001

- **verdict**: needs-fix

## Summary

台帳の 1 件（`JobStateStore` モックに `listWithSourceDirs` がない）は**未修正**。
`src/cli/__tests__/view-commands-worktree-guard.test.ts` は git diff main...HEAD に現れておらず、ファイルは変更されていない。

---

## Finding: 回帰あり

### [MEDIUM] JobStateStore モックに `listWithSourceDirs` が含まれず、assertion が空振りになる

- **File**: src/cli/__tests__/view-commands-worktree-guard.test.ts:22
- **Resolution**: fixable
- **Status**: ❌ 未修正（regression）

#### 検証根拠

1. `git diff main...HEAD -- src/cli/__tests__/view-commands-worktree-guard.test.ts` → 出力なし（変更なし）
2. ファイル L22–27 のモック定義は現在も以下のまま：
   ```ts
   vi.mock("../../store/job-state-store.js", () => ({
     JobStateStore: {
       list: vi.fn().mockResolvedValue([]),
       resolveId: vi.fn(),
     },
   }));
   ```
   `listWithSourceDirs` が存在しない。
3. `job-stats.ts` は本 branch で `JobStateStore.list` → `JobStateStore.listWithSourceDirs` に切り替え済み（`git diff main...HEAD -- src/core/command/job-stats.ts` で確認）。
4. `view-commands-worktree-guard.test.ts` の worktree guard テスト（L100–103）は worktree 早期リターンのため通過するが、`expect(mockList).not.toHaveBeenCalled()` は `runJobStats` が `list` をそもそも呼ばなくなったことによる空振り pass。
5. 非 worktree 正常系で `runJobStats` を呼ぶテストを追加すると `TypeError: listWithSourceDirs is not a function` で即死する状態が継続している。

#### 必要な修正

`vi.mock` の `JobStateStore` 定義に `listWithSourceDirs: vi.fn().mockResolvedValue([])` を追加し、
L100–103 の assertion を `expect(mockList).not.toHaveBeenCalled()` から `listWithSourceDirs` の呼ばれないことを確認するよう修正する。
また、`isSpecrunnerWorktree: false` の正常系テストに `runJobStats` のケースを追加して guard 不変条件を実際に検証できるようにする。
