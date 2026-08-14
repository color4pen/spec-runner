# Test Cases: テスト証拠と工程順序の分離(第1弾)

## Summary

- **Total**: 10 cases
- **Automated** (unit/integration): 9
- **Manual**: 0
- **Priority**: must: 9, should: 1, could: 0

---

### TC-001: red 強制の命令が prompt から消える

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-materialize prompt は red 観測の強制を課さず実行と観測記録のみを義務化する > Scenario: red 強制の命令が prompt から消える

---

### TC-002: 実行義務と観測記録要求は残る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-materialize prompt は red 観測の強制を課さず実行と観測記録のみを義務化する > Scenario: 実行義務と観測記録要求は残る

---

### TC-003: 初回 message が red 確認を課さない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-materialize prompt は red 観測の強制を課さず実行と観測記録のみを義務化する > Scenario: 初回 message が red 確認を課さない

---

### TC-004: green 観測時の指示が理由の記録である

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: expected-red が green だった場合は書き直しでなく理由の記録を指示する > Scenario: green 観測時の指示が理由の記録である

---

### TC-005: materialize 済みでテスト変更禁止が消える

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: implementer は materialize 済みテスト存在時に canon 整合を指示しテスト変更を禁止しない > Scenario: materialize 済みでテスト変更禁止が消える

---

### TC-006: fast pipeline の TDD message は無変更

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: implementer は materialize 済みテスト存在時に canon 整合を指示しテスト変更を禁止しない > Scenario: fast pipeline の TDD message は無変更

---

### TC-007: 再走で base に実装が混入したとき deferral になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: bite-evidence は base に過去の implementer commit が混入した場合 fail でなく理由付き deferral を返す > Scenario: 再走で base に実装が混入したとき deferral になる

---

### TC-008: 初回一巡での base-green は従来どおり failed のまま

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: bite-evidence は base に過去の implementer commit が混入した場合 fail でなく理由付き deferral を返す > Scenario: 初回一巡での base-green は従来どおり failed のまま

---

### TC-009: implementer true 分岐に lockfile 同期・tasks.md checkbox・end_turn 手順が残る

**Category**: unit
**Priority**: should
**Source**: design.md D2 / tasks.md T-03

**GIVEN** `buildImplementerInitialMessage({ testsMaterialized: true })` が生成した message を取得する
**WHEN** message の内容を検査する
**THEN** lockfile 同期指示(依存追加・変更時の lockfile sync)・tasks.md checkbox 更新指示・end_turn 使用指示がそれぞれ含まれる

---

### TC-010: typecheck && test が green

**Category**: gate
**Priority**: must
**Source**: tasks.md T-07

verification phase: `bun run typecheck && bun run test` — 全テスト(更新済み既存テスト・新規テスト・列挙外の既存テストを含む)が green で typecheck エラーが 0 件。

## Result

```yaml
result: completed
total: 10
automated: 9
manual: 0
must: 9
should: 1
could: 0
blocked_reasons: []
```
