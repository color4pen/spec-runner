# Test Cases: agent step の完了契機を report 受領主・プロセス終了 fallback の二重系にする

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual | gate
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>
  gate TC:
    GWT は記述しない。充足を担う verification phase 名（または verification.commands の command 名）を本文に記録する。

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  所有権と書込時点: Result YAML は test-case-gen によるテストケース生成の結果記録である。
  生成時に一度だけ書かれ、後続ステップは更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 7 cases
- **Automated** (unit/integration): 7
- **Manual**: 0
- **Priority**: must: 7, should: 0, could: 0

---

### TC-001: ok:true 受領後 grace 経過で success settle

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: report 受領が step 完了の主契機になる > Scenario: ok:true 受領後に generator が閉じない → grace 経過で success settle

---

### TC-002: ok:false 受領後 grace 経過で success settle

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: report 受領が step 完了の主契機になる > Scenario: ok:false 受領後に generator が閉じない → grace 経過で success settle

---

### TC-003: grace 内自然終了 → 最終 result から modelUsage 回収

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: grace 内に generator が自然終了した場合は usage を従来どおり回収する > Scenario: 受領後 grace 内に自然終了 → 最終 result から modelUsage 回収

---

### TC-004: grace 後 abort 経路で postWork prompts が resume で走る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: sessionId を最終 result より前に確保し grace 後 abort でも postWork を resume する > Scenario: grace 後 abort 経路で postWork prompts が resume で走る

---

### TC-005: report 受領後に hard abort が発火しても report を保全する (D5 catch path)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: abort catch 経路は受領済み report を破棄しない > Scenario: report 受領後に hard abort が発火しても report を保全する

**テスト構成 (D5 到達方法)**: `REPORT_SETTLE_GRACE_MS` (60 秒) < `DEFAULT_INACTIVITY_TIMEOUT_MS` (900 秒) のため、fake timer を単純に前進させると D3 grace path (T-04) が先に発火し D5 outer catch に到達しない。D5 catch 経路に到達するには以下のいずれかを使うこと:

- **案 A (推奨)**: `queryFn` 内で report handler を `ok:true` で呼んだ直後、grace timer が完了する前にテスト側から `sharedAbortController.abort()` を直接呼ぶ。shared abort が grace より先に発火し D5 outer catch に落ちる。
- **案 B**: step の wall-clock timeout (step-timeout) を `REPORT_SETTLE_GRACE_MS` 未満に設定し、fake timer を step-timeout 分だけ前進させる。grace より step-timeout が先に発火し D5 catch 経路に到達する。

---

### TC-006: report 不在で watchdog 発火 → STEP_TIMEOUT halt

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: report 不在時の fallback 挙動は不変である > Scenario: report 不在で watchdog 発火 → 従来どおり STEP_TIMEOUT halt

---

### TC-007: report 不在で generator 終了 → report retry 経路不変

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: report 不在時の fallback 挙動は不変である > Scenario: report 不在で generator が終了 → report retry 経路が不変

---

## Result

```yaml
result: completed
total: 7
automated: 7
manual: 0
must: 7
should: 0
could: 0
blocked_reasons: []
```
