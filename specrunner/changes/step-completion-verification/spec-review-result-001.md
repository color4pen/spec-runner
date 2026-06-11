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

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | Design Gap | design.md | adr-gen.writes() は `specrunner/adr/${slug}.md` を宣言するが、実際の ADR ファイルは `YYYY-MM-DD-${slug}.md` 形式で書かれる（specrunner/adr/ 配下の既存 ADR 全件が日付プレフィックス付き）。produced 契約が有効になると `adr: true` の全 pipeline で `STEP_OUTPUT_MISSING` halt が発生する。T-07 の audit タスクで捉えられる範囲だが、設計書が既知ケースとして明示しておらず実装者が見落とすリスクがある。 | design.md の D2 または T-07 に「adr-gen の writes() は宣言パスと実際の書き先がずれるため `verify: false` が必要」を追記する。実装時に T-07 で必ず確認・対処すること。 |
| 2 | MEDIUM | Observability | design.md / tasks.md | D6 の follow-up ループが既存の `followUpAttempts` カウンターに出力検証 attempt を加算する（T-05 参照）。現在の `followUpAttempts` は「report_result retry 回数」を意味するため、2 種類の retry が同一フィールドに混在し診断・ログ分析が曖昧になる。設計書はこの混在を明示していない。 | `AgentRunResult` に `outputVerificationAttempts?: number` を追加して別カウンターとするか、design.md に「followUpAttempts は report_result retry と出力検証 attempt の合算」と明示する。どちらの判断でも実装前に明記すること。 |
| 3 | LOW | Redundancy | design.md | implementer の writes() に含まれる `tasks.md`（非 gitState, verify 未指定）は produced 契約（halt）に昇格する。しかし implementer は tasks.md を作成せず更新するだけなので produced チェック（exists + non-empty）は常に素通りする。一方で tasks-complete 契約（outputContracts() 由来）が実際の検証を行う。tasks.md に `verify: false` を付けて produced 契約から除外する方が契約の意図が明確になる。 | implementer.writes() の tasks.md エントリに `verify: false` を追加し、「implementer は tasks.md を更新するのみで産出しないため produced 契約対象外」とコメントする。T-07 の audit タスクで一緒に対処可能。 |
