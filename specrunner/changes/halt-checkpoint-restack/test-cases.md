# Test Cases: halt checkpoint を未 push 作業 commit から分離して publish する

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

- **Total**: 39 cases
- **Automated** (unit/integration): 36
- **Manual**: 0
- **Priority**: must: 36, should: 3, could: 0

---

## Spec Scenario 由来テストケース

### TC-001: 作業 commit push 拒否時の halt checkpoint 積み直し（happy path）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: halt checkpoint の push が失敗したとき、最終 publish 済み tip を親として checkpoint を積み直して publish する > Scenario: 作業 commit の push が拒否される状況で halt した

---

### TC-002: publish 済み tip が存在しない branch での積み直しスキップ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: halt checkpoint の push が失敗したとき、最終 publish 済み tip を親として checkpoint を積み直して publish する > Scenario: publish 済み tip が存在しない branch では積み直しをしない

---

### TC-003: 未 push 作業 commit ファイル変更が積み直し commit に含まれない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 積み直した checkpoint の tree は change folder のみを差し替え、それ以外を publish しない > Scenario: 未 push 作業 commit のファイル変更は publish されない

---

### TC-004: change folder 外差分検出時の push 抑制（封じ込め検査）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 積み直した checkpoint の tree は change folder のみを差し替え、それ以外を publish しない > Scenario: change folder 外の差分が検出された場合は push しない

---

### TC-005: local state なし環境での attach 検証成立と resume step 解決

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 積み直された checkpoint は attach 検証を通過し、拒否された step から resume できる > Scenario: local state を持たない環境から attach 検証が成立する

---

### TC-006: 積み直し record 追記後の counter reversal 非検出

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 積み直された checkpoint は attach 検証を通過し、拒否された step から resume できる > Scenario: journal が state.json の counters を巻き戻していない

---

### TC-007: publish された checkpoint の events.jsonl に checkpoint-restack record が含まれ OID が一致する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 積み直しの発生を journal event として publish される checkpoint に記録する > Scenario: publish された checkpoint から未 publish commit を判別できる

---

### TC-008: checkpoint-restack record が projection（history/steps）を増やさない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 積み直しの発生を journal event として publish される checkpoint に記録する > Scenario: 積み直し record は projection を増やさない

---

### TC-009: 積み直し push も拒否された場合に throw せず警告を出力する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 積み直しの失敗は例外を投げず警告のみで継続する > Scenario: 積み直した checkpoint の push も拒否される

---

### TC-010: journal 追記失敗後に commit/push を継続する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 積み直しの失敗は例外を投げず警告のみで継続する > Scenario: journal 追記が失敗しても publish を試みる

---

### TC-011: graft によりローカル branch が積み直し commit の子孫になる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 積み直した checkpoint を publish したあと、ローカル branch を publish 済み commit の子孫にする > Scenario: 積み直し後もローカル branch から fast-forward で push できる状態になる

---

### TC-012: detached HEAD での graft スキップと branch ref 不変

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 積み直した checkpoint を publish したあと、ローカル branch を publish 済み commit の子孫にする > Scenario: HEAD が detached の場合は再接続しない

---

### TC-013: push 成功時に restack 系 git 操作が一切発生しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: push が成功する通常経路の挙動は変更しない > Scenario: push 成功時に追加の git 操作が発生しない

---

## 設計・タスク由来テストケース（GWT 必須）

### TC-014: CheckpointRestackRecord の fold による収集と historyCount 不変

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `EventRecord` union に `CheckpointRestackRecord` が追加されており、events.jsonl に `checkpoint-restack` record が 1 行含まれる（他の transition / step-attempt record と混在）
**WHEN** `fold()` を実行する
**THEN** `FoldResult.checkpointRestacks[]` に record が収集され、`historyCount` / `stepCounts` / `steps` / `history` は record 追加前と変わらない

---

