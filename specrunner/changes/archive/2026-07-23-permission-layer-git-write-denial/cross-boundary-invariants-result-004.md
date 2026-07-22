# Cross-Boundary Invariants Review — permission-layer-git-write-denial（Iteration 4）

## 調査範囲

- `git diff main HEAD` で full diff を確認（`git diff main...HEAD` の three-dot と区別）
- 主要実装ファイル全読み: `agent-runner.ts` / `git-command-classifier.ts` / `step-context-builder.ts` / `agent-runner.ts (port)` / `write-scope.ts` / `round-git-scope.ts` / `paths.ts`
- 削除ファイル: `canon-escalation.ts` / `canon-write-scope.ts` および関連削除テスト群
- 変更ファイル: `step-completion.ts` / `judge-verdict.ts` / `findings-ledger.ts` / `regression-gate.ts` / `code-fixer.ts` / `commit-orchestrator.ts`
- テストファイル: `round-git-scope.test.ts`（主要）/ `workspace-tool-guard.test.ts` / `step-context-builder.test.ts`
- main ブランチの対応ファイルを照合（git show origin/main:...）

---

## Finding A: pipelineManagedPaths から prCreateResultPath が削除され、#900 が再現する

### 不変条件（変更されていない側）

`src/core/pipeline/parallel-review-round.ts`（無改変）の実行パス:

```typescript
const inspection = await deps.runtimeStrategy.listWorktreeChanges(cwd);
const { toStage, offending } = partitionRoundChanges({
  changed: inspection.paths, declared, slug: deps.slug
});
```

`partitionRoundChanges` が保持する不変条件:
> **「`pipelineManagedPaths(slug)` に含まれるパスはすべて、`offending` リストから除外されなければならない。pipeline インフラが書き込むファイルは agent の宣言外変更として halt 判定されてはならない。」**

### diff が導入した変更

`src/core/pipeline/round-git-scope.ts`:

```diff
-  import { slugStateJsonPath, slugEventsPath, usageJsonPath, biteEvidenceResultPath, prCreateResultPath, changesDirRel, isCanonicalDocPath } from "../../util/paths.js";
+  import { slugStateJsonPath, slugEventsPath, usageJsonPath, biteEvidenceResultPath, changesDirRel, isCanonicalDocPath } from "../../util/paths.js";

   export function pipelineManagedPaths(slug: string): string[] {
-    return [slugStateJsonPath(slug), slugEventsPath(slug), usageJsonPath(slug), biteEvidenceResultPath(slug), prCreateResultPath(slug)];
+    return [slugStateJsonPath(slug), slugEventsPath(slug), usageJsonPath(slug), biteEvidenceResultPath(slug)];
   }
```

`round-git-scope.test.ts` も同時に更新され、`toHaveLength(5)` → `toHaveLength(4)` に変更されている（regression を test が隠す）。

### 破れる具体的な実行列

1. pipeline が pr-create step を実行 → `specrunner/changes/<slug>/pr-create-result.md` をディスクに書き込む
2. commit 処理の前に GitHub API タイムアウト / エラーが発生し、step が途中失敗する
3. `pr-create-result.md` は worktree に **uncommitted** のまま残る
4. operator が job resume → pipeline が conformance / custom reviewer round を再実行
5. `listWorktreeChanges(cwd)` が `pr-create-result.md` を `changed` に含んで返す
6. `partitionRoundChanges`:
   - `pr-create-result.md` ∉ `declared`（custom reviewer は宣言しない）
   - `pr-create-result.md` ∉ `pipelineManagedPaths(slug)`（本 diff で除去された）
   - → `offending = ["specrunner/changes/<slug>/pr-create-result.md"]`
7. round が false-positive halt する（#900 の再現）

### 証拠

- **main ブランチのテスト** (`git show origin/main:src/core/pipeline/__tests__/round-git-scope.test.ts`):
  - TC-002: `expect(paths).toHaveLength(5)` + `expect(paths).toContain(PR_CREATE_RESULT)` で 5 要素を固定
  - TC-001: `pr-create-result.md in changed → excluded from BOTH offending AND toStage` — "Destruction confirmation" コメントあり
    ```typescript
    // Destruction confirmation: prCreateResultPath を pipelineManagedPaths から除去すると
    // このテストが fail する — offending に PR_CREATE_RESULT が入り toHaveLength(0) が赤になる。
    ```
- **本ブランチのテスト**: `expect(paths).toHaveLength(4)` に更新 → TC-001 / TC-002 相当が削除された状態
- この変更は #900（"fix: custom reviewer round の運用欠落 2 件を修正する — pr-create-result の管理パス化"）を事実上 revert している

---

## Finding B: canon-escalation 削除により保護正典パスへの fixable finding が bounded loop を引き起こす

### 不変条件（変更されていない側）

`CommitOrchestrator.commitSuccess`（`commit-orchestrator.ts`、無改変）および pipeline routing（executor.ts）が保持する暗黙の前提:
> **「regression-gate が "needs-fix" を返す場合、`collectFindingsLedger` の findings は code-fixer によって法的に修正可能でなければならない。`skipWhen` は unroutable な findings がある場合にスキップを返し、不要な code-fixer ループを防止する。」**

### diff が導入した変更

