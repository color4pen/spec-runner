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
| 1 | HIGH | Missing artifact | design.md | design.md がテンプレートの空骨格のまま。Context / Goals / Decisions / Risks の全セクションが未記入。要件 2 の「再試行の配置（adapter 内 query 再試行 vs executor による step 再実行）」、要件 7 の「session 継続 / step 先頭再実行の再入セマンティクス」、transient ホワイトリストの定義がいずれも未記載であり、implementer が実装に進めない。 | design agent を再実行して全セクションを埋める。特に D1: retry 配置（adapter vs executor）、D2: transient whitelist の判定ロジック、D3: 再入セマンティクスと途中成果の扱いを必須とする。 |
| 2 | HIGH | Missing artifact | tasks.md | tasks.md がテンプレート（T-01 が空）のまま。実装者が何を実装すべきか一切記述されていない。 | design.md の決定事項を受けて実装タスクを列挙する（例: transient classifier 実装、retry ループの組み込み、StepRun スキーマ拡張、config 追加、テスト作成）。 |
| 3 | HIGH | Missing artifact | spec.md | spec.md の Requirements セクションが空。request.md の受け入れ基準（6 項目）に対応する Requirement + Scenario が一つも書かれていない。spec なしでは test-case-gen が機能しない。 | 受け入れ基準の各項目を Requirement: / Scenario: (Given/When/Then) 形式で記述する。少なくとも「transient 1 回挟んで成功」「3 回で halt」「非 transient は即 halt」「試行回数の記録」「上限 0 で現行挙動一致」の 5 シナリオを含める。 |
