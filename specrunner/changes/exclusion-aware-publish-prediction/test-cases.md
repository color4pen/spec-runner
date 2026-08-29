# Test Cases: exclusion-aware-publish-prediction

## Summary

- **Total**: 29 cases
- **Automated** (unit/integration): 26
- **Manual**: 2
- **Priority**: must: 22, should: 7, could: 0

---

## TC-001: worktree dirty な除外 path が guarded step で UNPUSHABLE_PATH_BLOCKED を引き起こさない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: worktree 由来の除外 path は unpushable-path 判定でブロックされない > Scenario: worktree dirty な除外 path が guarded step で UNPUSHABLE_PATH_BLOCKED を引き起こさない

---

## TC-002: worktree dirty な除外 path が commitScopedPaths で UNPUSHABLE_PATH_BLOCKED を引き起こさない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: worktree 由来の除外 path は unpushable-path 判定でブロックされない > Scenario: worktree dirty な除外 path が commitScopedPaths で UNPUSHABLE_PATH_BLOCKED を引き起こさない

---

## TC-003: Layer 1 の follow-up 判定で除外 path が violation にならない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: worktree 由来の除外 path は unpushable-path 判定でブロックされない > Scenario: Layer 1 の follow-up 判定で除外 path が violation にならない

---

## TC-004: unpushed commit に含まれる除外 path は従来どおりブロックされる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: worktree 由来の除外 path は unpushable-path 判定でブロックされない > Scenario: unpushed commit に含まれる除外 path は従来どおりブロックされる

---

## TC-005: scoped step が除外 dirty path を残留違反として検出しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: scoped step の residual check が除外 path を violation 扱いしない > Scenario: scoped step が除外 dirty path を残留違反として検出しない

---

## TC-006: 除外対象でない dirty path は従来どおり residual violation になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: scoped step の residual check が除外 path を violation 扱いしない > Scenario: 除外対象でない dirty path は従来どおり residual violation になる

---

## TC-007: 除外パターンが protected canon path に一致しても write-scope 違反検査を迂回しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: scoped step の residual check が除外 path を violation 扱いしない > Scenario: 除外パターンが protected canon path に一致しても write-scope 違反検査を迂回しない

---

## TC-008: E2E — guarded step が除外未追跡ファイルを生成し job が完了する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 除外 path は worktree に保持されたまま後続 step へ進む > Scenario: E2E — guarded step が除外未追跡ファイルを生成し job が完了する

---

## TC-009: design 初期メッセージに delivery exclusions block が注入される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: design / review が除外 scope を delivery 判定に使う > Scenario: design 初期メッセージに delivery exclusions block が注入される

---

## TC-010: stagingExcludePatterns が未設定の場合 delivery exclusions block は含まれない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: design / review が除外 scope を delivery 判定に使う > Scenario: stagingExcludePatterns が未設定の場合 delivery exclusions block は含まれない

---

## TC-011: worktree 成分の除外 path がフィルタされる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `collectPublishablePaths` は worktree 成分のみに除外を適用する > Scenario: worktree 成分の除外 path がフィルタされる

---

## TC-012: unpushed-commit 成分の path はフィルタされない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `collectPublishablePaths` は worktree 成分のみに除外を適用する > Scenario: unpushed-commit 成分の path はフィルタされない

---

## TC-013: mixed reset された agent self-commit は worktree 成分として除外対象になる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-10: ユニットテスト — unpushable-path 判定の除外（mixed reset した agent self-commit のテスト）

**GIVEN** `.github/workflows/x.yml` が mixed reset 後に worktree dirty（`git status` に untracked または modified として出現）であり、`worktreeExcludePatterns: [".github/workflows/**"]` を指定する
**WHEN** `collectPublishablePaths` を呼び出す
**THEN** `.github/workflows/x.yml` が戻り値に含まれない（worktree 成分として除外が適用される）

---

## TC-014: `collectPublishablePaths` の省略引数での後方互換性

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01: `collectPublishablePaths` に worktree 除外フィルタを追加する（Acceptance Criteria: 引数を省略した場合（既存呼び出し形式）の動作が変わらない）

**GIVEN** `worktreeExcludePatterns` を省略して `collectPublishablePaths(spawnFn, cwd)` を呼び出す
**WHEN** worktree に dirty な path が存在する
**THEN** 全 dirty path（worktree 成分 + unpushed-commit 成分）が戻り値に含まれ、既存の動作と変わらない

---

## TC-015: `commitScopedPaths` の省略引数での後方互換性

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03: Layer 2 backstop — `commitScopedPaths` に除外パラメータを追加する（Acceptance Criteria: 引数を省略した場合（既存呼び出し形式）の動作が変わらない）

