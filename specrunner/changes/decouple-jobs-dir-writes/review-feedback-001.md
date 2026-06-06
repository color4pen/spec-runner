# Code Review Feedback — iteration 001

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

- **verdict**: needs-fix
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | HIGH | testing | tests/ | `resolveStateStoreByJobId` のユニットテストが存在しない（TC-021 must・TC-024 must 未達）。`tests/load-by-job-id.test.ts` の同番号テストは読み取り版 `loadStateByJobId` のものであり別物。resume / cancel / exit-guard の核心ルーティング helper が無検証。 | `resolveStateStoreByJobId` 専用テストファイルを新設し、sidecar kind=local+worktree 実在 → worktree slug store 返却（TC-021）、sidecar kind=managed → jobId store 返却（TC-024）を最小限カバーする。 | yes |
| 2 | HIGH | testing | tests/local-no-jobs-dir-writes.test.ts | resume / exit-guard の jobs-dir ゼロ書き込みを確認する integration test がない（TC-006 must・TC-007 must・TC-011 resume ケース must 未達）。受け入れ基準「integration test で `.specrunner/jobs/` への書き込みが無いことをアサート」の一部が未達。 | 同ファイルに resume ケース（sidecar+slug 事前作成 → jobs-dir 不在アサート）と exit-guard ケース（`handleGlobalExit` 直呼び → jobs-dir 不在アサート）を追加する。 | yes |
| 3 | HIGH | testing | tests/unit/core/runtime/local.test.ts | resume-reuse 後の sidecar pid refresh がテスト未確認（TC-019 must 未達）。TC-LR-002 はワークスペース戻り値のみ検証し `liveness.json` の pid 更新を確認していない。`isStaleRunning` 誤判定防止が D3 の設計目的であり必須の確認。 | TC-LR-002 または新 describe に、worktree 再利用後に `.specrunner/local/<slug>/liveness.json` の `pid` が `process.pid` と一致することをアサートするケースを追加する。 | yes |
| 4 | HIGH | testing | tests/local-no-jobs-dir-writes.test.ts または tests/unit/core/runtime/local.test.ts | slug 正本（state.json）に machine-local フィールドが含まれないことがテスト未確認（TC-020 must 未達）。portable / machine-local の writer 単一化（D3）の核心保証が無検証。 | setupWorkspace run path 後の worktree 内 `state.json` を `JSON.parse` し、`worktreePath` / `pid` / `session` キーが存在しないことをアサートする。 | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 4 | 0.10 |

- **total**: 8.5

## Summary

実装（W1–W6 経路の移行、`bootstrapJob` / `persistJobState` port 追加、`resolveStateStoreByJobId` helper 新設）は設計 D1–D7 に忠実で、コード自体の欠陥は見当たらない。`bun run typecheck && bun run test` は全 3322 テスト green。

問題はテストカバレッジ。test-cases.md が must と定めた TC のうち 4 件（TC-019、TC-020、TC-021、TC-024）が未実装であり、TC-006、TC-007、TC-011 resume ケースの integration coverage も欠落している。`resolveStateStoreByJobId` は resume / cancel / exit-guard の核心 helper だが単体テストがゼロ。この状態では将来の変更でサイレントなリグレッションが起きうる。

修正範囲は小さい。既存の統合テストファイルへの追記と `resolveStateStoreByJobId` 専用ユニットテストの新設で対応できる。

