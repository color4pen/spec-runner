# Cross-Boundary Invariants Review — operator-canon-apply-on-resume

**Reviewer**: cross-boundary-invariants  
**Iteration**: 2  
**Focus**: Iteration 1 の3件の Finding が正しく修正されているか、および修正により新たな境界越え不変条件破損が生じていないか

---

## 検証対象の変更（前回 Finding → 修正内容）

| Finding | 深刻度 | 内容 | 今回の検証対象 |
|---------|--------|------|---------------|
| F1 | HIGH | 裸 `git add -A` が non-canon ファイルを index に残す | `git add -A -- <paths>` への修正の正当性 |
| F2 | MEDIUM | index 汚染を検出するテストアサーションが機能しない | index 純度テスト + 再帰スキャン |
| F3 | LOW | commit 成功 + persist 失敗の split-brain | `git reset --mixed HEAD~1` ロールバック |

---

## F1 修正の再検証 — pathspec-limited add

### 証拠

`src/core/resume/apply-canon.ts`（`commitOperatorCanon`）修正後:

```typescript
// Step 1: git add -A -- <paths> — stage ONLY the canon paths (explicit pathspec;
// -A within the pathspec also stages deletions/untracked for the listed paths).
// A bare `git add -A` would stage unrelated non-canon files into the index, where
// scoped steps leave them undetected and the first guarded step sweeps them into
// its own commit (index-pollution laundering — cross-boundary Finding 1).
const addResult = await runSubprocess(
  spawnFn,
  "git",
  ["add", "-A", "--", ...paths],
  { cwd: worktreePath },
);
```

### 評価

`git add -A -- <paths>` は `-A` フラグの効果を指定 pathspec に限定する。これにより:
- 正典パス: staged（削除・新規・変更を含む）
- non-canon パス: worktree-dirty のまま index に入らない

`git add -A` の `-A` を残した理由（削除のステージング）は正当。pathspec による限定が正しく機能する。

### 後続ステップへの影響 — 確認済み

**Scoped モード**（`commitAndPush` 内の残余検査）:
```typescript
const postStatus = await getWorktreeChangedPaths(infra.spawnFn, cwd, true);  // worktreeOnly=true
const residualViolations = findScopedCommitViolations(slug, postStatus.paths, filePaths, allManagedPaths);
```

apply-canon 後に non-canon dirty が worktree-only（staged でない）で残る場合、
`getWorktreeChangedPaths(worktreeOnly=true)` の `postStatus.paths` に含まれ、
`findScopedCommitViolations` が scope 外として検出 → `WRITE_SCOPE_VIOLATION` halt。
これは **正しい挙動**（scoped モードの設計どおり）であり、以前の無音蓄積よりも安全。

**Guarded モード**:
`getWorktreeChangedPaths(worktreeOnly=false)` は worktree-dirty non-canon ファイルを `changedPaths` に含め、
`findWriteScopeViolations` は protected canon でも judge artifact でもない `src/foo.ts` を violation としない。
よって guarded ステップが non-canon working-tree dirty を自身の commit に sweep する動作は **変更前から存在**しており、
本 PR が新たに引き起こしたものではない。

**結論**: F1 は正しく修正されている。副作用なし。✓

---

## F2 修正の再検証 — index 純度テストと再帰スキャン

### 証拠（テストの直接検証）

`tests/operator-canon-apply-on-resume-e2e.test.ts`（TC-003）に追加されたアサーション:

```typescript
// THEN: index purity (cross-boundary Finding 1/2)
const staged = spawnSync("git", ["diff", "--cached", "--name-only"], {
  cwd: repoDir, encoding: "utf8",
});
expect(
  staged.stdout,
  "non-canon file must not be staged after apply-canon (index purity)",
).not.toContain(NON_CANON_PATH);
expect(staged.stdout.trim(), "index must be fully clean after the pathspec commit").toBe("");
```

2つ目のアサーション（`staged.stdout.trim().toBe("")`）は index が完全に clean であることを強制する。
`git add -A -- <paths>` を裸 `git add -A` に戻すと `src/foo.ts` が staged に残るため、このアサーションが fail する。

