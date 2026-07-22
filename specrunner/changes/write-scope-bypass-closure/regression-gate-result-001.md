# Regression Gate Evidence Report — iteration 001

<!-- Verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。 -->

## 検証対象

- Change: write-scope-bypass-closure
- Branch: change/write-scope-bypass-closure-be8366eb
- Ledger: 4 findings

---

## Finding 別検証

### F-001 [LOW] TC-011 第2テストの halt アサーションが条件付き
**ファイル**: tests/unit/step/write-scope-bypass-closure.test.ts:1221

**期待する修正**: `expect(caught).toBeDefined()` を `if (caught) { ... }` の前に追加する。

**現状確認** (line 1213–1223):
```typescript
let caught: unknown;
try {
  await commitAndPush(step, makeJobState(), makeDeps(slug), null, infra);
} catch (e) {
  caught = e;
}

// After T-06: throws with message containing quarantine path
if (caught) {
  expect(String((caught as Error).message)).toContain("write-scope-violation-");
}
```

`expect(caught).toBeDefined()` が `if (caught)` の前に追加されていない。throw しない退行が発生してもアサーションがスキップされる構造のまま。

**判定: REGRESSION**

---

### F-002 [LOW] TC-009 の category 分類が integration だが実装は unit
**ファイル**: specrunner/changes/write-scope-bypass-closure/test-cases.md:109–110

**期待する修正**: TC-009 の `**Category**: integration` を `**Category**: unit` に変更する。

**現状確認** (line 108–112):
```markdown
### TC-009: 結果採用が halt により抑止される

**Category**: integration
**Priority**: must
```

`**Category**: integration` のまま変更なし。実装は `write-scope-bypass-closure.test.ts`（mock spawn / unit）に収録されており、integration variant は TC-025 が担う。分類ミスマッチは残存。

**判定: REGRESSION**

---

### F-003 [LOW] Scoped 残余 halt 後に declared outputs が commitFinalState で remote に commit される
**ファイル**: src/core/step/commit-push.ts:438

**期待する修正**: T-06 throw 前に staged された declared outputs（stagePaths）を unstage するコード追加、または commitFinalState docstring にこの副作用を明示。

**現状確認**:

T-06 throw 直前 (line 435–438):
```typescript
await gitExecResult(infra.spawnFn, cwd, ["clean", "-f", "--", ...residualViolations]);
await gitExecResult(infra.spawnFn, cwd, ["checkout", "HEAD", "--", ...residualViolations]);
// T-06: halt — do NOT proceed to commit/push with a contaminated step result.
throw writeScopeViolationError(step.name, branch, residualViolations, residualQuarantine);
```

`git add -A -- <stagePaths>` (line 401) で staged された宣言済み出力 (e.g. spec-review-result-001.md) を unstage する `git reset HEAD -- <stagePaths>` は追加されていない。

commitFinalState docstring (lines 517–521):
```
Write-scope safety: when commitFinalState is called after a WRITE_SCOPE_VIOLATION
halt, the guarded-mode commitAndPush has already restored violated files to their
HEAD state via git checkout HEAD before throwing. Scoped residual violations are
similarly restored before throwing (T-06). Therefore, git add -A here does not pick
up violation content — those files are already clean (match HEAD).
```

追加された一文 "Scoped residual violations are similarly restored before throwing (T-06)." は **違反ファイル（request.md 等）**の復元を指しており、**staged された declared outputs（spec-review-result-001.md 等）**の index 残留については記述がない。「git add -A does not pick up violation content」の主張は違反ファイルの文脈で正しいが、staged declared outputs が index に残り commitFinalState で commit・push される副作用は docstring 上で依然として未記述。

**git diff の確認**: `git diff main...HEAD -- src/core/step/commit-push.ts` で `reset` 操作の追加なし。docstring 変更は1文追加のみで staged declared outputs の言及なし。

**判定: REGRESSION**

---

### F-004 [LOW] headBeforeStep=null 時に自己 commit 検査が全バイパスされる
**ファイル**: src/core/step/commit-push.ts:198

**期待する修正**: headBeforeStep=null の場合に自己 commit 検査がスキップされることを docstring に明示。

**現状確認** (commitAndPushTail docstring, line 150):
```
c. headBeforeStep = null or HEAD unchanged → silently return (no-op).
```

このフォールスルーケースが docstring の箇条書き 2c に明示された。"git が壊れた状態で headBeforeStep=null になり自己 commit が検査されない" という制約が、前バージョンでは記述のなかった箇所に追加されており、finding の「明示されていない」要求を満たす。

**判定: FIXED ✓**

---

## 証跡サマリー

| Finding | 場所 | 修正状態 |
|---------|------|---------|
| F-001 TC-011 条件付きアサーション | .test.ts:1221 | REGRESSION |
| F-002 TC-009 category ミスマッチ | test-cases.md:110 | REGRESSION |
| F-003 staged declared outputs が commit される | commit-push.ts:438, 517–521 | REGRESSION |
| F-004 headBeforeStep=null バイパス未明示 | commit-push.ts:150 | FIXED ✓ |

- checked: 4
- skipped: 0
- unverified: 0
