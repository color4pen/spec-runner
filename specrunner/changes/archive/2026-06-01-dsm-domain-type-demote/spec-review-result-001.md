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
| 1 | HIGH | correctness | tasks.md / T-05 | `kernel/report-result.ts` は `BaseReportResult` しか export しない。`core/step/types.ts` は `ReportToolSpec` も `../port/report-result.js` から import しており（line 9）、`AgentStep.reportTool?: ReportToolSpec<BaseReportResult>`（line 175）で使用している。T-05 の path 置換指示 `../port/report-result.js` → `./report-result.js` を実装者がそのまま適用すると `kernel/step-types.ts` のコンパイルが失敗する。 | `kernel/report-result.ts`（または新規 `kernel/report-tool-spec.ts`）に `ReportToolSpec` 定義（および依存する `ZodRawShape` import）を追加し、T-05 に「`ReportToolSpec` を kernel/report-result.ts に追加するか kernel 内別ファイルに切り出す」サブタスクを明記する。 |
| 2 | MEDIUM | architecture | tasks.md / T-06 | `StepContext.githubClient?: GitHubClient` の `GitHubClient` import（`core/port/github-client.ts`）について、kernel→port は §3 で非 legal。T-06 は実装者に (a)/(b)/(c) の判断を委ねているが、いずれを選ぶかで新 §3 違反発生・型安全性劣化・追加作業が変わる。`GitHubClient` を kernel へ移動する (a) が最適だが、そのためのサブタスク（`kernel/github-client.ts` 作成、`core/port/github-client.ts` の re-export barrel 化）が tasks.md に存在しない。 | T-06 に option (a) を確定選択として明記し、サブタスク「`GitHubClient` interface を `kernel/github-client.ts` に移動し `core/port/github-client.ts` を re-export barrel に書き換える」を追加する。`GitHubClient` は外部依存ゼロの純 interface なので移動コストは最小。 |
