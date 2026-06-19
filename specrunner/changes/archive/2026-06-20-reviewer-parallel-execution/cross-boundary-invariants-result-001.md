# Cross-Boundary-Invariants Review — reviewer-parallel-execution — iter 1

## Reviewer: cross-boundary-invariants

**観点**: diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## Scope

変更ファイル数: 34 files / +4610 / -98 lines（実装 + テスト + 設計文書）

主な変更先:
- `src/state/schema.ts` — `ReviewerStatus` 追加、`validateJobState` 拡張
- `src/kernel/reviewer-snapshot.ts` — `ReviewerStatus` 型定義
- `src/core/pipeline/pipeline.ts` — coordinator fan-out、`mergeParallelReviewerStates`
- `src/core/pipeline/reviewer-chain.ts` — `buildParallelReviewerTransitions`、routing predicates
- `src/core/pipeline/reviewer-status.ts` — 純関数群（新設）
- `src/core/pipeline/compose-reviewers.ts` — parallel descriptor 合成
- `src/core/step/code-fixer.ts` — composed path findings 集約
- `src/core/step/executor.ts` — commit mutex

---

## Findings

### F-01: `resolveActiveReviewer` が 3 シブリング構成で exhaustion attribution に使われる（LOW）

**境界**: `buildReviewerChainTransitions`（標準パス）が想定する「sibling は code-review のみ」という前提と、compose 後の `loopFixerPairs` が code-review / custom-reviewers / regression-gate の 3 エントリを持つ構成の間。

**詳細**:
`resolvePairedReviewForFixer` は fixer のシブリングが複数いるとき `resolveActiveReviewer(state, siblings)` を呼ぶ。compose 後の composed path では `siblings = ["code-review", "custom-reviewers", "regression-gate"]` の 3 つになる。`resolveActiveReviewer` は `startedAt` 最新で active を判定する設計で、**直列フェーズ前提**（code-review → coordinator → regression-gate がこの順で完了する）に依存する。

実際の実行順序は常に code-review < coordinator synthetic StepRun < regression-gate となることが transition table の構造で保証されており、timestamp 逆転は起きない。exhaustion attribution（どの reviewer の error code を使うか）の正確性は保たれる。

**リスク**: timestamp が同一ミリ秒になる edge case（テスト環境で ts=new Date().toISOString() が連続呼び出しで一致する）では `>=` による tie-breaking が宣言順ではなく最後書き込み順になる。実用上は問題にならないが暗黙の前提。

**影響**: 既存の `resolveActiveReviewer` 契約（直列前提）を coordinator という新しい参加者に引き継いで使っており、前提が変わっているにもかかわらず動く理由がコメントで説明されていない。

---

### F-02: `deps` の可変フィールド（`resumePrompt` / `resumeContext`）が並列メンバー間で共有される（LOW）

**境界**: `executor.ts` の `runAgentStep` が `deps.resumePrompt = undefined` / `deps.resumeContext = undefined` をクリアする既存のワンショット設計と、coordinator fan-out で同一 `deps` 参照を複数メンバーに渡す新しい挙動の間。

**詳細**:
```ts
// executor.ts L331-333
if (deps.resumePrompt !== undefined || deps.resumeContext !== undefined) {
  deps.resumePrompt = undefined;
  deps.resumeContext = undefined;
}
```
このコードはメンバーの `runner.run` 完了後（await 後）に実行される。並列実行では「member A が runner.run 完了 → deps クリア」→「member B が resumePrompt をキャプチャ前に deps を参照」という順序になり得る。

ただし `buildResumePrompt({ deps.resumeContext, deps.resumePrompt })` の呼び出しは `runner.run` より前（await 境界をまたいでいる）なので、各メンバーは自分の `runner.run` 開始前に値をキャプチャする。かつ coordinator 到達時には先行 step（code-review 等）がすでに resume context を消費しているため、実際には `undefined` が渡されることが多い。

**リスク**: `--from custom-reviewers` など、coordinator が resume の起点になる特殊ケースで resume context がライブな状態で並列実行されると、レースにより一部メンバーが context を得られない。設計では coordinator への直接 `--from` は非サポートとされているため現行では問題にならない。

**推奨**: `runCoordinatorFanOut` の冒頭でメンバー実行前に `deps.resumePrompt / deps.resumeContext` を snapshot し、各メンバーに別の `deps` コピー（shallow clone）を渡すか、coordinator の entry で先に consume する。

---

### F-03: `coordinator skipped → regression-gate` 遷移が dead code（LOW）

**境界**: `aggregateVerdict` の出力型（`"approved" | "needs-fix" | "escalation"`）と `buildParallelReviewerTransitions` に含まれる `coordinator skipped → regression-gate` 行の間。

**詳細**:
```ts
// reviewer-chain.ts
transitions.push({ step: coordinator, on: "skipped", to: REGRESSION_GATE_STEP_NAME });
```

`runCoordinatorFanOut` は `aggregateVerdict([...memberVerdicts.values()])` を使い、戻り値の型は `"approved" | "needs-fix" | "escalation"` であることが TypeScript でも保証されている。coordinator が `"skipped"` を返す経路は存在しない。

全メンバーが skipped の場合 `aggregateVerdict` は `"approved"` を返す（skipped は needs-fix でも escalation でもないため）。

