# Code Review Feedback — iteration 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended. The verdict line is the authoritative decision.
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | MEDIUM | testing | tests/adapter/codex/agent-runner.test.ts | TC-013（must）未カバー: retry ターンに `outputSchema` が渡されることを検証するテストがない。実装は正しく（L223: `{ signal: abortController.signal, outputSchema }`）、既存テストは retry 回数・toolResult を検証しているが opts の内容は不検証。test-cases.md の must 要件。 | postWorkPrompts テスト（L649-682）と同様に `vi.fn().mockImplementation` で opts をキャプチャするテストを追加する。retry 1 回目の `thread.run()` 呼び出しの第 2 引数に `outputSchema` が含まれていることを assert する。 | yes |
| 2 | LOW | testing | tests/adapter/codex/agent-runner.test.ts | TC-003（must）部分カバー: `buildOutputSchema` は非 export のため直接テスト不可。`"reportTool set → thread.run() called with outputSchema in opts"` が `typeof outputSchema === 'object'` を確認しているが、schema 内の `properties`（ok, reason, status）と `required: ["ok"]` は assert されていない。 | `outputSchema` の値を `JSON.stringify` した上で `ok` / `required` の key 存在を assert するか、`buildOutputSchema` を export して直接テストする。間接カバレッジで許容とするなら Fix=no でも可。 | no |
| 3 | LOW | maintainability | src/adapter/codex/agent-runner.ts | retry ループ（L228-235）および postWorkPrompts ループ（L253-260）の usage 累積で `reasoning_output_tokens` が落とされる。`CodexUsage` interface に定義があるが累積式に含まれていない。最終 `ModelUsage` マッピング（L303-310）でも `reasoning_output_tokens` は使われないため verdict への影響はないが、usage object の一貫性が欠ける。 | スコープ外（ModelUsage への mapping 側の問題で本 change の責務外）。将来 R4/R5 で ModelUsage を拡張する際に合わせて対応する。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 10 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 7 | 0.10 |

- **total**: 8.95

## Summary

実装の正確性・設計整合性は高い。outputSchema 注入・finalResponse parse・retry ループ・postWorkPrompts 分離・frozen behavior コメント除去・delta spec 生成がすべて正常に実装されている。verification（build/typecheck/test/lint）が全 green（3325 tests）。

唯一の修正対象は **Finding #1（TC-013 missing）** のみ。retry ターンへの `outputSchema` 渡しは実装では明確（L223）だが、test-cases.md の must 要件に対応するテストがない。postWorkPrompts テストと同じパターンで追加可能な 1 テスト。

Finding #2（buildOutputSchema content）と Finding #3（reasoning_output_tokens）はスコープ外または間接カバレッジで許容のため Fix=no。
