# Test Cases: abolish-spec-merge

## Summary

- **Total**: 24 cases
- **Automated** (unit/integration): 8
- **Manual**: 16
- **Priority**: must: 20, should: 4, could: 0

---

### TC-001: finish が delta spec を baseline spec に書き込まない

**Category**: integration
**Priority**: must
**Source**: `specs/spec-merge/spec.md` > Requirement: finish SHALL NOT merge delta specs into baseline specs > Scenario: finish completes without modifying baseline specs

---

### TC-002: Phase 1 で staging あり → archive commit が作成される

**Category**: integration
**Priority**: must
**Source**: `specs/cli-finish-command/spec.md` > Requirement: Phase 1 は staging された変更を archive commit として確定する > Scenario: Phase 1 で staging あり → archive commit が作成される

---

### TC-003: Phase 1 で staging なし → commit skip (idempotent)

**Category**: integration
**Priority**: should
**Source**: `specs/cli-finish-command/spec.md` > Requirement: Phase 1 は staging された変更を archive commit として確定する > Scenario: Phase 1 で staging なし → commit skip (idempotent)

---

### TC-004: commit 失敗 → escalation して Phase 2 に進まない

**Category**: integration
**Priority**: must
**Source**: `specs/cli-finish-command/spec.md` > Requirement: Phase 1 は staging された変更を archive commit として確定する > Scenario: commit 失敗 → escalation

---

### TC-005: spec-change で delta spec が無くても finish が escalation せず完了する

**Category**: integration
**Priority**: must
**Source**: `tasks.md` > T-01 Acceptance Criteria / `request.md` 受け入れ基準 2

**GIVEN** `request.md` の type が `spec-change` で、`specs/<capability>/spec.md` が存在しない change  
**WHEN** `job finish <slug>` を実行する  
**THEN** escalation が発生せず、archive・push・PR merge の各フェーズが完了する

---

### TC-006: Phase 1 が usage derive → archive → commit の順で実行される

**Category**: integration
**Priority**: must
**Source**: `tasks.md` > T-01 Acceptance Criteria

**GIVEN** 正常な change（delta spec あり）を対象に  
**WHEN** `job finish <slug>` を実行する  
**THEN** Phase 1 のステップ順が usage derive → archiveChangeFolder → commit となり、spec-merge ステップは含まれない

---

### TC-007: spec-merge.ts が src/ に存在しない

**Category**: manual
**Priority**: must
**Source**: `tasks.md` > T-02 Acceptance Criteria

**GIVEN** リポジトリの `src/` ディレクトリ  
**WHEN** `find src/ -name "spec-merge.ts"` を実行する  
**THEN** 結果が空

---

### TC-008: baseline-headers.ts が src/ に存在しない

**Category**: manual
**Priority**: must
**Source**: `tasks.md` > T-02 Acceptance Criteria

**GIVEN** リポジトリの `src/` ディレクトリ  
**WHEN** `find src/ -name "baseline-headers.ts"` を実行する  
**THEN** 結果が空

---

### TC-009: orchestrator.ts に spec-merge / mergeSpecsForChange の参照が残らない

**Category**: manual
**Priority**: must
**Source**: `tasks.md` > T-01 Acceptance Criteria

**GIVEN** `src/core/finish/orchestrator.ts`  
**WHEN** `grep -n "spec-merge\|mergeSpecsForChange" src/core/finish/orchestrator.ts` を実行する  
**THEN** 結果が空

---

### TC-010: finish-spec-merge.test.ts が削除されている

**Category**: manual
**Priority**: must
**Source**: `tasks.md` > T-03 Acceptance Criteria

**GIVEN** リポジトリの `tests/` ディレクトリ  
**WHEN** `find tests/ -name "finish-spec-merge.test.ts"` を実行する  
**THEN** 結果が空

---

### TC-011: spec-merge-baseline-check.test.ts が削除されている

**Category**: manual
**Priority**: must
**Source**: `tasks.md` > T-03 Acceptance Criteria

**GIVEN** リポジトリの `tests/` ディレクトリ  
**WHEN** `find tests/ -name "spec-merge-baseline-check.test.ts"` を実行する  
**THEN** 結果が空

---

### TC-012: finish-orchestrator.test.ts に spec-merge 参照が残らない

**Category**: manual
**Priority**: must
**Source**: `tasks.md` > T-04 Acceptance Criteria

**GIVEN** `tests/finish-orchestrator.test.ts`  
**WHEN** `grep -n "spec-merge\|mergeSpecsForChange" tests/finish-orchestrator.test.ts` を実行する  
**THEN** 結果が空

---

### TC-013: request-review.test.ts の spec-merge アサーションが削除されている

**Category**: manual
**Priority**: must
**Source**: `tasks.md` > T-04 Acceptance Criteria

**GIVEN** `tests/unit/command/request-review.test.ts`  
**WHEN** `grep -n "spec-merge" tests/unit/command/request-review.test.ts` を実行する  
**THEN** 結果が空