**影響**: テスト・実行に影響なし。将来のメンテナーが「coordinator が skipped を返せるのか？」と誤解するソースになり得る。

---

### F-04: always-activate レビュワーが managed runtime でも invalidation される（INFORMATIONAL）

**境界**: design/risks で「managed runtime では invalidation 不発（fail-safe）」と記述されている前提と、`computeInvalidations` 実装が `paths: undefined` のレビュワーを常に pending に戻す挙動の間。

**詳細**:
`evaluateActivation({ paths: undefined }, { changedFiles: [], requestType })` は「条件なし = 常に activate」を返す：
```ts
if (!cond || (!cond.requestTypes && !cond.paths)) {
  return { activated: true, reason: "activated" };
}
```

managed runtime では `listChangedFiles` が `[]` を返すが、paths 未定義レビュワーは changedFiles を参照せずに `activated: true` を返すため、invalidation が**必ず**発火する。

設計文書の `reviewer-status.ts` JSDoc にはこの挙動が正しく記述されている：
> "Exception: always-activate reviewers... are always invalidated regardless of touchedFiles"

しかし `design.md` Risks セクションの「managed では invalidation 不発（fail-safe で再 review されない）」は **paths 制約付きレビュワー**にのみ当てはまる。always-activate レビュワーは managed でも毎回 pending に戻る。

**影響**: 動作的には設計意図通り（コメントに明記）。ただし design.md Risks の記述が misleading なため、managed runtime 向けの設定で always-activate レビュワーを使うユーザーが意図しない繰り返し review を経験する可能性がある。

---

### F-05: `state.step` フィールドが coordinator 実行中に更新されない（INFORMATIONAL）

**境界**: `store.update(jobState, { step: step.name })` が標準 step の最初に呼ばれる既存の「状態カーソル更新」パターンと、coordinator fan-out が自分のステップ名で update を呼ばない新しい挙動の間。

**詳細**:
`runCoordinatorFanOut` は `store.update(state, { step: coordinatorName })` を呼ばない。coordinator 実行中、各メンバーの `runAgentStep` が `store.update(state, { step: memberName })` を呼ぶためディスク上の `state.step` はメンバー名を short-live で示す。最終 persist では `base.step`（coordinator 前の step 名）が書き込まれる。

pipeline の内部 cursor（`currentStep` in-memory 変数）には影響なし。`specrunner ps` 等の表示で coordinator 実行中のステップ名が不確定になる程度。resumePoint 等の正確性には影響しない（`transitionJob` では `currentStep` を使用）。

**影響**: 観測性（display）のみ。correctness には影響なし。

---

## 境界不変条件の確認（侵害なし）

以下の既存不変条件を個別に確認した結果、すべて保持されていることを確認した：

| 不変条件 | 確認結果 |
|---------|---------|
| **zero-reviewer = base descriptor 参照同一** | `composeReviewerDescriptor(base, [])` が即時 return base ✓ |
| **`STANDARD_TRANSITIONS` / `FAST_TRANSITIONS` 無変更** | compose 後も filter + 置換なので標準遷移表は書き換えられない ✓ |
| **`collectFindingsLedger` 不変** | T-03 が `collectParallelFixerFindings` を別関数として追加。台帳関数は変更なし ✓ |
| **judge 契約（finding ref 検証・no-tool-call escalation）** | `createCustomReviewerStep` が `reportTool = JUDGE_REPORT_TOOL` を持ち、executor の `isJudgeStep` 判定が既存ロジックで適用される ✓ |
| **commit mutex = 単一 step 経路ではゼロオーバーヘッド** | `this.commitMutex` が resolved Promise のとき `.catch(()=>{}).then(fn)` は即実行 ✓ |
| **`resolveActiveReviewer` の標準パス不変** | `buildReviewerChainTransitions(["code-review"])` = standard/fast 用で変更なし。compose 後は `buildParallelReviewerTransitions` に置換 ✓ |
| **resume skip は `reviewerStatuses` 投影から自然導出** | `selectPendingMembers` が approved/skipped を除外。特別な resume 分岐なし ✓ |
| **`isCoordinatorLoopActive` が code-review ループ・regression-gate ループ・conformance fixer を正しく排除** | 優先順位付き predicate で各ケースを正確に区別 ✓ |
| **exhaustion attribution の 3 シブリング構成** | 直列フェーズ前提により `startedAt` 順が保証。F-01 として文書化するが correctness は保持 ✓ |
| **`mergeParallelReviewerStates` のメンバー外 step 不変** | `memberSet.has(key)` で member 以外は base を優先保持 ✓ |

---

## 総合判定

- **verdict**: approved

F-01〜F-05 はいずれも correctness を破る実証可能なパスが存在しない。主な判断根拠：

1. F-01（3-way resolveActiveReviewer）は直列フェーズ実行順序により timestamp ordering が物理的に保証されている
2. F-02（deps 共有）は coordinator への resume context 到達パスが transition table の構造上存在しない
3. F-03〜F-05 は correctness に影響しない dead code / 観測性のみの問題

F-02 の `deps` 共有に関しては、将来の拡張（coordinator への直接 resume 等）で問題が顕在化するリスクがあるため、後続 request での改善を推奨する（要件外のため今回スコープ外）。
