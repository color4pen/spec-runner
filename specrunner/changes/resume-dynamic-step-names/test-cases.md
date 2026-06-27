# Test Cases: resume の再開 step 検証を実 descriptor 由来にする

## Summary

- **Total**: 17 cases
- **Automated** (unit/integration): 16
- **Manual**: 1
- **Priority**: must: 12, should: 5, could: 0

---

### TC-001: buildAllowedStepSet — reviewers undefined → static-only（regression-gate 除外）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: buildAllowedStepSet は job の実 step 集合を返す > Scenario: 標準 job（custom reviewer なし）の集合

---

### TC-002: buildAllowedStepSet — reviewers 非 empty → regression-gate + reviewer 名 + static 全含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: buildAllowedStepSet は job の実 step 集合を返す > Scenario: custom reviewer あり job の集合

---

### TC-003: resolveResumeStep — 第 4 引数省略 → 静的集合にフォールバック（後退なし）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: resolveResumeStep は allowedSteps 引数を優先使用する > Scenario: 第 4 引数なし → 静的集合で判定（後退なし）

---

### TC-004: resolveResumeStep — カスタム allowedSteps で regression-gate を受理

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: resolveResumeStep は allowedSteps 引数を優先使用する > Scenario: カスタム allowedSteps で動的 step を受理する

---

### TC-005: stateStep = regression-gate + reviewers あり → hard-crash resume が成功

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: hard-crash 時の state.step フォールバックが動的 step 名を受理する > Scenario: regression-gate 実行中の hard-crash からの resume

---

### TC-006: stateStep = custom reviewer 名 + reviewers あり → hard-crash resume が成功

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: hard-crash 時の state.step フォールバックが動的 step 名を受理する > Scenario: custom reviewer 実行中の hard-crash からの resume

---

### TC-007: stateStep = regression-gate + reviewers なし（standard job）→ throw

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: hard-crash 時の state.step フォールバックが動的 step 名を受理する > Scenario: state.step が動的 step でも reviewers なし → 拒否

---

### TC-008: --from regression-gate（allowedSteps に含まれる）→ 受理

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: --from に動的 step 名を指定できる > Scenario: --from regression-gate（custom reviewer あり）

---

### TC-009: --from に実在しない名前 → throw、エラーメッセージに typo 名を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: --from に動的 step 名を指定できる > Scenario: --from に実在しない名前 → 拒否

---

### TC-010: resumePoint あり → verbatim return（allowedSteps 内容に依存しない）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: resumePoint 経路は allowedSteps に依存しない > Scenario: resumePoint あり → verbatim return（集合無関係）

---

### TC-011: buildAllowedStepSet — reviewers 空配列 → regression-gate が集合に含まれない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 Suite A

**GIVEN** `reviewers` が空配列 `[]`
**WHEN** `buildAllowedStepSet([])` を呼ぶ
**THEN** 返却集合に `"regression-gate"` が含まれない

---

### TC-012: stateStep が allowedSteps に存在しない reviewer 名 → throw

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 Suite B

**GIVEN** `allowedSteps` に `"scale-tolerance"` を含むが `"unknown-reviewer"` は含まれない
**WHEN** `resolveResumeStep(undefined, null, "unknown-reviewer", allowedSteps)` を呼ぶ
**THEN** throw する

---

### TC-013: --from custom reviewer 名（allowedSteps に含まれる）→ 受理

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Suite C

**GIVEN** `allowedSteps` に `"scale-tolerance"` が含まれる
**WHEN** `resolveResumeStep("scale-tolerance", null, undefined, allowedSteps)` を呼ぶ
**THEN** `"scale-tolerance"` を返す

---

### TC-014: --from 不正時のエラーメッセージに dynamic reviewer 名が列挙される

**Category**: unit
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-03 Suite C

**GIVEN** `allowedSteps` に `"scale-tolerance"` が含まれ、`"typo-reviewer"` は含まれない
**WHEN** `resolveResumeStep("typo-reviewer", null, undefined, allowedSteps)` を呼ぶ
**THEN** throw し、エラーメッセージに `"scale-tolerance"` が列挙される

---

### TC-015: ResumeCommand.prepare() が state.reviewers から buildAllowedStepSet を導出して渡す

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `state.reviewers = [{ name: "scale-tolerance" }]` かつ `state.step = "scale-tolerance"` の awaiting-resume job
**WHEN** `ResumeCommand.prepare()` が `resolveResumeStep` を呼ぶ
**THEN** `buildAllowedStepSet(state.reviewers)` 由来の allowedSteps が渡されるため throw せず `startStep = "scale-tolerance"` が解決される

---

### TC-016: 既存テストスイート後退なし

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** T-01 / T-02 の実装が適用されている
**WHEN** `bun run test` を実行する
**THEN** 既存スイート（`resumePoint.step returned verbatim` / `--from with registered step name` / `--from invalid value throws` / `null resumePoint + no from → throws`）が全件 pass する

---

### TC-017: typecheck && test が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** T-01 / T-02 / T-03 の実装が完了している
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 両コマンドが exit 0 で終了する

---

## Result

```yaml
result: completed
total: 17
automated: 16
manual: 1
must: 12
should: 5
could: 0
blocked_reasons: []
```
