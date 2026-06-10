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
**Verdict blocking rules (derived by CLI from report_result findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と `report_result` findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approve

## Findings

| # | Severity | Category | Location | Description | Recommendation |
|---|----------|----------|----------|-------------|----------------|
| 1 | MEDIUM | 仕様曖昧 | 要件2 | 承認ラベルのデフォルト値が未定義。「デフォルトを定める」と明記しているが具体値がない。デフォルト値はユーザーが GitHub で既に運用中のラベルと一致する必要があるため、候補を明示しておくと設計の迷いが減る。 | design step で `specrunner-approved` 等を決定し spec.md に記載する。 |
| 2 | LOW | 仕様曖昧 | 要件3 | `/resume` コメント本文のパース規則が未定義。同行テキスト（`/resume <text>`）か改行後テキストかで挙動が変わる。 | design step で「`/resume` 以降の改行区切り全体を resumePrompt とする」等のパース規則を spec.md に明記する。 |
| 3 | LOW | 仕様曖昧 | 要件3 | 「bot 自身のコメントはマーカーで除外する」の判定方法が曖昧。HTML コメントマーカー（`<!-- specrunner:notification`）の有無で判定するのか、GitHub actor type（`Bot`）で判定するのかが不明。 | design step で issue-notifier.ts の marker 形式を基準とすることを spec.md に明記する。 |
