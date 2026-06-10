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
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from report_result findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と `report_result` findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | medium | correctness | src/core/inbox/planner.ts:122 | `/resume` regex uses `/m` flag: `/^\/resume(\s|$)/m` makes `^` match the start of any line, not the start of the trimmed body. A collaborator comment with text before a `/resume` line (e.g. `"Thanks.\n/resume fix it"`) passes the guard. `parseResumePrompt` does not share the `/m` flag, so it fails to strip the command token and returns the full body as resumePrompt. Spec D5 requires "先頭トークンが `/resume`". | Remove the `/m` flag: `!/^\/resume(\s|$)/.test(comment.body.trimStart())` | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 8 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 8.85

## Summary

実装全体は設計どおりに仕上がっている。

planner/orchestrator の分離（D1）、inline await による冪等性（D2・D4）、auth gate（D5）、config バリデーション（D6）、worktree guard（D7）はいずれも仕様に従って実装されている。must テストケース 27 件はすべてカバーされ、typecheck && test は green。

唯一の指摘は F-01 の `/m` フラグ。collaborator がコメント本文の途中に `/resume` を書いた場合（例: 複数段落のコメントの後半行）に誤発火し、かつ `parseResumePrompt` が `/m` フラグを持たないため、コマンドトークンを除去できずに本文全体を resumePrompt として渡す。auth gate があるため外部攻撃ではなく collaborator の誤操作に限定されるが、spec 違反かつ resumePrompt の内容が壊れる実害がある。修正は `/m` フラグ削除の 1 文字。
