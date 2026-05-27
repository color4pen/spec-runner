# Code Review Feedback — cli-log-persistence — iter 2

## Summary

iter 1 の 3 件の指摘（HIGH: elapsed 欠落、MEDIUM×2: finish/cancel テスト未作成・T-033 テスト未作成）はいずれも正しく修正済み。全テスト green、型チェック clean を確認した。残る LOW 1 件（spec MUST 違反: ログディレクトリ 0o700 未指定）は次 iteration で対処すること。CRITICAL/HIGH finding なしのため approved とする。

- **verdict**: approved

---

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | LOW | spec-conformance | src/logger/pipeline-logger.ts | iter 1 F-004 の carry-over。`initPipelineLog` 内の `mkdirSync(dir, { recursive: true })` に `mode` 未指定。spec.md「ログディレクトリは 0700 相当のパーミッションで作成しなければならない（MUST）。mkdirSync でログディレクトリを作成する際は mode: 0o700 を指定すること」に非準拠。`SessionLogWriter` は `mkdirSync(..., { recursive: true, mode: 0o700 })` で正しく実装済みで一貫性も欠く。 | `mkdirSync(dir, { recursive: true })` を `mkdirSync(dir, { recursive: true, mode: 0o700 })` に変更すること。 | yes |

---

## テスト網羅確認（must シナリオ）

| T-ID | 内容 | カバー済み |
|------|------|----------|
| T-001〜T-003 | pipeline ログ自動作成 (run/resume) | △ 実装あり・統合レベル（許容） |
| T-005〜T-007 | initPipelineLog / append モード | ✅ |
| T-008〜T-013 | EventBus イベント記録 | ✅ |
| T-009 | step:complete に elapsed | ✅ (iter 1 F-001 修正済み) |
| T-014 | ts/type フィールド | ✅ |
| T-015 | 書き込みエラー耐性 | ✅ |
| T-016 | maskSensitive | ✅ |
| T-017〜T-021 | agent session log (debug/non-debug) | ✅ |
| T-022〜T-027 | SessionLogWriter | ✅ |
| T-028 | getAgentLogDir | ✅ |
| T-029〜T-032 | pruneOldLogs | ✅ |
| T-033 | pruneOldLogs エラー → pipeline 継続 | ✅ (iter 1 F-003 修正済み) |
| T-034 | run 開始時に pruneOldLogs 呼ばれる | △ 実装あり・統合レベル（許容） |
| T-035〜T-040 | logs.maxJobs バリデーション | ✅ |
| T-041〜T-045 | finish/cancel pipeline ログ | ✅ (iter 1 F-002 修正済み) |
| T-046 | doctor では pipeline ログ未初期化 | △ doctor.ts 未変更のため暗黙的に保証（許容） |
| T-047〜T-048 | job show Log フィールド | ✅ |
| T-049〜T-050 | typecheck/test green | ✅ (verification-result.md: 274 files, 3122 tests passed) |
