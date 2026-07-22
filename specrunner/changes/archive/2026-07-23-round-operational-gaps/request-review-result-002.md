# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### Bug #1: pr-create-result.md が pipelineManagedPaths 外

- `src/core/pipeline/round-git-scope.ts:104-105` を Read: `pipelineManagedPaths(slug)` は `[slugStateJsonPath, slugEventsPath, usageJsonPath, biteEvidenceResultPath]` の 4 要素を返す。`prCreateResultPath` は含まれない。✓
- `src/util/paths.ts:83-84` を Read: `prCreateResultPath(slug)` は `specrunner/changes/<slug>/pr-create-result.md` を返す関数として存在する。✓
- `partitionRoundChanges` (round-git-scope.ts:133-152) を Read: `managedSet = new Set(pipelineManagedPaths(slug))` を使い、`offending = changed.filter(f => !managedSet.has(f) && !declaredSet.has(f))` と計算する。`prCreateResultPath` が `managedSet` に入っていないため、pr-create-result.md が changed に現れると offending に分類される。✓
- 既存テスト `src/core/pipeline/__tests__/round-git-scope.test.ts:43-57` を確認: `expect(paths).toHaveLength(4)` を含む。

### Bug #2: cross-boundary-invariants の activationPaths 欠落

- `specrunner/reviewers/cross-boundary-invariants.md` を Read: frontmatter `paths` は `src/core/pipeline/**`, `src/core/step/**`, `src/state/**`, `src/store/**`, `src/adapter/**` の 5 グロブ。`src/core/runtime/**` と `src/core/verification/**` が無いことを確認。✓
- `src/core/runtime/` ディレクトリ: `local.ts`, `managed.ts`, `workspace-materializer.ts` 等が実在する。✓
- `src/core/verification/` ディレクトリ: `runner.ts`, `phases.ts` 等が実在する。✓

### テスト構造の確認

- `src/core/pipeline/__tests__/round-git-scope.test.ts` 全体を Read し、テスト構造を把握。bite-evidence の回帰テスト（scenario 3）が `BITE_EVIDENCE` 定数を pipeline-managed として検証しており、`pr-create-result.md` 向けの同型テストが存在しないことを確認。✓

## 検証できなかった項目

None — すべての主要な前提をコードで直接確認した。

## Findings 詳細

### Warning: 受け入れ基準と既存テストの衝突

受け入れ基準に「既存の round-git-scope / bite-evidence テストは**無改変**で green」とある。しかし `pipelineManagedPaths` に `prCreateResultPath` を追加すると配列長が 4 → 5 になるため、`round-git-scope.test.ts:49` の `expect(paths).toHaveLength(4)` が失敗する。

影響範囲は 1 行（`4` → `5`）であり、実装者は機械的に修正できる。ただし「無改変で green」という記述は技術的に正確でなく、実装者が誤読してテスト更新を避ける可能性がある。

推奨: 受け入れ基準の当該行を「既存テストのシナリオは無改変（length assertion は 5 に更新）で green」相当の表現に訂正するか、実装者に補足を伝える。ブロッカーではない。
