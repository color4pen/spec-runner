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
| 1 | MEDIUM | Implementation guidance | tasks.md | T-01 Section 3 の sourceChangeDir 第一式が誤り。`slugStateJsonPath(slug)` は `specrunner/changes/<slug>/state.json` を返すため、`path.join(worktreePath, slugStateJsonPath(slug), "..", "..")` は `<worktreePath>/specrunner/changes`（1 段多く上がる）になる。正しい結果は `<worktreePath>/specrunner/changes/<slug>`（1 段だけ上がる）。design.md D2 原則（「managed marker を除く全 section: `path.dirname(stateJsonPath)`」）と矛盾する。代替形（「または直接 `path.join(sidecarEntry.worktreePath, "specrunner", "changes", sidecarEntry.slug)`」）は正しいが、誤った第一形が先頭に置かれており実装者が誤った式を採用するリスクがある。誤った式を用いた場合、sidecar 経由 state の cost が null になるが、現状コードでも同 state の cost は null であり regression は発生しない。T-04 が Section 3 をカバーしないため自動検出されない。 | 誤った第一式（`"..", ".."` 形）を削除し、正しい `path.dirname(sidecarStateJsonPath)` または既存の代替形のみを残す。 |
| 2 | LOW | Test coverage | tasks.md | T-04 store 単体テストが Section 1（active）と Section 1b（archive）のみ検証し、Section 2（worktree）・Section 3（sidecar supplement）・Section 4（managed marker）の `sourceChangeDir` 精度をカバーしない。F-01 のリスクと合わせ、Section 3 のカバレッジがあればより安全。 | T-04 に worktree（Section 2）の sourceChangeDir テストケースを追加することを検討する。Section 3 は acceptance criteria の対象外のため必須ではないが、追加しておくと tasks.md の誤り検出の安全網になる。 |

## Summary

request.md・design.md・spec.md は整合しており、根本原因の分析・解決方針・受け入れ基準はいずれも明確。spec.md の 3 要件（per-jobId usage 解決・legacy 混入防止・null 行 drop なし）は design および tasks で適切にトレースされている。

tasks.md には Section 3 の sourceChangeDir 計算式に誤りがある（F-01）が、当該箇所は今回修正対象の同一 base-slug 誤配バグ（Section 1/1b パス）の外側にある sidecar 補完パスであり、誤った式を採用しても受け入れ基準が要求する active/archive ペアの挙動は損なわれない。正しい代替形も tasks.md に明記されているため、実装者が正しい形を選べば問題は生じない。セキュリティ上の懸念（パストラバーサル・認証・OWASP）は本変更では発生しない（read-only レポート、user input を sourceChangeDir に含まない構造）。
