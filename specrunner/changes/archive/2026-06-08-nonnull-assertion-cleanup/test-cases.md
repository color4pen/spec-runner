# Test Cases: managed-agent adapter の非 null アサーションを safe access に置き換える

## Summary

- **Total**: 7 cases
- **Automated** (unit/integration): 5
- **Manual**: 2
- **Priority**: must: 6, should: 1, could: 0

---

### TC-001: polling-style step で environment 未設定時に ENVIRONMENT_NOT_SET でthrow する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: managed environment 未設定時はクラッシュではなく明確なエラーで throw する > Scenario: polling-style step で environment 未設定

---

### TC-002: design-style step で environment 未設定時に ENVIRONMENT_NOT_SET でthrow する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: managed environment 未設定時はクラッシュではなく明確なエラーで throw する > Scenario: design-style step で environment 未設定

---

### TC-003: createSession が sessionId を返さない場合に session 未確立エラーで throw する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: session が確立されなかった場合は明確なエラーで throw する > Scenario: createSession が session id を返さない

---

### TC-004: polling-style run で branch が null の場合に BRANCH_NOT_SET で throw する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: branch が null の場合は明確なエラーで throw する > Scenario: polling-style run で branch が null

---

### TC-005: environmentNotSetError factory が正しい code・stepName・remediation を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01

**GIVEN** `environmentNotSetError("design")` を呼び出す
**WHEN** 戻り値を検査する
**THEN** `code === "ENVIRONMENT_NOT_SET"` かつ stepName（`"design"`）と remediation（`"specrunner managed setup"` 相当）を含む `SpecRunnerError` が返る

---

### TC-006: typecheck / test / lint がすべて green である

**Category**: manual
**Priority**: must
**Source**: tasks.md T-05

**GIVEN** 本 change の全変更が適用された状態
**WHEN** `bun run typecheck && bun run test && bun run lint` を実行する
**THEN** すべてが exit 0 で完了し、既存テストに regression がない

---

### TC-007: 変更 scope が managed adapter と errors.ts に閉じている

**Category**: manual
**Priority**: should
**Source**: tasks.md T-05

**GIVEN** 本 change の全変更が適用された状態
**WHEN** git diff で変更ファイル一覧を確認する
**THEN** 変更は `src/adapter/managed-agent/`・`src/errors.ts`・対応するテストファイルのみであり、local runtime（`src/adapter/local/` 等）のコードを含まない

---

## Result

```yaml
result: completed
total: 7
automated: 5
manual: 2
must: 6
should: 1
could: 0
blocked_reasons: []
```
