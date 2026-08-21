# Test Cases: plain archive の状態遷移を merge 境界に合わせる

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

- **Total**: 41 cases
- **Automated** (unit/integration): 41
- **Manual**: 0
- **Priority**: must: 29, should: 11, could: 1

---

## Archive Orchestrator

### TC-001: deferArchivedTransition 未指定で orchestrator が markJobArchived を呼ばない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: archive orchestrator は terminal transition を行わない > Scenario: deferArchivedTransition を省略して orchestrator を呼ぶ

### TC-002: deferArchivedTransition: true で orchestrator が markJobArchived を呼ばない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: archive orchestrator は terminal transition を行わない > Scenario: deferArchivedTransition: true で orchestrator を呼ぶ

### TC-003: orchestrator.ts に markJobArchived の参照が存在しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** `src/core/archive/orchestrator.ts` が T-03 に従い更新されている
**WHEN** orchestrator.ts のソースコードおよび import 一覧を確認する
**THEN** `markJobArchived` の呼び出しが 0 件であり、import からも除去されている
**AND** `assertJobFinishable` の import は引き続き存在する
**AND** 他の副作用（change folder mv / draft 削除 / commit / push / headSha 取得 / terminal 短絡）は変更されていない

### TC-004: orchestrator.ts が GitHubClient を import していない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 / design.md > D1

**GIVEN** `src/core/archive/orchestrator.ts` が T-03 に従い更新されている
**WHEN** orchestrator.ts の import 一覧を確認する
**THEN** `GitHubClient` および GitHub API に関する import が一切存在しない（client-closed 不変が維持される）

---

## Shared Module: job-context

### TC-005: resolveArchiveJobContext が job-context.ts に存在し正しく export される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `src/core/archive/job-context.ts` が T-01 に従い新規作成されている
**WHEN** モジュールを import して `resolveArchiveJobContext({ cwd, slug })` を呼び出す
**THEN** slug 一致 entry が存在する場合は `{ found: true, state, branch, worktreePath, noWorktree, archiveRecorded, recordDir }` を返す（`prNumber` は optional）
**AND** 一致なしの場合は `{ found: false, message }` を返す（message は `No job found with slug '<slug>'. Run 'specrunner ps' to see available jobs.` に一致する）
**AND** `listWithSourceDirs(cwd, { includeArchived: true })` で slug 一致 entry を取得し `updatedAt` 降順の先頭を採用する

### TC-006: archiveRecorded が sourceChangeDir の親 basename "archive" で判定される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 / design.md > D4

**GIVEN** slug `demo` の job の `sourceChangeDir` が `specrunner/changes/archive/2026-01-01-demo/` である
**WHEN** `resolveArchiveJobContext({ cwd, slug: "demo" })` を呼び出す
**THEN** 返却値の `archiveRecorded` が `true` である
**AND** `sourceChangeDir` が `specrunner/changes/demo/` の場合は `archiveRecorded` が `false` である

### TC-007: archiveRecorded / recordDir の導出ロジックが merge-then-archive.ts から除去されている

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** T-01 のリファクタが完了している
**WHEN** `src/core/archive/merge-then-archive.ts` を確認する
**THEN** `nodePath.basename(nodePath.dirname(sourceChangeDir)) === "archive"` の直接記述が存在しない
**AND** `noWorktree ? cwd : (worktreePath ?? cwd)` の直接記述が存在しない
**AND** これらの導出は `resolveArchiveJobContext` の呼び出しに一本化されている

---

## Shared Module: merge-completion

### TC-008: markJobArchived が throw しても runPostMergeCleanup が必ず実行される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `completeAfterMerge` が呼ばれ、`markJobArchived` が例外を投げる
**WHEN** `completeAfterMerge(input, stdoutWrite)` が実行される
**THEN** 例外は `stderrWrite` に警告として出力され、処理は継続する
**AND** `runPostMergeCleanup` は必ず呼ばれる（transition の失敗に関わらず）
**AND** 関数は成功（exitCode 0 相当）を返す

### TC-009: merge-then-archive.ts が markJobArchived / runPostMergeCleanup を直接呼ばない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** T-02 のリファクタが完了している
**WHEN** `src/core/archive/merge-then-archive.ts` のソースコードを確認する
**THEN** `markJobArchived` の直接呼び出しが存在しない
**AND** `runPostMergeCleanup` の直接呼び出しが存在しない
**AND** 両者は `completeAfterMerge` を経由してのみ呼ばれる

### TC-010: mergedBeforeRecordEscalation の resumeCommand が呼び出し元から注入できる

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-02 / design.md > D4

