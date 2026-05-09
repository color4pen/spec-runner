## Context

PR #176 で ManagedAgentRunner のポーリングにウォールクロックタイムアウトを追加した。`agent-runner.ts` の 2 箇所（L176, L355）で `resolvedConfig.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS` を使い、config 未設定時は 15 分をデフォルトとする。

問題:
1. `validateConfig()` が `timeoutMs < 1` を弾くため、`0` を設定できない
2. `agent-runner.ts` の `??` は `null` を `DEFAULT_POLL_TIMEOUT_MS` にフォールバックするため、`getStepExecutionConfig` が `null` を返しても 15 分になる。ユーザーが config で「タイムアウト無し」を指定する手段がない

`steps.defaults` の型定義（`StepConfigMap.defaults`）と解決ロジック（`getStepExecutionConfig` の 4 段階チェーン）は step-config-externalization（PR #95）で実装済み。defaults 自体の追加は不要。

## Goals / Non-Goals

**Goals:**

- `timeoutMs: 0` を validation で許可し、タイムアウト無効の意味として扱う
- `agent-runner.ts` で `0` → `null` 変換し、`pollUntilComplete` にタイムアウト無しで渡す
- 既存動作の維持: config 未設定時は `DEFAULT_POLL_TIMEOUT_MS`（15 分）

**Non-Goals:**

- `step-config.ts` の解決ロジック変更（`0` の変換は消費側 agent-runner.ts の責務）
- `completion.ts` の変更（`timeoutMs: null` で deadline スキップは既存動作）
- `timeoutMs: null` の明示的サポート拡張（config 上は `0` を使う）

## Decisions

### D1: 0 の意味

`timeoutMs: 0` はタイムアウト無効を意味する。負の値は validation で引き続き拒否する。

**理由**: `null` は JSON config では「未設定」と区別しづらい。`0` は「0 秒のタイムアウト」という意味は実用上ないため、無効化のシグナルとして再定義する。`maxTurns: 0` は引き続き無効（`null` = unlimited が明示手段）。timeoutMs だけの特殊ルール。

### D2: 変換の責務

`0` → `null` の変換は `agent-runner.ts`（消費側）で行う。`getStepExecutionConfig` は `0` をそのまま返す。

**理由**: 解決関数は汎用。`0` の意味は消費コンテキストに依存する。将来 `maxTurns: 0` に別の意味を持たせる可能性を閉じない。

### D3: validation の変更

`schema.ts` の `timeoutMs` validation を `timeoutMs < 1` から `timeoutMs < 0` に変更。`0` は通過し、負の値は拒否。

**理由**: 最小限の変更。エラーメッセージは `must be a non-negative integer or null` に更新。

## Risks / Trade-offs

- [Risk] `timeoutMs: 0` の意味が `maxTurns` と非対称（`maxTurns: 0` は invalid のまま）→ ドキュメントで明示。実用上問題なし
- [Trade-off] `null` を config で直接書いてもタイムアウト無効にならない（`??` で 15 分になる）→ `0` を唯一の無効化手段とすることで、`null` = 「未設定」のセマンティクスを維持