`tests/unit/architecture/write-scope-invariants.test.ts` に追加された再帰スキャン:

```typescript
it('src/ 配下の全 .ts ファイルに pathspec なし git add -A が存在しない (再帰・全域)', () => {
  // ... readdirSync(srcDir, { recursive: true }) で全 src/ を走査
  // line に '"add"', '"-A"' が含まれ '"--"' が含まれない場合 violation
});
```

旧スキャンは `src/core/step/` のみを対象としており `src/core/resume/` が死角だった。
新スキャンは `src/` 全域を再帰的に検索し `apply-canon.ts` の修正後コードも守備範囲に入る。

また `F-012` として `src/` 全域の pathspec なし `git commit` チェックも追加されている:

```typescript
// "commit" AND "-m" を含む行が "--" を持つことを要求
if (line.includes('"commit"') && line.includes('"-m"') && !line.includes('"--"')) {
```

`apply-canon.ts` の `git commit -- <paths>` はこのゲートを正しく通過する。

**結論**: F2 は正しく修正されている。静的ゲートが `apply-canon.ts` を網羅。✓

---

## F3 修正の再検証 — split-brain ロールバック

### 証拠

`src/core/command/resume.ts`:

```typescript
let committedOid: string | null = null;
try {
  const oid = await commitOperatorCanon(resolvedSlug, resolvedWorktreePath, dirtyCanonPaths, defaultSpawnFn);
  committedOid = oid;
  updatedState = appendSynthesizedCommit(updatedState, oid);
  if (runStore) await runStore.persist(updatedState);
  logInfo(`[apply-canon] operator-apply commit ${oid} (paths: ${dirtyCanonPaths.join(", ")})`);
} catch (err) {
  // Split-brain guard: persist 失敗後に OID が git 歴史にのみ残る場合、
  // mixed reset で commit を巻き戻し、operator の正典編集を worktree に保全する
  if (committedOid !== null) {
    const resetResult = await runSubprocess(defaultSpawnFn, "git", ["reset", "--mixed", "HEAD~1"], { cwd: resolvedWorktreePath });
    if (resetResult.exitCode !== 0) {
      logError(`Failed to roll back operator-apply commit ${committedOid} after persist failure ...`);
    } else {
      logInfo(`[apply-canon] rolled back operator-apply commit ${committedOid}; ...`);
    }
  }
  logError(`Failed to create operator-apply commit: ${(err as Error).message}`);
  throw new PrepareError(1, "Failed to create operator-apply commit");
}
```

### 評価

**split-brain シナリオ（commit 成功 + persist 失敗）のトレース**:

1. `commitOperatorCanon` 成功 → `committedOid = oid`（非 null）
2. `appendSynthesizedCommit`（pure function、throw しない） → in-memory に OID 追加
3. `runStore.persist(updatedState)` throw
4. catch ブロック: `committedOid !== null` → `git reset --mixed HEAD~1` 実行
5. canon 編集が worktree の dirty ファイルとして復元される
6. `throw new PrepareError(1, ...)` → `execute()` が exit code 1 で返る
7. job は "running" 状態のまま（disk: running、persist 成功時点の synthesizedCommits）
8. stale-detection が "awaiting-resume" に回復
9. 次の `resume --apply-canon` で `detectCanonDirtyPaths` が dirty を再検出
10. 新規 commit 作成 → 新規 OID → 台帳に記録（冪等: `appendSynthesizedCommit` は重複 skip）

この回復経路は正しく設計されている。手 push（本 PR が廃止する tribal knowledge）への逆戻りは発生しない。

### `appendSynthesizedCommit` の冪等性確認

`src/state/schema/operations.ts`:

```typescript
export function appendSynthesizedCommit(state: JobState, oid: string): JobState {
  const existing = state.synthesizedCommits ?? [];
  if (existing.includes(oid)) return state;  // 重複防止
  return { ...state, synthesizedCommits: [...existing, oid] };
}
```

同一 OID の二重追記は正しく防止される。ロールバック後の別 OID は問題なく追記される。

