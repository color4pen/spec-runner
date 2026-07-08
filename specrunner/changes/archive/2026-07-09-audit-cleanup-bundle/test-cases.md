# Test Cases: audit-cleanup-bundle

## Summary

- **Total**: 12 cases
- **Automated** (unit/integration): 8
- **Manual**: 4
- **Priority**: must: 10, should: 2, could: 0

---

### TC-001: root が cwd と異なる monorepo で coverage command が実行できる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: coverage gate の coverage command は verification.commands と同じ実行環境で実行される > Scenario: root が cwd と異なる monorepo で coverage command が実行できる

---

### TC-002: 1/3 実行で閾値 0.8 → below-threshold

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: minChangedLineCoverage 未達と全行未実行は reason とメッセージで区別される > Scenario: 1/3 実行で閾値 0.8 → below-threshold

---

### TC-003: 0/2 実行で threshold 未設定 → unexecuted（既存挙動維持）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: minChangedLineCoverage 未達と全行未実行は reason とメッセージで区別される > Scenario: 0/2 実行で threshold 未設定 → unexecuted（既存挙動維持）

---

### TC-004: ADR の例 config をそのままコピーしても validation が通る

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: ADR の minChangedLineCoverage 例 config は schema の制約（gt(0), lte(1)）に適合する > Scenario: ADR の例 config をそのままコピーしても validation が通る

---

### TC-005: project-local config が malformed → hint が project-local パスを案内する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor の config loadError hint は実際に失敗したファイルを案内する > Scenario: project-local config が malformed → hint が project-local パスを案内する

---

### TC-006: user-global config が malformed → hint が user-global パスを案内する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: doctor の config loadError hint は実際に失敗したファイルを案内する > Scenario: user-global config が malformed → hint が user-global パスを案内する（既存挙動維持）

---

### TC-007: T-PMI-01 が実装出力を検証する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: TC-032 と T-PMI-01 は実装の観測可能な挙動を assert するか、削除されて理由が記録されている > Scenario: T-PMI-01 が実装出力を検証する

---

### TC-008: runner.ts の 2 箇所が root を runChangedLineCoverageGate に渡す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `runner.ts` の `runVerificationCommands`（~line 398）および `runVerification`（~line 598）にある `runChangedLineCoverageGate` の呼び出し箇所
**WHEN** `detectPackageManager` が `root` を返す状況で両関数が実行される
**THEN** 両呼び出しに `root` フィールドが含まれ、`RunGateOptions` として渡されている

---

### TC-009: TC-032 の describe ブロックが ps-filter.test.ts から削除されている

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-05a Acceptance Criteria

**GIVEN** `tests/unit/cli/ps-filter.test.ts` を開く
**WHEN** ファイル内容を確認する
**THEN** TC-032 に対応する `describe` ブロック（元 line 359-393）が存在しない

---

### TC-010: TC-032 削除箇所に ESM intra-module mock の制限を説明するコメントが残っている

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-05a Acceptance Criteria

**GIVEN** `tests/unit/cli/ps-filter.test.ts` を開く
**WHEN** TC-032 があった箇所付近を確認する
**THEN** `vi.mock cannot intercept calls that runPs makes to checkPrMerged within the same module` を含む理由説明コメントが存在する

---

### TC-011: ADR D10 の説明文が ">0" の制約を明示している

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** `specrunner/adr/2026-07-08-lcov-changed-line-gate.md` を開く
**WHEN** D10 セクションの `minChangedLineCoverage` の説明文を確認する
**THEN** 説明文に `>0` または `0 より大きく` に相当する制約（0 を拒否することを示す表現）が含まれており、例示値として `0` が使われていない

---

### TC-012: typecheck && test が green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-01/T-02/T-04/T-05 Acceptance Criteria（全タスク共通の受け入れ基準）

**GIVEN** 全 5 件の修正が適用された状態のコードベース
**WHEN** `typecheck && test` を実行する
**THEN** TypeScript 型エラーがなく、すべてのテストが pass する（要件 5 の修正対象 2 テストを含む）

---

## Result

```yaml
result: completed
total: 12
automated: 8
manual: 4
must: 10
should: 2
could: 0
blocked_reasons: []
```
