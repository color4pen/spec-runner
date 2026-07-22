# Test Cases: round-operational-gaps

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```
-->

## Summary

- **Total**: 9 cases
- **Automated** (unit/integration): 3
- **Manual**: 6
- **Priority**: must: 5, should: 4, could: 0

---

### TC-001: pr-create-result.md のみが dirty な round で offending が空になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: pipelineManagedPaths は prCreateResultPath を含む > Scenario: pr-create-result.md のみが dirty な round で offending が空になる

---

### TC-002: pipelineManagedPaths が pr-create-result.md を含む（長さ 5）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: pipelineManagedPaths は prCreateResultPath を含む > Scenario: pipelineManagedPaths が pr-create-result.md を含む

---

### TC-003: runtime 専変更で cross-boundary-invariants が skip しない

**Category**: manual
**Priority**: should
**Source**: spec.md > Requirement: cross-boundary-invariants は runtime/verification 変更で起動する > Scenario: runtime 専変更で cross-boundary-invariants が skip しない

---

### TC-004: verification 専変更で cross-boundary-invariants が skip しない

**Category**: manual
**Priority**: should
**Source**: spec.md > Requirement: cross-boundary-invariants は runtime/verification 変更で起動する > Scenario: verification 専変更で cross-boundary-invariants が skip しない

---

### TC-005: 既存 5 glob が保存されている

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: cross-boundary-invariants は runtime/verification 変更で起動する > Scenario: 既存 5 glob が保存されている

---

### TC-006: cross-boundary-invariants.md frontmatter paths の総数が 7

**Category**: manual
**Priority**: must
**Source**: tasks.md T-04

**GIVEN** 修正後の `specrunner/reviewers/cross-boundary-invariants.md`  
**WHEN** frontmatter `paths` リストを読む  
**THEN** paths の要素数が 7 である（既存 5 + `src/core/runtime/**` + `src/core/verification/**`）

---

### TC-007: cross-boundary-invariants.md 本文（## 目的以降）が無改変

**Category**: manual
**Priority**: should
**Source**: tasks.md T-04

**GIVEN** 修正後の `specrunner/reviewers/cross-boundary-invariants.md`  
**WHEN** `## 目的` 以降のテキストを main ブランチの同ファイルと比較する  
**THEN** 本文テキストに一切の差分がない（frontmatter のみが変更されている）

---

### TC-008: typecheck && test が green（既存テスト無改変含む）

**Category**: unit
**Priority**: must
**Source**: tasks.md T-05

**GIVEN** T-01〜T-04 の修正が適用されたリポジトリ  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN** 両コマンドとも exit 0 で完了し、round-git-scope の既存テスト（bite-evidence / state.json / events.jsonl / usage.json）を含む全テストが pass する

---

### TC-009: 破壊確認コメントが test ファイルに明示されている

**Category**: manual
**Priority**: should
**Source**: tasks.md T-03

**GIVEN** 修正後の `src/core/pipeline/__tests__/round-git-scope.test.ts`  
**WHEN** `pipelineManagedPaths` describe ブロック内のコメントを確認する  
**THEN** 「prCreateResultPath を pipelineManagedPaths から除去すると該当テストが fail する」旨の destruction confirmation コメントが存在する

---

## Result

```yaml
result: completed
total: 9
automated: 3
manual: 6
must: 5
should: 4
could: 0
blocked_reasons: []
```
