# Code Review Feedback — cli-log-persistence — iter 1

## Summary

実装の骨格は正しく、EventBus subscriber パターン・SessionLogWriter・pruneOldLogs・module-level state for finish/cancel いずれも設計通りに実装されている。`maskSensitive()` の適用も両クラスで確認済み。`elapsed` フィールドの欠落というスペック非準拠（HIGH）が 1 件あるため needs-fix とする。

- **verdict**: needs-fix

---

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | HIGH | spec-conformance | src/logger/pipeline-logger.ts | `step:complete` ログエントリに `elapsed` フィールドが欠落。test-cases.md T-009 (must) の THEN 条件「step 名、verdict、elapsed を含む JSONL 行」および spec.md「記録対象イベント: step 開始/完了/エラー（step 名、elapsed）」に非準拠。`lastRun` には `completedAt`/`startedAt` が含まれるため計算可能。 | `step:complete` ハンドラに `elapsed: lastRun?.completedAt && lastRun?.startedAt ? new Date(lastRun.completedAt).getTime() - new Date(lastRun.startedAt).getTime() : null` を追加。`pipeline-logger.test.ts` の T-009 テストにも `elapsed` フィールドのアサーションを追加すること。 | yes |
| 2 | MEDIUM | test-coverage | (tests/unit/cli/finish.test.ts — 未作成) | finish/cancel の pipeline ログ初期化に対するユニットテストが存在しない。tasks.md task 4.4 は `[x]` 済みとされているが diff に対応テストファイルが含まれていない。T-041/T-042/T-043/T-044/T-045（全 must）が未カバー。 | `finish.ts`・`cancel.ts` 向けのテストファイルを追加し、`initPipelineLog`・`logPipelineEvent` をモックして開始/完了/エラーイベントが記録されること、`--all-terminated` パスでは個別初期化されないことを検証すること。 | yes |
| 3 | MEDIUM | test-coverage | (src/core/command/runner.test.ts — 未作成) | T-033 (must)「pruneOldLogs 内で例外が発生しても pipeline 実行は継続される」に対応するユニットテストが差分に含まれていない。`CommandRunner.execute()` の catch ブロックは実装済みだがテスト未作成。 | `pruneOldLogs` をモックして例外をスローさせ、`logWarn` が呼ばれかつ pipeline が abort されないことをアサートするテストケースを追加すること。 | yes |
| 4 | LOW | security | src/logger/pipeline-logger.ts | `initPipelineLog` が `.specrunner/logs/` ディレクトリを `mode` 未指定で作成している。spec.md「ログディレクトリは 0700 相当のパーミッションで作成しなければならない（MUST）」に厳密には非準拠。`SessionLogWriter` は `<jobId>/` を `0o700` で作成しているが、親 `logs/` ディレクトリは未設定。 | `mkdirSync(dir, { recursive: true })` を `mkdirSync(dir, { recursive: true, mode: 0o700 })` に変更すること。 | yes |
| 5 | LOW | test-coverage | src/logger/__tests__/pipeline-logger.test.ts | T-015 テスト（must）が「close 後の write が no-op」を検証しているが、実際の `writeSync` 例外をスローした場合の recovery パス（`catch` 内で fd を閉じ `this.fd = null` にする分岐）は未検証。動作上の問題はないがテスト意図と実装が乖離している。 | `writeSync` を `vi.spyOn` でモックして例外をスローさせ、`this.fd` が null になり以降の write が no-op になることを検証するテストを追加することを検討すること。 | no |

---

## テスト網羅確認（must シナリオ）

| T-ID | 内容 | カバー済み |
|------|------|----------|
| T-001〜T-003 | pipeline ログ自動作成 (run/resume) | △ 実装あり・統合レベル |
| T-005〜T-007 | initPipelineLog / append モード | ✅ |
| T-008〜T-013 | EventBus イベント記録 | ✅ |
| T-009 | step:complete に elapsed | ❌ (F-001) |
| T-014 | ts/type フィールド | ✅ |
| T-015 | 書き込みエラー耐性 | △ (F-005) |
| T-016 | maskSensitive | ✅ |
| T-017〜T-021 | agent session log (debug/non-debug) | ✅ |
| T-022〜T-027 | SessionLogWriter | ✅ |
| T-028 | getAgentLogDir | ✅ |
| T-029〜T-032 | pruneOldLogs | ✅ |
| T-033 | pruneOldLogs エラー継続 | ❌ (F-003) |
| T-034 | run 開始時に pruneOldLogs 呼ばれる | △ 実装あり・統合レベル |
| T-035〜T-040 | logs.maxJobs バリデーション | ✅ |
| T-041〜T-045 | finish/cancel pipeline ログ | ❌ (F-002) |
| T-047〜T-048 | job show Log フィールド | ✅ |
| T-049〜T-050 | typecheck/test green | ✅ (verification-result) |
