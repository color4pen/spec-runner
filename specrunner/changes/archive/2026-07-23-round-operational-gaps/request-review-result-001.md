# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### Bug 1: `pipelineManagedPaths` に `prCreateResultPath` が含まれない (#898)

- `src/core/pipeline/round-git-scope.ts:104-106` を読み確認
  - `pipelineManagedPaths(slug)` は現在 `[slugStateJsonPath, slugEventsPath, usageJsonPath, biteEvidenceResultPath]` の 4 つを返す
  - `prCreateResultPath(slug)` は含まれていない ✓
- `src/util/paths.ts:83-85` を読み確認
  - `prCreateResultPath(slug)` = `specrunner/changes/<slug>/pr-create-result.md` が定義済み ✓
- `partitionRoundChanges`（`round-git-scope.ts:133-152`）の挙動を確認
  - `managedSet` を `pipelineManagedPaths(slug)` から生成し、changed から管理パスを除外している
  - `pr-create-result.md` が managed に含まれない場合、declared にもなければ `offending` に分類されて round halt を引き起こす ✓
- `excludePipelineManagedChangePaths` は `isCanonicalDocPath` ベースの判定（5 canonical doc 名のみ保存）で、`pr-create-result.md` は canonical でなく change folder 配下なので除外される — これは invalidation diff 用の別関数であり、`partitionRoundChanges` は `pipelineManagedPaths` を使う別経路と確認 ✓

### Bug 2: `cross-boundary-invariants.md` に `src/core/runtime/**` と `src/core/verification/**` がない (#896)

- `specrunner/reviewers/cross-boundary-invariants.md` の frontmatter を読み確認
  - 現在 5 パス: `src/core/pipeline/**`, `src/core/step/**`, `src/state/**`, `src/store/**`, `src/adapter/**`
  - `src/core/runtime/**` と `src/core/verification/**` は含まれていない ✓
- 本文（観点・判定基準・補足）は変更しないという要件との整合性: frontmatter `paths` の追記のみで本文ノータッチは技術的に正しい ✓

### 既存テストの状態確認

- `src/core/pipeline/__tests__/round-git-scope.test.ts` を読み確認
  - `pipelineManagedPaths` テスト（line 43-57）に `expect(paths).toHaveLength(4)` があることを確認
  - `prCreateResultPath` 追加後は length が 5 になるため、この行は更新が必要になる
- `src/core/pipeline/__tests__/bite-evidence-pipeline.test.ts` を読み確認
  - bite-evidence のパイプライン wiring テスト。`pipelineManagedPaths` の length を直接テストしておらず、今回の変更の影響を受けない ✓
- `src/core/pipeline/__tests__/round-git-scope-pipeline-managed.test.ts` を読み確認
  - `excludePipelineManagedChangePaths` のテスト。今回の変更対象外の関数 ✓

### 設計判断の確認

- 採用: `pipelineManagedPaths` 単一ソースへの追加（呼び出し側変更なし）→ `partitionRoundChanges` と scoped commit の両方に同時に効く設計と確認 ✓
- 却下 2 案（pattern 緩和 / 命名変更）の理由は合理的 ✓

## 検証できなかった項目

None。全ての主要アサーションを読んで確認した。

## Findings 詳細

### Observation: `round-git-scope.test.ts` の `toHaveLength(4)` を更新する必要がある

受け入れ基準「既存の round-git-scope / bite-evidence テストは無改変で green」と実装の要件が局所的に矛盾する。

`src/core/pipeline/__tests__/round-git-scope.test.ts:49` に `expect(paths).toHaveLength(4)` があり、`prCreateResultPath` を追加すると length が 5 になって fail する。implementer はこの行を `toHaveLength(5)` に更新する必要がある。これは受け入れ基準が意図する「既存のテストの意味論を壊さない」という趣旨とは整合するが、文言通り「無改変」ではない。

影響は軽微（1 行のカウント更新）でブロッキングではない。
