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
**Verdict blocking rules (derived by CLI from report_result findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と `report_result` findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: needs-fix

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | Missing content | design.md | 再入セマンティクスが未記載（request 要件 7・AC6）。design.md の D1 は `runMainWorkTurn()` のラップ構造を説明しているが、「retry 時に新規 session を起動するか既存 session を継続するか」「失敗した試行の途中成果（書きかけファイル等）が worktree に残り得ること」「各 step class が安全に再入できる根拠（例: implementer は tasks.md チェック状態から続きを判断する）」の 3 点が明文化されていない。request 受け入れ基準 6 は「design.md に明示されている」を直接要求しており、この記載なしでは implementer が再入挙動を誤実装するリスクがある。 | D1 または独立セクションに以下を追記する: (a) retry は新規 agent session を起動する（失敗 attempt の session ID は capture されないため継続不能）、(b) 失敗した attempt の途中 worktree 成果は次の retry 開始時に残留し得る、(c) 各 step class が残留成果の存在下で安全に再入できる根拠（実例: implementer は tasks.md のチェック状態から作業位置を復元する既存設計）。 |
