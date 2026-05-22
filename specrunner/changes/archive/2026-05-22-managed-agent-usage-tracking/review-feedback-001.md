# Code Review: managed-agent-usage-tracking (Iteration 1)

## Summary

実装は設計通りに動作しており、`bun run typecheck && bun run test` (237 files / 2580 tests) が全 green。
受け入れ基準の実装面はすべて満たしている。ただし `test-cases.md` が "must" とマークしている TC-09 / TC-10 / TC-18 の 3 件がテストファイルに存在しない。

---

## Findings

### F-01 [minor] TC-09 / TC-10 が未実装 — `AnthropicSessionClient.getSessionUsage` 直接 unit test 不在

**severity**: minor  
**location**: `tests/unit/adapter/managed-agent/session-client.test.ts`

**観察**: `session-client.test.ts` には `AnthropicSessionClient.createSession` の branch 伝播テストのみ存在し、今回追加した `getSessionUsage` メソッドの直接 unit test がない。

- TC-09 (`retrieveSession` が usage 付き session を返す mock → 正しくマップされた値が返る)
- TC-10 (`retrieveSession` が throw する mock → `undefined` を返す / best-effort)

**現状との差異**: agent-runner.test.ts はインターフェース mock (`sessionClient.getSessionUsage` を `vi.fn()` でスタブ) でテストしており、adapter 実装の `getSessionUsage` 内部 (`retrieveSession` 呼び出し + catch block) は直接カバーされていない。

**影響**: best-effort の catch ブロックが将来除去されても既存テストは通る (= 退行検知できない)。

**修正案**: `session-client.test.ts` に以下 2 ケースを追加する。
```typescript
// TC-09
it("getSessionUsage — retrieveSession が usage を返す → マップされた SessionUsage を返す", async () => {
  const fake = makeFakeAnthropicWithRetrieve({ input_tokens: 100, output_tokens: 200 });
  const client = new AnthropicSessionClient(fake);
  const result = await client.getSessionUsage("sess-abc");
  expect(result).toEqual({
    inputTokens: 100, outputTokens: 200,
    cacheReadInputTokens: 0, cacheCreationInputTokens: 0,
  });
});

// TC-10
it("getSessionUsage — retrieveSession が throw する → undefined を返す (best-effort)", async () => {
  const fake = makeFakeAnthropicWithRetrieveError(new Error("network error"));
  const client = new AnthropicSessionClient(fake);
  const result = await client.getSessionUsage("sess-abc");
  expect(result).toBeUndefined();
});
```

---

### F-02 [minor] TC-18 が未実装 — follow-up turn 込みで `getSessionUsage` 呼び出し回数が 1 回のみであることを検証していない

**severity**: minor  
**location**: `tests/unit/adapter/managed-agent/agent-runner.test.ts`

**観察**: test-cases.md TC-18 は「follow-up turn を含む SSE/polling シナリオで `getSessionUsage` の呼び出し回数が 1 回のみ」を must で要求しているが、agent-runner.test.ts の usage 追跡テストには `toHaveBeenCalledTimes(1)` の assertion が存在しない。

**現状**: follow-up ありシナリオで usage が正しく result に乗ることは確認できるが、turn ループ内で誤って複数回呼ばれていても既存テストは通る。

**修正案**: 既存の follow-up turn テスト (例: "follow-up turn を含む polling 経路") の describe 内に、`getSessionUsage` の呼び出し回数を検証する assertion を追加する。
```typescript
expect(sessionClient.getSessionUsage).toHaveBeenCalledTimes(1);
```

---

## Positive Observations

- **純粋関数 `mapSessionUsage`**: null/undefined passthrough・全フィールド 0 埋め・`cache_creation` 両 ephemeral フィールドの合算を TC-01〜TC-06 として table-driven で網羅。SDK mock 不要の設計が正しく実現されている。
- **Port 層の SDK 型非露出**: `src/core/port/session-client.ts` が `@anthropic-ai/sdk` を import していないこと (TC-08) を確認。`SessionUsage` は手書き interface で定義されており、structural subtyping で `ModelUsage` と互換。
- **両経路の終端 1 read**: SSE 経路 (line 249) / polling 経路 (line 520) ともに follow-up turn ブロックの**外側**に usage read を配置しており、follow-up turn の有無に依らず cumulative な 1 read になっている。設計 D5 通り。
- **モデルキー**: SSE 経路も polling 経路も `step.agent.model` をキーに使用 (設計 D4 通り)。`resolvedConfig` が SSE end_turn 経路では未計算になる問題を正しく回避している。
- **best-effort**: `getSessionUsage` の try/catch 実装と、usage read の `if (sessionUsage)` ガードが Claude adapter `:190` と同パターンで実装されている。
- **Claude/Codex 無改修**: diff stat でいずれも変更なし (TC-22, TC-23 通過)。
- **全テスト green**: 237 test files / 2580 tests pass。typecheck clean。

---

## Test Coverage Gap Summary

| TC | Priority | Status | Gap |
|----|----------|--------|-----|
| TC-01〜TC-06 | must | ✅ covered | — |
| TC-07, TC-08 | must | ✅ covered (typecheck / import確認) | — |
| TC-09 | must | ❌ missing | adapter 実装の直接 unit test なし |
| TC-10 | must | ❌ missing | best-effort catch の直接 unit test なし |
| TC-12〜TC-17 | must | ✅ covered (agent-runner.test.ts) | — |
| TC-18 | must | ❌ missing | `toHaveBeenCalledTimes(1)` assertion なし |
| TC-20, TC-21 | must | ✅ covered | — |
| TC-22, TC-23 | must | ✅ covered | — |

---

## Verdict

- **verdict**: needs-fix

**理由**: 実装の正確性・設計適合性に問題はなく、全テストが green。ただし `test-cases.md` が must とマークした TC-09 / TC-10 / TC-18 の 3 件がテストファイルに存在しない。F-01 / F-02 は small scope の追加テストで解消できる。
