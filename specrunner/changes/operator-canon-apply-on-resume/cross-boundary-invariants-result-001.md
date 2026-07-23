# Cross-Boundary Invariants Review — operator-canon-apply-on-resume

**Reviewer**: cross-boundary-invariants  
**Iteration**: 1  
**Focus**: 新しい挙動が変更していないコードの暗黙の不変条件を黙って破っていないか

---

## 検証対象の境界

本変更は以下の境界をまたぐ新しい実行経路を追加する:

1. **resume 入口 → git index 状態** — `commitOperatorCanon` が worktree の git index を変更する
2. **resume 入口 → commitAndPush の write-scope 強制** — apply-canon 後に step が `commitAndPush` を呼び出す
3. **resume 入口 → egress backstop** — operator-apply OID が `synthesizedCommits` 台帳に載る必要がある
4. **状態遷移 → 永続化の原子性** — git commit と state persist の間に障害が起きた場合

---

## Finding 1（HIGH）— `git add -A` が non-canon ファイルを index に残し、後続 guarded ステップで sweep される

### 証拠

`src/core/resume/apply-canon.ts`（`commitOperatorCanon`）:

```typescript
// Step 1: git add -A — stage everything (including non-canon files) ...
const addResult = await runSubprocess(
  spawnFn,
  "git",
  ["add", "-A"],
  { cwd: worktreePath },
);
...
// Step 2: git commit -m "operator-apply: <slug>" -- <paths>
const commitResult = await runSubprocess(
  spawnFn,
  "git",
  ["commit", "-m", commitMessage, "--", ...paths],
  { cwd: worktreePath },
);
```

`git add -A` は worktree 内の**全ファイル**を index にステージする。続く `git commit -- <canonPaths>` は指定した正典パスのみをコミットする。その結果、non-canon ファイル（例: `src/foo.ts`）は **staged 状態のまま index に残る** (XY = `A ` または `M `)。

### 後続ステップでの影響

`src/core/step/commit-push.ts` の `commitAndPush`（guarded モード）:

```typescript
// getWorktreeChangedPaths is called with worktreeOnly=false (default)
const statusResult = await getWorktreeChangedPaths(infra.spawnFn, cwd);
// ...
const changedPaths = statusResult.paths;
```

`getWorktreeChangedPaths(worktreeOnly=false)` のパース処理:

```typescript
if (worktreeOnly && part[1] === " ") continue; // worktreeOnly=false の場合この行はスキップされない
const filePath = part.slice(3);
if (filePath) {
  paths.push(filePath);  // staged-only (X≠' ', Y=' ') のファイルも paths に含まれる
}
```

guarded モードでは `worktreeOnly=false` で呼ばれるため、staged-only ファイル（X≠`' '`, Y=`' '`）が `paths` に入る。その後:

```typescript
// findWriteScopeViolations は protected canon と judge artifact のみをチェックする
const violations = findWriteScopeViolations(step.name, slug, changedPaths, declaredWritePaths);
// src/foo.ts は protectedCanonPaths でも isJudgeArtifact でもないため violations に入らない

if (changedPaths.length > 0) {
  await gitExecResult(infra.spawnFn, cwd, ["add", "-A", "--", ...changedPaths]);
}
const commitResult = await gitExecResult(infra.spawnFn, cwd,
  ["commit", "-m", commitMessage, "--", ...changedPaths]);
// → src/foo.ts がコミットに含まれる (write-scope を通過した扱いで)
```

### 発火経路

CANON_FINDING_ESCALATION は通常 spec-review や code-review で発生し、resume point は review ステップ（scoped）が多い。resume 後のパイプラインは最終的に guarded ステップ（`implementer`, `build-fixer`, `code-fixer`, `test-materialize`, `adr-gen`）を経由する。resume 直後が code-fixer の場合は最初の guarded ステップで即座に発火する。

### 暗黙不変条件の破損

**破られている不変条件**: write-scope 強制は「宣言された出力パスと pipeline-managed パス以外のファイルはコミットに含まれない」を保証する（`commitAndPush` + `findWriteScopeViolations` の設計）。`commitOperatorCanon` の `git add -A` により、この保証が resume 入口からの index 汚染によって破られる。エラーは一切発生しない。

### 修正

`git add -A` を `git add -- <paths>` に置き換える:

```typescript
const addResult = await runSubprocess(
  spawnFn,
  "git",
  ["add", "--", ...paths],   // -A ではなく明示 pathspec
  { cwd: worktreePath },
);
```

これにより index には canon パスのみがステージされ、non-canon ファイルは worktree 上の dirty 状態のまま残る。

**備考**: コメントにある「完全に untracked なディレクトリでも git が canon パスを見つけられるようにするため `git add -A` が必要」という主張は不正確。`git add -- specrunner/changes/<slug>/design.md` は親ディレクトリが untracked でも正常に動作する。

---

## Finding 2（MEDIUM）— TC-013 のテストアサーションが index 汚染を検出しない

### 証拠

`src/core/resume/__tests__/apply-canon.test.ts`（TC-013）:

