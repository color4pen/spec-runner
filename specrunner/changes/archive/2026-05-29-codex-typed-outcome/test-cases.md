# Test Cases: codex-typed-outcome

## Summary

- **Total**: 19 cases
- **Automated** (unit/integration): 18
- **Manual**: 1
- **Priority**: must: 14, should: 5, could: 0

---

### TC-001: CodexThread.run() が outputSchema option を受け付ける型定義になっている

**Category**: unit
**Priority**: must
**Source**: T-01

**GIVEN** `src/adapter/codex/agent-runner.ts` の `CodexThread` interface
**WHEN** `run()` の第 2 引数の型定義を確認する
**THEN** `outputSchema?: unknown` が含まれている
**AND** 既存の `signal?: AbortSignal` が保持されている

---

### TC-002: bun run typecheck が green

**Category**: manual
**Priority**: must
**Source**: T-01, T-02, T-03, T-07 AC

**GIVEN** 全実装後の状態
**WHEN** `bun run typecheck` を実行する
**THEN** 型エラーなしで exit code 0 で終了する

---

### TC-003: buildOutputSchema が producer 用 JSON Schema を返す

**Category**: unit
**Priority**: must
**Source**: T-02

**GIVEN** `PRODUCER_REPORT_TOOL`（`status` フィールドを持つ `ReportToolSpec`）
**WHEN** `buildOutputSchema(PRODUCER_REPORT_TOOL)` を呼ぶ
**THEN** `type: "object"` の JSON Schema オブジェクトが返る
**AND** `properties` に `ok`, `reason`, `status` が含まれる
**AND** `required` に `"ok"` が含まれる

---

### TC-004: buildOutputSchema が judge 用 JSON Schema を返す

**Category**: unit
**Priority**: should
**Source**: T-02, D2

**GIVEN** `JUDGE_REPORT_TOOL`（`approved` フィールドを持つ `ReportToolSpec`）
**WHEN** `buildOutputSchema(JUDGE_REPORT_TOOL)` を呼ぶ
**THEN** `properties` に `ok`, `reason`, `approved` が含まれる JSON Schema が返る

---

### TC-005: buildOutputSchema が code-review 用 JSON Schema を返す

**Category**: unit
**Priority**: should
**Source**: T-02, D2

**GIVEN** `CODE_REVIEW_REPORT_TOOL`（`fixableCount` フィールドを持つ `ReportToolSpec`）
**WHEN** `buildOutputSchema(CODE_REVIEW_REPORT_TOOL)` を呼ぶ
**THEN** `properties` に `ok`, `reason`, `approved`, `fixableCount` が含まれる JSON Schema が返る

---

### TC-006: reportTool set 時に thread.run() が outputSchema 付きで呼ばれる

**Category**: unit
**Priority**: must
**Source**: T-03, T-07

**GIVEN** `ctx.policy.reportTool` が設定されている `CodexAgentRunner`
**AND** mock thread が `finalResponse` に valid JSON を返す
**WHEN** `run()` を実行する
**THEN** main work turn の `thread.run()` 第 2 引数に `outputSchema` が含まれている

---

### TC-007: reportTool 未設定時は thread.run() に outputSchema が含まれない

**Category**: unit
**Priority**: must
**Source**: T-03, T-07 AC（backward compat）

**GIVEN** `ctx.policy.reportTool` が未設定（`undefined`）
**WHEN** `run()` を実行する
**THEN** `thread.run()` の第 2 引数に `outputSchema` が含まれない
**AND** `toolResult` が `null` で返る

---

### TC-008: finalResponse が valid JSON かつ parseInput 成功 → toolResult populated

**Category**: unit
**Priority**: must
**Source**: T-04, T-07

**GIVEN** `ctx.policy.reportTool` が設定されている
**AND** mock thread の `finalResponse` が `{ "ok": true, "status": "success" }` の JSON 文字列
**WHEN** `run()` を実行する
**THEN** 返り値の `toolResult` が `{ ok: true, status: "success" }` である
**AND** `followUpAttempts` が `0` である

---

### TC-009: finalResponse が invalid JSON → toolResult null（全 retry 枯渇）

**Category**: unit
**Priority**: must
**Source**: T-04, T-07

**GIVEN** `ctx.policy.reportTool` が設定されている
**AND** main turn および全 retry ターンの `finalResponse` が不正な JSON 文字列
**WHEN** `run()` を実行する
**THEN** `toolResult` が `null` である
**AND** `followUpAttempts` が `maxAttempts` に等しい

---

### TC-010: finalResponse が schema 不一致（parseInput 失敗）→ retry へ

