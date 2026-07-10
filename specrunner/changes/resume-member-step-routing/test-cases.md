# Test Cases: resume-member-step-routing

## Summary

- **Total**: 19 cases
- **Automated** (unit/integration): 18
- **Manual**: 1
- **Priority**: must: 9, should: 9, could: 1

---

### TC-001: member 名の resumePoint → resolveResumeStep が coordinator を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: member step resumePoint is routed to coordinator on resume > Scenario: approved member — pipeline reaches terminal state

---

### TC-002: coordinator fan-out は reviewerStatuses から pending を再計算する

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: member step resumePoint is routed to coordinator on resume > Scenario: coordinator fan-out recalculates pending from reviewerStatuses

---

### TC-003: 静的 step の resumePoint はマッピングされない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: member step resumePoint is routed to coordinator on resume > Scenario: static step resumePoint is unaffected

---

### TC-004: `--from <member名>` → coordinator にマッピングされる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `--from <member-name>` is mapped to coordinator > Scenario: --from member maps to coordinator

---

### TC-005: `--from custom-reviewers` は coordinator として有効

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: `--from <member-name>` is mapped to coordinator > Scenario: --from custom-reviewers is explicitly valid

---

### TC-006: reviewers 存在時は coordinator が許可集合に含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: coordinator is in the allowed step set when reviewers are present > Scenario: coordinator added to allowed set

---

### TC-007: reviewers が空／未定義の場合は coordinator が許可集合に含まれない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: coordinator is in the allowed step set when reviewers are present > Scenario: no reviewers — coordinator not in set

---

### TC-008: signal handler がフラグを立てると exit-guard は appendInterruption をスキップする

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: signal stop produces exactly one interruption record > Scenario: signal handler marks flag; exit-guard skips append

---

### TC-009: signal なし（フラグ false）のとき exit-guard は interruption を記録する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: signal stop produces exactly one interruption record > Scenario: no signal — exit-guard acts as normal backstop

---

### TC-010: 静的 step からの resume は従来通り動作する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: existing resume behaviors are unaffected > Scenario: static step resume unchanged

---

### TC-011: 未知の `--from` 値はエラーになる

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: existing resume behaviors are unaffected > Scenario: unknown --from still throws

---

### TC-012: buildAllowedStepSet は既存の member 名と regression-gate を維持する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `buildAllowedStepSet([{ name: "security" }])` を呼ぶ
**WHEN** 返り値のセットを確認する
**THEN** `"security"` と `"regression-gate"` がセットに含まれる（coordinator 追加による既存エントリの欠落なし）

---

### TC-013: stateStep フォールバック（hard-crash）はマッピング対象外

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 (stateStep 分岐はマッピング対象外とする)

**GIVEN** `resumePoint` が `null` かつ `--from` 未指定、`stateStep = "cross-boundary-invariants"` で、reviewers に同名 member が存在する
**WHEN** `resolveResumeStep(undefined, null, "cross-boundary-invariants", allowedSteps, reviewers)` を呼ぶ
**THEN** `"cross-boundary-invariants"` がそのまま返る（stateStep 経路はマッピングしない）

---

### TC-014: typecheck が green かつ resume.ts の変更が 1 行のみ

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** T-02 / T-03 の実装が完了している
**WHEN** `bun run typecheck` を実行し、`resume.ts` の差分行数を確認する
**THEN** typecheck エラーが 0 件、`resume.ts` の変更は引数追加の 1 行のみ

---

### TC-015: signal-state.ts モジュールの初期値・フラグ操作・リセット

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** `signal-state.ts` モジュールを新規インポートした直後（または `resetSignalHandlerFiredForTest()` 呼び出し後）
**WHEN** `isSignalHandlerFired()` を呼ぶ
**THEN** `false` を返す

**GIVEN** `markSignalHandlerFired()` を呼んだ後
**WHEN** `isSignalHandlerFired()` を呼ぶ
**THEN** `true` を返す

**GIVEN** `markSignalHandlerFired()` 後に `resetSignalHandlerFiredForTest()` を呼ぶ
**WHEN** `isSignalHandlerFired()` を呼ぶ
**THEN** 再び `false` を返す

---

### TC-016: signalCleanup は最初の await より前に markSignalHandlerFired() を呼ぶ

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** `signalCleanup` が呼ばれる前は `isSignalHandlerFired()` が `false`
**WHEN** `signalCleanup` を起動し、内部の最初の `await` に到達する前に `isSignalHandlerFired()` を確認する
**THEN** 非同期処理の開始前時点ですでに `true` になっている

---

### TC-017: 3 つの exit-guard ハンドラそれぞれで signal フラグが true のときスキップする

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** `markSignalHandlerFired()` を呼んだ後
**WHEN** `handleNoWorktreeExit`、`handlePerJobExit`、`handleGlobalExit` をそれぞれ個別に実行する
**THEN** どのハンドラも `appendInterruption` を呼ばず、`store.persist` も呼ばない（各ハンドラ独立して検証）

---

### TC-018: signal フラグが true のとき state.status は running のまま persist されない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06 / T-08 Acceptance Criteria

**GIVEN** `state.status = "running"` のジョブが存在し、`markSignalHandlerFired()` が呼ばれた後に exit-guard が発火する
**WHEN** `handlePerJobExit`（または `handleGlobalExit`）を実行する
**THEN** ジョブの `state.status` が `running` のままで `awaiting-resume` に遷移しない。`events.jsonl` に新しい行が追加されていない

---

### TC-019: pipeline 統合 — approved 済み member は selectPendingMembers の結果に含まれない

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-09 Acceptance Criteria

**GIVEN** job 8d5f9b5c 相当の state: `resumePoint.step = "cross-boundary-invariants"`, `reviewers = [{ name: "cross-boundary-invariants" }]`, reviewerStatuses に同 member が `approved` として記録されている
**WHEN** `buildAllowedStepSet(reviewers)` → `resolveResumeStep(...)` → `selectPendingMembers(reviewerStatuses, reviewers)` を順に呼ぶ
**THEN** `resolveResumeStep` は `"custom-reviewers"` を返す。`selectPendingMembers` の結果が `[]` であり、approved 済み member は再実行対象に含まれない

---

## Result

```yaml
result: completed
total: 19
automated: 18
manual: 1
must: 9
should: 9
could: 1
blocked_reasons: []
```