**GIVEN** `mergedBeforeRecordEscalation({ slug, prNumber, baseBranch, resumeCommand })` が `merge-completion.ts` に実装されている
**WHEN** plain 経路から `resumeCommand: "specrunner job archive <slug>"` で呼ぶ
**AND** with-merge 経路から `resumeCommand: "specrunner job archive --with-merge <slug>"` で呼ぶ
**THEN** 各 escalation の `recommendedAction` に対応する resumeCommand が含まれる
**AND** `failedStep` / `detectedState` の文言は既存のまま保たれる

---

## New Module: plain-archive

### TC-011: PR が未merge の状態で plain archive が成功し awaiting-archive を維持する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: plain job archive は archive record を作っても awaiting-archive を維持する > Scenario: PR が未merge の状態で plain archive が成功する

### TC-012: archive record commit が feature branch に push される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: plain job archive は archive record を作っても awaiting-archive を維持する > Scenario: archive record commit が feature branch に push される

### TC-013: out-of-band merge 後の再実行で archived + cleanup が完了する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: archived への terminal transition は PR merge 後にのみ行われる > Scenario: out-of-band merge 後の再実行で archived + cleanup が完了する

### TC-014: PR が未merge の間は cleanup が行われない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: archived への terminal transition は PR merge 後にのみ行われる > Scenario: PR が未merge の間は cleanup が行われない

### TC-015: merge 済み PR に対して push を試みない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: merge 状態の確認は archive record の記帳より前に行われる > Scenario: merge 済み PR に対して push を試みない

### TC-016: 記帳前に merge された job は escalation を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: archive record 前に merge された場合は escalation する > Scenario: 記帳前に merge された job

### TC-017: 記帳済み・未merge からの再実行は冪等である

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: archive record 済み状態からの再実行は冪等である > Scenario: 記帳済み・未merge からの再実行

### TC-018: plain archive は check status を問い合わせない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: plain archive は CI 結果を観測せず、CI 結果によって状態を変えない > Scenario: plain archive は check status を問い合わせない

### TC-019: archive record push 後に CI が failure でも状態は awaiting-archive のまま

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: plain archive は CI 結果を観測せず、CI 結果によって状態を変えない > Scenario: archive record push 後に CI が failure でも状態は変わらない

### TC-020: GitHub client が構築できない場合は記帳して exit 0 を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: merge 状態を判定できない場合は awaiting-archive を維持して成功する > Scenario: GitHub client が利用できない

### TC-021: getPullRequest が例外を投げる場合は記帳して exit 0 を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: merge 状態を判定できない場合は awaiting-archive を維持して成功する > Scenario: PR 状態の取得が失敗する

### TC-022: PR を持たない job は記帳時点で archived になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: PR を持たない job は記帳時点で archived になる > Scenario: PR を持たない job の archive

### TC-023: 既に archived の job は no-op で exit 0 を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: terminal status の job に対する plain archive は no-op である > Scenario: 既に archived の job

### TC-024: 記帳成功時に PR merge 後の再実行案内が stdout に出力される

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: plain archive は次のアクションを操作者に提示する > Scenario: 記帳成功時の案内出力

### TC-025: plain-archive.ts が getCheckStatus / mergePullRequest を参照しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `src/core/archive/plain-archive.ts` が T-04 に従い実装されている
**WHEN** plain-archive.ts のソースコードを解析する
**THEN** `getCheckStatus` の参照が 0 件である
**AND** `mergePullRequest` の参照が 0 件である
**AND** CI 待ち / check status polling のコードが存在しない（`--with-merge` の責務に限定されている）

### TC-026: runPostMergeCleanup の呼び出しが MERGED 検出分岐の内側にのみ存在する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 / design.md > D7

**GIVEN** `src/core/archive/plain-archive.ts` が T-04 に従い実装されている
**WHEN** plain-archive.ts における `runPostMergeCleanup` の呼び出し箇所を確認する
**THEN** 呼び出しは `completeAfterMerge` 経由（MERGED 検出分岐の内側）のみに存在する
**AND** PR が `OPEN` / `CLOSED` / 判定不能の経路では `runPostMergeCleanup` が呼ばれるパスが存在しない

---

## CLI Wiring

### TC-027: withMerge:false の分岐が runPlainArchive に委譲する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `src/cli/archive.ts` が T-05 に従い更新されている
**WHEN** `opts.withMerge` が false で `runArchive()` が呼ばれる
**THEN** `runPlainArchive` が呼ばれる
**AND** `runArchiveOrchestrator` が CLI から直接呼ばれない

### TC-028: GitHub token が解決できない場合も plain archive は exit 0 で完了する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 / design.md > D6

**GIVEN** GitHub token / origin が環境から取得できない
**WHEN** `runArchive({ withMerge: false })` が呼ばれる
**THEN** `runPlainArchive` が `githubClient: undefined` で呼ばれる
**AND** exit code は 0 で完了する（token 不在は escalation にならない）

