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
| 1 | MEDIUM | spec-erosion | `specs/credential-store/spec.md` | "callsite は process.env を直読しない" の delta body は GH_TOKEN/GITHUB_TOKEN の制約のみを記述し、baseline にある SPECRUNNER_API_KEY の直読制限と Scenario "env 直読の排除" を含まない。`classifyDeltaSpec` が MODIFIED に分類して baseline 全体を置換するため、`specrunner finish` 後に SPECRUNNER_API_KEY 制約が authority spec から消える。 | delta spec の該当 Requirement body に SPECRUNNER_API_KEY の制約文と既存 Scenario を残し、GH_TOKEN/GITHUB_TOKEN 制約を追記する形で書き直す。 |
| 2 | MEDIUM | spec-erosion | `specs/credential-store/spec.md` | "DoctorContext は pre-resolved credential を注入する" の delta body が baseline の "Doctor check は MUST `ctx.env["SPECRUNNER_API_KEY"]` を直読せず" 一文と 2 つの Anthropic Scenario を含まない。merge 後これらが authority spec から失われる。 | delta spec の該当 Requirement body に baseline の既存制約文と 2 つの Anthropic Scenario を保持したうえで `githubTokenSource` の追加内容を記述する。 |

## Review Summary

spec-review-001 の 3 件（HIGH: Runtime credential matrix の envVar 更新エントリ欠落、MEDIUM: Requirement ヘッダーのリネーム未宣言、LOW: B-7 マスク確認タスク欠落）はすべて修正済み。

セキュリティ観点：`GH_TOKEN` の `SECRET_DENYLIST` 追加（B-6 封じ込め）、token 出力の B-7 seam 経由制約、`gh auth token` subprocess への timeout 指定・ENOENT フォールスルーはいずれも正しく仕様化されている。`gh auth token` コマンドへのユーザー入力は介在せず、コマンドインジェクションリスクなし。OWASP Top 10 該当なし。

残る 2 件は MEDIUM（spec erosion）のみで、実装の正確性・動作には影響しない。
