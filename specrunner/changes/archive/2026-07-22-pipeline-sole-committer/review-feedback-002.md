# Code Review Feedback — iteration 002

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## iteration 001 からの修正確認

**F-001（T-08 wiring 欠落）**: 修正済み ✅
- `src/core/step/commit-orchestrator.ts` に `appendSynthesizedCommit` が import され、`commitSuccess`（line 347）および `commitRound`（line 564）の両方で呼び出されている。

**F-002（commitFinalState に egress 検証なし）**: 修正済み ✅
- `commitFinalState` が `verifyEgressLedger` を呼び出すようになった（best-effort、catch で警告 + push スキップ）。
- `synthesizedCommits` も `commitFinalState` の params として local.ts:693 から渡されている。

**F-003（HEAD guard reset 失敗が fail-open）**: 修正済み ✅
- `parallel-review-round.ts` の HEAD guard が reset 失敗時に `SpecRunnerError(COMMIT_AND_PUSH_FAILED, ...)` を throw する（fail-closed）。

---

## 読んだファイル

- `src/core/step/commit-push.ts`（全文）
- `src/core/pipeline/parallel-review-round.ts`（全文）
- `src/core/step/commit-orchestrator.ts`（全文）
- `src/core/step/executor.ts`（runCliStep / runAgentStep 周辺 lines 300-601）
- `src/core/verification/propagate.ts`（全文）
- `src/core/pipeline/round-git-scope.ts`（全文）
- `src/core/runtime/local.ts`（commitFinalState / commitRoundArtifacts 周辺）
- `src/state/schema/types.ts`（synthesizedCommits field 定義）
- `src/state/schema/operations.ts`（appendSynthesizedCommit）
- `src/errors.ts`（EGRESS_UNKNOWN_COMMIT / ROUND_HEAD_ADVANCED）
- `tests/unit/step/pipeline-sole-committer-egress.test.ts`
- `tests/unit/state/pipeline-sole-committer-state.test.ts`（TC-025 周辺）
- `tests/unit/architecture/write-scope-invariants.test.ts`（TC-021）
- `tests/unit/step/write-scope-bypass-closure.test.ts`（TC-008/009 周辺）
- `specrunner/changes/pipeline-sole-committer/review-feedback-001.md`
- `specrunner/changes/pipeline-sole-committer/verification-result.md`

---

## 検証した項目

- R1 mixed reset + 明示 pathspec: headBeforeStep 比較 → reset --mixed → pathspec commit の実装を `commit-push.ts` で確認。
- R3 HEAD guard: fan-out 前 captureHeadSha → fan-out 後 HEAD 比較 → quarantine + reset + escalation の flow を `parallel-review-round.ts` step 5b で確認。reset 失敗の throw を確認。
- R4 egress backstop: `verifyEgressLedger` の実装と `commitAndPush` / `commitFinalState` からの呼び出しを確認。
- R5 fail-closed: `getWorktreeChangedPaths ok:false` → throw、`gitExecResult` 失敗 → throw を各経路で確認。
- D6 bite-evidence: `pipelineManagedPaths` に `biteEvidenceResultPath` が追加されていることを `round-git-scope.ts:105` で確認。
- synthesizedCommits wiring: `commitOrchestrator.commitSuccess`（line 347）および `commitRound`（line 564）で `appendSynthesizedCommit` が呼ばれていることを確認。
- TC-021 静的テスト: `write-scope-invariants.test.ts` のパターン `'"add"' && '"-A"' && !'"--"'` を確認。`commit-push.ts` に `["add", "-A"]` のみの行は存在しないことを確認。
- TC-034: verification-result.md で `typecheck && test` green（610 files / 8918 tests passed）を確認。
- iteration 001 F-001/F-002/F-003 の修正を実装コードで二重確認。
- `propagate.ts` の push 経路が egress を経由しないことを確認（F-002 継続）。
- `runCliStep` の entry-HEAD キャプチャが exit-HEAD を記録しないことを確認（F-001 partial）。

## 検証できなかった項目

- `tests/pipeline-sole-committer-e2e.test.ts` の実行詳細（passed は verification-result.md で確認済み）。
- `runCliStep` exit-HEAD wiring の end-to-end テスト（TC-025 は pure function テストのみ）。

---

## Findings 詳細

---

### F-001: CLI step の exit-HEAD が synthesizedCommits に未記録（T-08 partial）

**対象:** `src/core/step/executor.ts` line 556（entry-HEAD 取得）

**事実:**

`runCliStep` は `step.run()` を呼ぶ**前**に entry-HEAD を取得する（T-01 の評価 revision 記録）:

```typescript
// T-01: Capture entry-HEAD commitOid BEFORE step.run().
const entryHeadSha = deps.runtimeStrategy
  ? (await deps.runtimeStrategy.captureHeadSha(cwd)) ?? undefined
  : undefined;

await step.run(state, deps);  // ← propagateVerificationResult がここで commit + push
// ...
return {
  kind: "success",
  ...(entryHeadSha !== undefined ? { commitOid: entryHeadSha } : {}),
};
```

