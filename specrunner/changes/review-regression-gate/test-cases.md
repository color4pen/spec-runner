# Test Cases: レビュー収束後の退行ゲート

## Summary

- **Total**: 25 cases
- **Automated** (unit/integration): 25
- **Manual**: 0
- **Priority**: must: 17, should: 8, could: 0

---

### TC-001: custom reviewer 1 件の job でゲートがチェーン後に走る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 退行ゲートは reviewer チェーン完走後・conformance 前に実行される > Scenario: custom reviewer 1 件の job でゲートがチェーン後に走る

---

### TC-002: チェーン末尾の reviewer は conformance ではなくゲートへ遷移する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 退行ゲートは reviewer チェーン完走後・conformance 前に実行される > Scenario: チェーン末尾の reviewer は conformance ではなくゲートへ遷移する

---

### TC-003: reviewer ゼロでゲートが現れない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: custom reviewer ゼロではゲートを構造的に skip する > Scenario: reviewer ゼロでゲートが現れない

---

### TC-004: 途中で修正された fixable finding が台帳に含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: ゲートの入力は累積 findings 台帳に限定される > Scenario: 途中で修正された fixable finding が台帳に含まれる

---

### TC-005: decision-needed は台帳に含まれない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: ゲートの入力は累積 findings 台帳に限定される > Scenario: decision-needed は台帳に含まれない

---

### TC-006: 構造的重複が排除される

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: ゲートの入力は累積 findings 台帳に限定される > Scenario: 構造的重複が排除される

---

### TC-007: 退行なしで approved

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: ゲートは judge 契約に乗る > Scenario: 退行なしで approved

---

### TC-008: 実在しない参照は escalation

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: ゲートは judge 契約に乗る > Scenario: 実在しない参照は escalation

---

### TC-009: 退行 → code-fixer → 再ゲート

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 退行検出時は code-fixer ループで修正する > Scenario: 退行 → code-fixer → 再ゲート

---

### TC-010: 相互排他の矛盾で escalation

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 台帳項目間の矛盾は escalation に落ちる > Scenario: 相互排他の矛盾で escalation

---

### TC-011: 予算超過で exhaustion

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: ゲートは自身の iteration 予算と exhaustion を持つ > Scenario: 予算超過で exhaustion

---

### TC-012: regression-gate 定数が STEP_NAMES / AGENT_STEP_NAMES / CLI_STEP_NAMES に含まれない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01, T-09

**GIVEN** `REGRESSION_GATE_STEP_NAME` 定数が定義された状態  
**WHEN** `STEP_NAMES`・`AGENT_STEP_NAMES`・`CLI_STEP_NAMES` の値集合を検査する  
**THEN** いずれのコレクションにも `"regression-gate"` が含まれない

---

### TC-013: resolveReviewerResultPath がゲートの正しいパスを返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** slug が `"my-slug"`、iteration が `1`  
**WHEN** `resolveReviewerResultPath("my-slug", "regression-gate", 1)` を呼ぶ  
**THEN** 返されるパスが `specrunner/changes/my-slug/regression-gate-result-001.md` で終わる

---

### TC-014: findings / toolResult 不在の StepRun を安全に無視する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 (d)

**GIVEN** `outcome.toolResult` が `undefined` の StepRun を含む JobState と reviewer chain  
**WHEN** `collectFindingsLedger(state, reviewerChain)` を呼ぶ  
**THEN** 例外を投げず、toolResult 不在の StepRun は findings に寄与しない

---

### TC-015: 空チェーン / 空 findings で空配列を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 (e)

**GIVEN** StepRun が存在しない JobState と空の `reviewerChain = []`  
**WHEN** `collectFindingsLedger(state, [])` を呼ぶ  
**THEN** 空配列 `[]` が返る

---

### TC-016: createRegressionGateStep().reportTool が JUDGE_REPORT_TOOL と同一参照

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04; design.md > D3

