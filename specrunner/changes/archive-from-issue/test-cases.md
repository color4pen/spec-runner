# Test Cases: awaiting-archive checkpoint の issue 起点取り込み

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

- **Total**: 30 cases
- **Automated** (unit/integration): 28（うち gate 2）
- **Manual**: 0
- **Priority**: must: 27, should: 3, could: 0

---

### TC-001: awaiting-archive + PR number の checkpoint が accept される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: awaiting-archive checkpoint verification policy > Scenario: awaiting-archive checkpoint with PR number is accepted

---

### TC-002: awaiting-archive policy が awaiting-resume checkpoint を not-quiescent で reject する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: awaiting-archive checkpoint verification policy > Scenario: awaiting-resume checkpoint is rejected by the awaiting-archive policy

---

### TC-003: awaiting-archive policy が running checkpoint を not-quiescent で reject する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: awaiting-archive checkpoint verification policy > Scenario: running checkpoint is rejected by the awaiting-archive policy

---

### TC-004: awaiting-archive checkpoint で pullRequest.number 欠落時に reject される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: awaiting-archive checkpoint verification policy > Scenario: awaiting-archive checkpoint missing PR number is rejected

---

### TC-005: awaiting-archive checkpoint の attach が成功し archive hint が出力される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: job attach accepts both quiescent statuses and emits a status-specific hint > Scenario: attaching an awaiting-archive checkpoint succeeds with the archive hint

---

### TC-006: awaiting-resume checkpoint の attach が引き続き成功し resume hint が出力される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: job attach accepts both quiescent statuses and emits a status-specific hint > Scenario: attaching an awaiting-resume checkpoint still succeeds with the resume hint

---

### TC-007: non-quiescent checkpoint の attach が not-quiescent で reject される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: job attach accepts both quiescent statuses and emits a status-specific hint > Scenario: attaching a non-quiescent checkpoint is rejected

---

### TC-008: 複数 completed marker のうち最新の jobId が選ばれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: completed-marker jobId resolution > Scenario: newest completed marker selects the jobId

---

### TC-009: escalation marker のみの issue で ARCHIVE_FROM_ISSUE_NO_MARKER が throw される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: completed-marker jobId resolution > Scenario: escalation markers are ignored

---

### TC-010: marker 不在の issue で ARCHIVE_FROM_ISSUE_NO_MARKER が throw される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: completed-marker jobId resolution > Scenario: no marker present is a typed error

---

### TC-011: 4 点一意一致で branch / slug / checkpointOid が返る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: closing-PR branch locator with four-field identity match > Scenario: unique four-field match resolves the branch

---

### TC-012: closing PR 0 件で ARCHIVE_FROM_ISSUE_NO_PR が throw される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: closing-PR branch locator with four-field identity match > Scenario: zero closing PRs is a typed error

---

### TC-013: 複数 confirmed 候補で ARCHIVE_FROM_ISSUE_UNCONFIRMED が throw される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: closing-PR branch locator with four-field identity match > Scenario: multiple confirmed candidates is a typed error

---

### TC-014: PR number 不一致の候補が skip されて ARCHIVE_FROM_ISSUE_UNCONFIRMED になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: closing-PR branch locator with four-field identity match > Scenario: a candidate whose PR number mismatches the checkpoint is skipped

---

### TC-015: slug と --from-issue 同時指定で exit 2

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: job archive --from-issue CLI contract > Scenario: slug and --from-issue together exit 2

---

### TC-016: slug も --from-issue も指定なしで exit 2

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: job archive --from-issue CLI contract > Scenario: neither slug nor --from-issue exits 2

---

### TC-017: --with-merge が from-issue 経路を通じて archive 実行に引き継がれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: job archive --from-issue CLI contract > Scenario: --with-merge is carried through the from-issue path

---

### TC-018: local state 存在時に locator / rebind を経ずに archive へ直行する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: local short-circuit for issue-initiated archive > Scenario: existing local state skips rebind

---

### TC-019: rebind 後に awaiting-archive policy で検証され --with-merge 付き archive が実行される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: issue-initiated archive rebind connects to the existing archive orchestrator unchanged > Scenario: rebind then archive for a remote awaiting-archive job

---

