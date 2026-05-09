## 1. Validation 修正

- [x] 1.1 `src/config/schema.ts` L244: `timeoutMs < 1` を `timeoutMs < 0` に変更
- [x] 1.2 エラーメッセージを `must be a non-negative integer or null` に更新

## 2. agent-runner.ts の timeout 解決修正

- [x] 2.1 `src/adapter/managed-agent/agent-runner.ts` L176: `resolvedConfig.timeoutMs === 0 ? null : resolvedConfig.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS` に変更
- [x] 2.2 同 L355: 同じパターンを適用

## 3. テスト更新

- [x] 3.1 `tests/config/step-config.test.ts` TC-016: `timeoutMs: 0` が CONFIG_INVALID にならないことを検証するテストに反転
- [x] 3.2 `timeoutMs: -1` が CONFIG_INVALID のままであることを検証するテストを追加
- [x] 3.3 `timeoutMs: 0` が `getStepExecutionConfig` で `0` として解決されることを検証するテストを追加
- [x] 3.4 agent-runner の `resolveTimeout` パターン（0 → null、null → DEFAULT、正数 → そのまま）のユニットテストを追加（agent-runner のテストファイルまたは step-config テストに配置）

## 4. 検証

- [x] 4.1 `bun run typecheck` が green
- [x] 4.2 `bun run test` が green
