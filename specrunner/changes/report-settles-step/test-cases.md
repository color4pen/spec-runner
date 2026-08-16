# Test Cases: agent step の完了契機を report 受領主・プロセス終了 fallback の二重系にする

## Summary

- **Total**: 9 cases
- **Automated** (unit/integration): 8
- **Manual**: 0
- **Priority**: must: 9, should: 0, could: 0

---

### TC-001: ok:true 受領後に generator が閉じない → grace 経過で success settle

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: report 受領が step 完了の主契機になる > Scenario: ok:true 受領後に generator が閉じない → grace 経過で success settle

---

### TC-002: ok:false 受領後に generator が閉じない → grace 経過で success settle

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: report 受領が step 完了の主契機になる > Scenario: ok:false 受領後に generator が閉じない → grace 経過で success settle

---

### TC-003: 受領後 grace 内に自然終了 → 最終 result から modelUsage 回収

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: grace 内に generator が自然終了した場合は usage を従来どおり回収する > Scenario: 受領後 grace 内に自然終了 → 最終 result から modelUsage 回収

---

### TC-004: grace 後 abort 経路で postWork prompts が resume で走る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: sessionId を最終 result より前に確保し grace 後 abort でも postWork を resume する > Scenario: grace 後 abort 経路で postWork prompts が resume で走る

---

### TC-005: report 受領後に hard abort が発火しても report を保全する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: abort catch 経路は受領済み report を破棄しない > Scenario: report 受領後に hard abort が発火しても report を保全する

---

### TC-006: report 不在で watchdog 発火 → 従来どおり STEP_TIMEOUT halt

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: report 不在時の fallback 挙動は不変である > Scenario: report 不在で watchdog 発火 → 従来どおり STEP_TIMEOUT halt

---

### TC-007: report 不在で generator が終了 → report retry 経路が不変

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: report 不在時の fallback 挙動は不変である > Scenario: report 不在で generator が終了 → report retry 経路が不変

---

### TC-008: REPORT_SETTLE_GRACE_MS 定数が 60_000 で export される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `src/adapter/claude-code/agent-runner.ts` が import される
**WHEN** named export `REPORT_SETTLE_GRACE_MS` を参照する
**THEN** 値が `60_000`（60 秒）であり、型が `number` である

---

### TC-009: typecheck && test 全体が green（既存テスト無改変含む）

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-06 / request.md > 受け入れ基準

verification step: `typecheck && test` を実行し全体が green であること。特に `agent-runner-timeout-last-tool.test.ts` が無改変で pass すること（report 不在の watchdog 経路が従来どおりであることの機械的担保）。

---

## Result

```yaml
result: completed
total: 9
automated: 8
manual: 0
must: 9
should: 0
could: 0
blocked_reasons: []
```
