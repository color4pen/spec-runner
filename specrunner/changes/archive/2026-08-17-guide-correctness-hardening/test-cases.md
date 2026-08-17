# Test Cases: guide 正本の正確性硬化

## Summary

- **Total**: 19 cases
- **Automated** (unit/integration): 18
- **Manual**: 0
- **Priority**: must: 19, should: 0, could: 0

---

### TC-022: review topic does not contain issue-as-canon language

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: review topic SHALL describe request.md as the canonical reference post-pipeline-start > Scenario: review topic does not contain issue-as-canon language

---

### TC-023: review topic contains request.md as the post-pipeline canonical reference

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: review topic SHALL describe request.md as the canonical reference post-pipeline-start > Scenario: review topic contains request.md as the post-pipeline canonical reference

---

### TC-024: audit topic does not contain issue-as-canon language

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: audit topic SHALL position issue comparison as a transcription-audit concern only > Scenario: audit topic does not contain issue-as-canon language

---

### TC-025: audit topic describes issue comparison as transcription-audit concern

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: audit topic SHALL position issue comparison as a transcription-audit concern only > Scenario: audit topic describes issue comparison as transcription-audit concern

---

### TC-026: escalation topic provides job show step before cancel

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: escalation topic cancel guidance SHALL use jobId, not slug > Scenario: escalation topic provides job show step before cancel

---

### TC-027: escalation topic cancel uses jobId argument

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: escalation topic cancel guidance SHALL use jobId, not slug > Scenario: escalation topic cancel uses jobId argument

---

### TC-028: merge topic uses 8-char jobId prefix notation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: merge topic worktree path SHALL specify the 8-character jobId prefix > Scenario: merge topic uses 8-char jobId prefix notation

---

### TC-029: jobs topic has no stale pre-check instruction

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: jobs topic SHALL NOT contain the stale job-ls pre-check step > Scenario: jobs topic has no stale pre-check instruction

---

### TC-030: setup topic init heading reflects actual behavior

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: setup topic init description SHALL reflect global config + repository scaffold > Scenario: setup topic init heading reflects actual behavior

---

### TC-031: halt output contains guide link

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: runner.ts halt output SHALL include a guide escalation link > Scenario: halt output contains guide link

---

### TC-032: code block specrunner lines are extracted and validated

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: invocation contract SHALL cover triple-backtick code blocks > Scenario: code block specrunner lines are extracted and validated

---

### TC-033: skip patterns are explicitly documented

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: invocation contract SHALL cover triple-backtick code blocks > Scenario: skip patterns are explicitly documented

---

### TC-034: job cancel slug is detected as a violation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: invocation contract SHALL fail on placeholder name mismatch > Scenario: job cancel <slug> is detected as a violation

---

### TC-035: SKILL.md has no parallel-request-workflow reference

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: acceptance-and-issue-audit SKILL.md SHALL NOT mention parallel-request-workflow > Scenario: SKILL.md has no parallel-request-workflow reference

---

### TC-036: ADR does not describe tombstone approach

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: ADR SHALL reflect actual state of parallel-request-workflow deletion > Scenario: ADR does not describe tombstone approach

---

### TC-037: escalation topic cancel does not use slug as argument

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 > TC-023: escalation topic cancel does not use \<slug\> argument

**GIVEN** the guide `escalation` topic body
**WHEN** inspected for any `job cancel` invocation that uses `<slug>` as its argument
**THEN** no such invocation exists (i.e. `job cancel <slug>` is absent)

---

### TC-038: merge topic does not use bare slug-jobId path notation

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 > TC-024: merge topic does not use full \<jobId\> notation in worktree path

**GIVEN** the guide `merge` topic body
**WHEN** inspected for the worktree path pattern `<slug>-<jobId>` (full jobId, not truncated)
**THEN** the pattern `<slug>-<jobId>` is absent

---

### TC-039: job cancel jobId produces no violations

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 > TC-030: 'specrunner job cancel \<jobId\> --restore-draft' produces no violations

**GIVEN** the invocation string `specrunner job cancel <jobId> --restore-draft`
**WHEN** the invocation contract validator parses and validates it
**THEN** it returns zero violations (path resolves, `--restore-draft` flag exists in spec, `<jobId>` matches `args[0].name`)

---

### TC-040: typecheck && test gate

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-07: typecheck && test の green 確認

verification: `bun run typecheck && bun run test` — TC-001〜TC-039 全て green、exit code 0

---

### TC-041: inline backtick specrunner コマンドの invocation contract

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: invocation contract SHALL cover triple-backtick code blocks

**GIVEN** guide topic 本文の inline backtick 内の `specrunner ...` 参照
**WHEN** invocation contract テストが走る
**THEN** skip 対象でない各参照が path 解決・flag 実在・positional placeholder 整合の 3 点で検証される

---

### TC-042: placeholder 行が skip されないこと (fail-open 再発防止)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: invocation contract SHALL cover triple-backtick code blocks > skip patterns are tested against the placeholder-stripped line

**GIVEN** `<placeholder>` を含むが実 shell metacharacter を含まないコマンド行(escalation topic の `job cancel <jobId> --restore-draft` を含む)
**WHEN** skip 判定が走る
**THEN** placeholder 由来の `>` / `|` は skip 理由にならず、当該行は invocation contract の検証対象に含まれる。実 redirect を含む行(`request template > <file>`)は skip される

## Result

```yaml
result: completed
total: 21
automated: 20
manual: 0
must: 21
should: 0
could: 0
blocked_reasons: []
```
