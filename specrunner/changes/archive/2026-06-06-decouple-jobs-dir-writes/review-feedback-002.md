# Code Review Feedback — iteration 002

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended. The verdict line is the authoritative decision.
-->

- **verdict**: approved
- **iteration**: 002

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | LOW | testing | tests/ | "should" priority TCs（TC-022 kind=local worktree消失→changeDir次点、TC-023 両方消失→null、TC-025 sidecarなし→jobId安全網、TC-026 WORKSPACE_SETUP_FAILED skip、TC-027 cancel後resolveId、TC-028 persistJobState workspace優先）が未実装。いずれも非ブロッキング。 | 優先度 should のため本イテレーションでは不要。次 request（retire-jobs-dir 等）での追加を推奨。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 8.9

## Summary

iteration 001 の HIGH 指摘 4 件（TC-021/TC-024 missing、TC-006/TC-007/TC-011 resume/exit-guard integration missing、TC-019 sidecar pid refresh missing、TC-020 machine-local fields missing）はすべて解消済み。

- `tests/unit/core/job-access/resolve-state-store.test.ts` を新設し TC-021（kind=local+worktree実在→worktree slug store）と TC-024（kind=managed→jobId store）を 3 ケースでカバー。
- `tests/local-no-jobs-dir-writes.test.ts` に TC-NJW-004（resume path jobs-dir 不在）と TC-NJW-005（exit-guard global scan jobs-dir 不在 + awaiting-resume 遷移）を追加。
- `tests/unit/core/runtime/local.test.ts` に TC-019（resume-reuse で liveness.json pid 更新確認）と TC-020（slug state.json に machine-local フィールド不在確認）を追加。

`bun run typecheck && bun run test`（3329/3329）green を本レビュー内で確認済み。実装（W1–W6 経路の移行、D1–D7 すべて）は設計に忠実で欠陥なし。残存 should TC は非ブロッキングのため後続 request で対応を推奨する。
