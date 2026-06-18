# Test Cases: config-write-hygiene

## Summary

- **Total**: 11 cases
- **Automated** (unit/integration): 10
- **Manual**: 1
- **Priority**: must: 6, should: 4, could: 1

---

### TC-001: GHES config survives saveConfig

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: saveConfig shall not strip the github field > Scenario: GHES config survives saveConfig

---

### TC-002: Legacy fields are still stripped

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: saveConfig shall not strip the github field > Scenario: Legacy fields are still stripped

---

### TC-003: First-time init creates global config

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: init shall not overwrite an existing global config > Scenario: First-time init creates global config

---

### TC-004: Repeated init does not overwrite

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: init shall not overwrite an existing global config > Scenario: Repeated init does not overwrite

---

### TC-005: Project scaffold is created regardless

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: init shall not overwrite an existing global config > Scenario: Project scaffold is created regardless

---

### TC-006: login with no existing config creates scaffold

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: login shall not overwrite an existing global config > Scenario: login with no existing config creates scaffold

---

### TC-007: login with existing config preserves it

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: login shall not overwrite an existing global config > Scenario: login with existing config preserves it

---

### TC-008: Stale comment is absent after the change

**Category**: manual
**Priority**: could
**Source**: spec.md > Requirement: login.ts stale comment shall be updated > Scenario: Stale comment is absent after the change

---

### TC-009: login — config 存在時に saveConfig が呼ばれない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 > TC-LOGIN-014

**GIVEN** `fs.access` が config パスで成功する（グローバル config ファイルが存在する）状態
**WHEN** device flow 成功後に `runLogin({})` を実行する
**THEN** `saveConfig` が一度も呼ばれない

---

### TC-010: login — config 非存在時に saveConfig が呼ばれる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 > TC-LOGIN-015

**GIVEN** `fs.access` が config パスで ENOENT を返す（グローバル config ファイルが存在しない）状態で device flow が成功する
**WHEN** `runLogin({})` を実行する
**THEN** `saveConfig` が正確に 1 回呼ばれる

---

### TC-011: managed setup — saveConfig を引き続き使用する（regression）

**Category**: integration
**Priority**: should
**Source**: design.md > Non-Goals

**GIVEN** managed config が未設定の状態
**WHEN** `managed setup` コマンドを実行する
**THEN** `saveConfig` が呼ばれ managed フィールドを含む config が永続化される（本変更による regression なし）

---

## Result

```yaml
result: completed
total: 11
automated: 10
manual: 1
must: 6
should: 4
could: 1
blocked_reasons: []
```
