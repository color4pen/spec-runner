# Test Cases: readme-resume-command-fix

## Summary

- **Total**: 8 cases
- **Automated** (unit/integration): 3
- **Manual**: 5
- **Priority**: must: 6, should: 2, could: 0

---

### TC-001: 修正後の README は bare な resume コマンド表記を含まない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: README は resume コマンドを `specrunner job resume` としてのみ参照しなければならない > Scenario: 修正後の README は bare な resume コマンド表記を含まない

---

### TC-002: 誤った top-level resume 表記が再混入すると検知される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: README は resume コマンドを `specrunner job resume` としてのみ参照しなければならない > Scenario: 誤った top-level resume 表記が再混入すると検知される

---

### TC-003: README:411 が `specrunner job resume` に置換されている

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `README.md:411` の修正が適用されている
**WHEN** 当該行を目視確認する
**THEN** `If \`specrunner run\` or \`specrunner job resume\` exits unexpectedly without error output:` となっており、`specrunner resume`（`job` なし）が存在しない

---

### TC-004: README:418 が `<slug>` 引数を保ったまま `specrunner job resume <slug>` になっている

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `README.md:418` の修正が適用されている
**WHEN** 当該行を目視確認する
**THEN** `Run \`specrunner job resume <slug>\` to continue.` となっており、`<slug>` 引数が保持されている

---

### TC-005: `awaiting-resume` 状態名が変更されていない

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** README.md の Troubleshooting「Silent exit」節に `awaiting-resume` という状態名が存在する
**WHEN** T-01 の修正後に当該箇所を確認する
**THEN** `awaiting-resume` の表記はそのまま残っており、変更されていない

---

### TC-006: `specrunner run` 表記が変更されていない

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** README.md の Troubleshooting「Silent exit」節に `specrunner run` という表記が存在する
**WHEN** T-01 の修正後に当該箇所を確認する
**THEN** `specrunner run` の表記はそのまま残っており、変更されていない

---

### TC-007: drift-guard テストが `specrunner job resume` を誤検知しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `tests/unit/docs/readme-resume-command.test.ts` が追加され、README.md に `specrunner job resume` のみ存在する
**WHEN** テストを実行する
**THEN** テストは pass する（`specrunner job resume` は bare `specrunner resume` の部分文字列でないため誤検知しない）

---

### TC-008: `typecheck && test` が全件 green で完了する

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** T-01 の README 修正と T-02 の新規テストが適用されている
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** exit 0 で完了し、既存テストに regression がなく T-02 の新規テストも pass する

---

## Result

```yaml
result: completed
total: 8
automated: 3
manual: 5
must: 6
should: 2
could: 0
blocked_reasons: []
```