`src/core/step/judge-verdict.ts`:
```diff
- export function deriveJudgeVerdict(findings, ok, evidence, canonScope?) {
+ export function deriveJudgeVerdict(findings, ok, evidence) {
    ...
-   if (canonScope && selectUnroutableCanonFindings(findings, canonScope, judgeEffectiveFixer).length > 0) {
-     return "escalation";
-   }
    if (findings.some((f) => f.severity === "critical" || f.severity === "high")) return "needs-fix";
```

`src/core/pipeline/findings-ledger.ts`:
```diff
- export function collectFindingsLedger(reviewerChain, state, canonScope?) {
+ export function collectFindingsLedger(reviewerChain, state) {
    ...
-   // R3: exclude unroutable canon findings when canonScope is provided
-   if (!canonScope) return deduped;
-   const unroutable = ... selectUnroutableCanonFindings(deduped, canonScope, judgeEffectiveFixer) ...
-   return deduped.filter((f) => !unroutable.has(...));
+   return dedupeFindings(all);
```

`src/core/step/regression-gate.ts`:
```diff
-   const canonScope = buildCanonWriteScope(state, deps);
-   const ledger = collectFindingsLedger(reviewerChain, state, canonScope);
+   const ledger = collectFindingsLedger(reviewerChain, state);
```

### 破れる具体的な実行列

1. code-review が `specrunner/changes/<slug>/spec.md`（保護正典パス）への critical/high finding を `resolution: "fixable"` で報告する
2. `deriveJudgeVerdict(findings, ok, evidence)` — canonScope なし → `finding.severity === "critical"` → **"needs-fix"**
   （旧: `selectUnroutableCanonFindings` が spec.md ∈ canonPaths かつ code-fixer は spec.md 非可書き → "escalation"）
3. pipeline が code-fixer に routing する
4. code-fixer が `Edit spec.md` を試みる → permission guard: `scope.forbiddenPaths` に `spec.md` が含まれる → **deny**
   （guard は正しく動作する。問題は verdictDerivation 層にある）
5. code-fixer は spec.md を修正できないまま `report_result(status: "ok")` を呼ぶ → verdict = "success"
6. `regression-gate.skipWhen`: `collectFindingsLedger` で spec.md finding が ledger に含まれる（フィルタなし）→ `return null`（= 実行）
   （旧: canonScope フィルタで unroutable finding が除去 → ledger が空 → `"findings ledger is empty"` → SKIP）
7. regression-gate が実行 → spec.md の finding が依然存在 → "needs-fix"
8. 手順 3 に戻る → **bounded loop**（maxIterations まで繰り返し、最終的に escalation するが `CANON_FINDING_ESCALATION` error state が設定されない）

### 証拠

- `src/core/step/commit-orchestrator.ts` diff:
  ```diff
  - if (verdict === "escalation" && completion.escalationReason) {
  -   s = { ...s, error: { code: "CANON_FINDING_ESCALATION", message: ..., hint: ... } };
  - }
  ```
  オペレーターへの報告機能（CANON_FINDING_ESCALATION error state）も削除された
- 削除されたテスト群: `canon-escalation.test.ts`（291 行）/ `canon-write-scope.test.ts`（295 行）/ `judge-verdict-canon.test.ts`（553 行）/ `step-completion-canon.test.ts`（253 行）
- この削除は #901（"feat: 保護正典への fixable finding を、書けない fixer に routing せず escalation に倒す"）を事実上 revert している
- **判断の注意**: code-review finding が spec.md 上に "fixable" として出るかは agent 挙動に依存するため、確実性は Finding A より低い

---

## 前回（Iteration 3）確認済み事項の継続確認

| 項目 | 状態 |
|------|------|
| bootstrap commit OID が synthesizedCommits に記録される（3 ファイル） | ✓ 変更なし |
| CLI step（verification / pr-create / bite-evidence）が guard 非経由 | ✓ 変更なし |
| utility query の `buildSdkOptions` が sandbox を含まない | ✓ 変更なし |
| `write-scope.ts` / `commit-push.ts` が無改変 | ✓ diff ゼロ確認 |
| `buildStepContext` が scoped/guarded 両方で `writeScope` を設定 | ✓ 変更なし |
| カスタムレビューアーの scoped mode write 制御 | ✓ 変更なし |

---

## 検証した項目（本 Iteration）

1. `git diff main HEAD`（two-dot）で full diff を確認（three-dot との差異に注意）
2. `round-git-scope.ts` の `pipelineManagedPaths` 変更（5 → 4 要素）
3. main ブランチの `round-git-scope.test.ts`（TC-001 / TC-002 destruction confirmation）を照合
4. `canon-escalation.ts` / `canon-write-scope.ts` の削除と影響範囲を追跡
5. `judge-verdict.ts` / `findings-ledger.ts` / `regression-gate.ts` の canonScope 除去
6. `commit-orchestrator.ts` の `CANON_FINDING_ESCALATION` error state 削除
7. `step-completion.ts` の escalationReason 計算ブロック削除
8. permission guard の guarded mode `forbiddenPaths`（spec.md 等）との相互作用を確認
9. Finding B のシナリオの現実性確認（code-review が spec.md への fixable finding を報告する頻度に依存）

## 検証できなかった項目

- Finding B のシナリオ実現の頻度: code-review が保護正典パスへの `resolution: "fixable"` finding を実際に出すかは agent の実行挙動に依存するため、静的読解での断定は困難
