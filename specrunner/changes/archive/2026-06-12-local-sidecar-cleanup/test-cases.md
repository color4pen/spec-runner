# Test Cases:

## Summary

- **Total**: 11 cases
- **Automated** (unit/integration): 11
- **Manual**: 0
- **Priority**: must: 7, should: 4, could: 0

---

### TC-001: archive 後に sidecar ディレクトリが存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: archive 完了時に sidecar ディレクトリを削除する > Scenario: archive 後にディレクトリが存在しない

---

### TC-002: sidecar ディレクトリ削除の失敗が archive を失敗させない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: archive 完了時に sidecar ディレクトリを削除する > Scenario: sidecar ディレクトリ削除の失敗が archive を失敗させない

---

### TC-003: orphan なし — pass

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor が orphan sidecar を検出・列挙する > Scenario: orphan なし — pass

---

### TC-004: orphan あり — warn

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor が orphan sidecar を検出・列挙する > Scenario: orphan あり — warn

---

### TC-005: active job の sidecar は orphan とみなさない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor が orphan sidecar を検出・列挙する > Scenario: active job の sidecar は orphan とみなさない

---

### TC-006: doctor check が fs.rm / fs.unlink を呼ばない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor check は read-only — sidecar を削除しない > Scenario: doctor check が fs.rm / fs.unlink を呼ばない

---

### TC-007: fs.rm が recursive: true, force: true で呼ばれる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 > T-sidecar-01

**GIVEN** archive 対象の slug に `.specrunner/local/<slug>/` が存在する  
**WHEN** `runArchiveOrchestrator` が実行される  
**THEN** `fs.rm` が `nodePath.join(cwd, localSidecarDir(slug))` と `{ recursive: true, force: true }` を引数に呼ばれる

---

### TC-008: 複数 orphan の warn に件数と rm コマンドが含まれる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 > W-03

**GIVEN** `.specrunner/local/` に archived / 不存在 job の sidecar が複数存在する  
**WHEN** orphan-sidecars チェックを実行する  
**THEN** status が "warn"、message に件数、hint に全パスを対象にした `rm -rf` コマンドを含む

---

### TC-009: worktreePath 経由で running を検出したら orphan とみなさない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 > WT-01 / design.md > D2

**GIVEN** `liveness.json` に `worktreePath` があり、main checkout の state.json が存在しないが worktree 内の state.json の status が "running"  
**WHEN** orphan-sidecars チェックを実行する  
**THEN** その sidecar は orphan リストに含まれない

---

### TC-010: JSON 破損の sidecar はスキップされ orphan とみなさない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 > step 4 / design.md > D2

**GIVEN** `.specrunner/local/<slug>/` が存在するが、state.json が JSON 破損している  
**WHEN** orphan-sidecars チェックを実行する  
**THEN** その sidecar は orphan リストに含まれない（false positive 回避優先）

---

### TC-011: orphanSidecarsCheck が commonChecks に登録されている

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** doctor の checks index が読み込まれている  
**WHEN** `commonChecks` の内容を確認する  
**THEN** `orphanSidecarsCheck`（name: "orphan-sidecars"）がリストに含まれる

---

## Result

```yaml
result: completed
total: 11
automated: 11
manual: 0
must: 7
should: 4
could: 0
blocked_reasons: []
```