**GIVEN** `JUDGE_REPORT_TOOL` singleton が定義されている  
**WHEN** `createRegressionGateStep()` を呼ぶ  
**THEN** 返された step の `reportTool` が `JUDGE_REPORT_TOOL` と厳密等価（`===`）である

---

### TC-017: reads() がレビューワー結果ファイルを required input に含まない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** `createRegressionGateStep()` で生成したゲート step  
**WHEN** `reads(state, slug)` を呼ぶ  
**THEN** 返されるリストにレビューワー結果ファイル（`*-result-NNN.md`）が required artifact として含まれない

---

### TC-018: buildMessage が非空台帳で finding の title / file を含む

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** code-review step に fixable finding（title="foo", file="src/bar.ts"）が記録された state  
**WHEN** ゲート step の `buildMessage(state, slug)` を呼ぶ  
**THEN** 返されたメッセージに `"foo"` と `"src/bar.ts"` が含まれる

---

### TC-019: buildMessage が空台帳で空である旨を明示する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04; design.md > Risks

**GIVEN** いずれの reviewer step にも fixable finding が記録されていない state  
**WHEN** ゲート step の `buildMessage(state, slug)` を呼ぶ  
**THEN** 返されたメッセージが台帳が空であることを示す文言を含む

---

### TC-020: deriveImplFixerChain が reviewer ゼロで ["code-review"] を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 (a)

**GIVEN** `reviewers` が空配列（または未定義）の JobState  
**WHEN** `deriveImplFixerChain(state)` を呼ぶ  
**THEN** 返り値が `["code-review"]` であり `"regression-gate"` を含まない

---

### TC-021: deriveImplFixerChain が reviewer 非空で末尾に regression-gate を追加する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 (b)

**GIVEN** `reviewers = ["security", "perf"]` の JobState  
**WHEN** `deriveImplFixerChain(state)` を呼ぶ  
**THEN** 返り値が `["code-review", "security", "perf", "regression-gate"]` である

---

### TC-022: ゲートが active のとき code-fixer がゲートの結果パスを解決する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05; design.md > D5

**GIVEN** `regression-gate` が最新の `startedAt` を持つ state（reviewer chain に custom reviewer 非空）  
**WHEN** code-fixer の `reads(state, slug)` を呼ぶ  
**THEN** active reviewer が `"regression-gate"` と解決され、結果ファイルパスが `regression-gate-result-NNN.md` を指す

---

### TC-023: 非ゲート reviewer 収束中は code-fixer が当該 reviewer のパスを読む

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05; design.md > D5

**GIVEN** `"security"` reviewer が最新の `startedAt` を持つ state（gate は未起動 or 古い）  
**WHEN** code-fixer の `reads(state, slug)` を呼ぶ  
**THEN** active reviewer が `"security"` と解決され、結果ファイルパスが `security-result-NNN.md` を指し `regression-gate` を参照しない

---

### TC-024: REGRESSION_GATE_SYSTEM_PROMPT が台帳照合限定と矛盾 criterion を含む

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02; design.md > Risks

**GIVEN** `REGRESSION_GATE_SYSTEM_PROMPT` がビルドされた状態  
**WHEN** プロンプト文字列を検査する  
**THEN** (1) 台帳に無い新規観点を出さない旨、(2) ある台帳項目を直すと別項目が再発する場合は `decision-needed` を報告する criterion の両方が含まれる

---

### TC-025: ゲート exhaustion で REGRESSION_GATE_RETRIES_EXHAUSTED が記録される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07; design.md > D7

**GIVEN** `LOOP_ERROR_CODES` に `"regression-gate"` エントリが定義されている  
**WHEN** そのエントリの `code` フィールドを参照する  
**THEN** 値が `"REGRESSION_GATE_RETRIES_EXHAUSTED"` であり、`message` または `hint` に `regression-gate-result-NNN.md` への言及が含まれる

---

## Result

```yaml
result: completed
total: 25
automated: 25
manual: 0
must: 17
should: 8
could: 0
blocked_reasons: []
```
