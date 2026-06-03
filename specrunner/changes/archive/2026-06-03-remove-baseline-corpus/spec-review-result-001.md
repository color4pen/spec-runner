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
- Approval is blocked when CRITICAL ≥ 1 OR HIGH ≥ 1.
-->

- **verdict**: needs-fix

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | tasks-completeness | `tasks.md` T-07 | `tests/unit/prompts/design-system.test.ts` が T-07 に未列挙。このファイルは `DynamicContext` リテラルに `specIndex: []` を 2 箇所含む（line 128, 148）。`specIndex` フィールドを interface から削除すると TypeScript がエラーを出し `bun run typecheck` が失敗する。受け入れ基準「typecheck green」をブロックする。 | T-07 に `tests/unit/prompts/design-system.test.ts` を追加し、DynamicContext リテラルから `specIndex` フィールドを削除する旨を記載する。 |
| 2 | MEDIUM | tasks-completeness | `tasks.md` T-07 | `tests/pipeline-integration.test.ts` の TC-AUTH-INT-01・TC-AUTH-INT-02（line 1640–1753）が T-07 に未列挙。これらは `findAuthoritySpecViolations` の warning 動作を検証するテストで、ガード削除後も偶然 pass するが `specrunner/specs/` パスを参照する dead test として残る。 | TC-AUTH-INT-01・TC-AUTH-INT-02 のスイートを T-07 の削除対象に追加する（または削除理由を明示する）。 |
