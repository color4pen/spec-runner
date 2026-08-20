# Test Cases: --from の検証正本を core に一本化し CLI 静的 enum を撤去する

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual | gate
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
  gate TC:
    GWT は記述しない。充足を担う verification phase 名（または verification.commands の command 名）を本文に記録する。

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

  所有権と書込時点: Result YAML は test-case-gen によるテストケース生成の結果記録である。
  生成時に一度だけ書かれ、後続ステップは更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 17 cases
- **Automated** (unit/integration): 15
- **Manual**: 0
- **Priority**: must: 16, should: 1, could: 0

---

## CLI parser: --from flag は任意文字列を受理する

### TC-001: --from regression-gate accepted by CLI parser for resume

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CLI parser shall accept any string for the --from flag > Scenario: --from regression-gate accepted by CLI parser for resume

### TC-002: --from custom-reviewers accepted by CLI parser for resume

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CLI parser shall accept any string for the --from flag > Scenario: --from custom-reviewers accepted by CLI parser for resume

### TC-003: --from \<member-name\> accepted by CLI parser for resume

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CLI parser shall accept any string for the --from flag > Scenario: --from \<member-name\> accepted by CLI parser for resume

### TC-004: --from regression-gate accepted by CLI parser for reopen

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CLI parser shall accept any string for the --from flag > Scenario: --from regression-gate accepted by CLI parser for reopen

---

## Core: custom reviewers を持つ job の動的 --from 値を受理する

### TC-005: --from regression-gate succeeds for job with custom reviewers

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Core shall accept dynamic --from values for jobs with custom reviewers > Scenario: --from regression-gate succeeds for job with custom reviewers

### TC-006: --from custom-reviewers succeeds for job with custom reviewers

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Core shall accept dynamic --from values for jobs with custom reviewers > Scenario: --from custom-reviewers succeeds for job with custom reviewers

### TC-007: --from \<member-name\> maps to coordinator for job with custom reviewers

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Core shall accept dynamic --from values for jobs with custom reviewers > Scenario: --from \<member-name\> maps to coordinator for job with custom reviewers

---

## exit code 2: --from に不正な値を渡した場合

### TC-008: --from with nonexistent step exits 2 for resume

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Invalid --from values shall exit with code 2 > Scenario: --from with nonexistent step exits 2 for resume

### TC-009: --from regression-gate exits 2 for job without custom reviewers (resume)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Invalid --from values shall exit with code 2 > Scenario: --from regression-gate exits 2 for job without custom reviewers (resume)

### TC-010: --from with nonexistent step exits 2 for reopen

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Invalid --from values shall exit with code 2 > Scenario: --from with nonexistent step exits 2 for reopen

### TC-011: --from regression-gate exits 2 for job without custom reviewers (reopen)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Invalid --from values shall exit with code 2 > Scenario: --from regression-gate exits 2 for job without custom reviewers (reopen)

---

## exit code 1: --from 未指定で復帰点が決定できない場合

### TC-012: No --from and no resume position exits 1

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Resume without --from shall exit with code 1 when no resume position can be determined > Scenario: No --from, no resume position → exit 1

---

## usage text: 実能力に合った記述

### TC-013: Resume --help does not contain misleading composite-steps note

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Resume usage text shall accurately describe --from target steps > Scenario: --help does not contain misleading composite-steps note

### TC-014: Reopen --help mentions custom reviewers

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Reopen usage text shall mention dynamic step support > Scenario: --help mentions custom reviewers for reopen

---

## 非 Scenario 由来: 設計・tasks から導出した追加 TC

### TC-015: Legacy alias --from build-fixer passes CLI parser and resolves to implementer

**Category**: unit
**Priority**: should
**Source**: design.md > D1: CLI `from` flag を `{ type: "string" }` に単純化する

**GIVEN** resume の `from` flag 定義に `values:` 制約がなく、core の `LEGACY_STEP_ALIASES` に `"build-fixer"` → `"implementer"` の写像が存在する
**WHEN** `parseFlags` で `--from build-fixer` を処理する
**THEN** FlagParseError は throw されず、`resolveResumeStep` が `"build-fixer"` を `LEGACY_STEP_ALIASES` 経由で `"implementer"` として受理する

---

## gate

### TC-016: typecheck && test が全変更後に green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-05: 受け入れ基準を満たすテストを追加する > Acceptance Criteria

verification フェーズの `typecheck` および `test` コマンドで確認する。

### TC-017: 既存の resume / reopen テストが無変更で green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-05: Acceptance Criteria

verification フェーズで確認する。対象ファイル: `src/core/command/__tests__/resume-hard-crash.test.ts`, `src/core/command/__tests__/reopen-command.test.ts`, `src/cli/__tests__/command-registry-resume.test.ts`, `src/cli/__tests__/command-registry-reopen.test.ts`。

---

## Result

```yaml
result: completed
total: 17
automated: 15
manual: 0
must: 16
should: 1
could: 0
blocked_reasons: []
```
