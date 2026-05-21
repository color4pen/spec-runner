# Test Cases: finish-hint-actionable-fallback

## TC-01: failed ジョブの hint に specrunner rm が案内される

- **Category**: Unit / hint message
- **Priority**: must
- **Source**: 受け入れ基準 1, Task 1

**GIVEN** `STATUS_HINTS["failed"]` が書き換え済みの状態で  
**WHEN** `assertJobFinishable` を `status === "failed"` のジョブに対して呼び出すと  
**THEN** スローされた `SpecRunnerError` の `hint` が `"Run 'specrunner rm <jobId>' to remove the failed job."` である

---

## TC-02: terminated ジョブの hint に specrunner rm が案内される

- **Category**: Unit / hint message
- **Priority**: must
- **Source**: 受け入れ基準 1, Task 1

**GIVEN** `STATUS_HINTS["terminated"]` が書き換え済みの状態で  
**WHEN** `assertJobFinishable` を `status === "terminated"` のジョブに対して呼び出すと  
**THEN** スローされた `SpecRunnerError` の `hint` が `"Run 'specrunner rm <jobId>' to remove the terminated job."` である

---

## TC-03: failed ジョブの hint に specrunner cancel が含まれない

- **Category**: Unit / hint message
- **Priority**: must
- **Source**: 背景（dead-end 解消）, Task 1

**GIVEN** `STATUS_HINTS["failed"]` が書き換え済みの状態で  
**WHEN** `assertJobFinishable` を `status === "failed"` のジョブに対して呼び出すと  
**THEN** スローされた `SpecRunnerError` の `hint` に `"specrunner cancel"` が含まれない

---

## TC-04: terminated ジョブの hint に specrunner cancel が含まれない

- **Category**: Unit / hint message
- **Priority**: must
- **Source**: 背景（dead-end 解消）, Task 1

**GIVEN** `STATUS_HINTS["terminated"]` が書き換え済みの状態で  
**WHEN** `assertJobFinishable` を `status === "terminated"` のジョブに対して呼び出すと  
**THEN** スローされた `SpecRunnerError` の `hint` に `"specrunner cancel"` が含まれない

---

## TC-05: pollTimeoutError の hint に specrunner rm が案内される

- **Category**: Unit / hint message
- **Priority**: must
- **Source**: 受け入れ基準 2, Task 2

**GIVEN** `src/errors.ts` の `pollTimeoutError` が書き換え済みの状態で  
**WHEN** `pollTimeoutError("session-123", 60000)` を呼び出すと  
**THEN** 返された `SpecRunnerError` の `hint` が `"Session may still be running on Anthropic side. Use 'specrunner resume' to retry or 'specrunner rm <jobId>' to abort."` である

---

## TC-06: pollTimeoutError の hint に specrunner cancel が含まれない

- **Category**: Unit / hint message
- **Priority**: must
- **Source**: 背景（dead-end 解消）, Task 2

**GIVEN** `src/errors.ts` の `pollTimeoutError` が書き換え済みの状態で  
**WHEN** `pollTimeoutError("session-abc", 30000)` を呼び出すと  
**THEN** 返された `SpecRunnerError` の `hint` に `"specrunner cancel"` が含まれない

---

## TC-07: STATUS_HINTS の全エントリが COMMANDS registry に存在するコマンドのみ参照する

- **Category**: Unit / hint-command-existence
- **Priority**: must
- **Source**: 受け入れ基準 3, Task 3

**GIVEN** `STATUS_HINTS` の全エントリと `COMMANDS` registry が import 済みの状態で  
**WHEN** 各 hint 文字列に `/specrunner (\w+)/g` を適用して verb を抽出すると  
**THEN** 抽出された全 verb が `Object.keys(COMMANDS)` に含まれる

---

## TC-08: pollTimeoutError の hint が COMMANDS registry に存在するコマンドのみ参照する

- **Category**: Unit / hint-command-existence
- **Priority**: must
- **Source**: 受け入れ基準 3, Task 3

**GIVEN** `pollTimeoutError` の返り値と `COMMANDS` registry が import 済みの状態で  
**WHEN** hint 文字列に `/specrunner (\w+)/g` を適用して verb を抽出すると  
**THEN** 抽出された全 verb (`resume`, `rm`) が `Object.keys(COMMANDS)` に含まれる

---

## TC-09: running ジョブの hint は変更されていない

- **Category**: Unit / non-regression
- **Priority**: should
- **Source**: スコープ外（running の hint は修正不要）, Task 1

**GIVEN** `STATUS_HINTS["running"]` が変更されていない状態で  
**WHEN** `assertJobFinishable` を `status === "running"` のジョブに対して呼び出すと  
**THEN** スローされた `SpecRunnerError` の `hint` が `"Wait for the running job to complete before finishing."` である

---

## TC-10: awaiting-resume ジョブの hint は変更されていない

- **Category**: Unit / non-regression
- **Priority**: should
- **Source**: スコープ外（awaiting-resume の hint は修正不要）, Task 1

**GIVEN** `STATUS_HINTS["awaiting-resume"]` が変更されていない状態で  
**WHEN** `assertJobFinishable` を `status === "awaiting-resume"` のジョブに対して呼び出すと  
**THEN** スローされた `SpecRunnerError` の `hint` が `"Run 'specrunner resume' to continue the halted job before finishing."` である

---

## TC-11: typecheck と全テストが green

- **Category**: Build / integration
- **Priority**: must
- **Source**: 受け入れ基準 5, Task 4

**GIVEN** Task 1〜3 の変更が全て適用された状態で  
**WHEN** `bun run typecheck && bun run test` を実行すると  
**THEN** 型エラーがなく全テストが pass する

---

## TC-12: STATUS_HINTS が export されている

- **Category**: Unit / export
- **Priority**: must
- **Source**: Task 3（テスト用 export 追加）

**GIVEN** `src/core/finish/job-state-update.ts` の `STATUS_HINTS` が `export const` に変更されている状態で  
**WHEN** `import { STATUS_HINTS } from "../../src/core/finish/job-state-update.js"` を実行すると  
**THEN** `STATUS_HINTS` が `Record<string, string>` として import でき、`"failed"` / `"terminated"` / `"running"` 等のキーを持つ

---

## TC-13: hint-command-existence テストファイルが独立して存在する

- **Category**: Structure / test organization
- **Priority**: should
- **Source**: design.md D2（横断検証として独立）

**GIVEN** 実装が完了した状態で  
**WHEN** `tests/hint-command-existence.test.ts` を確認すると  
**THEN** ファイルが存在し、`STATUS_HINTS` と `pollTimeoutError` の両方を対象とする `describe` ブロックが含まれる

---

## TC-14: 未知ステータスのジョブは fallback hint を返す

- **Category**: Unit / edge case
- **Priority**: could
- **Source**: `job-state-update.ts:30` の fallback logic

**GIVEN** `STATUS_HINTS` に登録されていないステータス（例: `"unknown-status"`）を持つジョブで  
**WHEN** `assertJobFinishable` を呼び出すと  
**THEN** `hint` が `"Cannot finish job in status 'unknown-status'."` となる `SpecRunnerError` がスローされる
