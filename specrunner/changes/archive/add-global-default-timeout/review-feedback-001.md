# Review Feedback: add-global-default-timeout

- **iteration**: 1
- **date**: 2026-05-11
- **verdict**: needs-fix

## Summary

実装ロジック（D1: stepDefaults 解決チェーン統一、D2/D4: AbortController wall-clock timeout）は設計通り正確に実装されている。`resolveTimeoutMs` 削除・`finally` によるタイマーリーク防止・0-semantics 維持も含め correctness に問題はない。

問題は **テストカバレッジ**。`resolveTimeoutMs` の既存テスト 3 件（TC-026/027/028/029 相当）を削除した代わりに、ManagedAgentRunner の新しい stepDefaults 解決動作を検証するテストが一切追加されていない。must シナリオ 4 件（TC-036, TC-037, TC-038, TC-040）が未実装のまま。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | testing | tests/unit/adapter/managed-agent/agent-runner.test.ts | TC-036, TC-037, TC-038, TC-040 の must シナリオが未実装。`resolveTimeoutMs` の既存テスト 3 件を削除したが、新しい stepDefaults 解決チェーンを検証するテストが追加されていない。ManagedAgentRunner が `DEFAULT_POLL_TIMEOUT_MS` を stepDefaults として渡すことが実装コード上の唯一の担保となっており、動作保証がない | `runProposeStyle` / `runPollingStyle` それぞれで `getStepExecutionConfig` に `timeoutMs: DEFAULT_POLL_TIMEOUT_MS` が渡ることを確認するテストを追加（vi.spyOn か deps 注入で検証）。TC-036: defaults.timeoutMs が適用される、TC-037: step-level が defaults を上書き、TC-038: config なし → DEFAULT_POLL_TIMEOUT_MS、TC-040: no steps config → ManagedAgentRunner は DEFAULT_POLL_TIMEOUT_MS を維持 |
| 2 | MEDIUM | testing | tests/unit/adapter/claude-code/agent-runner.test.ts | TC-041 (should) — タイムアウト前に非 abort エラーが発生した場合に completionReason が "timeout" に誤分類されないことのテストが未実装 | queryFn がタイムアウト前に即時エラーをスローするシナリオを追加し、`result.completionReason !== "timeout"` かつ `abortController.signal.aborted === false` を確認する |
| 3 | LOW | maintainability | src/adapter/claude-code/agent-runner.ts:205 | timeout の catch ブロックで `clearTimeout(timeoutId)` を明示的に呼んだ後、`finally` でも `clearTimeout(timeoutId)` が呼ばれる。double-call だが harmless | catch 内の `clearTimeout(timeoutId)` を削除し、finally に一元化する |

## Scores

| Category | Score | Notes |
|----------|-------|-------|
| correctness | 8 | 実装ロジック正確。D1/D2/D4 の解決チェーン・AbortController・0-semantics すべて正しい |
| security | 8 | セキュリティ上の懸念なし |
| architecture | 8 | stepDefaults による解決チェーン統一は設計上クリーン。`resolveTimeoutMs` 削除も適切 |
| performance | 8 | finally によるタイマーリーク防止が正しく実装されている |
| maintainability | 7 | catch+finally の double clearTimeout が軽微な冗長性 |
| testing | 3 | must 4 件未実装（TC-036/037/038/040）。ManagedAgentRunner 側の動作保証がゼロ |

**Total**: 8×0.30 + 8×0.25 + 8×0.15 + 8×0.10 + 7×0.10 + 3×0.10 = **7.40**

pass threshold (7.0) は超えるが、HIGH finding (testing) により verdict = needs-fix。

## Verdict Rationale

- CRITICAL: 0
- HIGH: 1（testing — must シナリオ TC-036/037/038/040 未実装）
- 承認阻止条件: HIGH ≥ 1 → `needs-fix`
