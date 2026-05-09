# reconciliation モジュール新設と ps フィルタ追加

## Meta

- **type**: new-feature
- **slug**: reconcile-and-ps-filter
- **base-branch**: main

## 背景

外部状態（GitHub PR の状態）と内部状態（job state）が乖離するケースに対する reconciliation 機構がない。手動マージされた PR の job が `awaiting-merge` のまま残る。また `ps` コマンドで archived ジョブを確認する手段がない（#179）。

#75 Phase 4 として `reconcile.ts` を新設し、`ps` にフィルタオプションを追加する。

## 要件

1. `src/state/reconcile.ts` を新設する
2. `reconcileStaleRunning(state: JobState): TransitionResult | null` を実装する
   - `isStaleRunning(state)` が true なら `transitionJob(state, "awaiting-resume", ...)` を返す
   - stale でなければ `null` を返す
   - `safety.ts` の `isStaleRunning` を再利用する
3. `reconcilePrState(state: JobState, prStatus: "MERGED" | "CLOSED" | "OPEN"): TransitionResult | null` を実装する
   - `awaiting-merge` + `prStatus === "MERGED"` → `transitionJob(state, "archived", ...)` を返す
   - それ以外は `null`
4. `ps` コマンドに `--all` フラグを追加する
   - `--all` 指定時は archived を含む全ジョブを表示
   - デフォルト（引数なし）は現状通り archived を除外
5. `ps` コマンドに `--status <status>` フラグを追加する
   - 指定した status のジョブのみ表示
   - 例: `specrunner ps --status archived`, `specrunner ps --status awaiting-merge`
6. `ps` 実行時に `awaiting-merge` のジョブに対して PR 状態を確認し、MERGED なら `(PR merged, run finish)` と表示する
   - `gh pr view` を使用。`gh` CLI がない場合はスキップ
   - 自動で archived にはしない。ユーザーに `finish` の実行を促す

## スコープ外

- `ps` での自動 state 遷移（reconcile 結果を自動永続化しない。表示のみ）
- `doctor` コマンドへの reconciliation 統合
- cron / バックグラウンド reconciliation

## 受け入れ基準

- [ ] `reconcile.ts` が `reconcileStaleRunning` と `reconcilePrState` を export する
- [ ] `specrunner ps --all` で archived ジョブが表示される
- [ ] `specrunner ps --status awaiting-merge` でフィルタできる
- [ ] `awaiting-merge` のジョブで PR がマージ済みの場合、`(PR merged, run finish)` が表示される
- [ ] `gh` CLI がない環境でもエラーにならない
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

- reconciliation は表示のみ。自動 state 変更は `resume` や `finish` の責務
- `gh pr view` の API コールは `awaiting-merge` のジョブ（通常 0-2 個）にのみ実行。rate limit リスクは無視可能
- `reconcile.ts` は `lifecycle.ts` を import し `transitionJob` を呼ぶ。依存方向: `reconcile → lifecycle → schema`