**GIVEN** `worktreeExcludePatterns` を省略して `commitScopedPaths` を呼び出す
**WHEN** worktree に dirty な path が存在する
**THEN** 除外フィルタが適用されない従来どおりの動作となる

---

## TC-016: `validateStepOutputs` の省略引数での後方互換性

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05: Layer 1 — `validateStepOutputs` インターフェースと実装に除外パラメータを追加する（Acceptance Criteria: 第 4 引数を省略した場合（既存テスト・executor.ts）の動作が変わらない）

**GIVEN** `excludeWorktreePatterns` を省略して `validateStepOutputs(followUpContracts, cwd, branch)` を呼び出す
**WHEN** worktree に dirty な path が存在する（unpushable path も含む）
**THEN** 既存の unpushable-path 判定ロジックが変わらず動作する

---

## TC-017: `buildDeliveryExclusionsBlock` — 空 patterns で空文字列を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08: `buildDeliveryExclusionsBlock` ユーティリティを追加し、design/review メッセージに注入する（staging-containment.ts）

**GIVEN** `patterns: []`（空配列）を渡す
**WHEN** `buildDeliveryExclusionsBlock([])` を呼び出す
**THEN** 空文字列 `""` が返される（ブロックが生成されない）

---

## TC-018: `buildDeliveryExclusionsBlock` — 非空 patterns で markdown ブロックを生成する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08: `buildDeliveryExclusionsBlock` ユーティリティを追加し、design/review メッセージに注入する（staging-containment.ts）

**GIVEN** `patterns: [".github/workflows/**", "vendor/**"]`
**WHEN** `buildDeliveryExclusionsBlock` を呼び出す
**THEN** `"## Delivery exclusions"` ヘッダーを含む markdown 文字列が返される
**AND** `"- .github/workflows/**"` および `"- vendor/**"` のリスト形式の項目が含まれる
**AND** `"must not be required in the synthesized commits"` の記述が含まれる

---

## TC-019: code-review メッセージに delivery exclusions block が注入される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08: `buildDeliveryExclusionsBlock` ユーティリティを追加し、design/review メッセージに注入する（code-review.ts）

**GIVEN** `stagingExcludePatterns: [".github/workflows/**"]` が設定されている
**WHEN** `CodeReviewStep.buildMessage` / `buildCodeReviewInitialMessage` を呼び出す
**THEN** 返り値のメッセージに `"## Delivery exclusions"` セクションが含まれる
**AND** セクション内に `"- .github/workflows/**"` がリスト形式で含まれる

---

## TC-020: conformance メッセージに delivery exclusions block が注入される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08: `buildDeliveryExclusionsBlock` ユーティリティを追加し、design/review メッセージに注入する（conformance.ts）

**GIVEN** `stagingExcludePatterns: [".github/workflows/**"]` が設定されている
**WHEN** `ConformanceStep.buildMessage` を呼び出す
**THEN** 返り値のメッセージに `"## Delivery exclusions"` セクションが含まれる
**AND** セクション内に `"- .github/workflows/**"` がリスト形式で含まれる

---

## TC-021: custom-reviewer メッセージに delivery exclusions block が注入される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08: `buildDeliveryExclusionsBlock` ユーティリティを追加し、design/review メッセージに注入する（custom-reviewer.ts）

**GIVEN** `stagingExcludePatterns: [".github/workflows/**"]` が設定されている
**WHEN** `buildCustomReviewerMessage` / `createCustomReviewerStep.buildMessage` を呼び出す
**THEN** 返り値のメッセージに `"## Delivery exclusions"` セクションが含まれる
**AND** セクション内に `"- .github/workflows/**"` がリスト形式で含まれる

---

## TC-022: `renderPushCapabilityNotice` — 除外 path が advance warning から除かれる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-09: `renderPushCapabilityNotice` に worktree 除外フィルタを追加する

**GIVEN** `worktreeExcludePatterns: [".github/workflows/**"]` を指定し、`predictedTouchedFiles: [".github/workflows/ci.yml", "src/index.ts"]` を渡す
**WHEN** `renderPushCapabilityNotice(pushCapability, predictedTouchedFiles, worktreeExcludePatterns)` を呼び出す
**THEN** `.github/workflows/ci.yml` が advance warning の対象から除かれる
**AND** `src/index.ts` は除外対象でないため警告対象として残る

---

## TC-023: `renderPushCapabilityNotice` の省略引数での後方互換性

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-09: `renderPushCapabilityNotice` に worktree 除外フィルタを追加する（Acceptance Criteria: 引数を省略した場合（既存 caller）の動作が変わらない）

