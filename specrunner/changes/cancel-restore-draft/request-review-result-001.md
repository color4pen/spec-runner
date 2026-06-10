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
| 1 | MEDIUM | Scope ambiguity | request.md § 要件 1 | `--restore-draft` と `--all-terminated` を組み合わせた場合の挙動が未定義。`--purge` + `--all-terminated` は既にエラーで弾く precedent がある（`src/cli/cancel.ts` L44）。 | 実装時に `--purge` と同様に排他エラーとするか、無視するかを判断する（どちらも合理的）。acceptances は single-job のみ対象のため blocking ではない。 |
| 2 | LOW | Clarity | request.md § 受け入れ基準 1 | "validate が通る" の validate が暗黙（`specrunner request validate <slug>`）。コード上はコマンドが存在することを確認済み。 | 明示しなくても実装上問題なし。 |
| 3 | LOW | Clarity | request.md § 要件 1 | worktree が既に削除済み（手動削除・no-worktree モード等）で source の request.md が存在しない場合の挙動が未記述。 | 既存の best-effort + warning パターンに倣い warn + skip で対応可能。実装判断で解決できる範囲。 |
