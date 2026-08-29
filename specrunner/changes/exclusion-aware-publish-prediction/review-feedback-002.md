# Code Review Feedback — iteration 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

| 項目 | 確認方法 |
|---|---|
| iteration 1 の F-001〜F-003 修正確認 | review-feedback-001.md を読み、指摘された TC-003 / TC-008 / TC-015 / TC-016 が exclusion-aware-validation.test.ts および commit-push-exclusion.test.ts に実装済みであることを確認 |
| TC-001: guarded UNPUSHABLE_PATH_BLOCKED 非発生 | commit-push-exclusion.test.ts L175–218 を読んで describe ブロックと assert を確認。`WORKFLOWS_CAPABILITY` + `stagingExcludePatterns` 下で `commitAndPush` が resolve することを確認 |
| TC-002: commitScopedPaths UNPUSHABLE_PATH_BLOCKED 非発生 | commit-push-exclusion.test.ts L223–268 を確認。8 番目引数 `worktreeExcludePatterns` を渡して resolve することを確認 |
| TC-003: Layer 1 validateStepOutputs 除外パス非 violation | exclusion-aware-validation.test.ts L95–135 の describe ブロックを確認。`LocalRuntime.validateStepOutputs` を 4 引数で呼び violations が空であることを assert |
| TC-004: unpushed commit 側はブロックされる | commit-push-exclusion.test.ts L274–302 を確認。commit 成分（diff-tree）に含まれる path は UNPUSHABLE_PATH_BLOCKED される |
| TC-005: scoped step residual non-violation | commit-push-exclusion.test.ts L308–362 を確認。`applyStagingExclusions` → `findScopedCommitViolations` の除外配線で WRITE_SCOPE_VIOLATION が発生しない |
| TC-006: 非除外 dirty path は従来どおり residual violation | commit-push-exclusion.test.ts L368–406 を確認。`vendor/x.js`（除外対象外）が WRITE_SCOPE_VIOLATION を引き起こす |
| TC-007: write-scope bypass 防止（guarded mode） | commit-push-exclusion.test.ts L412–450 を確認。guarded mode で `findWriteScopeViolations` が full `changedPaths`（除外前）に対して実行されることを guarded step テストで固定 |
| TC-008: E2E — guarded→scoped 統合シナリオ | commit-push-exclusion.test.ts L498–610 を確認。guarded commitAndPush → scoped commitAndPush の順で両者が resolve し、除外ファイルへの `git clean` が発生しないことを assert |
| TC-009/010: design delivery exclusions block 注入 | exclusion-aware-validation.test.ts を確認。`DesignStep.buildMessage` で `buildDeliveryExclusionsBlock` が注入される / 未設定時は含まれないことを確認 |
| TC-011〜TC-014: collectPublishablePaths worktree/commit 分離 | push-capability.test.ts を読んで、worktree 成分のみ除外 / commit 成分は除外されない / mixed reset は worktree 扱い / 省略引数後方互換性を確認 |
| TC-015: commitScopedPaths 後方互換性 | commit-push-exclusion.test.ts L616–680 を確認。7 引数呼び出し（省略）で crash しないこと、および 8 番目引数省略時は除外が適用されない旧動作を確認 |
| TC-016: validateStepOutputs 後方互換性 | commit-push-exclusion.test.ts L682–734 を確認。3 引数呼び出しで dirty path が violation として報告される旧動作を確認 |
| TC-017/018: buildDeliveryExclusionsBlock | exclusion-aware-validation.test.ts を確認。空配列→空文字列 / 非空配列→markdown ブロック生成を確認 |
| TC-019/020/021: code-review / conformance / custom-reviewer 注入 | exclusion-aware-validation.test.ts を確認。各ステップの buildMessage が exclusions section を含むことを assert |
| TC-022/023: renderPushCapabilityNotice 除外・後方互換 | push-capability.test.ts L203–256 を確認 |
| TC-024: reconcile 非破壊 | reconcile-worktree-exclusion.test.ts を読んで isReconcilableArtifact が change-folder 外の path（.github/workflows/**、vendor/**）を非 reconcilable と分類することを確認 |
| TC-025: docs/configuration.md 更新 | docs/configuration.md L412–444 を読んで「2 層構造」の説明（staging 適用 = guarded / 効力 = pipeline 全体）が記載されていることを確認 |
| TC-026: maxStagedFiles / maxStagedBytes 非退行 | docs/configuration.md のテーブル行（L442–444）を確認。`maxStagedFiles` / `maxStagedBytes` の説明に「Guarded steps only.」が維持されていることを確認 |
| TC-027: typecheck / test / architecture tests green | verification-result.md を読んで build / typecheck / test / lint / changed-line-coverage 全フェーズ passed を確認 |
| TC-028: DSM 制約 — push-capability.ts が staging-containment.ts を import しない | push-capability.ts の import 文（L13–14）を確認 → `matchesGlob` を `../util/glob-match.js` から import、`staging-containment` への import が存在しない |
| TC-029: parallel-review-round 経由の excludeWorktreePatterns 伝播 | parallel-review-round.ts L443–447 を読んで `excludeWorktreePatterns: resolveStagingExcludePatterns(deps.config)` が egressParams に含まれていることを確認。local.ts L933–937 で egress?.excludeWorktreePatterns が commitScopedPaths の 8 番目引数に渡されていることを確認 |
| scoped 残留チェック — applyStagingExclusions 配線 | commit-push.ts L583–586 を読んで `applyStagingExclusions(postStatus.paths, residualExcludePatterns)` → `findScopedCommitViolations` の流れを確認。`findWriteScopeViolations` は `postStatus.stagedOnly`（除外フィルタなし）を使う不変条件を確認 |
| guarded write-scope 順序 | commit-push.ts L659–676 を読んで `findWriteScopeViolations`（L661: 全 changedPaths）が `applyStagingExclusions`（L676）より前に実行される順序を確認 |
| design-system.ts delivery exclusions 注入点 | design-system.ts L184–189 を確認。deliveryExclusionsBlock が </user-request> 後（constraints / factCheck と同列）に追記されることを確認 |
| conformance.ts delivery exclusions 注入点 | conformance.ts L78–103 を確認 → exclusionsSection が `<user-request>` タグ内・"Do NOT write a verdict line" の後・"Original request:" の前に配置されていることを確認（F-001 で記録） |

## 検証できなかった項目

- **TC-007 scoped mode の write-scope bypass 防止**: scoped mode で stagedOnly フィルタリング無しを直接 assert するテストは存在しない（guarded mode でのみ固定。scoped mode は実装の構造（stagedOnly は filteredResidualPaths に影響されない）から正しいが、明示テストが不在）
- **managed runtime の validateStepOutputs**: managed runtime 実装が 4 引数目を受け取るかどうかを確認していない（省略可能引数で後方互換は保たれる）

## Findings 詳細

### F-001: conformance.ts の delivery exclusions block が `<user-request>` タグ内・完了指示の後に配置されている

**場所**: `src/core/step/conformance.ts` L78–103

**問題**:
design.ts / code-review.ts では `deliveryExclusionsBlock` が `</user-request>` の後（constraints section と同位置）に注入されるが、conformance.ts では `<user-request>` タグ内の "Do NOT write a verdict line" の後に配置されている。

design.md D4 は「注入点: request 制約ブロック（constraints block）の後、完了指示の前」と定めており、現行の conformance.ts は完了指示（"Do NOT write a verdict line"）の**後**にブロックを置いている。これは:
- code-review / design との配置一貫性を欠く
- 設計仕様の「完了指示の前」という意図と逆順になる

**実際の影響**: 軽微（conformance agent は全文を読むため機能的には動作する）。ただし `<user-request>` タグ内と外では agent のコンテキスト解釈が異なる可能性があり、将来の prompt parsing で問題になり得る。

**修正方法**:
```ts
// 現行 (conformance.ts)
return `<user-request>
...
Do NOT write a verdict line. Verdict is derived by CLI from typed findings (report_result).
${exclusionsSection}
Original request:
...
</user-request>
...`;

// 修正案: </user-request> の後に移動（code-review / design と統一）
return `<user-request>
...
Do NOT write a verdict line. Verdict is derived by CLI from typed findings (report_result).

Original request:
...
</user-request>${exclusionsSection}
...`;
```