### TC-029: token + origin が揃うとき githubClient が runPlainArchive に渡る

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** GitHub token と origin（owner / repo）が環境から正常に取得できる
**WHEN** `runArchive({ withMerge: false })` が呼ばれる
**THEN** `runPlainArchive` に `githubClient`、`owner`、`repo` が全て渡される

### TC-030: --with-merge 分岐（runMergeThenArchive）は変更されていない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** `src/cli/archive.ts` が T-05 に従い更新されている
**WHEN** `opts.withMerge` が true で `runArchive()` が呼ばれる
**THEN** `runMergeThenArchive` が呼ばれる（既存経路と同一）
**AND** `runPlainArchive` は呼ばれない

---

## --with-merge 既存経路の回帰

### TC-031: CI green を待って merge 後に archived になる（--with-merge 経路）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: --with-merge の既存経路は維持される > Scenario: CI green を待って merge 後に archived になる

### TC-032: CI failure では merge も遷移も行われない（--with-merge 経路）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: --with-merge の既存経路は維持される > Scenario: CI failure では merge も遷移も行われない

---

## テストスイート整合性

### TC-033: orchestrator.test.ts の更新対象が TC-010 のみである

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** T-06 のテスト更新が完了している
**WHEN** `src/core/archive/__tests__/orchestrator.test.ts` の差分を確認する
**THEN** 変更が TC-010（`deferArchivedTransition unset → markJobArchived IS called` から `markJobArchived NOT called` への更新）のみである
**AND** TC-001〜TC-006、T-01〜T-10、T-DTE-01〜T-DTE-03、TC-009 のソースが無変更のまま green である

### TC-034: from-issue / with-merge / minimum-assurance テストが無変更で green

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06 / request.md > 受け入れ基準

**GIVEN** 全 T-01〜T-07 の変更が完了している
**WHEN** `merge-then-archive.test.ts`、`archive-from-issue.test.ts`、`archive-minimum-assurance.test.ts` を実行する
**THEN** 全テストが無変更（0 diff）のまま green である

---

## Help / Documentation

### TC-035: ARCHIVE_USAGE が "Archive the completed change folder" を含む

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** `src/cli/command-registry.ts` の `ARCHIVE_USAGE` が T-07 に従い更新されている
**WHEN** `ARCHIVE_USAGE` の内容を確認する
**THEN** 先頭行に `"Archive the completed change folder"` が含まれている
**AND** `tests/unit/cli/help-flag-dispatch.test.ts` が無変更で green である

### TC-036: ARCHIVE_USAGE に merge 前は awaiting-archive・merge 後再実行で完了の旨が明記される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07 / design.md > Risks/Trade-offs > R-1

**GIVEN** `src/cli/command-registry.ts` の `ARCHIVE_USAGE` が T-07 に従い更新されている
**WHEN** `ARCHIVE_USAGE` の内容を確認する
**THEN** 「PR が merge されるまで job は `awaiting-archive` のまま」の旨が含まれている
**AND** 「merge 後に同じコマンドを再実行すると `archived` + cleanup が完了する」の旨が含まれている

### TC-040: 既に canceled の job は no-op で exit 0 を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: terminal status の job に対する plain archive は no-op である > Scenario: 既に canceled の job

### TC-041: PR を持たない job で markJobArchived が失敗した場合は escalation を返す

**Category**: unit
**Priority**: should
**Source**: design.md > D3 step 5

**GIVEN** slug `demo` の job が status `awaiting-archive` で `pullRequest` を持たない
**AND** `markJobArchived(slug, recordDir)` が `SpecRunnerError` を投げる
**WHEN** `runPlainArchive` が実行される
**THEN** `runArchiveOrchestrator` は呼ばれ、exitCode 0 を返す
**AND** `markJobArchived` が呼ばれて例外を投げる
**AND** 関数は `{ exitCode: 1, escalation }` を返す
**AND** `runPostMergeCleanup` は呼ばれない

---

## Gate

### TC-037: bun run test が全て green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-06 > Acceptance Criteria

bun run test（全スイート）

### TC-038: bun run lint が green

**Category**: gate
**Priority**: should
**Source**: tasks.md > T-06 > Acceptance Criteria

bun run lint

### TC-039: bun run typecheck が green

**Category**: gate
**Priority**: should
**Source**: tasks.md > T-01, T-02, T-03, T-04 > Acceptance Criteria

bun run typecheck / bun run build

---

## Result

```yaml
result: completed
total: 41
automated: 41
manual: 0
must: 29
should: 11
could: 1
blocked_reasons: []
```