### TC-015: appendCheckpointRestack が events.jsonl のみを更新し state.json を書き換えない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `JobStateStore` が初期化されており、state.json が初期内容で存在する
**WHEN** `store.appendCheckpointRestack(record)` を呼ぶ
**THEN** events.jsonl に 1 行 append され、state.json の mtime と内容は変化しない

---

### TC-016: temp index（GIT_INDEX_FILE）による tree 構築の git 呼び出しシーケンス

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria / design.md > D3

**GIVEN** fake spawnFn が全呼び出しの引数・env を記録できる状態で `restackCheckpointOntoPublishedTip` を呼ぶ（remote tip / local tip が解決できる正常系）
**WHEN** tree 構築フェーズが実行される
**THEN** git 呼び出しが `read-tree <remoteTip>` → `ls-tree -r <remoteTip> -- <changeDir>/` → `ls-tree -r <localTip> -- <changeDir>/` → `update-index`（必要件数）→ `hash-object -w -- <eventsPath>` → `write-tree` の順で、すべて同一の `GIT_INDEX_FILE` env 付きで実行される

---

### TC-017: rev-parse 空 stdout で push/recordRestack/persistCommit が未呼び出し

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria / design.md > D8

**GIVEN** `git fetch origin <branch>` は成功するが、`git rev-parse refs/remotes/origin/<branch>^{commit}` の stdout が空文字列（remote tip 解決不可）
**WHEN** `restackCheckpointOntoPublishedTip` を呼ぶ
**THEN** `git push` / `recordRestack` callback / `persistCommit` callback が 1 度も呼ばれず、戻り値が `{ kind: "skipped", reason: "no-remote-tip" }` となり、関数は throw しない

---

### TC-018: recordRestack callback の reject で後続 tree 構築・push が継続する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria / design.md > D7

**GIVEN** `recordRestack` callback が `Promise.reject(new Error("journal-write-failed"))` を返す
**WHEN** `restackCheckpointOntoPublishedTip` を呼ぶ（正常系 remote tip あり）
**THEN** 例外を投げず、tree 構築と `git push` が引き続き実行される（`recordRestack` 失敗は warn のみ）

---

### TC-019: persistCommit callback の reject で push が継続する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria / design.md > D7

**GIVEN** `persistCommit` callback が reject する
**WHEN** `restackCheckpointOntoPublishedTip` を呼ぶ（正常系 remote tip あり）
**THEN** 例外を投げず、`git push` が引き続き実行される（`persistCommit` 失敗は warn のみ）

---

### TC-020: write-tree が parent tree と同値の場合は push しない（no-delta）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 / design.md > D3

**GIVEN** `git write-tree` の出力 OID が `git rev-parse <parentOid>^{tree}` の出力と同一（変更なし）
**WHEN** `restackCheckpointOntoPublishedTip` を呼ぶ
**THEN** `git commit-tree` および `git push` が呼ばれず、戻り値が `{ kind: "skipped", reason: "no-delta" }`

---

### TC-021: push 二重失敗で throw せず push-failed を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `git push origin <oid>:refs/heads/<branch>` が 2 回ともエラー（non-zero exit code）を返す
**WHEN** `restackCheckpointOntoPublishedTip` を呼ぶ
**THEN** 関数は throw せず `{ kind: "push-failed", restackedOid, parentOid, stderr }` を返し、git stderr を含む警告メッセージが stderr に出力される

---

### TC-022: graft 後の branch tip tree が restack 前 HEAD の tree と同一

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria / design.md > D6

**GIVEN** restack push が成功し、HEAD が対象 branch を指している（attached HEAD）
**WHEN** graft 処理が実行される（`commit-tree <headTree> -p <localHead> -p <restackedOid>` → `update-ref`）
**THEN** `git update-ref` で更新された branch tip の tree OID がローカル HEAD の tree OID と一致する（`-s ours` 相当の tree 保持）

---

### TC-023: graft 後に restackedOid がローカル branch の ancestor になる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria / design.md > D6

