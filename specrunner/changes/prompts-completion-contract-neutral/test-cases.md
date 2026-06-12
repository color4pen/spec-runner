# Test Cases: agent prompt の完了契約文言を provider 非依存にする

## Summary

- **Total**: 29 cases
- **Automated** (unit/integration): 28
- **Manual**: 1
- **Priority**: must: 26, should: 3, could: 0

---

### TC-001: system prompt に runtime 固有トークンが現れない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 共有 agent prompt は provider 中立の完了文言を使う > Scenario: system prompt に runtime 固有トークンが現れない

---

### TC-002: 初期メッセージにも runtime 固有トークンが現れない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 共有 agent prompt は provider 中立の完了文言を使う > Scenario: 初期メッセージにも runtime 固有トークンが現れない

---

### TC-003: producer 系 prompt が中立完了指示を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 完了の意味は中立表現で保持される > Scenario: producer 系 prompt が中立完了指示を含む

---

### TC-004: judge 系 prompt が中立完了指示と findings 報告を両立する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 完了の意味は中立表現で保持される > Scenario: judge 系 prompt が中立完了指示と findings 報告を両立する

---

### TC-005: VERDICT_BLOCKING_RULES が中立化される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: verdict 導出ガイドは完了機構名を含まない > Scenario: VERDICT_BLOCKING_RULES が中立化される

---

### TC-006: fragments.ts が3定数を export する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `src/prompts/fragments.ts` モジュール
**WHEN** モジュールを import する
**THEN** `COMPLETION_REPORT_LINE`、`COMPLETION_NO_EARLY_STOP_LINE`、`COMPLETION_DIRECTIVE` の3定数がすべて export されている

---

### TC-007: COMPLETION_DIRECTIVE が必要な構造を含む

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `fragments.ts` から import した `COMPLETION_DIRECTIVE` 定数
**WHEN** 文字列値を検査する
**THEN** `## Completion` 見出し、`{ok: true}`、`{ok: false, reason: "理由"}`、`COMPLETION_REPORT_LINE` の文言、`COMPLETION_NO_EARLY_STOP_LINE` の文言がすべて含まれる

---

### TC-008: fragments.ts の3定数に report_result / end_turn が含まれない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `COMPLETION_REPORT_LINE`、`COMPLETION_NO_EARLY_STOP_LINE`、`COMPLETION_DIRECTIVE` の各定数
**WHEN** それぞれの文字列を禁止トークンで検査する
**THEN** いずれの定数も `report_result` および `end_turn` を含まない

---

### TC-009: producer 8 prompt 末尾に COMPLETION_DIRECTIVE が含まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** design / implementer / test-case-gen / code-fixer / build-fixer / spec-fixer / adr-gen / conformance の各 system prompt 定数
**WHEN** 組み立て後の prompt 文字列を検査する
**THEN** 8 prompt それぞれが `COMPLETION_DIRECTIVE` の内容（`## Completion` 見出しと `{ok: true}` / `{ok: false, reason: "理由"}` の両方を含む）を末尾 fragment として持つ

---

### TC-010: producer 8 prompt から旧フッター文言が消えている

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** producer 系8 prompt の各 system prompt 定数
**WHEN** 組み立て後の文字列を旧文言で検査する
**THEN** `作業完了時は必ず`、`tool を呼び出して`、`tool を呼ばずに turn を終了` がいずれも含まれない

---

### TC-011: producer 8 prompt で既存 fragment の内容と順序が維持される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** producer 系8 prompt の組み立て後文字列
**WHEN** fragment の出現順序を検査する
**THEN** `COMMIT_DISCIPLINE` の内容が `PIPELINE_RULES` の内容より前に現れ、両者の文言が変更前から一字も変わっていない

---

### TC-012: judge 4 prompt に COMPLETION_REPORT_LINE / COMPLETION_NO_EARLY_STOP_LINE が含まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** code-review / spec-review / regression-gate / custom-reviewer の各 system prompt
**WHEN** 完了セクションの文字列を検査する
**THEN** 4 prompt それぞれが `COMPLETION_REPORT_LINE` の文言と `COMPLETION_NO_EARLY_STOP_LINE` の文言を含む

---

### TC-013: judge 4 prompt から report_result が消えている

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** judge 系4 prompt の各 system prompt（`VERDICT_BLOCKING_RULES` の T-05 中立化が適用済みの状態）
**WHEN** 組み立て後の文字列を `report_result` で検査する
**THEN** 4 prompt いずれにも `report_result` が含まれない

---

### TC-014: judge 4 prompt の findings 報告指示が維持される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** judge 系4 prompt の各 system prompt
**WHEN** findings 報告セクションを検査する
**THEN** `severity`、`resolution`、`findings` に関する指示文言がすべて含まれる

---

### TC-015: regression-gate の英語完了指示が中立化されている

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** `REGRESSION_GATE_SYSTEM_PROMPT`
**WHEN** 英語の完了指示行を検査する
**THEN** `You MUST report your completion result before finishing.` が存在し、`call \`report_result\`` が存在しない

---

