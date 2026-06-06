# Test Cases: archive 後に managed marker が残り幽霊 job が表示される

## Summary

- **Total**: 6 cases
- **Automated** (unit/integration): 5
- **Manual**: 1
- **Priority**: must: 3, should: 3, could: 0

---

### TC-001: managed job を archive すると marker.json が削除される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: archive SHALL delete marker.json on success > Scenario: managed job を archive すると marker.json が削除される

---

### TC-002: local job を archive すると liveness.json が削除される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: archive SHALL delete liveness.json on success > Scenario: local job を archive すると liveness.json が削除される

---

### TC-003: marker.json が存在しない場合も archive は成功する

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: deletion failure SHALL NOT fail the archive > Scenario: marker.json が存在しない場合も archive は成功する

---

### TC-004: liveness.json の unlink が ENOENT 以外のエラーで失敗しても archive は成功する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: deletion failure SHALL NOT fail the archive > Scenario: liveness.json の unlink が失敗した場合も archive は成功する

---

### TC-005: marker.json の unlink が ENOENT 以外のエラーで失敗しても archive は成功する

**Category**: unit
**Priority**: should
**Source**: design.md > Decisions > D1

**GIVEN** `fs.unlink` が ENOENT 以外のエラー（例: EACCES）をスローするようにモックされた状態で、managed marker パスが存在する
**WHEN** `archive/orchestrator.ts` が Phase 2 完了後に marker.json の unlink を試みる
**THEN** archive は exitCode 0 で完了し、catch ブロックがエラーを飲み込んで上位に伝播しない

---

### TC-006: typecheck および test suite が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-03 > Acceptance Criteria

**GIVEN** 変更後のソースコード一式
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 型エラーなし、テスト全件パスで終了する

---

## Result

```yaml
result: completed
total: 6
automated: 5
manual: 1
must: 3
should: 3
could: 0
blocked_reasons: []
```
