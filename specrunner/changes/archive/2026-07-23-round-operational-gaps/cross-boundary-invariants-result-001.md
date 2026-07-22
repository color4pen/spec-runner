# cross-boundary-invariants review — round-operational-gaps (Iteration 1)

## 対象 diff

```
specrunner/reviewers/cross-boundary-invariants.md   |   2 +
src/core/pipeline/__tests__/round-git-scope.test.ts |  45 +-
src/core/pipeline/round-git-scope.ts                |   9 +-
```

## 歩いた経路

### 経路 A: `pipelineManagedPaths` → `partitionRoundChanges`

`pipelineManagedPaths(slug)` が返す配列に `prCreateResultPath(slug)` を追加。

```typescript
// round-git-scope.ts:147
const managedSet = new Set(pipelineManagedPaths(slug));
const offending = changed.filter((f) => !managedSet.has(f) && !declaredSet.has(f));
```

`pr-create-result.md` は `managedSet` に入るため `offending` から除外される。fix の直接効果。
既存の `offending` ロジックは `changed − declared − managed` の純粋な集合演算であり、要素追加で既存の不変条件（declared は offending に含まれない、managed は toStage にも offending にも含まれない）はすべて保持される。

### 経路 B: `pipelineManagedPaths` → `commitAndPush` scoped mode

```typescript
// commit-push.ts:451-455
const allManagedPaths = pipelineManagedPaths(slug);
const existingManaged = await filterExistingFiles(allManagedPaths, cwd);
const stagePaths = [...new Set([...filePaths, ...existingManaged])];
```

`pr-create-result.md` が存在するとき `existingManaged` に加わり `stagePaths` に入る。
`PrCreateStep.writes()` は `prCreateResultPath(slug)` を宣言しているため `filePaths` にも含まれる。
`Set` の重複排除により二重 stage は発生しない。

`pr-create` 以外の scoped ステップ（design / spec-review 等）が `pr-create-result.md` が dirty なワークツリー上で走る場合（resume 経路）:

- `findScopedCommitViolations` で `allManagedPaths` が allowed に入るため violation にならない  
- `existingManaged` に含まれるため staged に加わり commit される

`usage.json` / `bite-evidence-result.md` と同一パターン。既存の「scoped step は declared + managed だけを commit する」不変条件は保たれる。

### 経路 C: `pipelineManagedPaths` → `commitFinalState`

```typescript
// commit-push.ts:642
const managedPaths = pipelineManagedPaths(slug);
for (const p of managedPaths) {
  const addResult = await spawnFn("git", ["add", "--", p], { cwd });
  if ((addResult.exitCode ?? 1) === 0) stagedPaths.push(p);
}
```

`pr-create-result.md` を per-path `git add` で試みる。ファイルが存在しない場合は exit≠0 で `stagedPaths` に入らない（既存の optional-path handling と同一）。存在する場合は finalize/checkpoint commit に含まれる。

`git diff --cached --quiet -- <stagedPaths>` でスコープ限定の変更検出を行うため、既コミット済みの場合は exit 0 でスキップされる。egress check（verifyEgressLedger）と push は変わらず機能する。

不変条件「finalize commit は explicit pathspec で管理パスのみを commit する」は保たれる。

### 経路 D: `cross-boundary-invariants.md` frontmatter

`paths` に `src/core/runtime/**` と `src/core/verification/**` を追加（5 → 7 glob）。
reviewer 定義は job bootstrap 時に state へ snapshot されるため実行中 job への遡及なし。
activation 評価ロジック（`evaluateActivation`）は paths に対して OR 評価であり、glob 追加は純粋に活性化条件を広げるのみ。

既存 5 glob の動作は変わらない。

### 経路 E: `findScopedCommitViolations` の境界検証

```typescript
// write-scope.ts:165-173
export function findScopedCommitViolations(
  _slug, changedPaths, declaredWritePaths, managedPaths,
): string[] {
  const allowed = new Set([...declaredWritePaths, ...managedPaths]);
  return changedPaths.filter((p) => !allowed.has(p));
}
```

`pr-create-result.md` が `managedPaths` に入ることで `allowed` に加わる。`isJudgeArtifact` は呼ばれない（guarded mode 用の `findWriteScopeViolations` が別関数）。判定境界は変わらない。

## 確認した不変条件

| 不変条件 | 経路 | 保持 |
|---|---|---|
| offending = changed − declared − managed | A | ✓ |
| toStage = changed ∩ declared | A | ✓ |
| scoped commit は declared + managed のみを stage する | B | ✓ |
| 残余 violation = changed − (declared ∪ managed) | B/E | ✓ |
| finalize commit は explicit pathspec に限定される | C | ✓ |
| pr-create-result.md が staged-and-committed ならば diff check で skip される | C | ✓ |
| reviewer activation は observable facts から決定論的に評価される | D | ✓ |
| 実行中 job への reviewer 定義変更は遡及しない | D | ✓ |

## 観察事項

**JSDoc stale（機能上の問題なし）**: `commit-push.ts` line 612–614 の `commitFinalState` JSDoc と `local.ts` line 696 の日本語コメントは「state.json / events.jsonl / usage.json / bite-evidence-result.md」と列挙しており `pr-create-result.md` が含まれていない。#888 で `bite-evidence-result.md` を追加した際と同様に JSDoc が実装に追随していない。実装は `pipelineManagedPaths()` を直接呼び出すため動作は正しい。

## 破れる具体的実行列

全経路で「この手順で不変条件が破れる」シナリオを構成できなかった。
