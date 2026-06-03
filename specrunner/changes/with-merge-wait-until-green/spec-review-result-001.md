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
| 1 | MEDIUM | Implementation Accuracy | tasks.md T-02 | combined status endpoint（`/status` singular）はページネーション非対応。`?per_page=100` パラメータは無視され、`Link` ヘッダは返らない。ページネーション対応が必要なら `/statuses`（plural）を使う必要がある。この記述に従うと実装者が「両 endpoint ともページネーション対応済み」と誤解し、singular endpoint の 100 件上限が黙示的に許容される。risk mitigation の説明（design.md D2 Risks）も同様に誤っている。 | T-02 の "GET .../status?per_page=100 … Link ヘッダがある場合は全ページ取得" を修正する。選択肢: (a) ページネーションが必要なら `/statuses`（plural）に切り替える。(b) singular `/status` のまま使うならページネーションの記述を削除し「最大 100 statuses を取得する（実用上十分）」と明記する。design.md の Risk 箇条書きも同様に修正する。 |
| 2 | LOW | UX Regression | design.md D3 / tasks.md T-04 | 現行コードは `mergeStateStatus === "BLOCKED"` を明示的に捕捉し "branch protection requirements not met" メッセージを出す。新設計はこのチェックを持たず、BLOCKED な PR は `mergePullRequest` の失敗（405）で終わる。機能的には正しく escalation するが、エラーメッセージの具体性が低下する。 | 必須修正ではない。T-04 の wait ループ内で `mergeStateStatus === "BLOCKED"` を明示的に escalation に加えることで UX を維持できる（conflict 検出と同じパターン）。 |
| 3 | LOW | Implementation Clarity | tasks.md T-04 | `headSha` が `undefined` の場合を "getPullRequest 失敗扱い" と表現しているが、`getPullRequest` は成功しており `headSha` フィールドが欠如しているケース（GitHub API の挙動変更等）。既存の `getPullRequest` 失敗 escalation パターンを流用するとメッセージが「getPullRequest failed」と誤報になる。 | T-04 に "headSha が欠如している場合は `unexpected: PR head SHA missing` 等の専用メッセージで escalation する" と明記する。 |

## Summary

spec.md / design.md / tasks.md は request.md の全要件（wait ループ・pending/failure 区別・config null=無制限・timeout escalation・client-closed 維持）を一貫して満たしている。設計判断（D1–D6）は rationale と alternatives が明記されており妥当。

MEDIUM 1 件（T-02 の status endpoint ページネーション記述誤り）は実装指示として誤りであり、実装者が誤った pagination コードを書く原因になる。修正してから実装に進むことを推奨する。
