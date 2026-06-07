# Test Cases: archive 親ディレクトリの実行時保証

## Summary

- **Total**: 4 cases
- **Automated** (unit/integration): 3
- **Manual**: 1
- **Priority**: must: 3, should: 1, could: 0

---

### TC-001: archive ディレクトリ不在時は作成してから移動が成功する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: archive-change-folder shall ensure the archive parent directory before moving > Scenario: archive ディレクトリ不在時は作成してから移動が成功する

---

### TC-002: archive ディレクトリ既存時は挙動が変わらない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: archive-change-folder shall ensure the archive parent directory before moving > Scenario: archive ディレクトリ既存時は挙動が変わらない

---

### TC-003: change folder 不在時は親ディレクトリを作らずに skip する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: archive-change-folder shall ensure the archive parent directory before moving > Scenario: change folder 不在時は親ディレクトリを作らずに skip する

---

### TC-004: bun run typecheck && bun run test が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-03: 検証

**GIVEN** 実装変更（T-01）および新規テスト（T-02: TC-CF-006）が適用されている
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 型エラーなし・全テスト pass（新規 TC-CF-006 を含む）・既存テストに regression なし

---

## Result

```yaml
result: completed
total: 4
automated: 3
manual: 1
must: 3
should: 1
could: 0
blocked_reasons: []
```
