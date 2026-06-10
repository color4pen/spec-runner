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
| 1 | MEDIUM | Security | tasks.md T-04/T-05 | issue 本文（外部入力）から抽出した `slug` を `specrunner/drafts/<slug>/request.md` のパス構成要素として使う際の path traversal 検証が spec に明示されていない。通常の `specrunner run` は開発者が書いたローカルファイルを使うが、inbox run は issue 本文という外部入力から slug を取得するため信頼レベルが異なる。`parseRequestMdContent` の slug バリデーションに暗黙依存している。 | T-04 `planStarts` の受け入れ基準に「slug は `parseRequestMdContent` のバリデーションを通過した安全な文字列（path traversal 不可）であることを前提とする」旨を追記する。実装時は既存パーサの slug バリデーション規則が `..` や `/` を排除することを確認する。 |
| 2 | LOW | Spec Coverage | spec.md | escalation マーカーが存在しない job（issue-notifier の best-effort 通知失敗ケース）は resume しないという「安全側」挙動のシナリオが spec.md にない。design.md D4 には記述がある。 | spec.md の "再開は escalation マーカーの時刻と権限とマーカーで発火を絞る" 要件に「紐付け issue に escalation マーカーコメントが存在しない job は再開されない」シナリオを追加する。 |
| 3 | LOW | Spec Coverage | spec.md | 複数の qualifying `/resume` コメントが存在する場合に「最新が採用される」という挙動が spec.md のシナリオにない（tasks.md T-04 には記述あり）。 | spec.md に "qualifying /resume が複数あるとき最新の createdAt を持つコメントが採用される" シナリオを追加する。 |
| 4 | LOW | Spec Coverage | spec.md | `maxStartsPerRun` の起動上限において reject（差し戻し）件数が上限にカウントされないことが spec.md に明示されていない（tasks.md T-04 には記述あり）。 | spec.md の起動上限要件のシナリオに「不正 issue 本文の差し戻しは起動上限にカウントされない」旨を追記する。 |
