# Review Feedback 003: delta-spec-session-followup

- **iteration**: 3
- **reviewer**: code-reviewer
- **verdict**: approved

---

## Summary

review-002 の F-01 (TC-25 abort functional test) と F-02 (TC-05/TC-06 executor 転記 unit test) が両方解消されており、すべての must-scenario が unit test でカバーされた。typecheck green、2569 tests passed。

---

## Findings

### F-01: TC numbering collision in executor.test.ts (note)

- **severity**: low (style / readability)
- **file**: `tests/unit/step/executor.test.ts` L974–975 / L1109

既存 executor.test.ts に「TC-05: runAgentStep — startedAt < endedAt」「TC-06: runCliStep — startedAt < endedAt」という describe ブロックが存在し、追加された「TC-05 / TC-06: followUpPrompt 転記」describe と番号が衝突している。

機能的な問題はなく、テストはすべて pass している。将来レビューや CI 出力を読む際に混乱する可能性があるが、修正必須ではない。

---

## Must-scenario Coverage Matrix

| TC | Priority | Status |
|---|---|---|
| TC-01〜TC-04 (interface) | must | ✅ typecheck green |
| TC-05 (executor 転記) | must | ✅ executor.test.ts L1149 (F-02 resolved) |
| TC-06 (executor undefined) | must | ✅ executor.test.ts L1172 (F-02 resolved) |
| TC-07 (executor 無改修) | must | ✅ diff で確認 |
| TC-08 (FIXER_STEP_NAMES 無改修) | must | ✅ |
| TC-09〜TC-18 (shared helper) | must | ✅ follow-up.test.ts |
| TC-19〜TC-22 (Claude 2-turn) | must | ✅ |
| TC-23 (Claude modelUsage cumulative) | must | ✅ |
| TC-24 (Claude follow error → error) | must | ✅ |
| TC-25 (Claude abort propagation) | must | ✅ agent-runner.test.ts L945 (F-01 resolved) |
| TC-27〜TC-33 (Codex) | must | ✅ |
| TC-34〜TC-42 (Managed SSE / polling) | must | ✅ |
| TC-43〜TC-46 (DesignStep wiring) | must | ✅ |
| TC-47〜TC-48 (AbortController) | must | ✅ Claude/Codex でカバー |
| TC-49〜TC-52 (pipeline integrity) | must | ✅ |
| TC-54〜TC-55 (typecheck/test green) | must | ✅ 2569 passed |

---

## Positive Observations

- TC-25 の functional test が review-002 の提示例とほぼ同一の構造で正確に実装されている。`callCount === 1` の assert が「follow turn 不起動」を直接証明している。
- TC-05/TC-06 executor 転記テストは `makeCapturingFollowUpRunner()` で ctx を直接キャプチャする方式で正確。executor の転記責務が独立して検証されている。
- review-002 F-03 (SSE polling fallback test, should) は未着手だが、実装は正しくテスト対象外パスを封じており、"should" スコープのまま据え置きは妥当。
