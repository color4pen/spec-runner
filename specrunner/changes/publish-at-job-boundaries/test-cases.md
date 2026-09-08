# Test Cases: job 境界での成果公開

## Summary

- **Total**: 34 cases
- **Automated** (unit/integration): 31
- **Manual**: 2
- **Priority**: must: 29, should: 4, could: 1

### TC-001: 複数の local step 成果を push せず蓄積する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: local step completion preserves revisions without publication > Scenario: steps accumulate locally

### TC-002: commit-only が安全でない出力を採用しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: local step completion preserves revisions without publication > Scenario: unsafe output is not adopted

### TC-003: 差分なしでも未送信 commit を再送する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: publication is independent from commit creation > Scenario: no-diff retry

### TC-004: 複数の検査済み commit を identity を保ったまま一括公開する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: publication is independent from commit creation > Scenario: multiple commits are batched

### TC-005: ledger 外 commit を fail closed で拒否する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: publication is independent from commit creation > Scenario: unknown commit fails closed

### TC-006: 初回 PR 作成の前後で所定順に公開する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: PR processing follows successful result publication > Scenario: first PR creation

### TC-007: 既存 PR の再試行で重複 PR を作らない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: PR processing follows successful result publication > Scenario: existing PR retry

### TC-008: pre-PR 公開失敗時に PR API を呼ばない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: PR processing follows successful result publication > Scenario: pre-PR publication fails

### TC-009: post-PR 公開失敗後も冪等に再試行できる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: PR processing follows successful result publication > Scenario: post-PR publication fails

### TC-010: GitHub 無効 job の正常完了を PR なしで公開する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: normal completion without PR publishes the branch > Scenario: GitHub-disabled completion

### TC-011: pr-create なし profile の最終 checkpoint を公開する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: normal completion without PR publishes the branch > Scenario: no-PR profile completion

### TC-012: halt 公開設定を新規 job に snapshot する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: halt publication is an explicit stable job policy > Scenario: configured policy is stored

### TC-013: resume・reopen・attach で保存済み policy を維持する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: halt publication is an explicit stable job policy > Scenario: config changes later

### TC-014: legacy state の halt 公開を既定で有効化する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: halt publication is an explicit stable job policy > Scenario: legacy policy

### TC-015: config effective に解決値と source/default を表示する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: halt publication is an explicit stable job policy > Scenario: effective value is visible

### TC-016: halt 公開有効時に別 checkout から再開できる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: controlled halts save safely and publish conditionally > Scenario: enabled halt supports remote resume

### TC-017: halt 公開無効時に同一 worktree から再開できる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: controlled halts save safely and publish conditionally > Scenario: disabled halt supports local resume

### TC-018: pipeline 前 fidelity gate halt に保存済み policy を適用する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: controlled halts save safely and publish conditionally > Scenario: gate halt follows policy

### TC-019: halt push 失敗を remote-ready と表示しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: controlled halts save safely and publish conditionally > Scenario: halt push failure

### TC-020: halt checkpoint に未検査残余を取り込まない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: controlled halts save safely and publish conditionally > Scenario: residual output is not swept in

### TC-021: signal stop はローカル保存だけを行う

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: abrupt termination remains local-only > Scenario: signal stop

### TC-022: Actions の復旧ガイドが突然終了時の喪失可能性を説明する

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: abrupt termination remains local-only > Scenario: ephemeral runner guidance

### TC-023: PR API failure を push failure と区別する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: failures are phase-specific and retryable > Scenario: API failure differs from push failure

### TC-024: 各公開 phase を新しいファイルなしで再試行する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: failures are phase-specific and retryable > Scenario: retry with no new files

### TC-025: archive push 失敗時に遷移と cleanup を抑止する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: archive and managed runtime contracts remain intact > Scenario: archive push failure

### TC-026: managed runtime の remote handoff を維持する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: archive and managed runtime contracts remain intact > Scenario: managed runtime

### TC-027: halt 公開設定が boolean 以外を拒否する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01: 設定と job policy snapshot を追加する

**GIVEN** `pipeline.publishCheckpointOnHalt` に boolean 以外の値を指定した project または user config
**WHEN** config schema の検証と解決を行う
**THEN** 設定エラーとなり job は作成されない

### TC-028: publish-only が同期済み branch を型付き結果で返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02: commit-only と publish-only を分離する

**GIVEN** `origin/<branch>` と HEAD が一致し outgoing commit がない
**WHEN** publish-only API を実行する
**THEN** push や commit を作成せず `already-synchronized` の typed result を返す

### TC-029: agent prompt と低水準経路に途中 push の迂回がない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03: local の途中経路を commit-only 化する

**GIVEN** local runtime の normal step、fixer、reverification、parallel round、verification の prompt と finalizer
**WHEN** behavior/static contract test で途中公開経路を検査する
**THEN** agent への push 指示も publish-only API 以外の低水準 push 呼び出しも存在しない

### TC-030: PR なし正常完了の公開失敗を未公開として保持する

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05: PR なし正常終了を公開する

**GIVEN** GitHub client を使用しない GitHub-disabled job または pr-create なし profile の成果と最終記録が commit 済みである
**WHEN** remote feature branch への publish が失敗する
**THEN** 正常公開完了を表示せず、未送信 commit と local retry state を保持し、PR API を呼ばない

### TC-031: beforeExit と process loss が publication API を呼ばない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07: signal、archive、managed の回帰を防ぐ

**GIVEN** local job に未送信 commit があり beforeExit または process-loss 経路が発生する
**WHEN** 終了処理がローカル状態を保存する
**THEN** controlled-halt 用 publication API は呼ばれず、新しい遠隔復旧保証も行われない

### TC-032: 公開境界と復旧契約の文書を実装に同期する

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-08: CLI と文書を同期する

**GIVEN** 実装済みの公開境界、既定 true の job snapshot、Actions 設定、archive と runtime の責務
**WHEN** README、guide、config reference、operations、Actions 例、architecture と CLI snapshot を確認する
**THEN** 各文書が実装と一致し、token 種別に依存しない境界、controlled halt と突然終了の差、disabled 時に remote recovery を約束しないことを説明している

### TC-033: project verification を一度だけ完了し証跡化する

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-09: 統合検証と証跡を完了する

充足を担う verification commands: `build`, `typecheck`, `test`, `lint`。隔離 fixture を使用し、実 GitHub/Vercel/credential を必要とせず、結果を verification evidence に一度だけ記録する。

### TC-034: local runtime の公開方針を agent provider に依存させない

**Category**: integration
**Priority**: could
**Source**: design.md > Decisions > D4. halt 公開方針を明示設定し job に固定する

**GIVEN** 同一の保存済み halt 公開 policy を持つ local jobs が異なる agent provider で実行される
**WHEN** 各 job が同じ controlled halt または正常公開境界に到達する
**THEN** provider や CI 環境変数から policy を推測せず、同じ保存済み policy と公開境界が適用される

## Result

```yaml
result: completed
total: 34
automated: 31
manual: 2
must: 29
should: 4
could: 1
blocked_reasons: []
```
