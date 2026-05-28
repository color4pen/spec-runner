# Code Review Feedback — iteration 002

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

- **verdict**: needs-fix
- **iteration**: 002

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | high | architecture | src/core/step/report-tool.ts | 受け入れ基準「ManagedAgentRunner が agent setup-time で `z.toJSONSchema(z.object(zodSchema))` により JSON Schema に変換した上で `agents.create` の `tools.input_schema` に登録し」に対し、`REPORT_TOOL_INPUT_SCHEMA` という別の静的オブジェクトを手書き定義して使用している。`zodSchema` と `REPORT_TOOL_INPUT_SCHEMA` の 2 箇所で同一スキーマを管理する dual-management が発生しており、設計方針「schema は両 runtime で 1 箇所のみ定義し、二重管理を回避する」に違反する。phase 3 で schema 拡張時に片方のみ更新されるリスクがある。 | `REPORT_TOOL_INPUT_SCHEMA` を削除し、`AnthropicClientAdapter.createAgent` / `updateAgent` 呼び出し前に `z.toJSONSchema(z.object(zodSchema))` で変換する経路を追加する（`z.toJSONSchema` は `zod/v4-mini` または `zod/v4` から import）。各 step の `AgentDefinition.tools` に追加している CustomToolSpec の `input_schema` フィールドも同様に zodSchema から派生させる。 | yes |
| 2 | medium | testing | tests/adapter/managed-agent/agent-runner.test.ts | test-cases.md の「must」テスト TC-028（Managed runtime — tool 未呼び出し → follow-up メッセージ送信）が未実装。Managed runtime の follow-up retry ロジック（`runPollingStyle` L.466-484）は実装済みだが、`pollUntilComplete` が `idle` で返ったとき（tool 未呼び出し）に `executeFollowUpTurn` → `sendUserMessage` が呼ばれることを検証するテストがない。 | `pollUntilComplete` が `{status:"idle"}` を返し `listEvents` が空を返す（tool 呼ばれない）シナリオを mock し、`sendUserMessage` が follow-up prompt で呼ばれることを assert するテストを追加する。 | yes |
| 3 | medium | testing | tests/adapter/managed-agent/agent-runner.test.ts | test-cases.md の「must」テスト TC-029（Managed runtime — maxAttempts 超過 → `toolResult:null`）が未実装。`maxAttempts=2` で 3 回連続 tool 未呼び出しをシミュレートする mock シーケンスがない。Local runtime 側（TC-023）は検証済みだが、Managed runtime 側のパスは完全未検証。 | `pollUntilComplete` が繰り返し `idle` を返し `listEvents` が常に空を返す mock を組み、`result.toolResult === null` かつ `result.followUpAttempts === 2` を assert するテストを追加する。 | yes |
| 4 | low | maintainability | src/core/step/delta-spec-fixer.ts | L60・L86 に「ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。」という旧挙動の指示が残存している。system prompt（SPEC_FIXER_SYSTEM_PROMPT、spec-fixer-system.ts 経由）には `report_result` を呼ぶ指示があるため、agent が `end_turn` で黙った後に不要な follow-up retry が発生する。前回レビュー（001）で指摘済みだが未修正。 | 当該指示を削除し「作業完了時は report_result tool を呼び出してください」に置き換えるか、system prompt の指示と一致する文言に更新する。 | yes |
| 5 | low | maintainability | src/errors.ts | L205 の `noCommitDetectedError` hint 文に「set `requiresCommit: false` on the step」という obsolete な指示が残っている。`requiresCommit` フィールドは本 change で削除済みであり、ユーザーを誤誘導する。前回レビュー（001）で指摘済みだが未修正。 | hint 文から `requiresCommit` への言及を削除し、新挙動（silently skip）を反映した内容に更新する（例：「Re-run the step or add content for the agent to commit.」）。 | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 8 | 0.30 |
| security | 10 | 0.25 |
| architecture | 7 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 8.35

## Summary

iteration 001 で指摘されたテスト不足の 5 件はすべて解消されており、`bun run typecheck && bun run test && bun run lint` は 287 ファイル 3274 件全グリーン。`DEFAULT_TOOL_RETRY` の `maxAttempts` ハードコード修正（`DEFAULT_MAX_TOOL_RETRY_ATTEMPTS` 定数化）も済んでいる。

**ブロッカーは 1 件（Finding #1）。** 受け入れ基準に「`z.toJSONSchema(z.object(zodSchema))` により変換」と明記されているにも関わらず、`REPORT_TOOL_INPUT_SCHEMA` という別の静的オブジェクトを手書きしている。phase 1 では同一内容のため実害はないが、phase 3 の schema 拡張時に両者の乖離が生まれるリスクがあり、設計の「1 箇所のみ定義」原則に反する。

Finding #2・#3 は Managed runtime の follow-up retry（tool 未呼び出し時の 2 回 retry と halt）が test で未検証。Local runtime 側は TC-023 で検証済みだが、Managed runtime は実装と test の対称性が欠ける。test-cases.md で「must」と分類されており追加が必要。

Finding #4・#5 は前回指摘のキャリーオーバー。いずれも小規模な文言修正で対応可能。
