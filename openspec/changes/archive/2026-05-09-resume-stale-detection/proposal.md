## Why

SIGKILL / OOM / マシン再起動後、job state が `running` のまま残る。`resume` は `running` を hard reject するため（resume.ts:95-101）、ユーザーは state ファイルを手動編集する以外に回復手段がない。

加えて `ManagedRuntime.registerCleanup()` は完全 no-op（managed.ts:158-161）で、SIGINT/SIGTERM でも state が `running` のまま残る。

`failed` / `terminated` の job も `resume` できない（`awaiting-resume` 以外を reject）。`VALID_TRANSITIONS` では `failed` / `terminated` → `running` が許可されているにもかかわらず、resume が独自の status gate で拒否している。

## What Changes

- `JobState` schema に `pid?: number` フィールドを追加し、`running` 状態のプロセスを識別可能にする
- `resume` コマンドの `running` gate に stale detection ロジックを組み込み、orphaned `running` state を自動回復する
- `resume` コマンドの status gate を `canTransition(state.status, "running")` に置換し、`failed` / `terminated` からの再開を可能にする
- `ManagedRuntime.registerCleanup()` に SIGINT/SIGTERM ハンドラを実装する

## Capabilities

### Modified

- **job-state-store** — `JobState` に `pid?: number` フィールドを追加
- **cli-commands** — `resume` の status gate を stale detection + `canTransition` に置換
- **step-execution-architecture** — `ManagedRuntime` にシグナルハンドラを追加

## Impact

- **Code**: `src/state/schema.ts`（pid フィールド追加）、`src/core/command/resume.ts`（stale detection + canTransition gate）、`src/core/runtime/managed.ts`（シグナルハンドラ）、`src/core/resume/safety.ts`（isProcessAlive ユーティリティ）
- **Backward compat**: `pid` は optional フィールド。既存 state ファイルは `pid` が undefined として扱われ、`updatedAt` フォールバックで stale 判定される
- **Testing**: stale detection（PID 存在/不在/EPERM、updatedAt フォールバック）、ManagedRuntime シグナルハンドラ、canTransition gate のユニットテスト
