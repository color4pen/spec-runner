# Test Cases: run / resume の終端を機械可読な --json 契約で出す

## Summary

- **Total**: 27 cases
- **Automated** (unit/integration): 26
- **Manual**: 1
- **Priority**: must: 17, should: 9, could: 1

---

### TC-001: run --json が pr-created を stdout に出す

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: run / job start / resume は --json を受理し終端 JSON を stdout に出す > Scenario: run --json が pr-created を stdout に出す

---

### TC-002: resume --json が終端 JSON を stdout に出す

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: run / job start / resume は --json を受理し終端 JSON を stdout に出す > Scenario: resume --json が終端 JSON を stdout に出す

---

### TC-003: job start エントリでも --json が受理される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: run / job start / resume は --json を受理し終端 JSON を stdout に出す > Scenario: job start エントリでも --json が受理される

---

### TC-004: --json 未指定では stdout に JSON が出ない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: run / job start / resume は --json を受理し終端 JSON を stdout に出す > Scenario: --json 未指定では stdout に JSON が出ない

---

### TC-005: awaiting-archive は pr-created

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 終端 JSON の種別は pr-created / awaiting-human / failed を区別する > Scenario: awaiting-archive は pr-created

---

### TC-006: escalation は awaiting-human

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 終端 JSON の種別は pr-created / awaiting-human / failed を区別する > Scenario: escalation は awaiting-human

---

### TC-007: loop 枯渇は awaiting-human

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 終端 JSON の種別は pr-created / awaiting-human / failed を区別する > Scenario: loop 枯渇は awaiting-human

---

### TC-008: 恒久失敗は failed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 終端 JSON の種別は pr-created / awaiting-human / failed を区別する > Scenario: 恒久失敗は failed

---

### TC-009: pr-created は prUrl を持ち reason が null

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 終端 JSON は終端判定に必要な最小情報を含む > Scenario: pr-created は prUrl を持ち reason が null

---

### TC-010: failed は reason を持ち prUrl が null

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 終端 JSON は終端判定に必要な最小情報を含む > Scenario: failed は reason を持ち prUrl が null

---

### TC-011: awaiting-human は halt した step と事由を持つ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 終端 JSON は終端判定に必要な最小情報を含む > Scenario: awaiting-human は halt した step と事由を持つ

---

### TC-012: pr-created は exit 0

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: exit code は現行を維持する > Scenario: pr-created は exit 0

---

### TC-013: awaiting-human と failed は exit 1

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: exit code は現行を維持する > Scenario: awaiting-human と failed は exit 1

---

### TC-014: --json 無しの人間向け出力が baseline と一致

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: --json 未指定時の人間向け出力は不変である > Scenario: --json 無しの人間向け出力が baseline と一致

---

### TC-015: awaiting-resume かつ resumePoint が無い場合は error から reason を導出する

**Category**: unit
**Priority**: should
**Source**: design.md > D5: 種別の写像規則と停止事由の抽出

**GIVEN** `status: "awaiting-resume"` かつ `resumePoint` が undefined、`error: { code: "ERR_X", message: "something failed" }` を持つ JobState
**WHEN** `buildRunResult(state, slug)` を呼ぶ
**THEN** `result` が `"awaiting-human"`、`reason.code` が `"ERR_X"`、`reason.message` が `"something failed"` になる

---

### TC-016: awaiting-archive かつ PR URL が無い場合は prUrl が null

**Category**: unit
**Priority**: should
**Source**: design.md > D5: 種別の写像規則と停止事由の抽出

**GIVEN** `status: "awaiting-archive"` かつ `pullRequest` が undefined の JobState
**WHEN** `buildRunResult(state, slug)` を呼ぶ
**THEN** `result` が `"pr-created"`、`prUrl` が `null`、`reason` が `null` になる

---

### TC-017: failed かつ error が無い場合は reason に既定文言が入る

**Category**: unit
**Priority**: should
**Source**: design.md > D5: 種別の写像規則と停止事由の抽出

**GIVEN** `status: "failed"` かつ `error` が undefined の JobState
**WHEN** `buildRunResult(state, slug)` を呼ぶ
**THEN** `result` が `"failed"`、`reason.code` が `null`、`reason.message` が非空の文字列（既定フォールバック）になる

---

