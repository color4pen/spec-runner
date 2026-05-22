# Code Review: managed-agent-usage-tracking (Iteration 2)

## Summary

Iteration 1 の `needs-fix` 指摘 (F-01: TC-09/TC-10 不在、F-02: TC-18 `toHaveBeenCalledTimes(1)` 不在) がすべて解消されている。
実装・型安全性・テストカバレッジに問題なし。全テスト green / typecheck clean を確認。

---

## Findings

### F-01 解消確認 — TC-09 / TC-10 追加済み

**location**: `tests/unit/adapter/managed-agent/session-client.test.ts` L111-130

- TC-09 (`retrieveSession` が usage を返す → `SessionUsage` に正しくマップ): `describe("AnthropicSessionClient.getSessionUsage")` ブロックに追加済み。`makeFakeAnthropicWithRetrieve` ヘルパーを使い SDK mock を最小化している。
- TC-10 (`retrieveSession` が throw → `undefined` best-effort): `makeFakeAnthropicWithRetrieveError` で catch ブロックを直接カバー済み。

以前 F-01 で指摘した「退行検知できない」問題が解消された。

---

### F-02 解消確認 — TC-18 `toHaveBeenCalledTimes(1)` 追加済み

**location**: `tests/unit/adapter/managed-agent/agent-runner.test.ts`

- SSE follow-up テスト L1092: `expect(sessionClient.getSessionUsage).toHaveBeenCalledTimes(1)` が追加済み。
- Polling follow-up テスト L1219: 同様に `toHaveBeenCalledTimes(1)` が追加済み。

これにより「turn ループ内で誤って複数回呼ばれても検知できない」問題が解消された。

---

## Test Coverage — must TC 確認

| TC | Priority | Status |
|----|----------|--------|
| TC-01〜TC-06 | must | ✅ `usage.test.ts` table-driven |
| TC-07, TC-08 | must | ✅ typecheck / import 確認 |
| TC-09 | must | ✅ `session-client.test.ts` (iter 2 追加) |
| TC-10 | must | ✅ `session-client.test.ts` (iter 2 追加) |
| TC-12〜TC-17 | must | ✅ `agent-runner.test.ts` |
| TC-18 | must | ✅ `agent-runner.test.ts` (iter 2 追加) |
| TC-20, TC-21 | must | ✅ verification-result: 2580 tests pass |
| TC-22, TC-23 | must | ✅ git diff で Claude/Codex 無改修 |

verification-result.md の `test-coverage` フェーズ: `21/21 must TCs covered` を確認。

---

## Positive Observations (iter 1 から変わらず)

- `mapSessionUsage` 純粋関数・`cache_creation` 平坦化・0 埋め: 変更なし、正確。
- port 層 SDK 型非露出: `src/core/port/session-client.ts` に `@anthropic-ai/sdk` import なし。
- 両経路の終端 1 read 配置: follow-up ブロック外側で usage read → cumulative 1 read 保証。
- `step.agent.model` 一次キー: SSE / polling 両経路で scope 内。
- best-effort パターン: Claude adapter と同一の try/catch + `if (sessionUsage)` ガード。

---

## Verdict

- **verdict**: approved
