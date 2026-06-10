# Test Cases: judge 系 step の verdict を構造化 findings から CLI が導出する

## Summary

- **Total**: 33 cases
- **Automated** (unit/integration): 32
- **Manual**: 1
- **Priority**: must: 19, should: 12, could: 2

---

### TC-001: critical を含むのに approved を申告しても needs-fix になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Judge verdict は構造化 findings から決定的に導出される > Scenario: critical を含むのに approved を申告しても needs-fix になる

---

### TC-002: 空の findings は approved になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Judge verdict は構造化 findings から決定的に導出される > Scenario: 空の findings は approved になる

---

### TC-003: decision-needed を含む報告は escalation になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Judge verdict は構造化 findings から決定的に導出される > Scenario: decision-needed を含む報告は escalation になる

---

### TC-004: ok:false 報告は escalation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 自発的失敗と no-tool-call は escalation に倒れる > Scenario: ok:false 報告は escalation

---

### TC-005: tool 未呼び出しは escalation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 自発的失敗と no-tool-call は escalation に倒れる > Scenario: tool 未呼び出しは escalation

---

### TC-006: 実在しない file を指す blocking finding は escalation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: verdict に影響する finding の参照は実在検証される > Scenario: 実在しない file を指す blocking finding は escalation

---

### TC-007: low/medium の不実在参照は verdict を変えない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: verdict に影響する finding の参照は実在検証される > Scenario: low/medium の不実在参照は verdict を変えない

---

### TC-008: request-review — blocking finding ありで needs-discussion

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request-review verdict は findings から 2 値で導出される > Scenario: blocking finding ありで needs-discussion

---

### TC-009: request-review — blocking finding なしで approve

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request-review verdict は findings から 2 値で導出される > Scenario: blocking finding なしで approve

---

### TC-010: fixer は state の findings を prompt から受け取る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: fixer は構造化 findings を prompt 経由で受け取る > Scenario: fixer は state の findings を prompt から受け取る

---

### TC-011: findings を持たない旧 job の resume はフォールバックする

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: fixer は構造化 findings を prompt 経由で受け取る > Scenario: findings を持たない旧 job の resume はフォールバックする

---

### TC-012: parseFindings が valid な findings 配列を正常に解析する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** `{ severity: "high", resolution: "fixable", file: "src/foo.ts", line: 10, title: "t", rationale: "r" }` を要素に持つ配列
**WHEN** `parseFindings(raw)` を呼ぶ
**THEN** `{ ok: true, value: [...] }` を返す（各フィールドが検証済み）

---

### TC-013: parseJudgeReportInput が ok=true かつ findings 欠落で invalid-input を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** `{ ok: true, approved: false }` （findings フィールドなし）
**WHEN** `parseJudgeReportInput` を呼ぶ
**THEN** `{ ok: false, missingFields: ["findings"] }` を返す

---

### TC-014: parseJudgeReportInput が ok=true かつ findings の severity 不正で invalid-input を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `{ ok: true, findings: [{ severity: "bogus", resolution: "fixable", file: "x.ts", title: "t", rationale: "r" }] }`
**WHEN** `parseJudgeReportInput` を呼ぶ
**THEN** `{ ok: false, missingFields: ["findings"] }` を返す

---

### TC-015: parseJudgeReportInput が ok=true かつ findings の resolution 不正で invalid-input を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `{ ok: true, findings: [{ severity: "high", resolution: "unknown", file: "x.ts", title: "t", rationale: "r" }] }`
**WHEN** `parseJudgeReportInput` を呼ぶ
**THEN** `{ ok: false, missingFields: ["findings"] }` を返す

---

### TC-016: parseJudgeReportInput が ok=false のとき findings なしで成功する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** `{ ok: false, reason: "cannot complete analysis" }`
**WHEN** `parseJudgeReportInput` を呼ぶ
**THEN** `{ ok: true }` を返す（findings 未提出でも valid）

---

### TC-017: parseCodeReviewReportInput / parseRequestReviewReportInput も同様に findings を検証する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `{ ok: true }` （findings 欠落）を code-review / request-review 各 parse 関数に渡す
**WHEN** それぞれの `parseInput` を呼ぶ
**THEN** 両方とも `{ ok: false, missingFields: ["findings"] }` を返す

---

### TC-018: toCustomToolSpec(JUDGE_REPORT_TOOL) が findings を含む有効な JSON Schema を生成する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** findings フィールドを追加した `JUDGE_REPORT_TOOL`
**WHEN** `toCustomToolSpec(JUDGE_REPORT_TOOL)` を呼ぶ
**THEN** `toJSONSchema` が例外を投げず、返された schema に `findings` 配列の定義が含まれる

---

### TC-019: collectVerdictAffectingFindings が verdict に影響する finding のみを返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** `[{ severity: "critical", resolution: "fixable" }, { severity: "medium", resolution: "decision-needed" }, { severity: "low", resolution: "fixable" }, { severity: "high", resolution: "fixable" }]`
**WHEN** `collectVerdictAffectingFindings(findings)` を呼ぶ
**THEN** critical（fixable）、medium（decision-needed）、high（fixable）の 3 件を返し、low（fixable）を含まない

---