`commitSuccess` は `result.commitOid`（= entry-HEAD）を `synthesizedCommits` に append するが、`propagateVerificationResult` が `step.run()` の中で作成した verification commit（exit-HEAD）の OID は台帳に追加されない。

**影響経路:**

1. `propagateVerificationResult` push 成功: verification commit は origin に到達済み → 後続 `git rev-list HEAD --not --remotes=origin` に含まれない → 問題なし。
2. `propagateVerificationResult` push 失敗（警告のみ、job 継続）: verification commit が local に残存 → `commitFinalState` の `verifyEgressLedger` で verification commit が公開範囲に含まれるが台帳には entry-HEAD のみ → EGRESS_UNKNOWN_COMMIT → 警告 + push スキップ（best-effort なので job は halt しない）。

なお `runInlineEgressCheck`（sequential step `commitAndPush`）は `headBeforeStep` 引数で verification commit を公開範囲から除外できるため、次ステップの `commitAndPush` 経路では false halt は起きない。gap は `commitFinalState` の `verifyEgressLedger` に限定される。

**TC-025 の検証範囲不足:**

`tests/unit/state/pipeline-sole-committer-state.test.ts` TC-025 は `appendSynthesizedCommit` 純関数のみをテストし、`runCliStep` が exit-HEAD を取得して CommitOrchestrator に渡す wiring を検証しない。T-08 受け入れ基準「push 失敗 resume 後の後続 push で egress 照合が誤 halt しない」はテストで固定されていない。

---

### F-002: `propagateVerificationResult` push と `commitScopedPaths` push が egress backstop を経由しない（D4/T-03 gap）

**対象:** `src/core/verification/propagate.ts:66`（push）、`src/core/step/commit-push.ts:commitScopedPaths`（pushOnly 直接呼び出し）

**事実（propagate.ts）:**

```typescript
const pushResult = await spawn("git", ["push", "origin", branch], { cwd });
// verifyEgressLedger 呼び出しなし
```

**事実（commitScopedPaths）:**

```typescript
// Push with one retry (uses commitMessage as step label for the event)
await pushOnly(branch, cwd, commitMessage, infra);
// runInlineEgressCheck も verifyEgressLedger も呼ばない
```

**設計との乖離:**

design.md D4:「各 push 発生点（`pushOnly` の 2 系列、`commitFinalState`、`propagateVerificationResult`）は共通の検証付き push を経由する。」

`commitFinalState`（iteration 002 で修正済み）と `commitAndPush`（`runInlineEgressCheck` で対応）はカバーされているが、`propagateVerificationResult` と `commitScopedPaths`（round artifact push）が未対応。

**直接リスク:** 一次防衛（mixed reset + 明示 pathspec、HEAD guard）が正しく実装されているため direct security hole ではないが、D4 の backstop 完全性要件を満たさない。

---

### F-003: guarded mode の空変更フォールバック `-- .` が実質的に bare add-A と同義

**対象:** `src/core/step/commit-push.ts` lines 465-468

**事実:**

```typescript
const addArgs: string[] =
  changedPaths.length > 0
    ? ["add", "-A", "--", ...changedPaths]
    : ["add", "-A", "--", "."];
```

`changedPaths` が空のとき `-- .`（= repo root 全体）を pathspec に使う。TC-021 の静的テストはパターン `!'"--"'` でこの行を通過させてしまう。`git add -A -- .` はパス指定なし `git add -A` と実質同義。

**実際の影響:** `changedPaths` が空 = `git status --porcelain` が全く変更を検出しなかったケース。このとき `add -A -- .` も `diff --cached --quiet` で exit 0 となり commit をスキップするため実害は低い。設計原則「全経路で明示パス指定」への違反。

---

## Positive 確認事項

- R1（mixed reset + 明示 pathspec 合成）: 正しく実装。headBeforeStep 比較 → reset --mixed → pathspec commit の流れが機能している。
- R3（HEAD guard）: fan-out 前の baselineCommit 取得 → fan-out 後の HEAD 比較 → 違反時に quarantine + reset + escalation halt が正しく実装されている。reset 失敗の fail-closed も修正済み。
- R4（egress backstop）: `verifyEgressLedger` が実装され、`commitAndPush` および `commitFinalState` から呼ばれている。
- R5（git 操作 fail-closed）: `getWorktreeChangedPaths` 失敗 → halt、`gitExecResult` 失敗 → halt が全経路で保証されている。
- D6（bite-evidence-result.md）: `pipelineManagedPaths` に `biteEvidenceResultPath` が追加され、scoped commit と offending 除外の単一ソースとして機能している。
- synthesizedCommits wiring: `commitSuccess` および `commitRound` から `appendSynthesizedCommit` が正しく呼ばれている。
- TC-034: `typecheck && test` green（610 files / 8918 tests passed）を確認。
