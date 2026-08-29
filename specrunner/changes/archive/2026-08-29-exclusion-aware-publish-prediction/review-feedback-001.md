# Code Review Feedback — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

| 項目 | 確認方法 |
|---|---|
| 受け入れ基準全件の実装確認 | design.md / tasks.md を読み、実装ファイル（push-capability.ts, commit-push.ts, local.ts, staging-containment.ts, design.ts, code-review.ts, conformance.ts, custom-reviewer.ts, step-context-builder.ts, parallel-review-round.ts）を読んで照合 |
| test-cases.md TC-001〜TC-029 の自動テスト網羅確認 | 新規テストファイル 4 本（push-capability.test.ts, commit-push-exclusion.test.ts, exclusion-aware-validation.test.ts, reconcile-worktree-exclusion.test.ts）の header comment および describe ブロックを読んで TC ID を照合 |
| TC-003 の有無 | `exclusion-aware-validation.test.ts` 全文 + `grep "TC-003\|validateStepOutputs" src/` → 当該 TC の describe ブロックが存在しない事を確認 |
| TC-008 の有無 | 全 4 テストファイルを目視 + grep → E2E 統合シナリオのテストブロックが存在しない事を確認 |
| Layer 2 guarded 除外配線 | commit-push.ts L519–536 を読んで `resolveStagingExcludePatterns(deps.config)` → `collectPublishablePaths(…, layer2ExcludePatterns)` の配線を確認 |
| Layer 2 scoped（commitScopedPaths）除外配線 | commit-push.ts L1003–1036 を読んで 8 番目引数 `worktreeExcludePatterns` → `collectPublishablePaths` の配線を確認 |
| scoped residual pre-filter 配線 | commit-push.ts L577–601 を読んで `applyStagingExclusions(postStatus.paths, residualExcludePatterns)` → `findScopedCommitViolations` の配線を確認。`findWriteScopeViolations` は `postStatus.stagedOnly` を使い除外前のまま（保護 canon 不変条件維持）を確認 |
| parallel-review-round egressParams 伝播 | parallel-review-round.ts L432–448 を読んで `excludeWorktreePatterns: resolveStagingExcludePatterns(deps.config)` が egressParams に追加されている事を確認 |
| local.ts:commitRoundArtifacts 抽出 | local.ts L923–938 を読んで `egress?.excludeWorktreePatterns` を 8 番目引数として `commitScopedPaths` に渡している事を確認 |
| Layer 1 validateStepOutputs 配線 | runtime-strategy.ts L412–417（インターフェース）と local.ts L1534–1621 を読んで `excludeWorktreePatterns` → `collectPublishablePaths` の配線を確認 |
| step-context-builder 配線 | step-context-builder.ts L127–166 を読んで `excludeWorktreePatterns = resolveStagingExcludePatterns(deps.config)` を一度解決し `strategy.validateStepOutputs(…, excludeWorktreePatterns)` に渡している事を確認 |
| DSM 制約（TC-028） | push-capability.ts の import 文を確認 → `staging-containment.ts` へのインポートが存在しない、`matchesGlob` を `util/glob-match.js` からインライン使用している事を確認 |
| collectPublishablePaths worktree / commit 分離 | push-capability.ts L126–207 を読んで、worktree 成分（section a）の後に除外フィルタ適用、commit 成分（section b）はフィルタ対象外である事を確認 |
| buildDeliveryExclusionsBlock | staging-containment.ts L212–216 を読んで空配列→空文字列・非空→markdown ブロック生成を確認 |
| design / code-review / conformance / custom-reviewer への注入 | 各ファイルの buildMessage 実装を確認。resolveStagingExcludePatterns → buildDeliveryExclusionsBlock → メッセージ組み立てへの注入を確認 |
| docs/configuration.md 更新 | L412–444 を読んで「2 層構造」の説明が追加・テーブル行が更新されている事を確認。maxStagedFiles / maxStagedBytes は「Guarded steps only」のまま非退行であることを確認 |
| verification-result.md の green 確認 | build / typecheck / test / lint / changed-line-coverage 全フェーズ passed を確認 |
| reconcile 非破壊（TC-024） | reconcile-worktree-exclusion.test.ts の isReconcilableArtifact + reconcileWorktreeArtifacts テストを確認 |

## 検証できなかった項目

- **TC-008 の自動テスト**: E2E 統合ストーリー（guarded commit → scoped review → 完了）の自動テストが存在せず、実際の統合シナリオを検証する手段がない（F-002 で報告）
- **managed runtime の `validateStepOutputs`**: managed runtime 実装が 4 引数目を受け取るかどうかを確認していない（省略可能引数で既存実装は互換を維持するが、明示的なテストはなし）

## Findings 詳細

### F-001: TC-003 unit test missing — `validateStepOutputs` with `excludeWorktreePatterns`

tasks.md T-12 は `[x]` で「Layer 1 `validateStepOutputs` のテスト」を done としているが、`exclusion-aware-validation.test.ts` のファイルヘッダーと describe ブロックを確認したところ TC-003 が存在しない。

カバーされている TC: TC-009, TC-010, TC-017, TC-018, TC-019, TC-020, TC-021 のみ。

実装は正しい（step-context-builder.ts → local.ts L1621 → collectPublishablePaths の配線は確認済み）が、この配線に対するダイレクトな unit test がない。受け入れ基準「同設定下で Layer 1（`validateStepOutputs`）が unpushable-path violation を報告しない」に対応するテストが欠落している。

**修正方法**: `exclusion-aware-validation.test.ts`（または新規ファイル）に TC-003 describe ブロックを追加する。`spawnFn` mock で `.github/workflows/x.yml` を worktree-dirty として返し、`LocalRuntime.validateStepOutputs([{ kind: "unpushable-path", patterns: [".github/workflows/**"], … }], cwd, branch, [".github/workflows/**"])` を呼び出して `violations` が空であることを assert する。

---

### F-002: TC-008 integration test (must) missing

test-cases.md の summary: `automated: 26` に TC-008 が含まれているが、いずれのテストファイルにも TC-008 の describe ブロックが存在しない。

TC-001（guarded UNPUSHABLE_PATH_BLOCKED しない）・TC-005（scoped WRITE_SCOPE_VIOLATION しない）・TC-024（reconcile 非破壊）が個別には確認されているが、これらを順に組み合わせた統合ストーリー（guarded commit 後に除外ファイルが worktree に残り → scoped commit でも WRITE_SCOPE_VIOLATION が起きない → 完了）は自動テストで固定されていない。

**修正方法**: `commit-push-exclusion.test.ts`（または新規ファイル）に、guarded `commitAndPush` → scoped `commitAndPush` を順に呼び出し、両者が resolve し、かつ除外ファイルへの git clean が呼ばれないことを assert する複数フェーズのテストを追加する。

---

### F-003: TC-015, TC-016 (should) backward compat tests absent

test-cases.md の automated 26 件に TC-015, TC-016 が含まれているが、いずれのファイルにも describe ブロックが存在しない。

- TC-015: `commitScopedPaths` を 7 引数（`worktreeExcludePatterns` 省略）で呼んだ場合に既存動作が変わらないことのテスト
- TC-016: `validateStepOutputs` を 3 引数（`excludeWorktreePatterns` 省略）で呼んだ場合に既存動作が変わらないことのテスト

should 優先度であるが、宣言された automated 26 件に算入されているため乖離がある。

**修正方法**: 省略引数でそれぞれを呼び出し、既存の unpushable-path 判定ロジックが変わらず動作する（引数省略で crash しない・戻り値が変わらない）ことを assert する小テストを追加する。
