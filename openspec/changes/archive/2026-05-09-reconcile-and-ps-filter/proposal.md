## Why

外部状態（GitHub PR）と内部状態（job state）が乖離するケースに対応する reconciliation 機構がない。手動マージされた PR の job が `awaiting-merge` のまま残り続ける。また `ps` コマンドに archived ジョブを確認する手段がなく、status フィルタもない（#179）。

#75 Phase 4 として `reconcile.ts` を新設し、`ps` にフィルタオプションを追加する。

## What Changes

- `src/state/reconcile.ts` を新設し、`reconcileStaleRunning` と `reconcilePrState` を実装する
- `src/cli/ps.ts` に `--status <status>` フラグを追加する
- `ps` 実行時に `awaiting-merge` ジョブの PR 状態を確認し、MERGED なら hint を表示する

## Capabilities

### New

- **reconciliation** — `reconcileStaleRunning` / `reconcilePrState` 純粋関数。表示判定のみ、自動永続化しない
- **ps-status-filter** — `--status <status>` フラグで任意の status にフィルタ
- **ps-pr-hint** — `awaiting-merge` ジョブで PR がマージ済みなら `(PR merged, run finish)` を表示

### Modified

- **cli-commands** — `ps` の flags に `status` を追加、handler 内で PR 状態確認ロジックを追加

## Impact

- **Code**: `src/state/reconcile.ts` 新設、`src/cli/ps.ts` 拡張、`src/cli/command-registry.ts` flags 追加
- **Backward compat**: `--all` / `--active` の既存動作は変更なし。`--status` は新規追加
- **Testing**: reconcile 関数の unit test、ps の status フィルタ + PR hint の integration test
