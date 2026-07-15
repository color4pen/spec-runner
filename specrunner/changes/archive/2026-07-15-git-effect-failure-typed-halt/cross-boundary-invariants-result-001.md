# Review: cross-boundary-invariants — git-effect-failure-typed-halt — iter 1

- **verdict**: approved
- **reviewer**: cross-boundary-invariants
- **scope**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## 検証方法

1. `git diff main...HEAD --stat` でスコープを確認（22 files、実装 4 ファイル + テスト群）
2. `src/core/step/commit-push.ts`、`src/util/git-exec.ts`、`src/errors.ts`、`src/core/runtime/local.ts` の実装差分を精読
3. executor.ts / step-halt.ts / commit-orchestrator.ts / parallel-review-round.ts / pipeline.ts の **変更なし側** を読み、既存不変条件の保持を確認
4. design.md（D1–D5）と tasks.md でアーキテクチャ判断を照合
5. verification-result.md でテスト green（6969 tests passed）を確認

---

## 既存不変条件の保持確認

### B-13 / B-14: StepExecutor が store を直接呼ばない（CommitOrchestrator 単一書き込み）

`executor.ts` に差分なし。`commitAndPush` / `commitScopedPaths` は throw するだけで、store への呼び出しを追加しない。Path A（finalizeStepArtifacts → executor catch → `makeCommitFailHalt`）、Path B（pipeline safety net）とも既存の適用点を通る。**保持**。

### B-15: round の git 副作用は coordinator 所有、scoped staging

`parallel-review-round.ts` に差分なし。`commitScopedPaths` は `["add", "-A", "--", ...stagePaths]` の pathspec 限定を維持している（bare `git add -A` 不使用）。**保持**。

### D2: StepHalt 単一適用点（makeCommitFailHalt / CommitOrchestrator）

Path A の halt 適用点（`executor.ts:449` の `makeCommitFailHalt`）に差分なし。Path B は既存 safety net（`pipeline.ts:155`）相乗り — `pushFailedError` が今日乗る経路と同一。新 halt 種別・新適用点なし。**保持**。

### commitFinalState（D5 スコープ外）

`commitFinalState`（commit-push.ts:99–139）に差分なし。`spawnFn` 直呼びの best-effort warn・silent-return 設計は不変。**保持**。

### pushOnly / pushFailedError

`pushOnly`（commit-push.ts:206–224）に差分なし。`gitExecExitCode` 継続使用。push 失敗は引き続き `pushFailedError`（code `PUSH_FAILED`）を throw。**保持**。

### architecture/: 変更なし

`architecture/` ディレクトリへの差分なし（D5 判断どおり）。**保持**。

---

## 観察事項

### Obs-1: `step-halt.ts:311` の magic string フォールバックが未更新

`makeCommitFailHalt` は `err.code ?? "COMMIT_AND_PUSH_FAILED"` のリテラルを持ち続ける。D1 tasks「magic string を解消する」の **一次目的**（`commitEffectFailedError` が常に code を設定するため `??` フォールバックが実行時に発火しない）は達成されているが、`step-halt.ts` 自体は `ERROR_CODES.COMMIT_AND_PUSH_FAILED` 定数を import していない。文字列値は同一なので実行時に差異はない。将来的な定数リネーム時のリスクは存在する。

**severity**: low / 機能影響なし。follow-up で `step-halt.ts:311` を `ERROR_CODES.COMMIT_AND_PUSH_FAILED` に統一すれば完全に解消される。

### Obs-2: Path A（failed）vs Path B（awaiting-resume）の terminal state 非対称

`commitScopedPaths` から throw が propagate した場合、pipeline safety net が `PIPELINE_UNHANDLED_ERROR` で `awaiting-resume` に遷移する。`commitAndPush`（Path A）は `makeCommitFailHalt` → `failed`（terminal）。この非対称は本変更で新設されたものでなく、`pushFailedError` が既に体現している既存挙動。design.md の Risks セクションに明示され、open-question として記録されている。**新規不変条件違反なし**。

### Obs-3: round の commitRoundArtifacts throw でメンバー結果が persist されない

`parallel-review-round.ts:282` の `commitRoundArtifacts` が throw すると、CommitOrchestrator の `commitRound`（in-memory fold + store persist）が到達しない。メンバーの実行結果はメモリ上にのみ存在した状態で pipeline safety net に落ちる。resume で fan-out 全再実行。`pushFailedError` の round 着地と同一挙動で回帰なし。design.md Risks に明記あり。**新規不変条件違反なし**。

---

## 総評

実装は既存の不変条件（B-13/B-14/B-15/D2/D5）をすべて保持している。変更対象外のファイル（executor.ts / step-halt.ts / parallel-review-round.ts / architecture/）に差分がなく、新しい halt 種別・新適用点・新 store 書き込み経路は追加されていない。`gitExecResult`（additive helper）と `commitEffectFailedError`（factory）は既存パターンに沿った実装で、既存 helper・caller に影響しない。

観察事項はすべて「既存挙動の継承 or 軽微な保守懸念」のレベルであり、機能的不変条件違反は検出されなかった。
