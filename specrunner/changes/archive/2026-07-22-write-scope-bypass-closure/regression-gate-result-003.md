# Regression Gate Result — Iteration 3

**Change**: write-scope-bypass-closure  
**Date**: 2026-07-22

## Evidence

### Finding 1 — TC-011 halt アサーションの条件付きスキップ
**File**: tests/unit/step/write-scope-bypass-closure.test.ts:1221  
**Status**: FIXED ✓

Line 1221 に `expect(caught).toBeDefined()` が無条件で呼ばれており、
その後に `if (caught) { expect(String(...)).toContain(...) }` が続く構造になっている。
throw しない退行が発生してもアサーションがスキップされる問題は解消されている。

```ts
// line 1220-1224
expect(caught).toBeDefined();
if (caught) {
  expect(String((caught as Error).message)).toContain("write-scope-violation-");
}
```

---

### Finding 2 — TC-009 category 分類ミスマッチ
**File**: specrunner/changes/write-scope-bypass-closure/test-cases.md:110  
**Status**: FIXED ✓

test-cases.md line 110 が `**Category**: unit` に変更されており、
実装（mock spawn, unit）と一致している。

```md
### TC-009: 結果採用が halt により抑止される

**Category**: unit
```

---

### Finding 3 — commitFinalState docstring のメカニズム記述不正確
**File**: src/core/step/commit-push.ts:527  
**Status**: FIXED ✓

`git reset HEAD -- stagePaths` が削除されたことで、`staged declared outputs remain in the index` という記述が事実と一致するようになった。  
また「Known side effect (scoped residual halt)」段落が追加され、git add -A がそれらを commit に含む挙動が明示されている（lines 527–533）。

---

### Finding 4 — git reset HEAD -- stagePaths が未テスト・behavioral effect ゼロ
**File**: src/core/step/commit-push.ts:440  
**Status**: FIXED ✓

lines 432–441 の残余違反 restore ブロック内に `git reset HEAD -- stagePaths` の呼び出しは存在しない。  
残余違反検出後は `git clean -f` + `git checkout HEAD -- <violations>` → `throw` の経路のみであり、untested な reset コードは除去されている。

```ts
await gitExecResult(infra.spawnFn, cwd, ["clean", "-f", "--", ...residualViolations]);
await gitExecResult(infra.spawnFn, cwd, ["checkout", "HEAD", "--", ...residualViolations]);
throw writeScopeViolationError(...);
```

---

### Finding 5 — Scoped 残余 halt 後に declared outputs が remote に commit される（docstring 不整合）
**File**: src/core/step/commit-push.ts:438  
**Status**: FIXED ✓

commitFinalState の docstring（lines 520–533）が 2 段構成に更新されている:
- 第1段: 「violation content は git add -A で拾われない（復元済み）」— 違反ファイルに関する記述は正確
- 第2段 (新規追加): 「Known side effect: stagePaths は残留 staged のまま checkpoint に含まれる — これは accepted」と明示

宣言出力が checkpoint commit に含まれる副作用を docstring が認識・文書化している。

---

### Finding 6 — headBeforeStep=null 時に自己 commit 検査が全バイパスされる（制約未明示）
**File**: src/core/step/commit-push.ts:198  
**Status**: FIXED ✓

`commitAndPushTail` の JSDoc（line 150）に `headBeforeStep = null or HEAD unchanged → silently return (no-op)` と明記されている。  
null 時に検査がスキップされる制約は関数コントラクトで明示されており、暗黙のバイパスではない。

## Summary

6 件すべての finding が修正済み。退行なし。
