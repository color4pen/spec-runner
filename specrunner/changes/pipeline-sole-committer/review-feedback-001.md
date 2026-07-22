# Code Review Feedback — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

**読んだファイル:**
- `specrunner/changes/pipeline-sole-committer/design.md` (全文)
- `specrunner/changes/pipeline-sole-committer/tasks.md` (全文)
- `specrunner/changes/pipeline-sole-committer/test-cases.md` (全文)
- `src/core/step/commit-push.ts` (全文 671 行)
- `src/core/pipeline/parallel-review-round.ts` (全文 471 行、特に step 5b HEAD guard)
- `src/core/pipeline/round-git-scope.ts` (全文)
- `src/core/step/commit-orchestrator.ts` (commitSuccess / commitRound の実装確認)
- `src/state/schema/types.ts` (synthesizedCommits field 定義確認)
- `src/state/schema/operations.ts` (appendSynthesizedCommit 実装確認)
- `src/errors.ts` (EGRESS_UNKNOWN_COMMIT / ROUND_HEAD_ADVANCED 確認)
- `src/core/runtime/local.ts` (commitRoundArtifacts → commitScopedPaths 確認)
- `tests/unit/step/pipeline-sole-committer-synthesis.test.ts`
- `tests/unit/step/pipeline-sole-committer-egress.test.ts`
- `tests/unit/core/step/pipeline-sole-committer-final-state.test.ts`
- `tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts`
- `tests/unit/pipeline/pipeline-sole-committer-bite-evidence.test.ts`
- `tests/unit/state/pipeline-sole-committer-state.test.ts`
- `tests/unit/architecture/write-scope-invariants.test.ts`
- `tests/pipeline-sole-committer-e2e.test.ts`
- `tests/unit/step/write-scope-bypass-closure.test.ts` (ヘッダとTC-008/009 周辺)
- `specrunner/changes/pipeline-sole-committer/verification-result.md` (610 files / 8918 tests passed)

**確認した主要事項:**
- 裸 `git add -A` 全廃: TC-021 静的テスト通過を確認（commit-push.ts の全行を走査）
- mixed reset + 合成モデル: TC-001/002/003 のシーケンス確認
- commitFinalState の明示 pathspec 化: TC-007/008 確認
- HEAD guard: parallel-review-round.ts step 5b の実装確認
- synthesizedCommits 台帳 wiring: CommitOrchestrator.commitSuccess / commitRound の双方を grep で確認
- verifyEgressLedger / runInlineEgressCheck の呼び出しグラフを grep で追跡
- commitRoundArtifacts → commitScopedPaths の呼び出し連鎖確認

**E2E / 受け入れ基準との照合:**
- R6-1 (TC-019): 実 git repo で secret.ts が finalize commit に混入しないことを確認
- R6-2 (TC-020): 実 git repo で reviewer 自己 commit が ROUND_HEAD_ADVANCED で halt することを確認
- typecheck && test: verification-result.md で passed 確認
- revision束縛 / canonHash束縛の既存テスト: verification-result.md で無改変 green 確認

## 検証できなかった項目

- `propagateVerificationResult` の egress 配線（executor.ts 内の runCliStep 実装は読んでいない）
  → finding 2 の egress 欠落が verification commit 経路でも同様かは本レビューでは未確認
- TC-TC-023/024/025 のテスト内容を超えた CommitOrchestrator の wiring 証明
  → 上記テストは appendSynthesizedCommit 純関数のみをテストし、Orchestrator からの呼び出し wiring は対象外であることを確認済み

## Findings 詳細

---

### F-001: synthesizedCommits 台帳が生産コードで populate されない（T-08 wiring 欠落）

**対象:** `src/core/step/commit-orchestrator.ts:commitSuccess`, `commitRound`

**事実:**
- `appendSynthesizedCommit` は `src/state/schema/operations.ts:35` に定義・export されている
- `CommitOrchestrator.commitSuccess`（行 299-351）および `commitRound`（行 464-566）には `appendSynthesizedCommit` の呼び出しが **存在しない**
- `grep -r "appendSynthesizedCommit" src/` で prod コードへの呼び出しが 0 件

**影響:**
- `state.synthesizedCommits` は常に `undefined`（legacy state と同等）
- `runInlineEgressCheck`（`commit-push.ts:265`）は呼び出し毎にローカル ledger を構築するため、**scoped/guarded step の inline egress check は動作する**（`headBeforeStep` で範囲を当該 commit に限定しているため false-halt も起きない）
- ただし `commitScopedPaths`（round artifacts push）および `commitFinalState` は egress check を呼ばない（F-002 参照）ため、persistent ledger が空でも直接の diff は小さい
- **本来の想定**（tasks.md T-08）は「resume 後の push でも台帳照合が通る」ことだが、ledger が空のまま resume する場合に verification 経路（propagateVerificationResult）の commit が認識されないリスクがある

