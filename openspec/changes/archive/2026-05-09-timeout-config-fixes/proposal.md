## Why

PR #176 で追加したウォールクロックタイムアウトに 2 つの設定不備がある。`timeoutMs: 0` でタイムアウトを無効化できない（validation が弾く + agent-runner が 0 を正しく扱わない）。また `steps.defaults.timeoutMs` は型・解決ロジック上は既に機能するが、`agent-runner.ts` の `?? DEFAULT_POLL_TIMEOUT_MS` パターンが `null`（解決結果）を 15 分にフォールバックするため、config で明示的にタイムアウト無効を指定する手段がない。

## What Changes

- `schema.ts` の validation で `timeoutMs: 0` を許可する（`>= 0` に変更）
- `agent-runner.ts` の 2 箇所で `timeoutMs === 0` を `null`（タイムアウト無効）に変換する
- TC-016 テストを「0 は有効値」に更新し、0 → null 変換のテストを追加

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `step-execution-architecture`: `timeoutMs: 0` がタイムアウト無効として扱われる動作を追加

## Impact

- `src/config/schema.ts`: validation の `timeoutMs < 1` を `timeoutMs < 0` に変更（1 行）
- `src/adapter/managed-agent/agent-runner.ts`: L176, L355 の timeout 解決を変更（2 箇所）
- `tests/config/step-config.test.ts`: TC-016 を反転、0 → null 変換テストを追加
