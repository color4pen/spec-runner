# Request Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approve | needs-discussion | reject
  - approve:          No blocking findings (no HIGH, no decision-needed). Request is ready for pipeline execution.
  - needs-discussion: One or more blocking findings (HIGH or decision-needed) resolvable through discussion.
  - reject:           Multiple blocking findings AND requirement contradictions or structural breakdown.
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | Location | Description | Recommendation
- Valid Severity values (uppercase): HIGH | MEDIUM | LOW
  - HIGH:   Request-level defect — goal unclear, acceptance criteria absent/untestable, or critical external constraint unspecified
  - MEDIUM: Scope ambiguity, recommended additions
  - LOW:    Clarity improvements, expression refinements
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approve

## Findings

| # | Severity | Category | Location | Description | Recommendation |
|---|----------|----------|----------|-------------|----------------|
| 1 | MEDIUM | Scope ambiguity | request.md §要件3 / AC2 | "全 agent step の post-work / follow-up prompt" にはビルド時静的列挙できる followUpPrompt（design, code-review, ADR_FOLLOWUP_PROMPT）と、実行時にファイルシステムから読み込まれる rules followup prompts（specrunner/rules/<step>/*.md の wrap 結果）の二種類がある。AC2 がどちらを対象とするか明記されていないため、実装者が静的のみをカバーして rules ファイルを見逃す可能性がある。 | テスト対象を「ステップ定義に静的に宣言された followUpPrompt / getFollowUpPrompt の返り値」に限定する旨を AC2 に追記するか、rules files も含めるなら fs read を用いた追加ケースを明示する。いずれにせよ実装時に判断して問題ないが、意図を request に残すと drift を防ぎやすい。 |
| 2 | LOW | Clarity | request.md §要件2 | Req2 は「typed findings の正当性を main work turn の完了契約に置く」と述べているが、code-review system prompt（src/prompts/code-review-system.ts 68–93 行）にはすでに findings 配列の必須フィールドと `findings: []` の指示が記述されている。「配置する」が既存記述の確認なのか、追記が必要なのか読み取れない。 | 実装者向けに「既存 system prompt の記述で要件は充足されているため追記不要」あるいは「不足を補う追記が必要」のいずれかを明記する。実装上は既存記述で要件を満たすと判断できるが、intent を明示しておくと drift しにくい。 |

## Review Notes

**背景の事実確認**（全て一致）

- `src/adapter/claude-code/agent-runner.ts:724-725` — post-work turn で tool call が捕捉されない設計が明記されている ✓
- `src/adapter/claude-code/agent-runner.ts:732-733` — post-work の `followUpOptions` から `mcpServers` を `delete` しており、report_result MCP tool は post-work turn に登録されない ✓
- `src/core/step/code-review.ts:138-159` — followUpPrompt の項目 4（148–150 行）が report_result findings 提出確認を指示し、157 行が "report_result findings を修正してください" と指示している ✓
- `src/prompts/code-review-system.ts:68-93` — main work turn の system prompt には findings 必須フィールドと `findings: []` の明示的な指示が既にある ✓

**静的 followUpPrompt の列挙**

現時点で静的に宣言されている followUpPrompt / getFollowUpPrompt 返り値は以下の 3 つ:

1. `src/core/step/design.ts:65` — `followUpPrompt`（spec 記法チェック、report_result 無し）
2. `src/core/step/code-review.ts:138` — `followUpPrompt`（問題箇所）
3. `src/core/step/adr-gen.ts:20` — `ADR_FOLLOWUP_PROMPT`（Alternatives Confirmed チェック、report_result 無し）

**AC との対応**

- AC1 は code-review.ts の followUpPrompt から report_result 参照を除去しテストで固定する。既存テスト（fragment-coverage, coverage-gate-prohibition）のパターンで実装可能 ✓
- AC2 は全ステップ静的 followUpPrompt を走査する横断テスト。AC1 の対象がすでに AC2 に包含されるため、AC2 を通せば AC1 は自動達成される。テストファイルの配置（既存ファイルに追記 or 新ファイル）は実装者の判断でよい ✓
- AC3 は観測挙動の保存。code-review の verdict 導出は followUpPrompt ではなく main work turn の report_result tool 経由なので、followUpPrompt の変更は verdict 導出に影響しない ✓
- AC4 は通常の CI ゲート ✓

**スコープ評価**

変更対象が `code-review.ts:followUpPrompt` の文言修正（項目 4 削除・157 行の "or report_result findings" 削除）と新規テスト追加のみで、挙動保存が AC3 で明示されている。スコープは適切に限定されており、request type（spec-change）と一致する。
