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

## Summary

3 つの disjoint な編集（journal 永続化 / adapter count-miss 修正 / code-review post-work 除去）からなる仕様。コード根拠を実際のファイルで照合し、設計判断・受け入れ基準・タスクの整合性を確認した。ブロッカーなし。

**コード照合結果**:

| 主張 | 照合結果 |
|------|---------|
| `StepAttemptRecord.outcome` に `addedTurns` なし（event-journal.ts:36-50） | ✓ |
| `stepRunToRecord` が `addedTurns` を書き出さない（:344-363） | ✓ |
| `fold` が `addedTurns` を復元しない（:274-293） | ✓ |
| post-work 失敗 early-return（:763-776）が `postWork++`（:779）より前に return | ✓ |
| agent redirect 超過 `:667-677` / main query 失敗 `:685-695` / timeout `:916-926` / error `:933-943` に `addedTurns` なし | ✓ |
| result file not found `:884-895` に `addedTurns` なし | ✓ |
| `CodeReviewStep.followUpPrompt` が lines 161-175 に存在 | ✓ |
| `specrunner/rules/code-review/` が存在しない（rules 由来 follow prompt なし） | ✓ |
| `ADDED_TURNS_ZERO` は `import type` でのみ参照（value import 追加が必要） | ✓ |
| `deriveJudgeVerdict` が構造化 findings → verdict を導出（judge-verdict.ts:32-40） | ✓ |

**不変条件の検証**:

`postWork++` 移動後も不変 `reportRetry + outputRepair === followUpAttempts` は保たれる。`postWork` は `followUpAttempts` の計算に含まれず（:721-744 の report_result retry loop と :805-858 の outputRepair loop のみが `followUpAttempts++` を行う）、postWorkPrompts loop からの early-return 時点では `outputRepair` はまだ加算されていない（outputVerification loop は :805 から開始）。✓

**セキュリティ観点**:

新規外部入力パスなし。`addedTurns` は内部カウンタ（整数）であり、ユーザー入力由来ではない。journal への書き込みは既存の `appendFile` 経路を通り、injection ベクターなし。post-work turn の削除は攻撃面を縮小する方向。OWASP Top 10 該当項目なし。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| None | | | | | |

## Observations

- **T-02 の import 記述について**: tasks.md は「現在は type のみ import」と書いているが、`ADDED_TURNS_ZERO` は実際には agent-runner.ts に import されていない（`import type { AgentRunner, ... }` に含まれていない）。意図する修正内容（value import を追加する）は変わらず、実装上の影響はない。
- **legacy-resume エッジ（code-fixer .md フォールバック）**: request.md および design.md で正確に分析されており、本変更がこのエッジを悪化させないことが確認できる。受け入れ基準の routing lock test がこの前提を lock する構成になっている。
