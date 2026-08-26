# Test Cases: archive を 1 回で完結させ、merge 後の再 archive 契約を撤回する

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

- **Total**: 43 cases
- **Automated** (unit/integration + gate): 42
- **Manual**: 1
- **Priority**: must: 31, should: 12, could: 0

---

## TC 一覧（Scenario 由来: TC-001〜TC-017, TC-043 / 非 Scenario 由来: TC-018〜TC-042）

---

### TC-001: awaiting-archive job with OPEN PR completes in one run

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: plain archive shall complete the whole archive operation in a single run > Scenario: awaiting-archive job with an OPEN PR completes in one run

---

### TC-002: success output does not instruct a second archive run

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: plain archive shall complete the whole archive operation in a single run > Scenario: success output does not instruct a second archive run

---

### TC-003: no further SpecRunner command is needed after the PR is merged

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: plain archive shall complete the whole archive operation in a single run > Scenario: no further SpecRunner command is needed after the PR is merged

---

### TC-004: PR merge state is never queried during plain archive

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: plain archive shall not read GitHub PR state > Scenario: PR merge state is never queried during plain archive

---

### TC-005: archived transition happens while the PR is still OPEN

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: plain archive shall not read GitHub PR state > Scenario: archived transition happens while the PR is still OPEN

---

### TC-006: plain archive keeps the remote branch

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: plain archive cleanup shall preserve the remote feature branch > Scenario: plain archive keeps the remote branch

---

### TC-007: with-merge still deletes the remote branch after merging

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: plain archive cleanup shall preserve the remote feature branch > Scenario: with-merge still deletes the remote branch after merging

---

### TC-008: push failure blocks the transition and cleanup

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: the archived transition shall be gated on a successful archive record push > Scenario: push failure blocks the transition and cleanup

---

### TC-009: transition failure blocks cleanup on the recording path

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: the archived transition shall be gated on a successful archive record push > Scenario: transition failure blocks cleanup on the recording path

---

### TC-010: leftover two-phase job with a merged PR is finished in one run

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: plain archive shall idempotently finish jobs whose archive record already exists > Scenario: leftover two-phase job with a merged PR is finished in one run

---

### TC-011: already-recorded job with an OPEN PR re-pushes harmlessly

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: plain archive shall idempotently finish jobs whose archive record already exists > Scenario: already-recorded job with an OPEN PR re-pushes harmlessly

---

### TC-012: recorded job with a missing worktree is finished without recording

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: plain archive shall idempotently finish jobs whose archive record already exists > Scenario: recorded job with a missing worktree is finished without recording

---

### TC-013: unrecorded job with a missing worktree still escalates

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: plain archive shall idempotently finish jobs whose archive record already exists > Scenario: unrecorded job with a missing worktree still escalates

---

### TC-014: PR-less job gets cleanup as well

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: plain archive shall treat PR-less jobs identically to PR-bearing jobs > Scenario: PR-less job gets cleanup as well

---

### TC-015: job ls recommends archive for an unmerged PR

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: operator-facing guidance shall state the archive-then-merge order > Scenario: job ls recommends archive for an unmerged PR

---

### TC-016: workflow dispatch documents a single-run archive

**Category**: manual
**Priority**: should
**Source**: spec.md > Requirement: operator-facing guidance shall state the archive-then-merge order > Scenario: workflow dispatch documents a single-run archive

`.github/workflows/specrunner-dispatch.yml` の `archive` action コメントブロックを目視で確認し、「2 相」「再実行」「1 回目 / 2 回目」「merge 後」等の案内が存在しないことを確認する。代わりに「1 回の実行で完結」「archive 後に GitHub 上で PR merge」が記述されていることを確認する。

---

### TC-017: success output points to the GitHub merge as the next step

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: operator-facing guidance shall state the archive-then-merge order > Scenario: success output points to the GitHub merge as the next step

---

### TC-018: runArchiveCleanup — deleteRemoteBranch: false は push --delete を発行しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 / design.md > D3

