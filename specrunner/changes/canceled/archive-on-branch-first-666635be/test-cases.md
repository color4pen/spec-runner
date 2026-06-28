# Test Cases: archive をブランチ上で先に実行し、base への直接影響を merge のみに限定する

## Summary

- **Total**: 35 cases
- **Automated** (unit/integration): 33
- **Manual**: 2
- **Priority**: must: 14, should: 20, could: 1

---

## Requirement: merge なしの archive 記帳は feature branch 上で行い base に触れない

### TC-001: base に対する git 操作を行わない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: merge なしの archive 記帳は feature branch 上で行い base に触れない > Scenario: base に対する git 操作を行わない

### TC-002: 記帳コミットが feature branch に乗り remote へ push される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: merge なしの archive 記帳は feature branch 上で行い base に触れない > Scenario: 記帳コミットが feature branch に乗り remote へ push される

### TC-003: protected base 環境でも成功する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: merge なしの archive 記帳は feature branch 上で行い base に触れない > Scenario: protected base 環境でも成功する

---

## Requirement: base への到達経路を PR merge のみに限定する

### TC-004: 記帳は merge を通じてのみ base に入る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: base への到達経路を PR merge のみに限定する > Scenario: 記帳は merge を通じてのみ base に入る

---

## Requirement: `--with-merge` は記帳 → CI green 待ち → merge → cleanup の順で実行する

### TC-005: 記帳が merge の前に push される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `--with-merge` は記帳 → CI green 待ち → merge → cleanup の順で実行する > Scenario: 記帳が merge の前に push される

### TC-006: cleanup は merge 成功後にのみ走る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `--with-merge` は記帳 → CI green 待ち → merge → cleanup の順で実行する > Scenario: cleanup は merge 成功後にのみ走る

### TC-007: merge を伴わない archive は cleanup しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `--with-merge` は記帳 → CI green 待ち → merge → cleanup の順で実行する > Scenario: merge を伴わない archive は cleanup しない

---

## Requirement: status lifecycle は記帳段階と terminal 段階を区別する

### TC-008: 記帳のみでは archived にならない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: status lifecycle は記帳段階と terminal 段階を区別する > Scenario: 記帳のみでは archived にならない

### TC-009: merge 完了後にのみ archived へ遷移する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: status lifecycle は記帳段階と terminal 段階を区別する > Scenario: merge 完了後にのみ archived へ遷移する

### TC-010: 遷移規則が archived を merge 経路に限定する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: status lifecycle は記帳段階と terminal 段階を区別する > Scenario: 遷移規則が archived を merge 経路に限定する

---

## Requirement: archive は冪等であり中断後に再実行で回復できる

### TC-011: 記帳済み feature branch への再実行は no-op

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: archive は冪等であり中断後に再実行で回復できる > Scenario: 記帳済み feature branch への再実行は no-op

### TC-012: 既に merged なら cleanup のみ実行する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: archive は冪等であり中断後に再実行で回復できる > Scenario: 既に merged なら cleanup のみ実行する

### TC-013: 記帳未実施のまま外部 merge 済みの PR で `--with-merge` を実行する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: archive は冪等であり中断後に再実行で回復できる > Scenario: 記帳未実施のまま外部 merge 済みの PR で `--with-merge` を実行する

### TC-014: terminal status は no-op

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: archive は冪等であり中断後に再実行で回復できる > Scenario: terminal status は no-op

---

## T-01: status lifecycle — canTransition 個別アサーション

### TC-015: awaiting-archive → archive-recorded 遷移が許可される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 > Acceptance Criteria

**GIVEN** lifecycle モジュールの VALID_TRANSITIONS テーブルがある
**WHEN** `canTransition("awaiting-archive", "archive-recorded")` を呼ぶ
**THEN** `true` を返す

### TC-016: archive-recorded → archived 遷移が許可される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 > Acceptance Criteria

