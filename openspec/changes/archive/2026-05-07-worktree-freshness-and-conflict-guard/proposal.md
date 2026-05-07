## Why

worktree は `git worktree add --detach <path> HEAD` でローカル HEAD から作成されるため、ローカル main が origin/main より古い場合、古い main から分岐した worktree で pipeline が走る。PR #113 merge 直後の PR #114 実行時にこの問題が顕在化し、旧コードベースで propose/implement が実行された。

また、finish の `pollMergeStateAfterPush()` は `mergeStateStatus === "DIRTY"`（conflict 確定）を明示的にハンドルせず、merge 試行まで進んで失敗する。

## What Changes

- **LocalRuntime.setupWorkspace()**: run パスで worktree 作成前に `git fetch origin` を実行し、`"origin/main"` を baseRef として渡す。behind 検出時は warning を出力
- **WorktreeManager.create()**: `baseRef?: string` 引数を追加（デフォルト `"HEAD"`）。worktree 作成時に指定 ref を使用
- **pollMergeStateAfterPush()**: `DIRTY` を検出したら即座にリトライを打ち切り返却
- **orchestrator.ts**: `mergeStateAfterPush === "DIRTY"` で Phase 3 に進まず escalation を返す
- **TODO コメント**: base branch 可変化の将来拡張ポイントを 3 箇所にマーク

## Capabilities

### New Capabilities

（なし）

### Modified Capabilities

- `worktree/manager`: `create()` に `baseRef` パラメータを追加
- `runtime/local`: freshness 保証（fetch + origin/main baseRef）
- `finish/preflight`: DIRTY 即時打ち切り
- `finish/orchestrator`: DIRTY escalation ガード

## Impact

- **src/core/worktree/manager.ts**: `create()` signature 変更（`baseRef?: string` 追加）、git worktree add の ref 引数を動的化
- **src/core/runtime/local.ts**: run パスに fetch + behind check + baseRef 引数追加。resume パスの 2 箇所にも baseRef 引数追加
- **src/core/finish/preflight.ts**: `pollMergeStateAfterPush()` に DIRTY 早期 return 追加
- **src/core/finish/orchestrator.ts**: Phase 3 前に DIRTY guard 追加
- **既存テスト**: WorktreeManager、LocalRuntime、finish-orchestrator のテストにテストケース追加。既存テストはデフォルト引数で互換維持
