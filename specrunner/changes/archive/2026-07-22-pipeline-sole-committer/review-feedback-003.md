# Code Review Feedback — iteration 003

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## iteration 002 からの修正確認

iteration 002 の F-001（T-08 wiring 欠落）/ F-002（commitFinalState egress なし）/ F-003（HEAD guard reset fail-open）の 3 件はすべて前回確認済みで修正されている。iteration 003 は新規 findings を対象とする。

---

## 読んだファイル

- `src/core/step/commit-push.ts`（全文 / 765 行）
- `src/core/pipeline/parallel-review-round.ts`（全文）
- `src/core/step/commit-orchestrator.ts`（全文）
- `src/core/step/executor.ts`（runCliStep 周辺 l.550-617）
- `src/core/verification/propagate.ts`（全文）
- `src/core/pipeline/round-git-scope.ts`（全文）
- `src/core/runtime/local.ts`（commitFinalState / commitRoundArtifacts 周辺 l.670-840）
- `src/state/schema/types.ts`（synthesizedCommits field / StepRun.commitOid docstring）
- `src/state/schema/operations.ts`（appendSynthesizedCommit）
- `src/errors.ts`（EGRESS_UNKNOWN_COMMIT / ROUND_HEAD_ADVANCED）
- `tests/unit/step/pipeline-sole-committer-synthesis.test.ts`
- `tests/unit/step/pipeline-sole-committer-egress.test.ts`
- `tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts`
- `tests/unit/pipeline/pipeline-sole-committer-bite-evidence.test.ts`
- `tests/unit/state/pipeline-sole-committer-state.test.ts`
- `tests/unit/core/step/pipeline-sole-committer-final-state.test.ts`
- `tests/unit/architecture/write-scope-invariants.test.ts`
- `tests/pipeline-sole-committer-e2e.test.ts`
- `specrunner/changes/pipeline-sole-committer/verification-result.md`

---

## 検証した項目

### R1: mixed reset + 明示パス合成

- `headBeforeStep` と `headAtEntry` を比較し、前進していれば `git reset --mixed <headBeforeStep>` を呼ぶ実装を `commitAndPush` l.395-404 で確認。
- scoped 合成: `pipelineManagedPaths(slug)` + declared writes を `filterExistingFiles` でフィルタし、明示 pathspec で `git add -A -- <stagePaths>` → `git commit -- <stagePaths>`。
- guarded 合成: `git status --porcelain -z --no-renames` で実変更列挙 → allowlist 検証 → `git add -A -- <changedPaths>` → `git commit -- <changedPaths>`。
- `changedPaths.length === 0` かつ whole-index staged changes ありの場合 `throw commitEffectFailedError("staged changes present but enumeration is empty")` で fail-closed（index 全体 commit 防護）。
- `commitAndPushTail` / `push-as-is` / `listCommitRangeChangedPaths` がソースから消えていることを grep で確認（ゼロヒット）。

### R2: commitFinalState 限定化

- 旧裸 `git add -A` を廃止し、`pipelineManagedPaths(slug)` の各パスに対して `git add -- <p>` ループを採用（l.603-608）。
- `stagedPaths`（add 成功パスのみ）を commit pathspec に渡す: `git commit -m "..." -- <stagedPaths>`（l.632）。

### R3: HEAD guard

- `baselineCommit` を fan-out 前の `captureHeadSha` で取得（l.134）。
- fan-out 後 `headAfterFanOut` を取得し比較（l.271-272）。
- 前進検出時: `quarantineRoundHeadAdvanceEvidence` → `git reset --mixed baselineCommit` → reset 失敗時は `throw SpecRunnerError(COMMIT_AND_PUSH_FAILED)` で fail-closed（l.287-293）。
- `roundError.code = "ROUND_HEAD_ADVANCED"` / `inspectionEscalated = true` → commitRound 後 escalation halt。

### R4: egress backstop (synthesizedCommits 台帳)

- `synthesizedCommits?: string[]` が `types.ts` l.504 で `JobState` に追加されていることを確認。
- `appendSynthesizedCommit` が `operations.ts` に実装（pure transform, dedup）されていることを確認。
- `commitSuccess` l.365-373: agent step の `commitOid` と CLI step の `exitCommitOid` を両方 append。
- `commitRound` l.585-589: `roundCommitOid` を append。
- `runInlineEgressCheck`: 合成直後に `rev-parse HEAD` でカレント OID を取得して ledger に union し、`git rev-list HEAD --not --remotes=origin` で公開範囲と照合。
- `commitFinalState` の egress 検証（l.641-652）は best-effort（catch→警告→push スキップ）: terminal path で throw しない設計意図と合致し、セキュリティ上も push を止める挙動になっている。

### R5: fail-closed 化

- `getWorktreeChangedPaths ok:false` → `commitEffectFailedError("stage", "git status failed")` で halt（scoped / guarded 双方）を確認。
- `restoreViolatedPaths`: untracked/tracked 分割により各コマンドの exit code 失敗判定が一意になり、restore 失敗 → `throw commitEffectFailedError("restore")` で fail-closed。
- mixed reset 失敗: `commitAndPush` l.401-403 / round HEAD guard l.287-293 の両経路で throw を確認。

### R6: 実 git E2E

- TC-019（R6-1）/ TC-020（R6-2）が `tests/pipeline-sole-committer-e2e.test.ts` に実装されていることを確認。

### D6: bite-evidence-result.md (#888)

- `round-git-scope.ts` l.105: `pipelineManagedPaths` が `biteEvidenceResultPath(slug)` を含むことを確認。
- この単一ソースが scoped 合成の stagePaths と `partitionRoundChanges` の offending 除外の両方に効く。

### 静的解析

- `src/` 内の裸 `git add -A`（pathspec なし）を grep → ゼロヒット確認。
- F-012（pathspec なし bare `git commit`）の静的テストが `write-scope-invariants.test.ts` に追加されていることを確認。

### TC カバレッジ

TC-001〜TC-034 の全 34 件について対応するテストファイルの存在を確認。TC-034（typecheck && test green）は `verification-result.md` の passed（build / typecheck / test / lint / changed-line-coverage 全 passed）を証拠とする。

---

## 検証できなかった項目

None — 全 34 TC に対応するテスト実装と verification green を確認した。

---

## Findings 詳細

### F-001（LOW）: `local.ts` l.679 の docstring が旧挙動を記述したまま

`LocalRuntime.commitFinalState` のメソッドコメント（l.679）に `- git add -A → commit → push origin <branch> (1 retry).` が残っている。実装は `commitFinalState`（commit-push.ts）へ委譲しており、管理パス限定の明示 pathspec 合成に変わっているが、docstring は旧実装を指したまま。

動作への影響はない（コードは正しい）。ただし将来の maintainer が docstring を読んで挙動を誤解するリスクがある。

修正案: `- git add -A → commit → push origin <branch> (1 retry).` を `- 管理パス（state.json / events.jsonl / usage.json / bite-evidence-result.md）のみを明示 pathspec で add → commit → push origin <branch>（1 retry）。` に更新。