### TC-020: resume policy が awaiting-archive checkpoint を not-quiescent で reject する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: issue-initiated resume remains awaiting-resume only > Scenario: resume rejects an awaiting-archive checkpoint

---

### TC-021: parseCompletedJobId の round-trip と escalation marker での null 返却

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `buildMarker("completed", jobId)` で生成した body
**WHEN** `parseCompletedJobId(body)` を呼ぶ
**THEN** jobId が返る

**GIVEN** `kind="escalation"` marker を含む body
**WHEN** `parseCompletedJobId(body)` を呼ぶ
**THEN** null が返る

---

### TC-022: policy 未指定の runAttachVerification は attachResumePolicy で動作する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `policy` を指定せずに `runAttachVerification` を呼び出す
**WHEN** awaiting-resume な checkpoint を検証する
**THEN** attach が成功する（default = attachResumePolicy が効く）

**GIVEN** `policy` を指定せずに `runAttachVerification` を呼び出す
**WHEN** awaiting-archive な checkpoint を検証する
**THEN** `not-quiescent` で reject される（resume policy が維持されている）

---

### TC-023: 3 つの error factory が正しい code と exitCode 2 を持つ

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** `archiveFromIssueNoMarkerError(issueNumber)` を呼ぶ
**WHEN** error の code と exitCode を確認する
**THEN** code が `ARCHIVE_FROM_ISSUE_NO_MARKER`、exitCode が 2

**GIVEN** `archiveFromIssueNoPrError(issueNumber)` を呼ぶ
**WHEN** error の code と exitCode を確認する
**THEN** code が `ARCHIVE_FROM_ISSUE_NO_PR`、exitCode が 2

**GIVEN** `archiveFromIssueUnconfirmedError(detail)` を呼ぶ
**WHEN** error の code と exitCode を確認する
**THEN** code が `ARCHIVE_FROM_ISSUE_UNCONFIRMED`、exitCode が 2

---

### TC-024: archiveFromIssueNoPrError のメッセージに job attach --branch の案内が含まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** `archiveFromIssueNoPrError(issueNumber)` を呼ぶ
**WHEN** error の message / hint を確認する
**THEN** `"job attach --branch"` が含まれる

---

### TC-025: 非 local runtime で runArchiveFromIssue が attachRuntimeUnsupportedError を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08 / design.md > D9

**GIVEN** `config.runtime` が `"local"` 以外（例: `"managed"`）に設定されている
**WHEN** `runArchiveFromIssue` を呼ぶ
**THEN** `attachRuntimeUnsupportedError` が返り、exit code が非ゼロになる

---

### TC-026: ARCHIVE_USAGE に --from-issue の記述と slug 排他の説明が含まれる

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-09

**GIVEN** `command-registry.ts` 内の `ARCHIVE_USAGE` 定数
**WHEN** 文字列を検査する
**THEN** `"--from-issue"` が含まれ、slug との排他が説明されている

---

### TC-027: guide の jobs topic に archive --from-issue の経路が含まれる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-11

**GIVEN** `guide.ts` の jobs topic テキスト
**WHEN** テキストを検査する
**THEN** `"archive --from-issue"` が含まれる

---

### TC-028: guide の merge topic に issue 起点取り込みと job attach --branch の手動経路が含まれる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-11

**GIVEN** `guide.ts` の merge topic テキスト
**WHEN** テキストを検査する
**THEN** issue 起点取り込みの説明と `"job attach --branch"` の手動経路が含まれる

---

### TC-029: typecheck && test が全て green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-12

`bun run typecheck && bun run test`（verification フェーズで実行）

---

### TC-030: 既存の resume / attach / archive テストが無変更で green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-10 / request.md 受け入れ基準

`bun run test`（対象: `src/cli/__tests__/resume-from-issue.test.ts`、`src/core/issue-target/__tests__/resume.test.ts`、既存 attach / archive テスト群が無変更で全 pass すること。「既存テスト」とは本 request の実装追加前から存在するテストファイルを指す（本 request が T-03/T-09/T-12 で新規追加するテストは含まない）。既存テストのいずれかで変更を要した場合は設計回帰とみなす）

---

## Result

```yaml
result: completed
total: 30
automated: 28
manual: 0
must: 27
should: 3
could: 0
blocked_reasons: []
```