**GIVEN** lifecycle モジュールの VALID_TRANSITIONS テーブルがある
**WHEN** `canTransition("archive-recorded", "archived")` を呼ぶ
**THEN** `true` を返す

### TC-017: archive-recorded → canceled 遷移が許可される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 > Acceptance Criteria

**GIVEN** lifecycle モジュールの VALID_TRANSITIONS テーブルがある
**WHEN** `canTransition("archive-recorded", "canceled")` を呼ぶ
**THEN** `true` を返す

### TC-018: archive-recorded から未許可ステータスへの遷移が拒否される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 > Acceptance Criteria

**GIVEN** lifecycle モジュールの VALID_TRANSITIONS テーブルがある
**WHEN** `canTransition("archive-recorded", "running")` など未定義遷移先を呼ぶ
**THEN** `false` を返す

### TC-019: archive-recorded は terminal ではない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 > Acceptance Criteria

**GIVEN** lifecycle モジュールの TERMINAL_STATUSES 集合がある
**WHEN** `isTerminal("archive-recorded")` を呼ぶ
**THEN** `false` を返す

---

## T-02: JobStatus consumer への archive-recorded 反映

### TC-020: ps で archive-recorded の job が PR open 扱いで表示される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 > Acceptance Criteria

**GIVEN** status が `archive-recorded` の job が存在する
**WHEN** `ps`（または ps.ts の表示ロジック）を実行する
**THEN** `awaiting-archive` と同様に PR open ヒント対象として扱われ、merged チェックの対象になる

### TC-021: archive-recorded の job を cancel（--force なし）すると open PR ガードで停止する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 > Acceptance Criteria

**GIVEN** status が `archive-recorded` の job が存在する
**WHEN** `job cancel <slug>`（`--force` なし）を呼ぶ
**THEN** "PR open のため --force 必要" 旨のエラーメッセージで停止し、status は変更されない

### TC-022: doctor の orphan sidecar 判定が archive-recorded を orphan としない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 > Acceptance Criteria

**GIVEN** status が `archive-recorded` の job に対応する sidecar ディレクトリが存在する
**WHEN** doctor の orphan sidecar チェックを実行する
**THEN** その sidecar は orphan として報告されない

### TC-023: reconcilePrState で archive-recorded かつ MERGED なら archived へ遷移する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 > Acceptance Criteria

**GIVEN** status が `archive-recorded`、PR status が `MERGED` の job がある
**WHEN** `reconcilePrState` を呼ぶ
**THEN** `archived` への `TransitionResult` を返す

---

## T-03: markJobArchiveRecorded / markJobArchived の分割

### TC-024: markJobArchiveRecorded が awaiting-archive → archive-recorded 遷移を永続化する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 > Acceptance Criteria

**GIVEN** status が `awaiting-archive` の job の state.json がある
**WHEN** `markJobArchiveRecorded(slug, stateRoot)` を呼ぶ
**THEN** state.json の status フィールドが `archive-recorded` に更新される

### TC-025: markJobArchiveRecorded は archive-recorded 状態での再実行で no-op になる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 > Acceptance Criteria

**GIVEN** status が既に `archive-recorded` の job がある
**WHEN** `markJobArchiveRecorded(slug, stateRoot)` を再実行する
**THEN** エラーなく正常終了し、status は `archive-recorded` のまま変化しない

### TC-026: markJobArchived が archive-recorded → archived 遷移を永続化する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 > Acceptance Criteria

**GIVEN** status が `archive-recorded` の job の state.json がある
**WHEN** `markJobArchived(slug, stateRoot)` を呼ぶ
**THEN** state.json の status フィールドが `archived` に更新される

### TC-027: assertJobFinishable が awaiting-archive / archive-recorded を finishable と判定する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 > Acceptance Criteria

**GIVEN** status が `awaiting-archive` または `archive-recorded` の job state がある
**WHEN** `assertJobFinishable(state)` を呼ぶ
**THEN** 例外を投げずに正常終了する。status が `running` の場合は `JOB_NOT_FINISHABLE` エラーを投げる