**GIVEN** restack push が成功し graft が完了した後
**WHEN** `git merge-base --is-ancestor <restackedOid> refs/heads/<branch>` を実行する
**THEN** exit code が 0（restackedOid は branch の ancestor）であり、作業 commit もローカル branch から引き続き到達可能である

---

### TC-024: detached HEAD での update-ref 未発行

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria / design.md > D6

**GIVEN** `git symbolic-ref -q HEAD` が non-zero exit code を返す（detached HEAD 状態）
**WHEN** restack push が成功する
**THEN** `git update-ref refs/heads/<branch>` が 1 度も発行されず、`RestackOutcome.graft` が `"skipped"` であり、関数は throw しない

---

### TC-025: push 1 回成功経路の git 呼び出し列が変更前と完全一致

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria / design.md > D1

**GIVEN** `commitFinalState` の `git push` が 1 回目で成功する
**WHEN** `commitFinalState` を実行する
**THEN** 記録された git 呼び出し列が変更前（`commit-push-egress-invariant.test.ts` TC-003）と完全一致し、`fetch` / `ls-tree` / `commit-tree` / `update-ref` など restack 系の git 操作が 1 度も発行されない

---

### TC-026: push 二重失敗後の既存 warn と restack 結果メッセージの出力順

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** `commitFinalState` の push が 2 回とも失敗する（restack は `no-remote-tip` で skip する）
**WHEN** `commitFinalState` が完了する
**THEN** 既存の `"Warning: failed to push ..."` 文言が先に stderr へ出力され、その後に restack 結果（`skipped: no-remote-tip` など）を示すメッセージが 1 件出力される（既存 warn の文言は変更されていない）

---

### TC-027: restack/graft OID が synthesizedCommits 台帳に追記される

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05 Acceptance Criteria / design.md > D6

**GIVEN** `LocalRuntime.commitFinalState` が restack を実行し、restack push と graft の両方が成功する
**WHEN** state.json を読む
**THEN** restack commit OID と graft merge commit OID の両方が `synthesizedCommits` 配列に含まれ、egress backstop がこれらを既知 commit として認識できる

---

### TC-028: worktree/index 変更 git サブコマンドの非発行 invariant

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria / design.md > D3

**GIVEN** fake spawnFn が全 git 呼び出しの argv[0]（サブコマンド）を記録する状態で `restackCheckpointOntoPublishedTip` を正常系で呼ぶ
**WHEN** 処理が完了する
**THEN** 記録されたサブコマンドに `add` / `commit` / `checkout` / `reset` / `stash` / `merge` が 1 件も含まれない（plumbing 操作のみ）

---

### TC-029: reason フィールドに maskSensitive が適用されセンシティブ文字列が伏字化される

**Category**: unit
**Priority**: must
**Source**: design.md > D5 / tasks.md > T-02

**GIVEN** `pushFailureStderr` にセンシティブ文字列（例: `token`, `secret`, `password`）を含む git エラー出力が渡される
**WHEN** `recordRestack` callback が呼ばれる
**THEN** record の `reason` フィールドが `maskSensitive` で伏字化されており、センシティブ文字列が含まれない

---

### TC-030: fetch 失敗を無視して rev-parse に進む（best-effort fetch）

**Category**: unit
**Priority**: should
**Source**: design.md > D8

**GIVEN** `git fetch origin <branch>` が non-zero exit code を返す（ネットワーク障害等）
**WHEN** remote tip 解決フェーズが実行される
**THEN** fetch エラーは無視されて中断せず、次の `git rev-parse refs/remotes/origin/<branch>^{commit}` が実行される

---

### TC-031: restack push 成功後に remote-tracking ref が更新される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02（手順 10）/ design.md > D8

**GIVEN** `git push origin <restackedOid>:refs/heads/<branch>` が成功する
**WHEN** `restackCheckpointOntoPublishedTip` の push 成功後段が実行される
**THEN** `git update-ref refs/remotes/origin/<branch> <restackedOid>` が呼ばれ、remote-tracking ref が積み直し commit を指す

---

