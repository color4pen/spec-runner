# Code Review Feedback — iteration 004

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## iteration 003 以降の修正確認

iteration 003 の F-001（local.ts docstring）は前回確認済み。  
iteration 003 以後に実施された operator 修正（commit 1696f5f91）が本 iteration の対象。  
cross-boundary review 002 の F-001（stale JSDoc）/ F-002（staged-only 正典改変 bypass）を検証する。

---

## 読んだファイル

- `src/core/step/commit-push.ts`（全文）— `getWorktreeChangedPaths`、scoped 残余検査、guarded JSDoc
- `tests/unit/step/write-scope-bypass-closure.test.ts`（l.1863–1930 operator 追加分）
- `src/core/step/write-scope.ts`（`findWriteScopeViolations` / `protectedCanonPaths`）
- `specrunner/changes/pipeline-sole-committer/cross-boundary-invariants-result-002.md`（F-001/F-002 定義）
- operator commit 1696f5f91 の diff（`git show 1696f5f91`）

---

## 検証した項目

### cross-boundary F-001: guarded mode JSDoc stale "git add -A -- . fallback" 記述

`commit-push.ts` l.379 に旧来の `- Fallback: if no changes detected, uses 'git add -A -- .' (backward compat).` が残存していた問題。

**現在の状態** (`commit-push.ts` l.376–381):
```
 * "guarded" mode:
 *   - Stages all enumerated changed paths explicitly (git add -A -- <paths>).
 *   - Empty enumeration skips the add entirely; if staged changes exist anyway, the
 *     commit throws fail-closed (never a whole-index commit; no `git add -A -- .`).
```

旧 fallback 記述が削除され、実装（changedPaths=0 時は add スキップ + staged changes 残存時は fail-closed throw）と整合する記述に更新されている。**修正確認。** ✓

---

### cross-boundary F-002: worktreeOnly=true の残余検査が staged-only 正典改変を見逃す

agent が正典を `git add` のみで変更した場合（X='M', Y=' '）、`getWorktreeChangedPaths(worktreeOnly=true)` が `part[1] === " "` のエントリをスキップするため `postStatus.paths` に含まれず、`findScopedCommitViolations` で検出不能になっていた問題。

**修正内容（commit 1696f5f91）**:

1. **`getWorktreeChangedPaths` の返却型に `stagedOnly: string[]` を追加**  
   `part[0] !== " " && part[0] !== "?" && part[1] === " "` の条件で staged-only エントリを収集。`worktreeOnly` の値に関わらず収集される。

2. **scoped 残余検査に第 2 規則を追加** (`commit-push.ts` l.456–459):
   ```typescript
   const residualViolations = findScopedCommitViolations(slug, postStatus.paths, filePaths, allManagedPaths);
   const stagedCanonViolations = findWriteScopeViolations(step.name, slug, postStatus.stagedOnly, filePaths);
   const allViolations = [...new Set([...residualViolations, ...stagedCanonViolations])];
   ```
   - worktree-dirty 規則: 宣言+管理パス以外を違反（従来どおり）
   - staged-only 規則: 保護正典のみ違反（`findWriteScopeViolations`）

3. **保護正典の識別**: `findWriteScopeViolations` は `protectedCanonPaths`（request.md / spec.md / design.md / tasks.md / test-cases.md / attestation）と `isJudgeArtifact` のみを違反とする。非正典ファイル（`src/secret.ts` 等）はスコープ外 → halt しない。

4. **restore 経路**: staged-only 正典違反は tracked ファイルのため `checkoutTargets` へルーティングされ `git checkout HEAD -- <path>` が呼ばれる。index と worktree の両方を HEAD に戻す。 ✓

**修正確認。** ✓

---

### R6-1 保存確認: 非正典 staged-only ファイルは halt しない

追加テスト `"pre-staged NON-canon file (staged-only) does not halt"` の論理を検証:

- `git status` → `M  src/secret.ts\0`（staged-only）
- `postStatus.stagedOnly = ["src/secret.ts"]`
- `findWriteScopeViolations("spec-review", slug, ["src/secret.ts"], [resultPath])` → `[]`  
  `src/secret.ts` は `protectedCanonPaths` に含まれず `isJudgeArtifact` でもない → 違反なし
- `allViolations = []` → halt なし → commit が呼ばれる ✓

R6-1「事前 stage 許可外ファイルは pathspec 除外で続行」契約が保存されていることを確認。 ✓

---

### 破壊確認テストの検証

operator 追加テストに DESTROY annotation が明記されている:
```typescript
// DESTROY: drop the stagedOnly canon check → this resolves (silent adoption).
```

staged-only 規則（`findWriteScopeViolations(slug, postStatus.stagedOnly, ...)`）を除去すると `allViolations = []` → halt しなくなる → テストが fail する。有効な破壊確認。 ✓

---

### 型整合性

`getWorktreeChangedPaths` 返却型への `stagedOnly: string[]` 追加は後方互換:
- `ok:false` 時は `stagedOnly: []` を返す
- guarded path（l.505、`worktreeOnly=false`）は `stagedOnly` を使わない — staged-only エントリが `paths` に既に含まれるため不要。型エラーなし ✓

---

## 検証できなかった項目

- operator fix 後の `typecheck && test` 実行結果（verification-result.md は 1696f5f91 適用前の iter 4 実行分）。  
  静的解析では型互換・テスト論理に問題なし。Fix は 2 テスト追加 + return 型拡張のみで既存テストへの影響はない。

---

## Findings 詳細

新規 findings なし。

iteration 003 F-001（local.ts docstring）および cross-boundary F-001/F-002 はすべて修正確認済み。  
実装・テスト・破壊確認に未解決の問題は見当たらない。
