# Regression Gate Evidence Report — iteration 002

<!-- Verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。 -->

## 検証対象

- Change: write-scope-bypass-closure
- Branch: change/write-scope-bypass-closure-be8366eb
- Ledger: 6 findings

---

## Finding 別検証

### F-001 [LOW] TC-011 第2テストの halt アサーションが条件付き
**ファイル**: tests/unit/step/write-scope-bypass-closure.test.ts:1221

**期待する修正**: `expect(caught).toBeDefined()` を `if (caught) { ... }` の前に追加する。

**現状確認** (line 1213–1224):
```typescript
let caught: unknown;
try {
  await commitAndPush(step, makeJobState(), makeDeps(slug), null, infra);
} catch (e) {
  caught = e;
}

// After T-06: throws with message containing quarantine path
expect(caught).toBeDefined();
if (caught) {
  expect(String((caught as Error).message)).toContain("write-scope-violation-");
}
```

`expect(caught).toBeDefined()` が line 1221 に追加され、`if (caught)` ブロックの前に置かれている。throw しない退行が発生した場合にアサーションがスキップされない構造に修正済み。

**判定: FIXED ✓**

---

### F-002 [LOW] TC-009 の category 分類が integration だが実装は unit
**ファイル**: specrunner/changes/write-scope-bypass-closure/test-cases.md:109–110

**期待する修正**: TC-009 の `**Category**: integration` を `**Category**: unit` に変更する。

**現状確認** (line 108–112):
```markdown
### TC-009: 結果採用が halt により抑止される

**Category**: unit
**Priority**: must
```

`**Category**: unit` に変更済み（cdc60bfc3 operator fix）。

**判定: FIXED ✓**

---

### F-003 [LOW] commitFinalState docstring のメカニズム記述が operator fix 後に不正確
**ファイル**: src/core/step/commit-push.ts:527

**期待する修正**: docstring の "those staged declared outputs remain in the index" を、実際の動作（git reset で unstage → git add -A が worktree から再 stage）に合わせて修正。T-06 コードコメントも整合させる。

**現状確認**:

commitFinalState docstring (lines 527–532):
```
Known side effect (scoped residual halt): stagePaths (declared outputs) are staged
by commitAndPush before the residual check. When T-06 throws, those staged declared
outputs remain in the index. Consequently, git add -A here picks them up and they
are committed as part of this checkpoint.
```

T-06 コードコメント (lines 437–439):
```typescript
// T-06: unstage the already-staged declared outputs before the halt.
// The step result was produced alongside a canon violation — leaving it staged
// would let the checkpoint commit record it as if the step completed normally.
await gitExecResult(infra.spawnFn, cwd, ["reset", "HEAD", "--", ...stagePaths]);
```

**不整合の確認**:
- `git reset HEAD -- stagePaths` (line 440) が throw 前に実行され、declared outputs は index から除外（unstaged）される。
- しかし docstring は "remain in the index" と述べており、実際のメカニズムと一致しない。
- T-06 コメント "leaving it staged would let the checkpoint commit record it" は、unstage によってチェックポイント記録が防がれるかのように読めるが、`commitFinalState` の `git add -A` が worktree から再 stage するため記録は防がれない。
- operator fix (cdc60bfc3) で追加された "Known side effect" 段落と git reset は同一コミットで書かれたが、両者の記述が整合していない。
- docs-only の問題。functional correctness への影響はない。

**判定: NOT FIXED — REGRESSION**

---

### F-004 [LOW] T-06 residual halt の git reset HEAD -- stagePaths が未テスト・behavioral effect ゼロ
**ファイル**: src/core/step/commit-push.ts:440

**期待する修正**: git reset の呼び出しをアサートするテストを追加する、または git reset を削除して docstring の "This is accepted" と整合させる。

**現状確認**:

`write-scope-bypass-closure.test.ts`、`commit-push-write-scope.test.ts`、`write-scope-bypass-closure-integration.test.ts` の全ファイルを検索（`grep -n "reset"`）したが、`git reset HEAD -- stagePaths` の呼び出し自体を assert するテストは存在しない。

behavioral effect がゼロである理由（review-feedback-002 F-002 と同一）:
- unstage 後に `commitFinalState` の `git add -A` が worktree から再 stage するため、declared outputs のチェックポイント記録有無は `reset` の有無に関わらず同一。
- この行を削除しても 8689 テストすべてが green のままであることが期待される。

code-fixer commit (a724d47f6) ではソースコードに変更なし（events.jsonl / state.json のみ更新）。Finding が適用されていない。

**判定: NOT FIXED — REGRESSION**

---

### F-005 [LOW] Scoped 残余 halt 後に declared outputs が commitFinalState で remote に commit される
**ファイル**: src/core/step/commit-push.ts:438

**期待する修正**: `git reset HEAD -- stagePaths` を追加して staged declared outputs を unstage するか、commitFinalState docstring にこの副作用を明示する（"This is accepted" として）。

**現状確認**:

operator fix (cdc60bfc3) で両方が適用された：
1. `await gitExecResult(infra.spawnFn, cwd, ["reset", "HEAD", "--", ...stagePaths])` が line 440 に追加（unstage）
2. commitFinalState docstring に "Known side effect (scoped residual halt)..." 段落が追加され、副作用を "This is accepted" と明示

副作用（declared outputs がチェックポイント commit に含まれる）はドキュメント化された。finding 要求（安全性の根拠を補完）は満たされている。

Note: docstring のメカニズム記述の正確性（F-003）は別 finding で扱う。

**判定: FIXED ✓**

---

### F-006 [LOW] headBeforeStep=null 時に自己 commit 検査が全バイパスされる
**ファイル**: src/core/step/commit-push.ts:198

**期待する修正**: headBeforeStep=null の場合のバイパスを commitAndPushTail docstring に明示する。

**現状確認** (commitAndPushTail docstring, line 150):
```
c. headBeforeStep = null or HEAD unchanged → silently return (no-op).
```

docstring の 2c 項に明示されている（iteration 001 regression gate で FIXED 確認済み）。現バージョンでも変更なく残存。

**判定: FIXED ✓**

---

## 証跡サマリー

| Finding | 場所 | 修正状態 |
|---------|------|---------|
| F-001 TC-011 条件付きアサーション | .test.ts:1221 | FIXED ✓ |
| F-002 TC-009 category ミスマッチ | test-cases.md:110 | FIXED ✓ |
| F-003 commitFinalState docstring メカニズム不正確 | commit-push.ts:527–532, 437–439 | NOT FIXED — REGRESSION |
| F-004 git reset HEAD 未テスト・behavioral effect ゼロ | commit-push.ts:440 | NOT FIXED — REGRESSION |
| F-005 staged declared outputs が checkpoint commit に含まれる | commit-push.ts:438 | FIXED ✓ |
| F-006 headBeforeStep=null バイパス未明示 | commit-push.ts:150 | FIXED ✓ |

- checked: 6
- skipped: 0
- unverified: 0
