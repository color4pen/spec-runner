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
| 1 | LOW | Security | tasks.md T-01 | `listLocalSidecars` が `.specrunner/local/` を readdir して取得した slug 名を `path.join` に渡す際、`../../` 形式のディレクトリ名によるパストラバーサルが理論上可能。ただし `.specrunner/local/` への書き込みには既にリポジトリ書き込み権限が必要なため、実効リスクは極低。 | T-01 の実装時に `slug.includes("/") \|\| slug.includes("..")` で skip するガードを 1 行追加すると防御的になる。 |
| 2 | LOW | Performance | design.md D3 / tasks.md T-03 | `resolveId` で `list()` を呼ぶと内部で `listLocalSidecars` が実行され、その直後に T-03 が `listLocalSidecars` を再度呼ぶため 2 重 readdir になる。正確性に影響しないが I/O が増える。 | `list()` の戻り値から jobId 集合を取り出し、sidecar jobId を union する際は `list()` 内の sidecar 走査結果を再利用できるよう、将来の cleanup 時に検討する（本変更のスコープ外として許容可）。 |

## Summary

request.md・design.md・spec.md・tasks.md の間で要件・設計判断・シナリオ・タスクが整合している。

**スコープ境界**は明確（managed は温存、dual-write は温存、load() fallback readFile は温存）で、段階的な移行として安全に実施できる中間状態になっている。

**D4 のカスケード解決**（sidecar → worktree slug dir → resolveCanonicalStateDir → fallback readFile）は正確で、active / archived / managed / sidecar 不在の全ケースを漏れなくカバーしている。T-04 のタスク記述と一致している。

**既存の seam 再利用**（`resolveCanonicalStateDir`、`changeDir` seam、`livenessJsonPath`）が適切で、新規 API surface が最小限に抑えられている。

**Risks セクション**で acknowledged された canceled local job の degraded 化と terminal managed job の `--all` 可視性変化は、いずれも要件 5 の「degrade 表示でよいが jobId を失わない」の範囲内、かつ T-07 のテスト更新で固定されるため許容できる。

HIGH / CRITICAL 相当の問題はなく、実装に進んでよい状態と判断する。