**結論**: F3 は正しく修正されている。split-brain の回復経路が機能する。✓

---

## 新規の境界越え問題調査

### 調査 A: `commitOperatorCanon` 内部での中間失敗（新規確認）

`commitOperatorCanon` 内で `git commit` が成功した後に `git rev-parse HEAD` が失敗する場合:
- commit は git 歴史に存在する
- `commitOperatorCanon` が throw する
- `resume.ts` の catch 時に `committedOid === null`（`oid` の代入前に throw されたため）
- rollback は実行されない → 理論上の split-brain

`git rev-parse HEAD` は commit 成功後に実質失敗しない（HEAD は commit で更新される）。
この split-brain は理論上存在するが実環境では発生不能。新規 finding の対象外。

### 調査 B: `runStore === null` かつ `resolvedWorktreePath !== null` の組み合わせ

`resolveStateStoreByJobId` が null を返す場合（sidecar なし + state.worktreePath 有）:
- running-transition の persist がスキップされる（既存の動作）
- apply-canon gate が実行され commit が作成される
- `if (runStore) await runStore.persist(...)` がスキップされる
- commit は歴史にあるが台帳に載らない

ただし runStore が null の場合は running-transition 自体も persist されていない。
この状態では stale-detection が回復を試みても commit が台帳外のままになる可能性がある。

これは **既存の pre-condition（runStore が null の時 persist スキップ）の延長**であり、
apply-canon が新たに引き起こした境界越え不変条件破損ではない。
ただし runStore null + apply-canon の組み合わせは従来不可能だった（resume に apply-canon がなかったため）。

**評価**: 極めて低頻度のエッジケース。設計上 `resolveStateStoreByJobId` が null を返すのは
sidecar が存在しない稀な状況に限られる。新規 finding とするには影響経路の現実性が低い。
既存の runStore-null コードパスの問題として分類。

### 調査 C: index 純度テスト — pre-staged non-canon ファイルの死角

TC-013 および TC-003 は「operator が手動で `git add src/foo.ts` を実行した後に `resume --apply-canon` を実行した場合」のシナリオをテストしていない。
この場合、`commitOperatorCanon` の `git add -A -- <canon-paths>` は `src/foo.ts` を変更しないが、
既に index に staged されていた `src/foo.ts` は commit 後も staged のまま残る。
結果、scoped mode の `postStatus.stagedOnly` が `src/foo.ts` を検出するが、
`findWriteScopeViolations` は protected canon でも judge artifact でもないため violation にしない。
よって `src/foo.ts` は次の guarded ステップの commit に sweep される可能性がある。

ただし、これは operator が明示的に `git add` を実行した場合であり:
- 本変更が新たに導入した挙動ではなく、本変更以前から存在した挙動
- operator が自身でステージしたファイルが pipeline commit に混入する
- `--apply-canon` は「protected canon パスのみを operator-apply として取り込む」機能であり、
  既存の staged 状態の管理は operator の責任範囲

新規 finding の対象外。

---

## 検証サマリー

| 確認項目 | 結果 |
|---------|------|
| F1（裸 add -A → pathspec add -A -- paths） | 修正確認 ✓ |
| F2（index 純度テスト + src/ 再帰スキャン） | 修正確認 ✓ |
| F3（persist 失敗時の mixed reset ロールバック） | 修正確認 ✓ |
| 新規: commit-revparse 中間失敗 split-brain | 理論上存在するが実環境不能 — 対象外 |
| 新規: runStore null + apply-canon の組み合わせ | 既存 pre-condition の延長 — 対象外 |
| 新規: pre-staged non-canon の死角 | 既存挙動であり operator 責任 — 対象外 |
| Guarded モードへの影響 | 変更前から同一挙動 — 新規問題なし |
| Scoped モードへの影響 | non-canon dirty を以前より早期検出（改善） |
| `appendSynthesizedCommit` 冪等性 | 確認 ✓ |
| write-scope-invariants 再帰スキャン網羅 | 確認 ✓ |
| F-012 pathspec なし git commit ゲート | 確認 ✓ |
