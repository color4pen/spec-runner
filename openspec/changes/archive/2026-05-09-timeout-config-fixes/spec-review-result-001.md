# Spec Review Result — timeout-config-fixes

- **iteration**: 1
- **date**: 2026-05-09
- **verdict**: approved
- **request-type**: bug-fix

## Summary

仕様は正確にスコーピングされている。`defaults` 関連の要件（request 2-5）が PR #95 で既に実装済みであることを design.md で正しく識別し、実際に修正が必要な `timeoutMs: 0` の validation + agent-runner 変換のみにスコープを絞っている。コードベースの実態と一致しており、過不足ない。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | feasibility | tasks.md:8-9 | Task 2.1/2.2 が提案するコード `resolvedConfig.timeoutMs === 0 ? null : ...` は `SessionClient.pollUntilComplete` の型 `timeoutMs?: number` と不整合。`null` は `number \| undefined` に代入不可で typecheck が失敗する | `null` の代わりに `undefined` を使用するか、`timeoutMs` キーを条件付きで省略する |
| 2 | LOW | completeness | proposal.md | request.md の要件 2-5（defaults サポート）が PR #95 で実装済みである旨が proposal.md に明記されていない。design.md には記載あり | proposal.md の Impact または What Changes に「defaults は PR #95 で実装済み。本修正のスコープ外」を追記 |

## Verification Against Codebase

- `schema.ts` L244: `timeoutMs < 1` 確認済み。spec の主張と一致
- `agent-runner.ts` L176, L355: `?? DEFAULT_POLL_TIMEOUT_MS` 確認済み。spec の主張と一致
- `StepConfigMap.defaults`: 既に定義済み（schema.ts L33）。design.md の主張と一致
- `getStepExecutionConfig`: 4 段階チェーン実装済み（step-config.ts L59-81）。design.md の主張と一致
- `completion.ts` L71: `opts?.timeoutMs != null` で deadline スキップ。spec の主張と一致（ただし型は `number | undefined` であり `null` ではない）
- TC-016: 現在は `timeoutMs: 0 → CONFIG_INVALID` を検証。task 3.1 の反転対象として正確

## Acceptance Criteria Coverage

| 受け入れ基準 | カバー |
|-------------|--------|
| `timeoutMs: 0` でタイムアウト無効化 | Task 1.x + 2.x |
| `steps.defaults.timeoutMs` がフォールバック | PR #95 で実装済み。validation 修正（Task 1.x）で 0 も設定可能に |
| ステップ固有が defaults を上書き | PR #95 で実装済み |
| defaults 未設定時はハードコードデフォルト 15 分 | 既存動作維持。Task 2.x の `?? DEFAULT_POLL_TIMEOUT_MS` で保証 |
| validation が defaults キーを許可 | 既存動作。validation ループが全 stepKey を処理 |
| ユニットテスト | Task 3.1-3.4 |
| typecheck + test green | Task 4.1-4.2 |

## Design Decision Assessment

- **D1 (0 = no timeout)**: 妥当。`0` は実用上「0 秒タイムアウト」の意味がなく、無効化シグナルとして自然。`maxTurns` との非対称性はリスクとして明記されており許容範囲
- **D2 (変換は消費側)**: 妥当。解決関数の汎用性を維持する正しい責務分離
- **D3 (validation `< 0`)**: 妥当。最小変更で `0` を通過させつつ負値を拒否