**GIVEN** `runArchiveCleanup` に `deleteRemoteBranch: false` とブランチ名 `change/foo-1234` を渡す  
**WHEN** cleanup を実行する  
**THEN** `git push origin --delete change/foo-1234` は一度も spawn されない。`git branch -D change/foo-1234`（local 削除）は spawn される。worktree 撤去・liveness.json 削除・managed marker 削除・sidecar 削除はいずれも従来どおり実行される。

---

### TC-019: runArchiveCleanup — deleteRemoteBranch 未指定（既定 true）は旧 runPostMergeCleanup と同一コマンド列を発行する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 AC / design.md > D3

**GIVEN** `runArchiveCleanup` に `deleteRemoteBranch` を指定しない（既定値 `true`）  
**WHEN** cleanup を実行する  
**THEN** spawn されるコマンド列（git push origin --delete を含む）が、改名前の `runPostMergeCleanup` と完全一致する（アサーション変更なし）

---

### TC-020: runArchiveCleanup — deleteRemoteBranch: false で remote branch 保持の advisory が stdout に出力される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 / design.md > D3

**GIVEN** `runArchiveCleanup` に `deleteRemoteBranch: false` とブランチ名を渡す  
**WHEN** cleanup を実行する  
**THEN** stdout に「remote branch を保持した」旨と `git fetch origin <branch>` による復元方法の案内が含まれる

---

### TC-021: src/core/archive/post-merge-cleanup.ts が存在しない（削除済み）

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-01 AC

`grep -rn "runPostMergeCleanup\|PostMergeCleanupInput\|post-merge-cleanup" src tests .github` の結果が空であること。`bun run typecheck` が green であること。

---

### TC-022: orchestrator — mv/commit 双方 skip + ls-remote 空 → push を skip して exit 0

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 (a) / design.md > D5 Path A

**GIVEN** `archiveChangeFolder` と `commitArchive` が両方 `skipped: true` を返し（既に記帳済み）、`git ls-remote --heads origin <branch>` が空の stdout を返す  
**WHEN** `runArchiveOrchestrator` を実行する  
**THEN** `git push origin <branch>` は spawn されない。warning が出力される。exit code は 0。headSha は従来どおり `git rev-parse HEAD` で取得される。

---

### TC-023: orchestrator — mv/commit 双方 skip + ls-remote が branch を返す → push が実行される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 (b) / design.md > D5 Path A

**GIVEN** `archiveChangeFolder` と `commitArchive` が両方 `skipped: true` を返し、`git ls-remote --heads origin <branch>` が branch の ref を返す  
**WHEN** `runArchiveOrchestrator` を実行する  
**THEN** `git push origin <branch>` が spawn される。exit code は 0。

---

### TC-024: orchestrator — mv/commit 双方 skip + push 失敗 → escalation せず warning のみ / exit 0

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 (c) / design.md > D5 Path A

**GIVEN** `archiveChangeFolder` と `commitArchive` が両方 `skipped: true` を返し、ls-remote が branch を返す。`git push origin <branch>` が exit code 1 で失敗する  
**WHEN** `runArchiveOrchestrator` を実行する  
**THEN** exit code は 0（escalation しない）。警告メッセージが出力される。`markJobArchived` は呼ばれない（transition は呼び出し元の責任）。

---

### TC-025: orchestrator — 新規記帳あり + push 失敗 → 従来どおり escalation / exit 1

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 (d) / design.md > D5 Path A

**GIVEN** `archiveChangeFolder` または `commitArchive` が実際に処理を行った（skipped でない）。`git push origin <branch>` が exit code 1 で失敗する  
**WHEN** `runArchiveOrchestrator` を実行する  
**THEN** exit code は 1 かつ escalation が返る（変更前の挙動と同一）。

---

### TC-026: orchestrator — ls-remote が非 0 終了 → fail-open で push を試行する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 (e) / design.md > D5 Path A

**GIVEN** `archiveChangeFolder` と `commitArchive` が両方 `skipped: true` を返し、`git ls-remote --heads origin <branch>` が exit code 1 で失敗する  
**WHEN** `runArchiveOrchestrator` を実行する  
**THEN** `git push origin <branch>` は通常どおり試行される（ls-remote 失敗を理由に archive を止めない）。

---

### TC-027: PlainArchiveInput に githubClient / owner / repo が存在しない（型レベルの保証）

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-03 AC / design.md > D1