### TC-020: verifyFindingRefs が空配列入力で空配列を返す（no-op）

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** 空の `FindingRef[]`
**WHEN** local / managed いずれかの `verifyFindingRefs([], cwd, branch)` を呼ぶ
**THEN** 空配列を返す（fs / API 呼び出しなし）

---

### TC-021: local verifyFindingRefs が実在するファイルを不実在として返さない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-12

**GIVEN** worktree 上に実在するファイルへの `FindingRef`
**WHEN** `local.verifyFindingRefs([ref], cwd, branch)` を呼ぶ
**THEN** 空配列を返す（不実在なし）

---

### TC-022: local verifyFindingRefs が存在しないファイルを不実在として返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-12

**GIVEN** worktree 上に存在しないパスへの `FindingRef`
**WHEN** `local.verifyFindingRefs([ref], cwd, branch)` を呼ぶ
**THEN** その ref を含む配列を返す

---

### TC-023: local verifyFindingRefs が line 行数超過を不実在として返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-12

**GIVEN** 実在するファイルへの `FindingRef` だが `line` がファイルの総行数を超える
**WHEN** `local.verifyFindingRefs([ref], cwd, branch)` を呼ぶ
**THEN** その ref を不実在として返す

---

### TC-024: managed verifyFindingRefs が getRawFile null を不実在として返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-12

**GIVEN** `getRawFile` が null を返す `GitHubClient` mock を注入した managed runtime と blocking finding の `FindingRef`
**WHEN** `managed.verifyFindingRefs([ref], cwd, branch)` を呼ぶ
**THEN** その ref を不実在として返す

---

### TC-025: managed verifyFindingRefs が branch null のとき全 refs を不実在として返す

**Category**: unit
**Priority**: should
**Source**: design.md > D6 / tasks.md > T-05

**GIVEN** `branch` パラメータが null
**WHEN** `managed.verifyFindingRefs(refs, cwd, null)` を呼ぶ（refs は 1 件以上）
**THEN** 渡した refs をすべて不実在として返す

---

### TC-026: executor が実在する finding のみのとき verdict を escalation に上書きしない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-11

**GIVEN** high-severity finding を含む judge step 報告、かつ `verifyFindingRefs` が空配列を返す mock を注入
**WHEN** `executor.finalizeStep` を実行する
**THEN** verdict は `needs-fix` のままであり `escalation` に上書きされない

---

### TC-027: decision-needed で pipeline が escalate 経路に入る（default-to-escalate 検証）

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-14 / design.md > D5

**GIVEN** spec-review / code-review step が decision-needed finding を含む報告を行い verdict = `escalation`、かつ transition テーブルに `escalation` 行が存在しない
**WHEN** pipeline が `nextStep` を評価する（`transition?.to ?? "escalate"`）
**THEN** `nextStep === "escalate"` となり awaiting-resume 状態に遷移する

---

### TC-028: build-fixer の buildMessage は findingsPath 方式のまま変更なし

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08

**GIVEN** build-fixer step の state（verification prose result を参照する job）
**WHEN** `buildMessage` を呼ぶ
**THEN** prompt が findingsPath ファイル読み込み方式を使い、構造化 findings の埋め込みを含まない

---

### TC-029: request-review ok=false で needs-discussion を返す

**Category**: unit
**Priority**: must
**Source**: design.md > D4 / D7

**GIVEN** request-review agent が `{ ok: false, reason: "scope unclear" }` を申告する
**WHEN** `deriveRequestReviewVerdict(findings, false)` を呼ぶ
**THEN** verdict は `needs-discussion`（escalate 経路に遷移）

---

### TC-030: fixableCount が 0 扱いとなり approved→code-fixer 経路が inert になる

**Category**: unit
**Priority**: could
**Source**: design.md > D11

**GIVEN** code-review findings が low/medium の fixable 指摘のみ、verdict は `approved`、toolResult に fixableCount フィールドなし
**WHEN** pipeline が code-review approved の transition を評価する
**THEN** `fixableCount ?? 0 === 0` となり approved は conformance へ直行し code-fixer に入らない

---

### TC-031: judge 系 system prompt が findings 提出指示と severity/resolution 基準を含む

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-09

**GIVEN** spec-review / code-review / request-review の system prompt 文字列
**WHEN** 各 prompt の内容を検査する
**THEN** 3 つとも `findings` 配列の提出指示、severity（critical/high/medium/low）の定義、resolution（fixable/decision-needed）の定義、verdict 自己申告が CLI に無視される旨を含む

---

### TC-032: code-review followUpPrompt が findings 構造確認に整合する

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-09

**GIVEN** code-review の `followUpPrompt`（self-check）文字列
**WHEN** prompt 内容を検査する
**THEN** verdict 行整合チェックの文言ではなく findings 配列の提出確認を促す文言に更新されている

---

### TC-033: StepOutcome.toolResult に findings を含むオブジェクトを代入しても型エラーがない

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `StepOutcome.toolResult` へ `{ ok: true, findings: [{ severity: "high", ... }] }` を代入するコード
**WHEN** `bun run typecheck` を実行する
**THEN** 型エラーなし（green）

---

## Result

```yaml
result: completed
total: 33
automated: 32
manual: 1
must: 19
should: 12
could: 2
blocked_reasons: []
```
