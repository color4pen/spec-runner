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
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: needs-fix
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | high | testing | `src/core/lifecycle/__tests__/exit-guard.test.ts` | TC-006（per-job 経路の resumePoint 書き込み）テストが欠落。受け入れ基準は「exit-guard の 3 経路それぞれで resumePoint をテストで固定する」と明示しており、`test-cases.md` でも must 優先度。no-worktree と global scan は追加テストでカバーされているが、`handlePerJobExit` 経路のみ未検証のまま。 | `tempDir` に `.git/specrunner-worktrees/<name>-<jobId8>/specrunner/changes/<slug>/state.json`（step: "implementer" 等）と `events.jsonl` を作成し、`createExitGuardHandler(tempDir, jobId)` を呼んで遷移後 state の `resumePoint.step` / `resumePoint.reason` を検証するテストを追加する。 | yes |
| 2 | low | maintainability | `src/cli/job-show.ts` | `"../errors.js"` が 2 回 import されている（新規追加の `worktreeGuardError` と既存の `SpecRunnerError, ERROR_CODES` が別行）。 | 2 つの import を 1 行に統合する: `import { SpecRunnerError, ERROR_CODES, worktreeGuardError } from "../errors.js";` | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 6 | 0.10 |

- **total**: 9.0

## Summary

3 件の不具合修正（fixer prompt 更新 / exit-guard resumePoint / view コマンド worktree guard）はいずれも実装コードが正しい。

- **build-fixer prompt**: 旧 TC-ID 手順を削除し lcov 変更行 gate 手順に置換。gate 回避禁止規律（テスト削除・dead code 追加・coverage 設定編集の禁止、正当解消不能なら失敗のまま終える）を `## 禁止事項` に追記。テストは `tests/prompts/build-fixer-system.test.ts` と `src/prompts/__tests__/coverage-gate-prohibition.test.ts` の両方でカバーされており堅牢。
- **code-fixer prompt**: 同一の gate 回避禁止規律を 1 行追加。テスト済み。
- **exit-guard resumePoint**: 3 経路すべてに `state.step` truthy 条件付きの `patch: { resumePoint: { step, reason: "signal", iterationsExhausted: 0 } }` を追加。実装は正しいが、per-job 経路のテスト（TC-006）が欠落している（HIGH 所見 #1）。
- **view コマンド worktree guard**: `runPs` / `runJobStats` / `runJobShow` に `detectSpecrunnerWorktree` チェックを `JobStateStore.list` 呼び出し前に挿入。`job resume` の既存ガード機構を流用しており一貫性がある。テストも網羅的。

修正が必要なのは TC-006 の per-job テスト追加（#1、受け入れ基準の充足のため必須）と `job-show.ts` の重複 import 統合（#2、軽微）の 2 件。