`grep -n "GitHubClient\|merge-completion\|getPullRequest\|mergePullRequest" src/core/archive/plain-archive.ts src/cli/archive.ts` を実行し、plain archive の該当箇所に 0 件であることを確認する（`--with-merge` 分岐のみ許容）。`bun run typecheck` が green。

---

### TC-028: src/cli/archive.ts の plain 分岐に createGitHubClient / getOriginInfo が存在しない

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-04 AC / design.md > D1

`grep -n "createGitHubClient\|getOriginInfo" src/cli/archive.ts` の結果が、`--with-merge` 分岐のみに限定されていること（plain 分岐の行に存在しないこと）。`--with-merge` 分岐の引数が変更前と同一であること。

---

### TC-029: merge-completion.ts を import しているのが merge-then-archive.ts のみ

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-05 AC / design.md > D7

`grep -rn "merge-completion" src tests` の結果が `src/core/archive/merge-then-archive.ts` のみであること。plain-archive.ts での import が 0 件であること。

---

### TC-030: deriveNextAction — awaiting-archive かつ prMerged: null → job archive \<slug\> を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06 AC / design.md > D8

**GIVEN** `deriveNextAction` に status `awaiting-archive` かつ `prMerged: null` の job row を渡す  
**WHEN** 関数を呼び出す  
**THEN** 戻り値が `"job archive <slug>"` である（旧実装では `null` を返していた）

---

### TC-031: deriveNextAction — awaiting-archive かつ prMerged: false → job archive \<slug\> を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06 AC / design.md > D8

**GIVEN** `deriveNextAction` に status `awaiting-archive` かつ `prMerged: false` の job row を渡す  
**WHEN** 関数を呼び出す  
**THEN** 戻り値が `"job archive <slug>"` である（旧実装では `null` を返していた）

---

### TC-032: workflow YAML に 2 相・再実行を示唆する語が存在しない

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-07 AC / design.md > D8-1

`grep -n "2 相\|2相\|再実行\|completeAfterMerge\|1 回目\|2 回目\|re-run after merge\|second.*archive\|archive.*again" .github/workflows/specrunner-dispatch.yml` の結果が空であること。

---

### TC-033: workflow YAML の archive CLI 呼び出しが変更前と byte 単位で同一

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-07 AC / design.md > D8-1

`.github/workflows/specrunner-dispatch.yml` の `elif [ "$ACTION" = "archive" ]` ブロック内の実行コマンド行が `bun ./bin/specrunner.ts job archive --from-issue "$ISSUE"` のままであること。YAML が構文的に妥当であること（`yq` などによるパースが成功する）。

---

### TC-034: plain archive テストスイートに 2 相契約を前提とするアサーションが存在しない

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-08 AC

`grep -n "awaiting-archive\|re-run\|re.run after merge\|remains in\|After the PR is merged" src/core/archive/__tests__/plain-archive.test.ts` の結果に「2 相前提の期待値」に相当するアサーション文字列が含まれないこと。旧 `runPostMergeCleanup` の mock 参照が 0 件であること。

---

### TC-035: spec.md の全 Scenario に対応するユニットテストが存在する

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-08 AC

`src/core/archive/__tests__/plain-archive.test.ts` に以下の挙動を検証するテストが各 1 本以上存在すること:
- PR OPEN + awaiting-archive → 1 回で archived + cleanup + exit 0
- 成功 stdout に再実行案内・`remains in awaiting-archive` が含まれない
- archived 済み job 再実行 → short-circuit exit 0
- 全経路で PR API 呼び出しが 0 回
- cleanup が `deleteRemoteBranch: false` で呼ばれる
- push 失敗 → exit 1・未遷移・cleanup 未実行
- transition 失敗 → exit 1・cleanup 未実行
- 記録済み + remote branch 消失 → 新規 commit なし・push skip warning・archived + cleanup・exit 0
- 記録済み + remote branch 存在 → 再 push・archived + cleanup
- 記録済み + worktree 欠損 → Path B で exit 0
- 未記録 + worktree 欠損 → escalation exit 1・未遷移

---

### TC-036: --with-merge 関連テストがアサーション変更なしで green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08 / design.md > Risks: --with-merge の回帰

