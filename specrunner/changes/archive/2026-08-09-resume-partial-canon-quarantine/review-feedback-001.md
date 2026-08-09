# Code Review Feedback — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 読んだファイル

- `src/core/resume/canon-provenance.ts` — 純粋ヘルパー実装全体
- `src/core/resume/apply-canon.ts` — re-export 追加部分
- `src/core/resume/reconcile-worktree.ts` — `quarantineAndRemoveMatching` core + `quarantinePartialCanon` 実装全体
- `src/core/command/resume.ts` — 三分岐ゲート + `staleRunningDetected` キャプチャ変更
- `src/core/resume/__tests__/apply-canon-provenance.test.ts` — pure helper 単体テスト全体 (TC-011〜TC-022)
- `src/core/command/__tests__/resume-partial-canon.test.ts` — gate 統合テスト全体 (TC-001〜TC-010, TC-027)
- `tests/resume-partial-canon-quarantine-e2e.test.ts` — real-git e2e テスト全体 (TC-023〜TC-026)
- `src/core/step/write-scope.ts` — `protectedCanonPaths` 定義確認
- `src/core/step/design.ts` — `writes()` 実装確認（`verify: isSpecRequired(...)` フィルタ）
- `src/core/port/step-types.ts` — `IoRef.verify?: boolean` 定義確認
- `src/core/port/step-context.ts` — `StepContext`（= `StepDeps`）フィールド確認
- `src/core/attach/verify-checkpoint.ts` — `new Map(descriptor.steps).get(name)` パターン確認
- `src/config/type-config.ts` — `isSpecRequired` / `chore` 判定確認
- `specrunner/changes/resume-partial-canon-quarantine/verification-result.md` — typecheck/test 結果確認

### 確認した差分

- `git diff main...HEAD --stat` でスコープ全体把握
- `git diff main...HEAD -- src/core/command/resume.ts` で gate 変更の実コード確認
- 既存テスト (`reconcile-worktree.test.ts`, `resume-reconcile.test.ts`, `resume-apply-canon.test.ts`, `resume-hard-crash.test.ts`) の diff が空であること確認（無改変）

### 確認したロジックポイント

1. **`staleRunningDetected` キャプチャ順序**
   - `isStaleRunning(state, sidecarPath)` は line 164（`state = recovered` の書き換え前）
   - stale 分岐で `state = recovered` が走っても `staleRunningDetected` は元値を保持 ✓

2. **`resumePoint` キャプチャ後の stale 変異**
   - line 196 `const resumePoint = state.resumePoint ?? null;` は stale 分岐後に評価
   - SIGKILL/stale 路では `recovered.resumePoint = null`（patch が `{ pid: null }` のみ）
   - `isInterruptionBacked(null, true) = true` ✓

3. **`interruptedStep` と `completedStepRunAbsent` のソース**
   - `interruptedStep = state.step` — pre-running-transition state（または recovered state）
   - `completedStepRunAbsent = !(state.steps?.[interruptedStep]?.length)` — 同じ state
   - `transitionJob` to "running" の patch は `step` / `steps` を変更しない ✓

4. **`declaredCanonWritesForStep` に `updatedState` を渡す妥当性**
   - `getPipelineId(updatedState)` は `request.type` / `reviewers` に依存
   - "running" 遷移は両者を変更しないため `getPipelineId` の結果は不変 ✓

5. **`verify !== false` フィルタの動作**
   - `design.writes()` で `spec.md` は `verify: isSpecRequired(deps.request.type)`
   - `chore` → `verify: false` → フィルタで除外 → declaredCanonWrites に含まれない ✓
   - `design.md`, `tasks.md` → `verify` 未定義 → `undefined !== false` → 含まれる ✓

6. **`minimalDeps` の StepContext 適合**
   - `StepContext` の必須フィールドは `config`, `slug`, `request`（`cwd` はオプション）
   - `minimalDeps = { slug, request, config }` は型的に満たしている ✓
   - `design.writes()` は `deps.slug` と `deps.request.type` のみ参照 ✓

7. **evidence-first / fail-closed 不変の確認**
   - `quarantineAndRemoveMatching` の step 4（fsWriteFile all）が step 5（git clean/checkout all）より先
   - fsWriteFile 例外は `await` で伝播 → step 5 未到達 ✓
   - `fsMkdir(quarantineDir, { recursive: true })` も step 4 の手前で fail-closed ✓

8. **`reconcileWorktreeArtifacts` 外部シグネチャの不変**
   - 外部シグネチャ: `(slug, worktreePath, spawnFn) => Promise<ReconcileResult>` 不変
   - 戻り値型 `ReconcileResult` 不変
   - git コマンド列（`git status | filter | evidence | clean/rm/checkout`）不変
   - 既存テスト 3 ファイルの diff が空 → 機械的歯が緑のまま ✓

9. **受け入れ基準 9 点の充足**
   - untracked / tracked-modified 両ケース: TC-001/002 (integration) + TC-023 (e2e) ✓
   - evidence 可読性: TC-003 (integration) + TC-023 untracked/tracked-modified (e2e) ✓
   - 裏づけ無し halt: TC-004 (integration) + TC-013/014 (unit) ✓
   - writes() 外混在 halt: TC-005 (integration) + TC-019 (unit) ✓
   - `--apply-canon` 優先: TC-007 (integration) ✓
   - 退避失敗 halt / 未削除: TC-008 (integration) + TC-024 (e2e) ✓
   - stale-running 経路: TC-009 (integration) ✓
   - 冪等性: TC-010 (integration) + TC-023(idempotency) (e2e) ✓
   - typecheck && test green: verification-result.md 確認 ✓

## 検証できなかった項目

None — 全受け入れ基準を確認した。

## Findings 詳細

指摘なし。

### 参考観察（非ブロッキング）

**TC-009 mock の簡略化**

`setupStaleRunningDesign()` では `status: "awaiting-resume"` + `isStaleRunning.mockReturnValue(true)` を組み合わせている。実際の stale 経路（`status: "running"` → `state = recovered`）の state 変異パスは経由しないが、apply-canon gate での `staleRunningDetected = true` の動作を正しく検証している。stale 遷移自体は `resume-hard-crash.test.ts`（無改変・緑）でカバー済み。resume.ts のコメントでも明示されており、意図的な簡略化。

**`as StepDeps` キャスト**

`const minimalDeps = { slug: resolvedSlug, request, config } as StepDeps;` — `{ slug, request, config }` は `StepContext`（= `StepDeps`）の必須フィールドをすべて持つため、キャスト無しでも成立する。冗長だが無害。
