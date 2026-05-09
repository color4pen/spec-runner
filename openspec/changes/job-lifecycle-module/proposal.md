## Why

JobStatus の遷移ロジックが `pipeline.ts`, `executor.ts`, `orchestrator.ts`, `job-state-update.ts`, `resume.ts`, `local.ts` の 6 箇所以上に分散している。各箇所が `state.status = "..."` を直接代入しており、遷移ルールが暗黙的。不正な遷移（例: `archived` → `running`）を静的にも動的にも検出できず、新しい status 追加時に全箇所を手動で同期する必要がある。

これは #75 の Phase 1 にあたり、後続の全 Phase（pipeline 移行、finish 順序入れ替え、resume stale detection、永続化一元化、reconciliation）がこのモジュールに依存する。

## What Changes

- `src/state/lifecycle.ts` を新設し、遷移マップ・ガード関数・純粋遷移関数を集約する
- `src/core/finish/idempotency.ts` を削除し、呼び出し元を `TERMINAL_STATUSES.has()` に置換する
- `src/cli/ps.ts` のハードコード `ACTIVE_STATUSES` を `lifecycle.ts` からの import に置換する

## Capabilities

### New

- **job-state-lifecycle** — `VALID_TRANSITIONS` マップ、`transitionJob` 純粋関数、`canTransition` / `isTerminal` ガード関数、`TERMINAL_STATUSES` / `ACTIVE_STATUSES` 定数

### Modified

- **cli-finish-command** — `isFullyFinished()` → `TERMINAL_STATUSES.has()` に置換
- **cli-commands** — `ps.ts` の `ACTIVE_STATUSES` を lifecycle からの import に置換

## Impact

- **Code**: `src/state/lifecycle.ts` 新設、`src/core/finish/idempotency.ts` 削除、`orchestrator.ts` / `ps.ts` の import 変更
- **Backward compat**: 既存の遷移ロジック自体は Phase 1 では変更しない。既存コードの `state.status = "..."` は Phase 2 で移行
- **Testing**: 全 JobStatus × 全遷移先の網羅テスト、不正遷移の throw 検証、idempotency 置換後の既存テスト green 維持
