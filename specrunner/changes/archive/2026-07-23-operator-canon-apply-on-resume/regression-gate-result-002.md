# Regression Gate Result — Iteration 2

**Change**: operator-canon-apply-on-resume  
**Date**: 2026-07-23  
**Findings verified**: 4 (all confirmed fixed, 0 regressions)

---

## Evidence

### Finding 1 (HIGH): `git add -A` 単体による non-canon ファイルの index 汚染

**File**: `src/core/resume/apply-canon.ts`

**Verification**: `commitOperatorCanon` の step 1 は `["add", "-A", "--", ...paths]` を使用している（line 121）。
pathspec (`--` + `paths`) が `-A` のスコープを canon パスのみに限定しているため、non-canon ファイルは index にステージされない。
コメント（lines 113–117）にも「bare `git add -A` を避ける理由 = index-pollution laundering」が明記されている。

**Status**: FIXED — regression なし

---

### Finding 2 (MEDIUM): TC-013 が staged 状態と untracked 状態を区別せず index 汚染を検出しない

**File**: `src/core/resume/__tests__/apply-canon.test.ts`

**Verification**: TC-013「non-canon file remains dirty in worktree」テスト（line 325）は:
1. 既存の `git status --porcelain` による存在確認（line 340）を保持
2. **追加されたアサーション**（lines 346–353）: `git diff --cached --name-only` を実行し、
   `NON_CANON_PATH` が staged set に含まれないことを明示的に固定

```ts
const stagedResult = spawnSync("git", ["diff", "--cached", "--name-only"], ...);
const stagedFiles = stagedResult.stdout.trim().split("\n").filter(Boolean);
expect(stagedFiles, "non-canon file must NOT be staged in the index ...").not.toContain(NON_CANON_PATH);
```

**Status**: FIXED — regression なし

---

### Finding 3 (LOW): TC-016 に `applyCanon: true` が欠落し warning パスが未テスト / 残留コメント

**File**: `src/core/command/__tests__/resume-apply-canon.test.ts`

**Verification**:
- TC-016 の 3 つのサブテスト（lines 417, 436, 462）はすべて options に `applyCanon: true` を含む
- 「warning が stderr に出力される」サブテスト（line 436）は `stderrWrite` の呼び出しを検査し、
  `--apply-canon` + `warning` を含むメッセージが存在することをアサート（lines 451–459）
- 「will be added by T-02」という残留コメントは存在しない（`grep` で確認済み）

```ts
const hasWarning = stderrMessages.some((msg) =>
  msg.includes("--apply-canon") && msg.toLowerCase().includes("warning"),
);
expect(hasWarning, "stderr must contain a Warning mentioning --apply-canon when worktree is absent").toBe(true);
```

**Status**: FIXED — regression なし

---

### Finding 4 (MEDIUM): exit-128 carve-out が統合レベルで未文書化・未テスト

**File**: `src/core/command/resume.ts:274–283` および `__tests__/resume-apply-canon.test.ts:489–578`

**Verification**:
- `prepare()` の exit-128 carve-out は lines 274–283 に実装済みで、コメントで明示（「non-git directory cannot have git-tracked dirty files; treat as clean」）
- TC-019（lines 489–578）が統合レベルで 3 点を固定:
  1. `detectCanonDirtyPaths` が "exit 128" エラーを throw → `prepare()` は throw しない
  2. `detectCanonDirtyPaths` が "exit 1"（非 128）エラーを throw → `prepare()` は throw する（fail-closed）
  3. exit-128 carve-out 時に `commitOperatorCanon` が呼ばれない（clean 扱い）
- これにより TC-012（unit レベルで常に throw）と `prepare()` の条件付き挙動の不一致が可視化された

**Status**: FIXED — regression なし

---

## Summary

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | HIGH | `git add -A` による index 汚染 | FIXED |
| 2 | MEDIUM | TC-013 が staged/untracked を区別せず | FIXED |
| 3 | LOW | TC-016 の `applyCanon: true` 欠落 + 残留コメント | FIXED |
| 4 | MEDIUM | exit-128 carve-out の統合テスト不在 | FIXED |

4 件全件修正確認。regression なし。contradiction なし。