### TC-032: graft の git 失敗で throw せず RestackOutcome.graft が "failed" になる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria / design.md > D6

**GIVEN** `git update-ref refs/heads/<branch> <mergeOid> <localHead>` が non-zero exit code を返す
**WHEN** restack 処理が完了する
**THEN** 例外を投げず、`RestackOutcome.graft` が `"failed"` であり、restack push の成功は維持されている（`kind: "published"`）

---

### TC-033: egress 検査失敗経路では restack が呼ばれない

**Category**: unit
**Priority**: must
**Source**: design.md > D1 / tasks.md > T-04

**GIVEN** `commitFinalState` 内の egress backstop（`verifyEgressLedger`）が失敗して早期 return する
**WHEN** `commitFinalState` が完了する
**THEN** `restackCheckpointOntoPublishedTip` は 1 度も呼ばれず、関数は throw しない

---

## Gate テストケース

### TC-034: typecheck が green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-08 Acceptance Criteria

verification フェーズの `bun run typecheck` が green であることを確認する。特に `EventRecord` union への `CheckpointRestackRecord` 追加後に既存の `FoldResult` literal が typecheck エラーを起こさないこと（optional field 設計により既存 literal 変更不要）を固定する。

---

### TC-035: bun run test が全件 green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-08 Acceptance Criteria

verification フェーズの `bun run test` が green であることを確認する。TC-001〜TC-033 の unit / integration テストを含む全テストスイートが通過し、push 成功経路の既存テスト（`commit-push-egress-invariant.test.ts`）が無変更で green であることを固定する。

---

### TC-036: 既存テストファイルへの変更が 0 件

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-08 Acceptance Criteria

verification フェーズで `git diff --name-only main` の変更ファイルに既存テストファイル（`src/core/step/__tests__/commit-push-egress-invariant.test.ts` 等）が含まれないことを確認する。新規テストファイルの追加のみが許容される。

---

## 追裼（reopen iteration 001: PR #1065 review 対応）

### TC-037: remote divergence 検知時の積み直しスキップ（remote-diverged)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: halt checkpoint の push が失敗したとき、最終 publish 済み tip を親として checkpoint を積み直して publish する > Scenario: remote が local history と分岐している場合は積み直しをしない

fake `spawnFn` で `merge-base --is-ancestor` が exitCode 1 を返すとき、outcome が
`skipped`（reason: `remote-diverged`）であり、`checkpoint-restack` record の append
（`recordRestack`）・tree 構築（read-tree / ls-tree / update-index / write-tree / commit-tree）・
push・`persistCommit` がいずれも呼ばれないことを確認する。

---

### TC-038: 別 runner 先行時に remote state を上書きしない（E2E）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: halt checkpoint の push が失敗したとき、最終 publish 済み tip を親として checkpoint を積み直して publish する > Scenario: remote が local history と分岐している場合は積み直しをしない

**実 git（bare remote + 2 clone）で、runner B が同一 branch の change folder を `R1` まで進めて
push 済みの状態から、古い local tip を持つ runner A の checkpoint push を non-fast-forward で
拒否させ restack を実行する。restack が `remote-diverged` で skip し、`origin/<branch>` の tip が
`R1` のまま・`R1` の tree（state.json / events.jsonl / 成果物）が変化しないことを確認する。

---

### TC-039: finalize label では restack が発動しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: halt checkpoint の push が失敗したとき、最終 publish 済み tip を親として checkpoint を積み直して publish する > Scenario: finalize commit の push 失敗では積み直しをしない

`messageLabel: "finalize"` で push が二重失敗したとき、restack 用の git 操作
（fetch / rev-parse origin ref / merge-base / read-tree / commit-tree / update-ref）が 1 度も
発行されず、events.jsonl に `checkpoint-restack` record が追記されず、既存の push 失敗 warn のみで
呼び出しが例外なく完了することを確認する。

---

## Result

```yaml
result: completed
total: 39
automated: 36
manual: 0
must: 36
should: 3
could: 0
blocked_reasons: []
```
