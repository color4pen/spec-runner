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
| 1 | HIGH | completeness | tasks.md § T-02 / T-04 | design.md D2 は spec-review-001 の指摘を受けて **port interface 経由 DI 方式**（`RuntimePrereqChecker` / `RuntimeCredentialsResolver` を `core/port/runtime-prereqs.ts` に新設し、`runPreflight` に `deps` 引数を追加、`cli/run.ts` で具体実装を注入）に更新されているが、tasks.md T-02 は旧インライン方式（`checkRuntimePrereqs` / `resolveRuntimeCredentials` を `preflight.ts` に移設、`prereqs.ts` を削除）のままである。T-04 も "prereqs 関連の re-export を barrel から削除" および "prereqs.ts が存在しない（T-02 で削除済み）" という旧方式の記述を含む。このまま実装すると B-8 違反が発生し、受け入れ基準「B-1〜B-9 が無改変で green」を満たせない。 | T-02 を design.md D2 の新方式に全面書き換えする。具体的タスク: (1) `core/port/runtime-prereqs.ts` を新設し `RuntimePrereqChecker` / `RuntimeCredentialsResolver` interface と `RuntimeCredentials` 型を定義、(2) `runPreflight` のシグネチャに `deps: { prereqChecker: RuntimePrereqChecker; credentialsResolver: RuntimeCredentialsResolver }` を追加し `prereqs.js` の直接 import を削除、(3) `cli/run.ts` で具体実装（`checkRuntimePrereqs` / `resolveRuntimeCredentials`）を `deps` として渡す、(4) `core/runtime/prereqs.ts` は削除せず `RuntimeCredentials` 型を port ファイルから re-import に切り替え、(5) `core/port/index.ts` に新 port 型を re-export 追加。T-04 の "prereqs.ts が存在しない" と barrel からの prereqs re-export 削除の記述も削除・修正する。 |
