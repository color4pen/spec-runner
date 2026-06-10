# Test Cases: SECURITY.md を追加する（脆弱性報告窓口の明示）

## Summary

- **Total**: 13 cases
- **Automated** (unit/integration): 11
- **Manual**: 2
- **Priority**: must: 13, should: 0, could: 0

---

### TC-001: SECURITY.md がリポジトリ直下に存在する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: リポジトリ直下に SECURITY.md が存在しなければならない > Scenario: SECURITY.md がリポジトリ直下に存在する

---

### TC-002: 4 つの必須節見出しが存在する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: SECURITY.md は報告方法・対応方針・スコープの節を備えなければならない > Scenario: 4 つの必須節見出しが存在する

---

### TC-003: 報告導線のキーフレーズが存在する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 報告窓口は GitHub Private vulnerability reporting を一次窓口として案内しなければならない > Scenario: 報告導線のキーフレーズが存在する

---

### TC-004: サポート方針が最新 minor に限定されている

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: Supported Versions は 0.x の最新 minor のみを policy として示さなければならない > Scenario: サポート方針が最新 minor に限定されている

---

### TC-005: scope が trust model を参照する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Scope は README の trust model を参照しなければならない > Scenario: scope が trust model を参照する

---

### TC-006: README とソースが不変で品質ゲートが green

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: 本変更は README を変更してはならず品質ゲートを green に保たなければならない > Scenario: README とソースが不変で品質ゲートが green

---

### TC-007: drift-guard テストが SECURITY.md 削除で落ちる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `tests/unit/docs/security-policy.test.ts` が存在し `bun run test` が green である  
**WHEN** `SECURITY.md` を削除した状態で `bun run test` を実行する  
**THEN** `security-policy.test.ts` のテストが fail する

---

### TC-008: drift-guard テストが必須見出し欠落で落ちる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** SECURITY.md に 4 つの必須節見出しが存在し `bun run test` が green である  
**WHEN** いずれか 1 つの見出し（例: `## Scope`）を削除した状態で `bun run test` を実行する  
**THEN** `security-policy.test.ts` のテストが fail する

---

### TC-009: drift-guard テストが `Report a vulnerability` 欠落で落ちる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** SECURITY.md に `Report a vulnerability` が存在し `bun run test` が green である  
**WHEN** 該当フレーズを削除した状態で `bun run test` を実行する  
**THEN** `security-policy.test.ts` のテストが fail する

---

### TC-010: drift-guard テストが `trust model` 欠落で落ちる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** SECURITY.md に `trust model`（case-insensitive）が存在し `bun run test` が green である  
**WHEN** 該当フレーズを削除した状態で `bun run test` を実行する  
**THEN** `security-policy.test.ts` のテストが fail する

---

### TC-011: lint ゲートが drift-guard テストファイルで warning/error を出さない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `tests/unit/docs/security-policy.test.ts` が追加されている  
**WHEN** `bun run lint`（`eslint ./src ./tests --max-warnings 0`）を実行する  
**THEN** `security-policy.test.ts` に関する warning / error が 0 件である

---

### TC-012: SECURITY.md にバグバウンティ・報奨金への言及がない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** SECURITY.md の本文  
**WHEN** "bounty" / "reward" / "monetary" 等の文字列を検索する  
**THEN** 該当する記述が存在しない

---

### TC-013: Supported Versions が特定 patch バージョンを pin していない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria / design.md > D4

**GIVEN** `## Supported Versions` 節の本文  
**WHEN** `0.2.0` や `0.[0-9]+\.[0-9]+` 形式の特定 patch バージョン文字列を検索する  
**THEN** 特定 patch バージョンの記述が存在しない

---

## Result

```yaml
result: completed
total: 13
automated: 11
manual: 2
must: 13
should: 0
could: 0
blocked_reasons: []
```