**tasks.md との乖離:**
- T-08 の各 acceptance criteria は「sequential / round / verification の各 OID が synthesizedCommits に記録される」だが、wiring が存在しないため未達成
- TC-023/024/025 は `appendSynthesizedCommit` 純関数のみを検証しており、Orchestrator からの wiring は **テストされていない**

---

### F-002: commitFinalState の push に egress 検証がない（T-05 完了マーク不一致）

**対象:** `src/core/step/commit-push.ts:commitFinalState` (lines 524-585)

**事実:**
- `commitFinalState` は `pipelineManagedPaths` 限定の明示 pathspec でコミットする（T-05 の管理パス限定部分は正しく実装）
- しかし `git push` 前に `runInlineEgressCheck` も `verifyEgressLedger` も呼ばれていない
- push は line 575 と 578 の裸 `spawnFn("git", ["push", ...])` で実行される

**設計との乖離:**
- design.md D4:「各 push 発生点（pushOnly の 2 系列、commitFinalState、propagateVerificationResult）は共通の検証付き push を経由する」
- tasks.md T-05（完了マーク ✓）:「commit 後の OID を egress 台帳 union に渡して直 push を egress 検証する（T-03）」
- `commitScopedPaths`（round artifact push 経路）も同様に egress check なし

**補足:**
- F-001（台帳未 populate）と連動: 仮に commitFinalState で verifyEgressLedger を呼んでも、ledger が空のため **全 commit が EGRESS_UNKNOWN_COMMIT で reject される** という矛盾がある。両方を同時に修正する必要がある。
- 一次防衛（mixed reset + 明示 pathspec）は正しく機能しているため、バックストップの欠落は直接の seurity hole ではないが、D4 の backstop 設計が未完である。

---

### F-003: HEAD guard の reset 失敗が halt に倒れない

**対象:** `src/core/pipeline/parallel-review-round.ts:281`

**事実:**
```typescript
await gitExecResult(guardSpawnFn, cwd, ["reset", "--mixed", baselineCommit]);
roundError = { code: "ROUND_HEAD_ADVANCED", ... };
```
- `gitExecResult` の戻り値を確認していない。reset が非 0 exit で失敗しても処理が続行する
- `inspectionEscalated = true` は既に設定済み（line 271）なので round は escalation halts する
- しかし HEAD が `baselineCommit` に戻っていない状態で resume した場合、reviewer の self-commit が HEAD に残る

**設計との乖離:**
- design.md D3:「reset 失敗 → fail-closed」
- tasks.md T-07:「git reset --mixed `<headBeforeRound>`（失敗 → halt）」

**実際のリスク:**
- reset 失敗後に resume → 次 step の headBeforeStep が reviewer commit OID を指す → egress check の `--not headBeforeStep` がその commit を除外 → 照合はパスするが `git push` が reviewer commit も origin へ送る可能性がある
- ただし F-001/F-002 の egress gap と同様、一次防衛（HEAD guard が先に設定される）はあるため低確率

---

### F-004: guarded mode の空変更フォールバック `["add", "-A", "--", "."]` が実質的に bare add と同義（could）

**対象:** `src/core/step/commit-push.ts:464-490`

**事実:**
```typescript
const addArgs: string[] =
  changedPaths.length > 0
    ? ["add", "-A", "--", ...changedPaths]
    : ["add", "-A", "--", "."];
// ...
const commitArgs: string[] =
  changedPaths.length > 0
    ? ["commit", "-m", commitMessage, "--", ...changedPaths]
    : ["commit", "-m", commitMessage]; // bare commit
```
- `changedPaths` が空のとき `-- .`（= repo root 全体）を pathspec に使う
- commit も pathspec なし（bare commit）
- TC-021 静的テストは `"--"` を含む行を bare add でないと判定するため、このパスはテストを**通過する**

**実際の影響:** changedPaths が空 = git status が全く変更を検出しなかったケース。このとき `add -A -- .` も commit も no-op に近い（diff --cached が exit 0 で skip される）ため、実害は低い。ただし設計趣旨「裸 git add -A 全廃」と乖離する。

---

### F-005: tasks.md T-10 の完了マーカーが不正確（could）

**対象:** `tasks.md:T-10`、`tests/unit/step/write-scope-bypass-closure.test.ts`

**事実:**
- tasks.md T-10:「scoped residual halt → 「非宣言変更は commit に含まれない・halt しない」期待へ」と記載して ✓ マーク
- しかし `write-scope-bypass-closure.test.ts` の TC-008/009 は依然 `WRITE_SCOPE_VIOLATION` halt を期待している
- 実装（commit-push.ts:391-407）も scoped residual に対して quarantine + restore + throw を行う（halt を保持）

**評価:** 実装判断としては「halt を残す」方が保守的で安全。しかし T-10 のチェックマークは「migration 完了」を示しておらず、tasks.md の内容と実装・テストが不一致のまま。