**GIVEN** `worktreeExcludePatterns` を省略して `renderPushCapabilityNotice(pushCapability, predictedTouchedFiles)` を呼び出す
**WHEN** `predictedTouchedFiles` に除外 pattern に一致するファイルが含まれる
**THEN** 除外フィルタが適用されず、既存の動作と変わらない

---

## TC-024: halt → resume でも除外対象 path が reconcile で破壊されない

**Category**: integration
**Priority**: must
**Source**: design.md > Goals (Goal 3: guarded step が生成した除外未追跡ファイルが `git clean` で削除されずに worktree に保持される) / request.md 受け入れ基準（halt → resume を挟んでも、worktree が継続している限り除外対象 path が reconcile で破壊されない）

**GIVEN** `stagingExcludePatterns: [".github/workflows/**"]` が設定されており、guarded step が `.github/workflows/ci.yml` を未追跡ファイルとして生成して worktree に保持している状態で job が別理由で halt する
**WHEN** resume（reconcile フェーズを含む）が実行される
**THEN** `.github/workflows/ci.yml` が reconcile 処理（`git clean -f` 等）で削除されない
**AND** worktree が継続している限り除外対象ファイルが保持される

---

## TC-025: `docs/configuration.md` の stagingExcludePatterns 記述が新契約に更新されている

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-13: `docs/configuration.md` の更新

**GIVEN** `docs/configuration.md` を開く
**WHEN** `stagingExcludePatterns` のセクション（Guarded staging containment）を確認する
**THEN** staging 適用 = guarded step のみ・効力（unpushable-path 判定・scoped residual check・design/review の delivery scope）= pipeline 全体という内容が明記されている
**AND** `"All three settings affect GUARDED steps only"` などの旧記述が削除または修正されている
**AND** テーブル行の説明が「Guarded steps のみに staging 適用。ただし unpushable-path 判定・scoped residual check・design/review の delivery scope は pipeline 全体に適用。」等の新記述になっている

---

## TC-026: `docs/configuration.md` の `maxStagedFiles`・`maxStagedBytes` 記述が非退行

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-13: `docs/configuration.md` の更新（Acceptance Criteria: `maxStagedFiles`・`maxStagedBytes` のテーブル行は「Guarded steps only」のまま変更されていない）

**GIVEN** `docs/configuration.md` を開く
**WHEN** `maxStagedFiles` および `maxStagedBytes` のテーブル行を確認する
**THEN** 両設定の説明に `"Guarded steps only"` の記述が維持されており、変更されていない

---

## TC-027: typecheck / test / architecture tests が green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-14: typecheck / lint / test の green 確認

verification コマンド:
- `bun run typecheck` — exit 0（型エラーなし）
- `bun run test` — exit 0（全テスト pass、新規テスト TC-001〜TC-024 を含む）
- architecture tests（存在する場合）— exit 0

---

## TC-028: DSM 制約 — `push-capability.ts` が `staging-containment.ts` をインポートしない

**Category**: unit
**Priority**: must
**Source**: design.md > D1（Rationale: `push-capability.ts` は `src/git/` 共有カーネル層。`staging-containment.ts` のインポートは DSM 違反になるため `matchesGlob` をインライン使用する）

**GIVEN** `src/git/push-capability.ts` のインポート文一覧
**WHEN** ファイルを静的解析する
**THEN** `staging-containment.ts` または `staging-containment` へのインポートが存在しない
**AND** `matchesGlob` を使ったインラインフィルタで除外処理が実装されている

---

## TC-029: parallel-review-round 経由の `commitRoundArtifacts` が除外 path を UNPUSHABLE_PATH_BLOCKED しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04: `commitRoundArtifacts` / `parallel-review-round.ts` 経由で除外パラメータを渡す（Acceptance Criteria: parallel-review-round から呼ばれる `commitRoundArtifacts` が `UNPUSHABLE_PATH_BLOCKED` を throw しない）

**GIVEN** `stagingExcludePatterns: [".github/workflows/**"]` が設定されており、`.github/workflows/ci.yml` が worktree dirty な状態
**WHEN** `parallel-review-round.ts` から `deps.runtimeStrategy.commitRoundArtifacts` を経由して `commitScopedPaths` が呼び出される（`egressParams` に `excludeWorktreePatterns` が含まれる）
**THEN** `UNPUSHABLE_PATH_BLOCKED` が throw されない
**AND** `egressParams.excludeWorktreePatterns` が `local.ts:commitRoundArtifacts` → `commitScopedPaths` まで正しく伝播している

---

## Result

```yaml
result: completed
total: 29
automated: 26
manual: 2
gate: 1
must: 22
should: 7
could: 0
blocked_reasons: []
```