---

### TC-014: spec-fixer-system.ts の Critical ラベルが delta-spec-validation を参照する

**Category**: manual
**Priority**: must
**Source**: `tasks.md` > T-05 Acceptance Criteria

**GIVEN** `src/prompts/spec-fixer-system.ts`  
**WHEN** ファイル内の Critical ラベルを確認する  
**THEN** `spec-merge が parse に依存` の記述が存在せず、`delta-spec-validation が parse に依存` に更新されている

---

### TC-015: code-fixer-system.ts の Critical ラベルが delta-spec-validation を参照する

**Category**: manual
**Priority**: must
**Source**: `tasks.md` > T-05 Acceptance Criteria

**GIVEN** `src/prompts/code-fixer-system.ts`  
**WHEN** ファイル内の Critical ラベルを確認する  
**THEN** `spec-merge が parse に依存` の記述が存在せず、`delta-spec-validation が parse に依存` に更新されている

---

### TC-016: request-review-system.ts から authority spec auto-update by spec-merge の記述が消えている

**Category**: manual
**Priority**: must
**Source**: `tasks.md` > T-05 Acceptance Criteria

**GIVEN** `src/prompts/request-review-system.ts`  
**WHEN** `grep -n "spec-merge" src/prompts/request-review-system.ts` を実行する  
**THEN** 結果が空

---

### TC-017: delta spec フォーマット規約が prompt に維持されている

**Category**: manual
**Priority**: must
**Source**: `design.md` > D3 / `tasks.md` > T-05 Acceptance Criteria

**GIVEN** `src/prompts/spec-fixer-system.ts` および `src/prompts/code-fixer-system.ts`  
**WHEN** フォーマット規約セクションを確認する  
**THEN** `## Removed` リスト形式・`### Requirement:` header 一致等の規約記述が削除されていない

---

### TC-018: rules.ts の spec authority lifecycle 説明が更新されている

**Category**: manual
**Priority**: should
**Source**: `tasks.md` > T-06 Acceptance Criteria

**GIVEN** `src/prompts/rules.ts`  
**WHEN** `grep -n "mergeSpecsForChange\|spec-merge" src/prompts/rules.ts` を実行する  
**THEN** 結果が空

---

### TC-019: README の finish 説明に delta→baseline 反映の記述が無い

**Category**: manual
**Priority**: must
**Source**: `request.md` 受け入れ基準 5

**GIVEN** `README.md` の finish セクション  
**WHEN** `grep -n "spec-merge\|delta.*baseline\|baseline.*delta" README.md` を実行する  
**THEN** finish の説明で delta spec を baseline に反映する旨の記述が存在せず、archive + squash merge のみの説明になっている

---

### TC-020: src/ 内に spec-merge / mergeSpecsForChange / baseline-headers の残置参照がない

**Category**: manual
**Priority**: must
**Source**: `tasks.md` > T-08 Acceptance Criteria

**GIVEN** リポジトリの `src/` ディレクトリ  
**WHEN** `grep -r "spec-merge\|mergeSpecsForChange\|baseline-headers" src/` を実行する  
**THEN** 結果が空

---

### TC-021: commit-archive.ts のコメントに mergeSpecsForChange が残らない

**Category**: manual
**Priority**: should
**Source**: `tasks.md` > T-07 Acceptance Criteria

**GIVEN** `src/core/finish/commit-archive.ts`  
**WHEN** `grep -n "spec-merge\|mergeSpecsForChange" src/core/finish/commit-archive.ts` を実行する  
**THEN** 結果が空

---

### TC-022: no-authority-spec-direct-edit.ts のコメントに spec-merge が残らない

**Category**: manual
**Priority**: should
**Source**: `tasks.md` > T-07 Acceptance Criteria

**GIVEN** `src/core/spec/rules/no-authority-spec-direct-edit.ts`  
**WHEN** `grep -n "spec-merge" src/core/spec/rules/no-authority-spec-direct-edit.ts` を実行する  
**THEN** 結果が空

---

### TC-023: bun run typecheck が green

**Category**: integration
**Priority**: must
**Source**: `tasks.md` > T-08 Acceptance Criteria

**GIVEN** spec-merge.ts / baseline-headers.ts 削除・orchestrator.ts 更新後の状態  
**WHEN** `bun run typecheck` を実行する  
**THEN** exit code 0 で完了し、型エラーが出力されない

---

### TC-024: bun run test が green（B-1〜B-10 / §3 DSM closure を含む）

**Category**: integration
**Priority**: must
**Source**: `tasks.md` > T-08 Acceptance Criteria

**GIVEN** spec-merge テスト削除・orchestrator テスト更新後の状態  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass し、B-1〜B-10 および §3 DSM closure のテストも green

---

## Result

```yaml
result: completed
total: 24
automated: 8
manual: 16
must: 20
should: 4
could: 0
blocked_reasons: []
```
