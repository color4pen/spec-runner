## Why

Phase 1（PR #180, `job-lifecycle-module`）で `transitionJob` 純粋関数と `VALID_TRANSITIONS` マップを導入したが、`pipeline.ts` と `executor.ts` は依然として `state.status = "..."` / `{ ...state, status: "..." }` の直接代入で状態遷移を行っている。遷移バリデーションが効いておらず、不正遷移を検出できない。

history 操作も `{ ...state, history: [...state.history, entry] }` のスプレッド構文を使っている箇所があり、`MAX_HISTORY_SIZE` ガードが効かない。

Phase 2a として pipeline 層と executor 層の全遷移・全 history 操作を `transitionJob` / `appendHistoryEntry` に統一する。

## What Changes

- `pipeline.ts` の全 status 直接代入（3 箇所）を `transitionJob` 呼び出しに置換
- `pipeline.ts` の history スプレッド構文（2 箇所）を `appendHistoryEntry` に置換
- `executor.ts` の timeout 遷移（1 箇所）を `transitionJob` に置換
- `pipeline.ts` の `handleExhausted` の直接代入を `transitionJob` に置換

## Capabilities

### Modified

- **pipeline-orchestrator** — 全遷移が `transitionJob` 経由。history 操作が `appendHistoryEntry` 経由
- **step-execution-architecture** — executor の timeout 遷移が `transitionJob` 経由

## Impact

- **Code**: `src/core/pipeline/pipeline.ts`（5 箇所変更）、`src/core/step/executor.ts`（1 箇所変更）
- **Backward compat**: 遷移の挙動は同一。バリデーションが追加されるのみ
- **Testing**: 既存テスト green 維持。新規テストは不要（遷移ロジック自体のテストは Phase 1 で網羅済み）
