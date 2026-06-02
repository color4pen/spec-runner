# Test Cases: must TC の test に実質的な assertion を要求する faithfulness gate

## Summary

- **Total**: 11 cases
- **Automated** (unit/integration): 11
- **Manual**: 0
- **Priority**: must: 6, should: 5, could: 0

---

### TC-001: must TC 全網羅かつ assertion あり → passed

**Category**: unit
**Priority**: must
**Source**: specs/verification-runner/spec.md > Requirement: test-coverage phase は test-cases.md の must TC ID を tests/ 配下から grep で検証する > Scenario: must TC 全網羅かつ assertion あり

---

### TC-002: must TC 部分欠損 → failed with missingTcIds

**Category**: unit
**Priority**: must
**Source**: specs/verification-runner/spec.md > Requirement: test-coverage phase は test-cases.md の must TC ID を tests/ 配下から grep で検証する > Scenario: must TC 部分欠損

---

### TC-003: TC-ID は出現するが assertion が無い（空 stub）→ failed with assertionlessTcIds

**Category**: unit
**Priority**: must
**Source**: specs/verification-runner/spec.md > Requirement: test-coverage phase は test-cases.md の must TC ID を tests/ 配下から grep で検証する > Scenario: TC ID は出現するが assertion が無い（空 stub）

---

### TC-004: must TC 0 件 → passed

**Category**: unit
**Priority**: must
**Source**: specs/verification-runner/spec.md > Requirement: test-coverage phase は test-cases.md の must TC ID を tests/ 配下から grep で検証する > Scenario: must TC 0 件

---

### TC-005: missing と assertionless が混在 → 両方報告、status failed

**Category**: unit
**Priority**: must
**Source**: specs/verification-runner/spec.md > Requirement: test-coverage phase は test-cases.md の must TC ID を tests/ 配下から grep で検証する > Scenario: missing と assertionless が混在

---

### TC-006: TestCoverageResult 型に assertionlessTcIds フィールドが存在する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `src/core/verification/test-coverage.ts` の `TestCoverageResult` interface
**WHEN** TypeScript の型チェックを実行する
**THEN** `assertionlessTcIds: string[]` フィールドが存在し、`bun run typecheck` が exit 0 で完了する

---

### TC-007: TC-ID が複数ファイルに出現し、うち 1 ファイルに assertion がある場合は assertionless ではない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 / T-06

**GIVEN** test-cases.md に must TC-001 があり、tests/ 配下の file-a.ts に `TC-001` と `expect(` が存在し、file-b.ts に `TC-001` のみ（assertion 無し）が存在する
**WHEN** `runTestCoveragePhase(slug, cwd)` を呼ぶ
**THEN** `assertionlessTcIds` は空配列であり、`status` は `"passed"`

---

### TC-008: `assert(` パターンで assertion を検出する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06 / design.md > D2

**GIVEN** test-cases.md に must TC-001 があり、tests/ 配下のファイルに `TC-001` と `assert(actual, "message")` が存在する（`expect(` は存在しない）
**WHEN** `runTestCoveragePhase(slug, cwd)` を呼ぶ
**THEN** `assertionlessTcIds` は空配列であり、`status` は `"passed"`

---

### TC-009: `assert.` パターンで assertion を検出する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06 / design.md > D2

**GIVEN** test-cases.md に must TC-001 があり、tests/ 配下のファイルに `TC-001` と `assert.strictEqual(a, b)` が存在する（`expect(` / `assert(` は存在しない）
**WHEN** `runTestCoveragePhase(slug, cwd)` を呼ぶ
**THEN** `assertionlessTcIds` は空配列であり、`status` は `"passed"`

---

### TC-010: test-cases.md が存在しない場合は従来通り skipped / passed

**Category**: unit
**Priority**: should
**Source**: request.md > 受け入れ基準

**GIVEN** `specrunner/changes/<slug>/test-cases.md` が存在しない
**WHEN** `runTestCoveragePhase(slug, cwd)` を呼ぶ
**THEN** `status` は `"skipped"` または `"passed"` であり、`assertionlessTcIds` は空配列

---

### TC-011: assertion 欠如 TC がある場合、stdout に `Assertionless:` 行が含まれる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** test-cases.md に must TC-001 があり、tests/ 配下に `TC-001` を含む assertion 無しのファイルが存在する（missing TC は無い）
**WHEN** `runTestCoveragePhase(slug, cwd)` を呼ぶ
**THEN** `stdout` に `Assertionless: TC-001` を含む行が存在し、`Missing:` 行は存在しない（または空）

---

## Result

```yaml
result: completed
total: 11
automated: 11
manual: 0
must: 6
should: 5
could: 0
blocked_reasons: []
```