```typescript
it("TC-013: non-canon file remains dirty in worktree after commitOperatorCanon", async () => {
  ...
  // THEN: non-canon path is still dirty (in working tree)
  const statusResult = spawnSync("git", ["status", "--porcelain"], {
    cwd: tempDir, encoding: "utf8",
  });
  expect(statusResult.stdout).toContain(NON_CANON_PATH);
});
```

`git status --porcelain` の出力は staged ファイル（`A  src/foo.ts`）も worktree-dirty ファイル（`?? src/foo.ts` や ` M src/foo.ts`）も**同様に NON_CANON_PATH を含む**。`git add -A` → selective commit の後、`src/foo.ts` は staged 状態（`A  src/foo.ts`）になるが、このアサーションはそれを区別しない。

このため Finding 1 の `git add -A` が生む index 汚染はテストで検出されず、現行テストはすべて green のまま bug が潜伏している。

### 修正

staged 状態でないことを確認するアサーションを追加する:

```typescript
// non-canon file should NOT be staged (only worktree-dirty)
expect(statusResult.stdout).toMatch(/^\?\? .*src\/foo\.ts/m);  // untracked
// OR: assert index is clean for NON_CANON_PATH
const indexStatus = spawnSync("git", ["diff", "--cached", "--name-only"], { ... });
expect(indexStatus.stdout).not.toContain(NON_CANON_PATH);
```

---

## Finding 3（LOW）— git commit 成功 / state persist 失敗の split-brain

### 証拠

`src/core/command/resume.ts`:

```typescript
try {
  const oid = await commitOperatorCanon(resolvedSlug, resolvedWorktreePath, dirtyCanonPaths, defaultSpawnFn);
  updatedState = appendSynthesizedCommit(updatedState, oid);
  if (runStore) await runStore.persist(updatedState);   // ← ここで失敗した場合
  logInfo(`[apply-canon] operator-apply commit ${oid} ...`);
} catch (err) {
  logError(`Failed to create operator-apply commit: ...`);
  throw new PrepareError(1, "Failed to create operator-apply commit");
}
```

`commitOperatorCanon` が成功し `runStore.persist` が失敗した場合:
- git 上には `operator-apply: <slug>` コミット（OID）が存在する
- `state.synthesizedCommits` には OID が含まれない
- stale-detection が job を `awaiting-resume` に回復
- 次回の `resume --apply-canon`: `detectCanonDirtyPaths` は `[]` を返す（正典は commit 済みで clean）
- apply-canon gate をスキップして step が起動
- `commitAndPush` の egress check: `rev-list HEAD --not --remotes=origin` に operator-apply OID が残っており、台帳に存在しないため `EGRESS_UNKNOWN_COMMIT` で halt

**回復経路**: 手動で `git push origin <branch>` を実行すると operator-apply OID が origin に移動し `rev-list --not --remotes=origin` から除外される。これは本 PR が廃止しようとした tribal knowledge に逆戻りする。

### 設計の参照

design.md の Risks セクション:
> If `commitOperatorCanon` fails (e.g., git user config not set in the worktree), `prepare()` throws `PrepareError(1)`. The job remains in "running" with no process; stale-detection recovers it on next resume.

この記述は「git commit 失敗」の場合のみを対象とし、「git commit 成功 + persist 失敗」のケースを明示していない。

---

## 観察事項（verdict に影響しない）

- **egress backstop の正当性**: Finding 1 とは無関係に、egress backstop 自体は正しく機能する。operator-apply OID が `synthesizedCommits` に正常に記録された場合、`runInlineEgressCheck` はその OID を ledger に含めるため通過する。境界間の設計整合性は保たれている。

- **fail-closed 保証（R2）**: `detectCanonDirtyPaths` が git status 失敗時に throw する設計は正しく実装されており、exit code 128 の特例処理（non-git ディレクトリ）も適切に範囲限定されている。

- **commit 内容の正確性**: `git commit -- <canonPaths>` は pathspec commit として正確に canon パスのみをコミットする（egress への登録は正しい）。問題は commit 内容ではなく、前段の `git add -A` による index への副作用。

- **scoped ステップでの index 汚染の蓄積**: scoped モードでも staged non-canon ファイルは `stagedOnly` として認識されるが、`findWriteScopeViolations` は protected canon でも judge artifact でもないファイルを violation としない。よって複数の scoped ステップを経由しても index 汚染は無検出のまま蓄積し、最初の guarded ステップで一括 sweep される。

---

## 検証サマリー

| 境界 | 検証項目 | 結果 |
|------|---------|------|
| apply-canon → git index | `git add -A` が non-canon ファイルをステージするか | **Finding 1**: 汚染あり |
| git index → guarded commitAndPush | staged non-canon ファイルが `paths` に入りコミットされるか | **Finding 1**: sweep 確認 |
| git index → scoped commitAndPush | staged non-canon ファイルが violation に引っかかるか | 引っかからない（蓄積・無検出） |
| apply-canon → egress backstop | OID が synthesizedCommits に記録されるか | 正常（正規経路） |
| git commit → state persist 原子性 | split-brain 時の回復経路 | **Finding 3**: tribal knowledge 逆戻り |
| test coverage | index 汚染を検出するテストが存在するか | **Finding 2**: 検出不能 |
| fail-closed (R2) | git status 失敗時の throw | 正しく実装 |
| hint / escalation text | `--apply-canon` を案内するか | 正しく実装 |
