# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | Scope note | tasks.md §T-04 | `DESIGN_ONLY_DESCRIPTOR` は `STANDARD_DESCRIPTOR` / `FAST_DESCRIPTOR` と並ぶ第 3 のパイプライン定義だが T-04 の走査対象に含まれていない。`DesignStep.followUpPrompt` は `report_result` を参照しないため現状は問題なく、テストは DESIGN_ONLY を含めなくても green になる。将来 DESIGN_ONLY に follow-up を追加した際に未カバーになるリスクが残る。 | テストファイル内コメントに「DESIGN_ONLY_DESCRIPTOR は現状 follow-up なし、追加時はここに追加」と一言残すと意図が伝わりやすい。実装の判断に委ねる。 |

## Review Notes

### 事実確認（コードとの照合）

- `src/adapter/claude-code/agent-runner.ts:724-725` — `tool calls in postWorkPrompts turns are intentionally NOT detected` のコメント確認 ✓
- `src/adapter/claude-code/agent-runner.ts:732-733` — `delete followUpOptions["mcpServers"]` により report_result MCP tool が post-work turn に登録されないことを確認 ✓
- `src/core/step/code-review.ts:138-159` — `followUpPrompt` 項目 4（:148-150）が `report_result findings` 提出確認を指示し、:157 が "report_result findings を修正してください" と指示していることを確認 ✓
- `src/prompts/code-review-system.ts:67-93` — `## Completion` セクションに `findings` 配列必須・各フィールド・`findings: []` 規約が既に存在することを確認 ✓
- `CODE_REVIEW_REPORT_TOOL.description`（`src/core/step/report-tool.ts:149`）— "REQUIRED when ok=true: provide a 'findings' array" の記述を確認 ✓

### 設計評価

**D1（followUpPrompt を Markdown 専用に限定）**: 適切。items 1–3・5（Markdown テーブル形式・必須カラム・Fix カラム・Severity 定義）は Markdown ファイルに対して `Read`/`Edit` で完結する有効な post-work 指示。item 4（report_result 配列）のみが post-work では機能しない死んだ指示。除去後に 1-4 に連番付け直す点も design.md に明記されている。

**D2（lock test — main work turn 完了契約）**: 適切。system prompt と tool description に既に担保が存在し、source は変更不要。lock test が regression を fail-closed に固定する防御策として有効。

**D3（越境不変テスト）**: 適切。禁止マーカーを `report_result` に絞る理由（`Edit`/`Read` 等の post-work 有効 tool は false positive になる）が明確に示されている。registry 由来の動的列挙により step 追加時に自動包含される設計。

### 現在の静的 followUpPrompt 一覧（実装時の参照用）

| Step | 定義場所 | report_result 言及 |
|------|----------|--------------------|
| design | `src/core/step/design.ts:65` | なし |
| code-review | `src/core/step/code-review.ts:138` | **あり（修正対象）** |
| adr-gen | `src/core/step/adr-gen.ts:20`（`ADR_FOLLOWUP_PROMPT`） | なし |

その他 agent step（request-review / spec-review / spec-fixer / test-case-gen / implementer / build-fixer / code-fixer / conformance）は `followUpPrompt` / `getFollowUpPrompt` を持たず、T-04 の走査では undefined としてスキップされる。

### セキュリティ

変更は静的プロンプト文字列の一部削除と新規テストの追加に限定される。新たな I/O パス・認証経路・外部入力を導入しない。OWASP Top 10 該当なし。

### 受け入れ基準との対応

- AC1（followUpPrompt に report_result 非包含をテストで固定）→ T-02 で対応 ✓
- AC2（越境不変歯、全 agent step の post-work prompt 走査）→ T-04 で対応 ✓
- AC3（verdict 導出・Markdown result file 検査の観測挙動が不変）→ T-05 で対応 ✓
- AC4（typecheck && test が green）→ T-05 で確認 ✓
