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

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | Spec Consistency | design.md | D1 の Risks/Mitigation セクションが T-01 と矛盾している。D1 本文は「DIRTY と同様に BLOCKED / UNSTABLE を即座に return」と定め、T-01 も「DIRTY と同じパターン」と指示しているが、D1 Risks の Mitigation には「既存 retry ロジック（5 回 × 3 秒）で一時的な BLOCKED は解消される。retry exhaustion 後に BLOCKED が残っている場合に escalation する」と書かれており、実装者が Risks セクションを優先すると BLOCKED を retry してから escalation する誤実装になる。 | D1 Risks/Mitigation の記述を「BLOCKED / UNSTABLE は DIRTY 同様に即時 return する（retry しない）。一時的 BLOCKED による false positive は許容し、ユーザーが再実行する設計とする」に修正する。 |
| 2 | LOW | Spec Consistency | tasks.md | T-06 bullet 5 に「commit は best-effort で、失敗しても `markJobArchived` に進む」とあるが、T-06 acceptance criteria の「PR already merged + archive 失敗 → escalation」が何を "archive 失敗" と定義するか曖昧で、実装者が commit 失敗もエスカレーション対象と誤解するリスクがある。 | T-06 acceptance criteria の「archive 失敗」を「`archiveChangeFolder` が `ok: false` を返した場合」と明記する。 |
| 3 | LOW | Completeness | tasks.md | T-04 の acceptance criteria は「"admin bypass" "admin token bypasses" を含むコメント」を削除対象とするが、`src/adapter/github/github-client.ts` L404 の `"Check admin token or repository merge policy."` というエラーメッセージ（"admin token" を含む）が対象外になっている。spec.md の Scenario は「"admin bypass" "admin token" を意図する」全般を対象としており粒度が異なる。 | T-04 の acceptance criteria に L404 エラーメッセージの更新（"Check token permissions or repository merge policy." 等への変更）を追加するか、T-04 の grep 対象に `"admin token"` を含める。 |
