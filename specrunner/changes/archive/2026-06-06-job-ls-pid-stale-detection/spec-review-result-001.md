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
| 1 | MEDIUM | Spec Inconsistency | spec.md, design.md / tasks.md | `isStaleRunning` の優先度 2（sidecar path が渡されてファイルが存在しない場合）は即 `true` を返す。design D3 は常に `sidecarPath` を渡すため、「pid なし・sidecar ファイル不在・更新 15 分以内」のケースは優先度 3（15 分 fallback）に到達せず、即 stale 扱いになる。spec.md シナリオ「pid / sidecar なし・15 分以内 → not stale」および tasks.md T-02 のテストケース「pid / sidecar なし・直近 → stale なし」はこの前提で作成されており、設計通りに実装すると期待通りに通らない。 | spec.md と tasks.md のシナリオを `isStaleRunning` の実際の挙動に合わせて修正する。「sidecar ファイルが存在しない場合は即 stale」が意図した動作であれば、該当シナリオを削除 or「sidecar 不在 → 即 stale」と書き直す。15 分 fallback を保持したい場合は design.md に「state.pid なし・sidecar ファイル不在の場合は sidecarPath を渡さない」という条件分岐を追記し、T-02 テストの前提条件と合わせる。 |