**GIVEN** `src/core/archive/__tests__/merge-then-archive.test.ts`・`tests/unit/core/archive/achieved-assurance-*`・`tests/unit/core/archive/merge-then-archive-floor*` の全テストが存在する  
**WHEN** `bun run test` を実行する  
**THEN** すべてのアサーションが green。変更は mock の import path・シンボル名の追従のみであり、アサーション内容は変更前と同一。

---

### TC-037: build / typecheck / test / architecture tests が全て green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-09 AC / request.md 受け入れ条件

`bun run build` / `bun run typecheck` / `bun run test` / architecture 検証テスト（DSM / layer 依存テスト）が全て green であること。

---

### TC-038: Path B — archiveRecorded + worktree ディレクトリ欠損 → best-effort archived + cleanup + exit 0

**Category**: unit
**Priority**: must
**Source**: design.md > D5 Path B / tasks.md > T-03

**GIVEN** job が `awaiting-archive` かつ `archiveRecorded === true`（change folder が archive/ 配下に存在）。worktree ディレクトリが disk 上に存在しない（`noWorktree === false` かつ `fs.exists(worktreePath)` が false）。  
**WHEN** `runPlainArchive` を実行する  
**THEN** `runArchiveOrchestrator` は呼ばれない。`markJobArchived` が best-effort で試行される（失敗しても warning に留める）。`runArchiveCleanup` が `deleteRemoteBranch: false` で実行される。exit code は 0。

---

### TC-039: transition（markJobArchived）は cleanup（runArchiveCleanup）より先に呼ばれる

**Category**: unit
**Priority**: must
**Source**: design.md > D2

**GIVEN** job が `awaiting-archive` かつ worktree が有効。archive 操作が成功する。  
**WHEN** `runPlainArchive` を実行する  
**THEN** `markJobArchived` の呼び出しが `runArchiveCleanup` の呼び出しよりも先に発生している（モック呼び出し順序で検証）。これは worktree 撤去後に state 書き込み先が消滅することを防ぐための順序保証。

---

### TC-040: tests/unit/no-worktree-archive.test.ts がアサーション変更なしで green

**Category**: gate
**Priority**: should
**Source**: tasks.md > T-02 AC / T-08

`bun run test tests/unit/no-worktree-archive.test.ts` が green であること。テストのアサーション内容に変更が加えられていないこと（mock path の追従のみ）。

---

### TC-041: 成功時の advisory は PR state を読まずに無条件に出力される

**Category**: unit
**Priority**: should
**Source**: design.md > D6 / tasks.md > T-03

**GIVEN** job が `awaiting-archive` かつ PR 番号が記録されている。archive 操作が成功する。  
**WHEN** `runPlainArchive` を実行する  
**THEN** stdout に「次は GitHub 上で PR を merge すること」および「PR が既に merge / close 済みの場合 archive commit は base branch に届かない」旨の advisory が含まれる。この出力のために GitHub API（`getPullRequest` 等）は一切呼ばれていない（無条件の 1 行 advisory）。

---

### TC-042: Path B — noWorktree===true + local branch 不在 → best-effort archived + cleanup + exit 0

**Category**: unit
**Priority**: should
**Source**: design.md > D5 Path B / tasks.md > T-03

**GIVEN** job が `awaiting-archive` かつ `archiveRecorded === true`（change folder が archive/ 配下に存在）。`noWorktree === true`（`--no-worktree` モード）であり、`git rev-parse --verify --quiet refs/heads/<branch>` が非 0 を返す（local feature branch が存在しない）。  
**WHEN** `runPlainArchive` を実行する  
**THEN** `runArchiveOrchestrator` は呼ばれない（Path B 経路）。`markJobArchived` が best-effort で試行される（失敗しても warning に留める）。`runArchiveCleanup` が `deleteRemoteBranch: false` で実行される。exit code は 0。

---

### TC-043: --from-issue invocation completes in one run

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: plain archive shall complete the whole archive operation in a single run > Scenario: --from-issue invocation completes in one run

---

## Result

```yaml
result: completed
total: 43
automated: 42
manual: 1
must: 31
should: 12
could: 0
blocked_reasons: []
```