**Category**: unit
**Priority**: should
**Source**: T-04, D3

**GIVEN** `ctx.policy.reportTool` が設定されている
**AND** `finalResponse` が valid JSON だが必須フィールド `ok` が欠如している
**WHEN** `run()` を実行する
**THEN** `capturedToolResult` は `null` のまま follow-up retry に進む

---

### TC-011: retry 1 回目で valid JSON → toolResult populated, followUpAttempts: 1

**Category**: unit
**Priority**: must
**Source**: T-05, T-07

**GIVEN** `ctx.policy.reportTool` が設定されている
**AND** main turn の `finalResponse` が invalid JSON
**AND** 1 回目 retry の `finalResponse` が `{ "ok": true, "approved": true }` の valid JSON
**WHEN** `run()` を実行する
**THEN** `toolResult` が `{ ok: true, approved: true }` である
**AND** `followUpAttempts` が `1` である

---

### TC-012: 全 retry 枯渇 → toolResult null, followUpAttempts = maxAttempts

**Category**: unit
**Priority**: must
**Source**: T-05, T-07

**GIVEN** `ctx.policy.reportTool` が設定されている
**AND** main turn および全 retry ターンの `finalResponse` が invalid
**WHEN** `run()` を実行する
**THEN** `toolResult` が `null` である
**AND** `followUpAttempts` が `DEFAULT_TOOL_RETRY.maxAttempts` に等しい

---

### TC-013: retry ターンにも outputSchema が付与される

**Category**: unit
**Priority**: must
**Source**: T-05, D4

**GIVEN** main turn の `finalResponse` が invalid（retry が発生する）
**WHEN** retry の `thread.run()` 呼び出しを観察する
**THEN** retry の `thread.run()` 第 2 引数にも `outputSchema` が含まれている

---

### TC-014: usage が retry 分も含めて加算される

**Category**: unit
**Priority**: should
**Source**: T-05 AC

**GIVEN** main turn が 1 回、retry が 2 回実行される
**WHEN** `run()` の返り値の `usage` を確認する
**THEN** main turn + retry 2 回分の token 使用量が合算されている

---

### TC-015: postWorkPrompts ターンに outputSchema が含まれない

**Category**: unit
**Priority**: must
**Source**: T-06, D5

**GIVEN** `postWorkPrompts` が設定されており `shouldRunFollowUp` が `true`
**WHEN** postWorkPrompts ターンの `thread.run()` 呼び出しを観察する
**THEN** `thread.run()` の第 2 引数に `outputSchema` が含まれていない

---

### TC-016: frozen behavior コメントが全て削除されている

**Category**: unit
**Priority**: must
**Source**: T-06 AC

**GIVEN** 変更後の `src/adapter/codex/agent-runner.ts`
**WHEN** ファイル内容を検索する
**THEN** `"Frozen behavior"` という文字列が 0 件である
**AND** `"toolResult always null"` という文字列が 0 件である

---

### TC-017: delta spec が正しいパスに存在し frozen behavior 要件を削除/置換している

**Category**: unit
**Priority**: must
**Source**: T-08

**GIVEN** `specrunner/changes/codex-typed-outcome/specs/tool-driven-step-completion/spec.md`
**WHEN** ファイルの内容を確認する
**THEN** `## Removed` セクションに「Codex adapter の frozen behavior」MUST 要件が記載されている
**AND** `## Requirements` セクションに outputSchema 経由 typed outcome の新要件が `SHALL`/`MUST` キーワード付きで記載されている
**AND** 少なくとも 1 つの Scenario（Given/When/Then）が含まれている

---

### TC-018: delta spec の degrade path Scenario が含まれている

**Category**: unit
**Priority**: should
**Source**: T-08, D4, design Risks

**GIVEN** `specrunner/changes/codex-typed-outcome/specs/tool-driven-step-completion/spec.md` の Scenario 一覧
**WHEN** retry 枯渇シナリオを確認する
**THEN** `toolResult: null` の degrade（judge→needs-fix / producer→completionVerdict）が contract safe であることを示す Scenario が存在する

---

### TC-019: bun run build && bun run typecheck && bun run test が全 green

**Category**: integration
**Priority**: must
**Source**: request 受け入れ基準, T-07 AC

**GIVEN** 全 task 実装後の状態
**WHEN** `bun run build && bun run typecheck && bun run test` を実行する
**THEN** 全コマンドが exit code 0 で終了する
**AND** 型エラー・テスト失敗がゼロである

---

## Result

```yaml
result: completed
total: 19
automated: 18
manual: 1
must: 14
should: 5
could: 0
blocked_reasons: []
```
