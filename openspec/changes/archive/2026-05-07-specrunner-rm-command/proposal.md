## Why

`specrunner ps` に `failed` / `terminated` / `archived` の古い job が蓄積し、出力が汚染される。手動で state file を消す回避策はあるが、managed mode では cloud session が orphan として残る。正式な `rm` コマンドで state file 削除と session cleanup を一貫して行う手段が必要。

## What Changes

- **`specrunner rm <jobId>`**: 単一 job の state file を削除する CLI コマンドを追加。status gate で running / awaiting-merge をデフォルト拒否し `--force` で override 可能
- **`specrunner rm --all-terminated`**: `failed` / `terminated` / `archived` の全 job を一括削除。`--yes` で確認プロンプスキップ
- **`deleteSession` API 統合**: managed mode では state file 削除前に Anthropic SDK の `client.beta.sessions.delete()` を best-effort で呼び出し、orphan session を防止
- **state store / session client port 拡張**: `deleteJobState()` と `deleteSession()` を追加

## Capabilities

### New Capabilities

- `cli-rm-command`: job の削除（単一 / 一括）を行う CLI コマンド。status gate + force override + managed session cleanup

### Modified Capabilities

- `state-management`: `deleteJobState()` を追加（`fs.unlink` + ENOENT 冪等）
- `session-client-port`: `deleteSession()` を port interface に追加。managed adapter は SDK 呼出し、local は no-op

## Impact

- **src/cli/rm.ts**: 新規。CLI entry point
- **src/core/rm/runner.ts**: 新規。削除ロジック（status gate, session cleanup, state file 削除）
- **src/state/store.ts**: `deleteJobState()` 追加
- **src/core/port/session-client.ts**: `deleteSession()` を interface に追加
- **src/adapter/managed-agent/session-client.ts**: `deleteSession()` 実装
- **src/adapter/managed-agent/sdk/sessions.ts**: SDK `delete` wrapper 追加
- **bin/specrunner.ts**: `rm` case 追加 + USAGE 更新
- **tests/rm.test.ts**: 新規。unit test
