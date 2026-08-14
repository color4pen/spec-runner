# Regression Gate Result — archive-flat-draft-cleanup (Iteration 1)

## Evidence

Checked 5 findings from the review ledger against the current branch.

### Finding 1: [MEDIUM] relPath の導出式が tasks.md に明示されていない

**Status: FIXED**

`tasks.md` T-01 に relPath と absPath の導出式が明示されている:

```
- フラット: `relPath = nodePath.join(draftsDir(), slug + ".md")`, `absPath = nodePath.join(cwd, relPath)`
- ディレクトリ: `relPath = nodePath.join(draftsDir(), slug)`, `absPath = nodePath.join(cwd, relPath)`
```

実装 (`orchestrator.ts:263-266`) も同式に基づいた for ループになっており整合している。

---

### Finding 2: [LOW] ディレクトリ形式 tracked draft のシナリオが欠落

**Status: FIXED**

`spec.md` に「tracked なディレクトリ形式 draft が存在する場合」シナリオが追加済み。  
`orchestrator.test.ts:453` に TC-005 として実装されており、`stderrWrite` に Warning が出て `fs.rm` は呼ばれないことを assert している。

---

### Finding 3: [LOW] 両形式同時存在シナリオが欠落

**Status: FIXED**

`spec.md` に「フラット形式とディレクトリ形式が同時に存在する場合、両方を削除する」Requirement と Scenario が追加済み。  
`orchestrator.test.ts:496` に TC-006 として実装されており、両パスで `fs.rm` が呼ばれることを assert している。

---

### Finding 4: [LOW] T-07 命名衝突（pre-existing）

**Status: FIXED**

テストファイル冒頭のコメント (line 15) に `T-10: archived job resolves via includeArchived and returns Already finished` が追記されており、line 517 の実装も `"T-10: archived job resolves via includeArchived and returns Already finished"` として改名されている。T-07 は line 249 の EACCES テスト 1 件のみになり重複は解消した。

---

### Finding 5: [LOW] TC-007 and TC-008 (should-priority) have no explicit test implementations

**Status: STILL PRESENT**

`orchestrator.test.ts` を全探索したが、TC-007 (worktree-side `fs.rm` が呼ばれない) および TC-008 (worktree-side `git add specrunner/drafts` が呼ばれない) に相当する明示的な negative assertion テストは存在しない。

- T-01 / T-09 / TC-001〜TC-006 はすべて cwd パスが rm される**正** assertion であり、FAKE_WORKTREE 配下のパスが rm されないことを保証しない。
- TC-009 は `deferArchivedTransition` のテストであり draft git add とは無関係。

pipeline 設計上 test-materialize は must-priority のみを対象とする (finding 自身もその旨を述べている) ため、これは意図的な未実装である。ただし、worktree-side 処理が再導入された場合に検出する歯がない点は変わらない。

---

## Summary

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | MEDIUM | relPath の導出式が tasks.md に明示されていない | ✅ FIXED |
| 2 | LOW | ディレクトリ形式 tracked draft のシナリオが欠落 | ✅ FIXED |
| 3 | LOW | 両形式同時存在シナリオが欠落 | ✅ FIXED |
| 4 | LOW | T-07 命名衝突（pre-existing） | ✅ FIXED |
| 5 | LOW | TC-007 and TC-008 have no explicit test implementations | ⚠️ STILL PRESENT |
