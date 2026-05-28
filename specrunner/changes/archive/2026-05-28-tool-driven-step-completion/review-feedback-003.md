# Code Review Feedback — iteration 003

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
- **iteration**: 003

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | maintainability | src/prompts/spec-fixer-system.ts, build-fixer-system.ts, code-fixer-system.ts, implementer-system.ts | T-12 で各 system prompt の末尾に `## Completion` セクション（"必ず `report_result` tool を呼び出してください"）が追加されたが、同じ prompt 内の手順ステップ（spec-fixer L34: "修正が完了したら end_turn する"、build-fixer L35、code-fixer L37、implementer L50 同様）との矛盾が残存している。agent が手順ステップを読んで `end_turn` で完了した場合、tool 未呼び出しとして follow-up retry が発生する。retry 機構が緩和するため機能上の破壊はないが、無駄なリトライを誘発する可能性がある。 | 各 prompt の手順ステップ中の "end_turn する" を "report_result tool を呼び出して完了する" に置き換える。ただし design-system.ts の Completion Checklist ("end_turn 前に self-check") はファイル書き出し確認のための前提条件であり、別途判断する。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 10 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.10

## Summary

iteration 002 で指摘された 5 件の findings はすべて解消されている。

**Finding #1（high）— 解消済み**: `REPORT_TOOL_INPUT_SCHEMA` 手書き静的オブジェクトを廃止し、`REPORT_TOOL_CUSTOM_TOOL_SPEC.input_schema` を `toJSONSchema(object(REPORT_TOOL.zodSchema))` で派生させる single-source-of-truth 設計に移行した。`zod/v4-mini` の `toJSONSchema` と `object` を `report-tool.ts` 内で直接 import しており、phase 3 での schema 拡張時も自動伝播する。

**Finding #2/3（medium）— 解消済み**: Managed runtime の follow-up retry テスト TC-028・TC-029 を追加。TC-028 は `pollUntilComplete` が idle 返却 + `listEvents` 空のシナリオで `sendUserMessage` が 2 回以上呼ばれ、2 回目の call に "report_result" が含まれることを検証。TC-029 は `toolResult === null` かつ `followUpAttempts === 2` を assert している。

**Finding #4（low）— 解消済み**: `delta-spec-fixer.ts` の初回・継続メッセージ双方で "ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。" を "call the report_result tool to complete this step" に置き換え済み。

**Finding #5（low）— 解消済み**: `errors.ts` の `noCommitDetectedError` hint から "set `requiresCommit: false` on the step" への言及を削除。現行文言は "Re-run the step or inspect the agent session log." に更新されている。

**新規 Finding #1（low）**: `spec-fixer-system.ts` 等の複数 prompt で、手順ステップに残存する "end_turn する" と末尾 `## Completion` の "report_result tool を呼び出してください" が矛盾している。phase 1 の段階的移行方針（T-12: "既存の format 制約は削除しない"）の範囲内の問題であり、retry 機構が緩和するため本 change のブロッカーではない。Fix 列 `no`（phase 3 での cleanup 対象）。

`bun run typecheck && bun run test && bun run lint` は 287 ファイル 3263 件全グリーン。全受け入れ基準を満たしており、approve とする。