---

## T-04: orchestrator の client-closed 不変

### TC-028: orchestrator が github-client port を import しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 > Acceptance Criteria / design.md > D1

**GIVEN** `src/core/archive/orchestrator.ts` のソースコード
**WHEN** import 文を静的解析する（またはテストで import グラフを検査する）
**THEN** `src/core/port/github-client.ts` への直接 import が存在しない

---

## T-05: recordArchiveOnBranch の動作ディレクトリ解決と異常系

### TC-029: worktree mode で記帳の git 操作が worktreePath を cwd として実行される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 > Acceptance Criteria

**GIVEN** `noWorktree === false`、解決済みの worktreePath がある job
**WHEN** `recordArchiveOnBranch` を実行する
**THEN** `archiveChangeFolder`・`commitArchive`・`deriveAndWriteUsage` に渡される `cwd` 引数が worktreePath になり、base パスを参照しない

### TC-030: no-worktree mode で uncommitted changes があると escalation で停止する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 / design.md > D1（no-worktree mode のブランチ切り替えシーケンス）

**GIVEN** `noWorktree === true`、cwd に uncommitted changes が存在する（`git status --porcelain` が非空）
**WHEN** `recordArchiveOnBranch` を実行する
**THEN** uncommitted changes を検出して escalation（exit 1 + ガイダンスメッセージ）で停止し、`git checkout <featureBranch>` / commit は実行されない

### TC-031: worktreePath 解決不能時に escalation を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 > Acceptance Criteria

**GIVEN** worktree mode だが `resolveWorktreePathForArchive` が解決不能を返す
**WHEN** `recordArchiveOnBranch` を実行する
**THEN** escalation（exit 1 + 記帳先 feature branch 特定不可の旨 + 再実行ガイダンス）で停止する

---

## T-06: merge 失敗時の cleanup 抑止

### TC-032: merge 失敗・timeout・conflict で cleanup が呼ばれない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06 > Acceptance Criteria

**GIVEN** `--with-merge` フロー、squash merge またはそれ以前（wait timeout / conflict / guard ブロック）が失敗する
**WHEN** 失敗後の後続処理
**THEN** `cleanupAfterMerge`（worktree remove / branch delete）は呼ばれず、escalation で停止する。feature branch は記帳コミット付きで残る

---

## D2: cleanupAfterMerge の git pull 失敗耐性

### TC-033: cleanupAfterMerge で git pull --ff-only 失敗は非致命的

**Category**: unit
**Priority**: should
**Source**: design.md > D2（Rationale）

**GIVEN** merge 完了後の `cleanupAfterMerge` フロー、`git pull --ff-only` が失敗する（ネットワーク断等）
**WHEN** `cleanupAfterMerge` を実行する
**THEN** pull 失敗を警告ログに記録し処理を継続する。`markJobArchived` および worktree/branch cleanup の後続ステップが実行され、再実行で回復可能な旨のメッセージが出力される

---

## T-11: 全体ビルド検証

### TC-034: typecheck && test が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-11 > Acceptance Criteria

**GIVEN** T-01 〜 T-10 の全実装が完了している
**WHEN** プロジェクトの検証コマンド（`typecheck && test`）を実行する
**THEN** typecheck がエラーなく通り、全テストが pass する

---

## D6: ADR 生成

### TC-035: ADR が生成され ADR-20260603 を supersede する

**Category**: manual
**Priority**: could
**Source**: design.md > D6 / tasks.md > T-01 補足

**GIVEN** adr-gen step が完了している
**WHEN** `specrunner/adr/` ディレクトリを確認する
**THEN** ADR-20260603 を supersede する新 ADR ファイルが存在し、branch 規律優先の受容根拠・status lifecycle 再設計・client-closed 性質の一部後退が明記されている

---

## Result

```yaml
result: completed
total: 35
automated: 33
manual: 2
must: 14
should: 20
could: 1
blocked_reasons: []
```
