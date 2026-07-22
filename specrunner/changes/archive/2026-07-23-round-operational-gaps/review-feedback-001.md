# Code Review Feedback — round-operational-gaps iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 受け入れ基準 チェック

| # | 受け入れ基準 | 結果 |
|---|-------------|------|
| 1 | pr-create-result.md のみが dirty な round で offending が空になりテストで固定 | ✅ |
| 2 | pr-create-result.md が scoped 合成 / round 合成の commit 対象に含まれるテスト固定 | ✅ |
| 3 | cross-boundary-invariants.md frontmatter に 2 glob 追加、既存 5 保存 | ✅ |
| 4 | 修正前挙動に戻すと該当テストが fail することを破壊確認として記録 | ✅ |
| 5 | 既存 round-git-scope / bite-evidence テスト無改変で green | ✅ |
| 6 | typecheck && test green | ✅ |

### T-01: pipelineManagedPaths への prCreateResultPath 追加

`src/core/pipeline/round-git-scope.ts` diff 確認:

- import 文に `prCreateResultPath` が追加されている（`../../util/paths.js` から）
- `pipelineManagedPaths(slug)` の返り値が 5 要素に更新されている
- JSDoc に `#898 fix, T-01` の説明が追加されている（biteEvidenceResultPath の注記と同型）
- `prCreateResultPath` は main ブランチの `src/util/paths.ts:83` に既存。import は純粋な追加。

### T-02/T-03: テスト更新・回帰テスト追加

`src/core/pipeline/__tests__/round-git-scope.test.ts` diff 確認:

- `PR_CREATE_RESULT` 定数が追加されている（`BITE_EVIDENCE` と同パターン）
- `pipelineManagedPaths` describe の第 1 テストが更新済み（名称、containment assertion、`toHaveLength(5)`）
- TC-001 シナリオが 2 ケース追加（declared changes あり / なし両方）
- 破壊確認コメントが `pipelineManagedPaths` describe 内に明示されている

### T-04: cross-boundary-invariants.md 更新

diff 確認:

- `src/core/runtime/**` と `src/core/verification/**` の 2 行が追加されている
- 既存 5 glob（`src/core/pipeline/**`, `src/core/step/**`, `src/state/**`, `src/store/**`, `src/adapter/**`）は保存・順序維持
- `## 目的` 以降の本文は無改変

### T-05: typecheck && test green

`specrunner/changes/round-operational-gaps/verification-result.md` 確認:

- build: passed (exit 0)
- typecheck: passed (exit 0)
- test: passed — 8947 passed, 1 skipped (8948 total)
- lint: passed (exit 0)
- changed-line-coverage: passed

### scoped commit 経路の確認

`src/core/step/commit-push.ts:451` が `pipelineManagedPaths(slug)` を呼んでいることを確認。
`pr-create-result.md` は `pipelineManagedPaths` 経由で `existingManaged` に含まれ、`stagePaths` に入る。
単一ソース設計通りであり、callsite の変更なしで両方の用途に効く。

## 検証できなかった項目

- TC-003/TC-004（runtime/verification 専変更で cross-boundary-invariants が skip しない）: manual テストのため実ジョブ実行で確認が必要。機械検証では確認不可。

## Findings 詳細

### [low] 同一 TC-001 ラベルのテスト 2 件が共存

`src/core/pipeline/__tests__/round-git-scope.test.ts` 内に以下の 2 テストが存在する:

- `it("TC-001: pr-create-result.md in changed → excluded from BOTH offending AND toStage", …)`
- `it("TC-001: pr-create-result.md only in changed (no declared changes) → toStage = [], offending = []", …)`

Vitest は full string で識別するため機能的問題はない。ただしテストレポートで TC-001 が 2 件並ぶと読者が混乱する可能性がある。

修正案: 2 件目のラベルを `TC-001b:` に改名する（または describe ブロックを分離する）。
