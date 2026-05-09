# finish Phase 4 の markJobArchived を Phase 3 直後に移動する

## Meta

- **type**: bug-fix
- **slug**: finish-phase4-reorder
- **base-branch**: main

## 背景

`finish` の Phase 3 で PR マージ成功後、Phase 4 の cleanup（worktree 削除、branch 削除）中に例外が発生すると、`markJobArchived` に到達せず job state が `awaiting-merge` のまま残る（#178）。2026-05-08〜09 に 4 件発生。

PR マージは不可逆な外部操作であり、成功直後に内部状態を確定させるのが正しい順序。cleanup は best-effort で後回しにする。

#75 Phase 1 で導入された `transitionJob` を使って遷移を行う。

## 要件

1. `orchestrator.ts` の Phase 4 で `markJobArchived()` を Phase 3（PR マージ成功）直後に移動する
   - `transitionJob(state, "archived", { trigger: "finish", reason: "PR merged" })` を使用
   - 遷移後の state を `updateJobState` または `JobStateStore.persist()` で永続化
2. Phase 4 の残り処理（worktree 削除、branch 削除、git checkout/pull）は archived 状態遷移後の best-effort として実行する
3. `assertJobFinishable` を `canTransition(state.status, "archived")` に置換する
   - 遷移不可の場合のエラーメッセージは status ごとに分岐（現行の switch/case 相当の情報量を維持）
4. `job-state-update.ts` の `markJobArchived` 関数を `transitionJob` ベースに書き換えるか、削除して呼び出し元で直接 `transitionJob` を使う
5. Phase 4 の worktree 削除後の `updateJobState(... worktreePath: null)` を try-catch で保護する（264 行目の未保護 await）

## スコープ外

- pipeline.ts の遷移移行（Phase 2a）
- resume の stale detection（Phase 2c）
- 永続化の一元化（Phase 3）

## 受け入れ基準

- [ ] `markJobArchived` が Phase 3 直後に実行される
- [ ] Phase 4 の cleanup 失敗が state 更新を阻害しない
- [ ] `assertJobFinishable` が `canTransition` ベースに置換されている
- [ ] Phase 4 の `updateJobState(... worktreePath: null)` が try-catch で保護されている
- [ ] TC-126（archived → no-op）が引き続き通る
- [ ] `bun run typecheck && bun run test` が green