### TC-016: REQUEST_REVIEW_SYSTEM_PROMPT に report_result / end_turn が含まれない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` 定数
**WHEN** 文字列を禁止トークンで検査する
**THEN** `report_result` および `end_turn` がいずれも含まれない

---

### TC-017: buildRequestReviewInitialMessage 出力に report_result / end_turn が含まれない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `buildRequestReviewInitialMessage(...)` の出力文字列
**WHEN** 禁止トークンで検査する
**THEN** `report_result` および `end_turn` がいずれも含まれない

---

### TC-018: request-review の完了報告指示が意味として維持される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` と `buildRequestReviewInitialMessage(...)` 出力
**WHEN** 完了報告セクションを内容で検査する
**THEN** `verdict` と `findings` 配列の報告を指示する文脈が両文字列に残っている

---

### TC-019: VERDICT_BLOCKING_RULES に report_result が含まれない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `judge-rules.ts` の `VERDICT_BLOCKING_RULES` 定数
**WHEN** 文字列を `report_result` で検査する
**THEN** `report_result` が含まれない

---

### TC-020: VERDICT_BLOCKING_RULES の blocking 判定キーワードが変更されていない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `VERDICT_BLOCKING_RULES` 定数
**WHEN** verdict 判定キーワードを検査する
**THEN** `decision-needed`、`escalation`、`needs-fix`、`needs-discussion`、`findings 由来の導出が優先` がすべて含まれる

---

### TC-021: DECISION_NEEDED_DEFINITION / OBSERVATION_DEFINITION が無変更

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `judge-rules.ts` の `DECISION_NEEDED_DEFINITION` および `OBSERVATION_DEFINITION` 定数
**WHEN** 変更前のベースライン文字列と比較する
**THEN** 両定数とも変更前の値から一字も変わっていない

---

### TC-022: 全 14 exported シンボルに end_turn が含まれない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** tasks.md の対象 14 ファイル表に掲載された全 exported シンボル（system prompt 定数・template 定数・builder 出力）
**WHEN** 各文字列を `end_turn` で検査する
**THEN** いずれの文字列にも `end_turn` が含まれない

---

### TC-023: src/adapter/ の stop_reason: "end_turn" は変更されていない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** `src/adapter/claude-code/` 配下のファイルおよびそのテスト（`agent-runner-transient-retry.test.ts` / `agent-redirect-integration.test.ts` 等）
**WHEN** `stop_reason` の値を検査する
**THEN** `stop_reason: "end_turn"` の記述がすべて変更前と同一である

---

### TC-024: fragment-coverage テストが14シンボル全体で neutrality を断言する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** T-07 変更後の `src/prompts/__tests__/fragment-coverage.test.ts`
**WHEN** テストファイルの describe ブロックを検査する
**THEN** 対象 14 exported シンボルのすべてに対して `not.toContain("report_result")`、`not.toContain("end_turn")`、`not.toContain("作業完了時は必ず")` を断言するブロックが存在し、producer 8 prompt には `COMPLETION_DIRECTIVE` 存在断言、judge 4 prompt には `COMPLETION_REPORT_LINE` / `COMPLETION_NO_EARLY_STOP_LINE` 存在断言が含まれる

---

### TC-025: 廃止トークン混入で fragment-coverage テストが fail する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** `fragment-coverage.test.ts` の neutrality 断言が追加された状態
**WHEN** 対象 14 prompt のいずれかに `report_result` または `end_turn` を含む文字列を混入させる
**THEN** 対応する `not.toContain` 断言が fail し、neutrality が機械的に固定されていることが確認できる

---

### TC-026: custom-reviewer-system.test.ts の完了文言断言が中立完了文言に更新されている

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08

**GIVEN** T-08 変更後の `src/prompts/__tests__/custom-reviewer-system.test.ts`
**WHEN** 旧 `it("contains report_result tool requirement")` に相当するテストケースを確認する
**THEN** `toContain("report_result")` の断言が消えており、代わりに `COMPLETION_REPORT_LINE` または `COMPLETION_NO_EARLY_STOP_LINE` の存在を断言するテストに置き換わっている

---

### TC-027: claude-code runtime テストが無変更で green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-08 / T-09

**GIVEN** `src/adapter/claude-code/__tests__/transient-error.test.ts`、`agent-runner-transient-retry.test.ts`、`agent-redirect-integration.test.ts` が一切変更されていない状態
**WHEN** `bun run test` でこれらのテストファイルを実行する
**THEN** 全テストが green となり、`Agent did not call report_result` や `stop_reason: "end_turn"` を対象とする既存断言がそのまま成立する

---

### TC-028: typecheck && test が green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-09

**GIVEN** T-01〜T-08 を適用した変更全体
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 両コマンドがエラーなく exit code 0 で完了する

---

### TC-029: 対象外ファイルに差分がない

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-09

**GIVEN** 変更ブランチの git diff
**WHEN** `src/adapter/`、`src/core/step/report-tool.ts`、`src/errors.ts` のパスを対象に差分を確認する
**THEN** いずれのパスにも変更が存在しない

---

## Result

```yaml
result: completed
total: 29
automated: 28
manual: 1
must: 26
should: 3
could: 0
blocked_reasons: []
```
