# Test Cases: guide 正本の正確性硬化

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

- **Total**: 20 cases
- **Automated** (unit/integration): 18
- **Manual**: 0
- **Priority**: must: 20, should: 0, could: 0

---

## review / audit topic — 正典モデル記述の是正

### TC-022: review topic に issue-as-canon 記述が存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: review topic SHALL describe request.md as the canonical reference post-pipeline-start > Scenario: review topic does not contain issue-as-canon language

### TC-023: review topic が pipeline 開始後の規範として request.md を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: review topic SHALL describe request.md as the canonical reference post-pipeline-start > Scenario: review topic contains request.md as the post-pipeline canonical reference

### TC-024: audit topic に issue-as-canon 記述が存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: audit topic SHALL position issue comparison as a transcription-audit concern only > Scenario: audit topic does not contain issue-as-canon language

### TC-025: audit topic が issue 比較を転記監査観点として位置づける

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: audit topic SHALL position issue comparison as a transcription-audit concern only > Scenario: audit topic describes issue comparison as transcription-audit concern

---

## escalation topic — cancel 案内の修正

### TC-026: escalation topic が cancel より前に job show を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: escalation topic cancel guidance SHALL use jobId, not slug > Scenario: escalation topic provides job show step before cancel

### TC-027: escalation topic の cancel 引数が jobId である

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: escalation topic cancel guidance SHALL use jobId, not slug > Scenario: escalation topic cancel uses jobId argument

### TC-028: escalation topic の cancel 引数に slug が使われていない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 > TC-023 (escalation topic cancel does not use \<slug\> argument)

**GIVEN** the guide `escalation` topic body
**WHEN** inspected for job cancel command invocations
**THEN** the text `job cancel <slug>` is absent from the topic body

---

## merge topic — worktree path 表記の修正

### TC-029: merge topic の worktree path が先頭 8 文字表記を使う

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: merge topic worktree path SHALL specify the 8-character jobId prefix > Scenario: merge topic uses 8-char jobId prefix notation

### TC-030: merge topic の worktree path に full jobId 表記が存在しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 > TC-024 (merge topic does not use full \<jobId\> notation in worktree path)

**GIVEN** the guide `merge` topic body
**WHEN** inspected for worktree path notation
**THEN** the pattern `<slug>-<jobId>` (full jobId, without 8-char truncation qualifier) is absent from the topic body

---

## jobs topic — 陳腐化手順の除去

### TC-031: jobs topic に stale pre-check 手順が存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: jobs topic SHALL NOT contain the stale job-ls pre-check step > Scenario: jobs topic has no stale pre-check instruction

---

## setup topic — init 記述の実態整合

### TC-032: setup topic の init 見出しが実態を反映している

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: setup topic init description SHALL reflect global config + repository scaffold > Scenario: setup topic init heading reflects actual behavior

---

## runner.ts — halt 出力への guide 導線追加

### TC-033: runner.ts の halt 出力が specrunner guide escalation リンクを含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: runner.ts halt output SHALL include a guide escalation link > Scenario: halt output contains guide link

---

## invocation contract — triple-backtick コードブロック拡張

### TC-034: コードブロック内の specrunner 行が invocation contract で検証される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: invocation contract SHALL cover triple-backtick code blocks > Scenario: code block specrunner lines are extracted and validated

### TC-035: skip パターンが各エントリに reason 文字列を持つ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: invocation contract SHALL cover triple-backtick code blocks > Scenario: skip patterns are explicitly documented

---

## invocation contract — placeholder 名不一致の検出

### TC-036: `specrunner job cancel <slug>` が positional-name-mismatch violation を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: invocation contract SHALL fail on placeholder name mismatch > Scenario: job cancel \<slug\> is detected as a violation

### TC-037: `specrunner job cancel <jobId>` が violation なしを返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 > TC-030 (specrunner job cancel \<jobId\> --restore-draft produces no violations)

**GIVEN** the invocation string `specrunner job cancel <jobId> --restore-draft`
**WHEN** the invocation contract validator (`validateInvocation(parseInvocation(line))`) runs on it
**THEN** the returned violations array is empty

---

## SKILL.md — dead reference の除去

### TC-038: acceptance-and-issue-audit SKILL.md に parallel-request-workflow が存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: acceptance-and-issue-audit SKILL.md SHALL NOT mention parallel-request-workflow > Scenario: SKILL.md has no parallel-request-workflow reference

---

## ADR — skill 削除の実状態整合

### TC-039: ADR が tombstone アプローチを記述していない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: ADR SHALL reflect actual state of parallel-request-workflow deletion > Scenario: ADR does not describe tombstone approach

---

## ゲート

### TC-040: 既存 TC-001〜TC-021 が変更なしで green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-07

verification: `bun run test` — TC-001〜TC-021 に相当する既存テストが全件 pass すること。本 request が修正した guide 本文への文言 pin テストは更新可とする。

### TC-041: typecheck && test が green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-07

verification: `bun run typecheck && bun run test` — exit code 0 で完了すること。TC-022〜TC-039 の全件を含む。

---

## Result

```yaml
result: completed
total: 20
automated: 18
manual: 0
must: 20
should: 0
could: 0
blocked_reasons: []
```
