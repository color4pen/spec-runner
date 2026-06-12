# Test Cases: findingRef 検証の EISDIR 誤判定修正

## Summary

- **Total**: 14 cases
- **Automated** (unit/integration): 14
- **Manual**: 0
- **Priority**: must: 14, should: 0, could: 0

---

## Category: 新規 — local runtime EISDIR 修正

### TC-VFR-L-006: local — 実在ディレクトリ（line なし）→ nonExistent に含まれない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 実在ディレクトリは nonExistent 扱いにならない > Scenario: local runtime — 実在ディレクトリ参照（line なし）

### TC-VFR-L-007: local — 実在ディレクトリ + line → nonExistent に含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: ディレクトリ + line 指定は nonExistent > Scenario: local runtime — 実在ディレクトリ + line

---

## Category: 新規 — managed runtime ディレクトリ検出

### TC-VFR-M-006: managed — getRawFile が JSON 配列を返す（line なし）→ nonExistent に含まれない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 実在ディレクトリは nonExistent 扱いにならない > Scenario: managed runtime — 実在ディレクトリ参照（line なし）

### TC-VFR-M-007: managed — getRawFile が JSON 配列を返す + line → nonExistent に含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: ディレクトリ + line 指定は nonExistent > Scenario: managed runtime — ディレクトリ（JSON 配列）+ line

---

## Category: 退行確認 — local runtime

### TC-VFR-L-001: local — 実在ファイル（line なし）→ nonExistent に含まれない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 > Acceptance Criteria

**GIVEN** tempDir に `src/exists.ts` が存在する
**WHEN** `verifyFindingRefs([{ file: "src/exists.ts" }], tempDir, "main")` を呼ぶ
**THEN** 返却配列は空

### TC-VFR-L-002: local — 存在しないパス → nonExistent に含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 存在しないパスは nonExistent のまま > Scenario: local runtime — 存在しないパス

### TC-VFR-L-003: local — 実在ファイル + line（行数内）→ nonExistent に含まれない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 > Acceptance Criteria

**GIVEN** tempDir に 10 行の `src/ten-lines.ts` が存在する
**WHEN** `verifyFindingRefs([{ file: "src/ten-lines.ts", line: 5 }], tempDir, "main")` を呼ぶ
**THEN** 返却配列は空

### TC-VFR-L-004: local — 実在ファイル + line（行数超過）→ nonExistent に含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: ファイルの行数超過は nonExistent のまま > Scenario: local runtime — 行数超過

### TC-VFR-L-005: local — 空入力 → 空出力

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 > Acceptance Criteria

**GIVEN** FindingRef 配列が空
**WHEN** `verifyFindingRefs([], tempDir, null)` を呼ぶ
**THEN** 返却配列は空

---

## Category: 退行確認 — managed runtime

### TC-VFR-M-001: managed — getRawFile がファイル内容を返す（line なし）→ nonExistent に含まれない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 > Acceptance Criteria

**GIVEN** `getRawFile` が通常のファイル文字列を返す
**WHEN** `verifyFindingRefs([{ file: "src/exists.ts" }], tempDir, "main")` を呼ぶ
**THEN** 返却配列は空、`getRawFile` は正しい引数で呼ばれる

### TC-VFR-M-002: managed — getRawFile が null を返す → nonExistent に含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 存在しないパスは nonExistent のまま > Scenario: managed runtime — getRawFile が null を返す

### TC-VFR-M-003: managed — branch が null → 全 refs が nonExistent

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 > Acceptance Criteria

**GIVEN** `getRawFile` が有効な内容を返す mock が設定されている
**WHEN** `verifyFindingRefs([{ file: "src/a.ts" }, { file: "src/b.ts" }], tempDir, null)` を呼ぶ
**THEN** 返却配列の長さが 2 で、`getRawFile` は呼ばれない

### TC-VFR-M-004: managed — 空入力 → 空出力

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 > Acceptance Criteria

**GIVEN** FindingRef 配列が空
**WHEN** `verifyFindingRefs([], tempDir, "main")` を呼ぶ
**THEN** 返却配列は空

### TC-VFR-M-005: managed — getRawFile がファイル内容を返す + line（行数超過）→ nonExistent に含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: ファイルの行数超過は nonExistent のまま > Scenario: managed runtime — 行数超過

---

## Result

```yaml
result: completed
total: 14
automated: 14
manual: 0
must: 14
should: 0
could: 0
blocked_reasons: []
```
