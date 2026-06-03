# Test Cases: remove-baseline-corpus

## Summary

- **Total**: 13 cases
- **Automated** (unit/integration): 13
- **Manual**: 0
- **Priority**: must: 12, should: 1, could: 0

---

### TC-001: DynamicContext に specIndex フィールドが存在しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: DynamicContext SHALL NOT contain baseline spec index > Scenario: DynamicContext has no specIndex field

---

### TC-002: specrunner/specs/ パスを含む staged ファイルがあっても commit-push が警告しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: commit-push SHALL NOT detect authority spec violations > Scenario: staged files include a path under specrunner/specs/

---

### TC-003: rules.md の内容に baseline 参照が存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Agent prompts SHALL NOT reference baseline corpus > Scenario: rules.md content has no baseline references

---

### TC-004: src/ 内の baseline シンボル grep がゼロマッチ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: No source references to removed baseline paths > Scenario: grep for baseline symbols returns no matches

---

### TC-005: specrunner/specs/ ディレクトリが存在しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** 変更が適用されたリポジトリ
**WHEN** `specrunner/specs/` のパスに対してファイルシステムを参照する
**THEN** ディレクトリが存在しない（ls / stat が non-zero を返す）

---

### TC-006: src/ 内に baseline path helper への参照がない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** 変更が適用された `src/` ディレクトリ
**WHEN** `src/` 以下の `.ts` ファイル全体を `baselineSpecPath`・`specsDirRel`・`SPECS_DIR` で検索する
**THEN** マッチ件数がゼロ

---

### TC-007: src/ 内に specIndex 関連シンボルへの参照がない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** 変更が適用された `src/` ディレクトリ
**WHEN** `src/` 以下の `.ts` ファイル全体を `specIndex`・`SpecIndexEntry`・`collectSpecIndex` で検索する
**THEN** マッチ件数がゼロ

---

### TC-008: design-system.ts に specIndex / specrunner/specs/ 参照がない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** 変更が適用された `src/prompts/design-system.ts`
**WHEN** ファイルを `specIndex` および `specrunner/specs/` で検索する
**THEN** 両パターンともマッチ件数がゼロ

---

### TC-009: commit-push.ts に baseline 編集検出コードがない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** 変更が適用された `src/core/step/commit-push.ts`
**WHEN** ファイルを `findAuthoritySpecViolations`・`AUTHORITY_SPEC_PREFIX`・`specrunner/specs/` で検索する
**THEN** 全パターンでマッチ件数がゼロ

---

### TC-010: 各 prompt ファイルに baseline read-only / 直接編集禁止 guidance がない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06

**GIVEN** 変更が適用された `src/prompts/code-fixer-system.ts`・`request-generate-system.ts`・`request-review-system.ts` および `src/core/command/request.ts`
**WHEN** 各ファイルを `specrunner/specs/`・`authority spec`・`authority path` で検索する
**THEN** 全ファイルでマッチ件数がゼロ

---

### TC-011: tests/ 内に specIndex / SpecIndexEntry への参照がない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** 変更が適用された `tests/` ディレクトリ
**WHEN** `tests/` 以下の `.ts` ファイル全体を `specIndex`・`SpecIndexEntry` で検索する
**THEN** マッチ件数がゼロ

---

### TC-012: bun run typecheck が green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-07 / request.md 受け入れ基準

**GIVEN** 変更が適用されたリポジトリ
**WHEN** `bun run typecheck` を実行する
**THEN** exit code が 0（型エラーなし）

---

### TC-013: bun run test が green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-07 / request.md 受け入れ基準

**GIVEN** 変更が適用されたリポジトリ
**WHEN** `bun run test` を実行する
**THEN** exit code が 0（全テストがパス）

---

## Result

```yaml
result: completed
total: 13
automated: 13
manual: 0
must: 12
should: 1
could: 0
blocked_reasons: []
```
