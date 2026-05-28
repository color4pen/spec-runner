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

- **verdict**: needs-fix
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | high | testing | tests/unit/adapter/claude-code/agent-runner.test.ts | 受け入れ基準「Local runtime で少なくとも 1 step を代表例として report_result tool 経由完了が新規 test で検証されている」を満たすテストが存在しない。`createSdkMcpServer` でツールが登録されること、ok:true で呼ばれたとき `toolResult: {ok:true}` が返ること (TC-018, TC-019 相当) が未検証。 | `_queryFn` mock でハンドラ呼び出しをシミュレートし、`capturedToolResult` が正しくセットされるテストを追加する。 | yes |
| 2 | high | testing | tests/unit/adapter/claude-code/agent-runner.test.ts | 受け入れ基準「tool 未呼び出し時の follow-up retry (2 回 → halt) が新規 test で検証されている」が未実装。Local runner の follow-up retry ループ (TC-021, TC-022, TC-023 相当) と `followUpAttempts === 2` / `toolResult === null` の最終状態が未検証。 | mock が tool を呼ばずに 3 回連続 result を返すシーケンスを組み、`followUpAttempts === 2`, `toolResult === null` を assert するテストを追加する。 | yes |
| 3 | high | testing | tests/unit/adapter/claude-code/agent-runner.test.ts | 受け入れ基準「tool 検出が main work ターンのみで行われ、postWorkPrompts ターン中の report_result 呼び出しは無視されることが test で検証されている」が未実装 (TC-024 相当)。 | main work で `{ok:true}` を返し、postWorkPrompts ターンで `{ok:false}` を返す mock シーケンスを作り、最終 `toolResult` が main work の値のままであることを検証するテストを追加する。 | yes |
| 4 | high | testing | tests/adapter/managed-agent/agent-runner.test.ts | 受け入れ基準「Managed runtime で少なくとも 1 step を代表例として requires_action 経由の report_result 取得が新規 test で検証されている」が未実装。`pollResult.status === "requires_action"` → `handleRequiresAction` → `listEvents` / `sendEvents` 呼び出し → `toolResult: {ok:true}` の流れ (TC-026 相当) が単体テストに存在しない。 | `pollUntilComplete` が `{status: "requires_action"}` を返し、`listEvents` が `agent.custom_tool_use` イベントを返す mock を組み、`sendEvents` が `user.custom_tool_result` で呼ばれること・`result.toolResult === {ok: true}` を assert するテストを追加する。 | yes |
| 5 | high | testing | tests/unit/core/step/executor.test.ts | 受け入れ基準「halt 時に job status が awaiting-resume に遷移することが検証されている」が未実装 (TC-040, TC-041, TC-042 相当)。`ctx.policy.reportTool` が設定されていて `toolResult === null` のとき `stepHaltedNoToolCallError` が throw され job が `awaiting-resume` になること、および `reportTool` が未設定 (Codex path) では halt しないことが executor テストで未検証。 | `runResult.toolResult === null` + `reportTool` 有/無の 2 パターンを mock runner で作り、executor の状態遷移を assert するテストを追加する。 | yes |
| 6 | medium | correctness | src/core/port/report-result.ts | `DEFAULT_TOOL_RETRY.buildPrompt` が `maxAttempts` を `/${2}` とハードコードしている (L85, L87)。カスタム `FollowUpPolicy { maxAttempts: 3, buildPrompt: DEFAULT_TOOL_RETRY.buildPrompt }` を作ると "attempt 1/2" と表示され不正確になる。 | `buildPrompt` の引数に `maxAttempts` を追加するか、クロージャで参照するよう修正する。Phase 1 では影響が限定的だが、interface 定義に `maxAttempts` を渡さない設計なら `FollowUpPolicy` の contract に `maxAttempts` を含めるべき。 | yes |
| 7 | low | maintainability | src/core/step/delta-spec-fixer.ts | L60 の `buildDeltaSpecFixerInitialMessage` に「ファイルを worktree に書き出したら end_turn してください」という旧挙動の指示が残っている。system prompt (SPEC_FIXER_SYSTEM_PROMPT) には `report_result` を呼ぶ指示があるため矛盾する。agent が end_turn で黙った後に不要な follow-up retry が発生するリスクがある。 | 旧指示を削除し「作業完了時は report_result tool を呼んでください」に置き換えるか、system prompt の指示と一致させる。 | yes |
| 8 | low | maintainability | src/errors.ts | `noCommitDetectedError` のヒント文に「set `requiresCommit: false` on the step」という obsolete な指示が残っている (L205)。`requiresCommit` フィールドは本 change で削除された。commit-push.ts からはもうスローされないが、他の呼び出し元が残っている場合ユーザーを誤誘導する。 | ヒント文から `requiresCommit` への言及を削除し、新しい挙動 (silently skip) を反映した文言に更新する。 | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 8 | 0.30 |
| security | 10 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 7 | 0.10 |
| testing | 3 | 0.10 |

- **total**: 7.70

## Summary

実装品質は高い。`report-result.ts` port 定義、`AgentRunContext` の subfield 化リファクタ、`requiresCommit` guard 廃止、`commit-push.ts` の新挙動、ClaudeCodeRunner / ManagedAgentRunner の両 runtime への対応、全 10 step への `reportTool` 追加、executor の halt ロジック、state schema 拡張、いずれも設計通りに実装されており、型チェック・lint・既存テスト (3266) はすべてグリーン。

**ブロッカーは受け入れ基準に明示された 4 つの新規テスト不足（Finding #1〜#5）。** 既存テストは新 `AgentRunContext` 構造に対応させる形でのみ更新されており、`report_result` tool 経由の実際の完了フロー、follow-up retry の 2 回 → halt 挙動、および executor の `awaiting-resume` 遷移が単体・統合テストで検証されていない。これらは acceptance criteria に「新規 test で検証されている」と明記された must 項目。

`DEFAULT_TOOL_RETRY.buildPrompt` の `maxAttempts` ハードコード（Finding #6）は Phase 1 では実害がないが、Phase 3 での step 固有ポリシー追加時にバグになる可能性があり、今のうちに修正しておくのが安全。