### TC-018: schemaVersion は全種別で常に 1

**Category**: unit
**Priority**: should
**Source**: design.md > D4: schemaVersion を契約に含める

**GIVEN** `awaiting-archive` / `awaiting-resume` / `failed` それぞれの JobState
**WHEN** `buildRunResult` を各 state で呼ぶ
**THEN** 全ての出力オブジェクトで `schemaVersion` が `1` である

---

### TC-019: buildRunResult は副作用を持たない純粋関数である

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** 同一の JobState と slug
**WHEN** `buildRunResult` を複数回呼ぶ
**THEN** 毎回同一のオブジェクトを返し、I/O・logger・fs・process への呼び出しが発生しない

---

### TC-020: formatRunResultJson は 2 スペースインデント + 末尾改行の JSON 文字列を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** 有効な `RunResultContract` オブジェクト
**WHEN** `formatRunResultJson(contract)` を呼ぶ
**THEN** 返り値が `JSON.stringify(contract, null, 2) + "\n"` と等しい文字列である

---

### TC-021: --json 未指定時は json が false として扱われる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `--json` フラグを付けずに `run` / `resume` コマンドを起動する
**WHEN** フラグがパースされ PrepareResult に伝播される
**THEN** `PrepareResult.json` が `false`（または未設定）として扱われ、stdout への終端 JSON 出力が発生しない

---

### TC-022: --json フラグが CLI から execute() まで伝播する

**Category**: integration
**Priority**: should
**Source**: design.md > D6: --json フラグの配線

**GIVEN** `run --json` または `job start --json` を起動する
**WHEN** CLI が flags をパースし command registry → runRun → PipelineRunCommand.prepare() → PrepareResult → execute() の経路を通る
**THEN** `PrepareResult.json` が `true` として `execute()` に届き、`handleResult` に渡される

---

### TC-023: setupWorkspace 失敗終端で --json 時に failed JSON を stdout に出す

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03 / design.md > 終端の発生箇所（execute 内）1.

**GIVEN** `setupWorkspace` が `WORKSPACE_SETUP_FAILED` で失敗し、`--json` が指定されている
**WHEN** `run --json` が実行される
**THEN** stdout に `result: "failed"` を含む単一の有効な JSON が出力され、`slug` / `jobId` / `step` が埋まっている

---

### TC-024: buildDeps / registerCleanup 失敗終端で --json 時に failed JSON を stdout に出す

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03 / design.md > 終端の発生箇所（execute 内）2.

**GIVEN** `buildDeps` または `registerCleanup` が `INIT_FAILED` で失敗し、`--json` が指定されている
**WHEN** `run --json` が実行される
**THEN** stdout に `result: "failed"` を含む単一の有効な JSON が出力される

---

### TC-025: pipeline throw（crash）終端で --json 時に failed JSON を stdout に出す

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03 / design.md > 終端の発生箇所（execute 内）3.

**GIVEN** pipeline が例外を throw し（crash 終端）、`--json` が指定されている
**WHEN** `run --json` が実行される
**THEN** stdout に `result: "failed"` を含む単一の有効な JSON が出力され、`step` が throw 時点の `jobState.step`、`reason` が thrown error の code / message から導出されている

---

### TC-026: SPEC_REVIEW_RESULT_NOT_FOUND 早期 return で --json 時に failed JSON を stdout に出す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 / design.md > runner.ts:245 早期 return

**GIVEN** `runner.ts:245` の `SPEC_REVIEW_RESULT_NOT_FOUND` 早期 return 条件が成立し、`json: true` が渡されている
**WHEN** `execute()` が当該経路を通る
**THEN** stdout に `result: "failed"` を含む単一の有効な JSON が出力される

---

### TC-027: status → 種別 の写像ロジックが run-result.ts 以外に存在しない

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-05 / design.md > D2: status → 種別 の写像を純粋関数 1 つに集約する

**GIVEN** 実装後のコードベース
**WHEN** `run-result.ts` 以外の全ソースファイルで status → `pr-created` / `awaiting-human` / `failed` の写像分岐を検索する
**THEN** 写像ロジックの重複が `src/core/command/run-result.ts` 以外には存在しない

---

## Result

```yaml
result: completed
total: 27
automated: 26
manual: 1
must: 17
should: 9
could: 1
blocked_reasons: []
```
