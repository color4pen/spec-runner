# Test Cases: pipeline を唯一の committer にする（検査モデル → 合成モデル）

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
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
-->

## Summary

- **Total**: 34 cases
- **Automated** (unit/integration): 34 (unit: 32, integration: 2)
- **Manual**: 0
- **Priority**: must: 19, should: 15, could: 0

---

## R1: sequential step 合成（mixed reset + 明示パス）

### TC-001: agent 自己 commit を mixed reset で歴史から除外し合成し直す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: sequential step の commit は合成で構成する > Scenario: agent 自己 commit を mixed reset で歴史から除外し合成し直す

---

### TC-002: agent 自己 commit の正当な作業内容が無損失で合成 commit に入る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: sequential step の commit は合成で構成する > Scenario: agent 自己 commit の正当な作業内容が無損失で合成 commit に入る

---

### TC-003: agent 自己 commit が無くても合成は起点から構成される

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: sequential step の commit は合成で構成する > Scenario: agent 自己 commit が無くても合成は起点から構成される

---

### TC-004: scoped step は宣言 path + 管理 path のみを明示 commit する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: scoped / guarded 双方の staging は明示パス指定とし裸の `git add -A` を全廃する > Scenario: scoped step は宣言 path + 管理 path のみを明示 commit する

---

### TC-005: guarded step の実変更列挙が正当な変更を 1 個も落とさない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: scoped / guarded 双方の staging は明示パス指定とし裸の `git add -A` を全廃する > Scenario: guarded step の実変更列挙が正当な変更を 1 個も落とさない

---

### TC-006: push-as-is 経路と自己 commit 範囲検査のコードが削除されている

**Category**: unit
**Priority**: should
**Source**: design.md > D7: 過去必要性が消える inspection 経路の除去とテスト移行 / tasks.md > T-04

**GIVEN** 本変更適用後の `src/core/step/commit-push.ts` および `commitAndPushTail`
**WHEN** 静的解析で push-as-is 経路（`commit-push.ts:237-247`）および自己 commit 範囲検査（`listCommitRangeChangedPaths` / `findScopedCommitViolations` の tail 呼び出し）を検索する
**THEN** 該当コードパスが存在しない

---

## R2: commitFinalState 限定化

### TC-007: 事前 stage された許可外ファイルが checkpoint / finalize に混入しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: checkpoint / finalize の commit 対象を pipeline 管理パスに限定する > Scenario: 事前 stage された許可外ファイルが checkpoint / finalize に混入しない

---

### TC-008: agent 未 commit 作業内容は checkpoint に残らず worktree に残存する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: checkpoint / finalize の commit 対象を pipeline 管理パスに限定する > Scenario: agent 未 commit 作業内容は checkpoint に残らず worktree に残存する

---

## R3: parallel round HEAD guard

### TC-009: reviewer が正典を弱化して自己 commit → round halt

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: parallel round は fan-out 前後の HEAD 前進を違反として halt する > Scenario: reviewer が正典を弱化して自己 commit → round halt

---

### TC-010: reviewer が何も commit しなければ round は現行どおり進む

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: parallel round は fan-out 前後の HEAD 前進を違反として halt する > Scenario: reviewer が何も commit しなければ round は現行どおり進む

---

### TC-011: round HEAD guard 違反時に diff 退避証跡が生成される

**Category**: unit
**Priority**: must
**Source**: design.md > D3: parallel round に fan-out 前後の HEAD guard を追加する / tasks.md > T-07

**GIVEN** parallel reviewer が fan-out 後に `request.md` を弱化して自己 commit し、worktree が clean になった
**WHEN** `ParallelReviewRound` が HEAD 照合を行う
**THEN** `<headBeforeRound>..HEAD` の diff が `.specrunner/local/<slug>/` へ退避されており、`roundError.code === "ROUND_HEAD_ADVANCED"` で escalation halt し、push は実行されない

---

## R4: egress backstop（公開範囲照合）

### TC-012: 台帳未記録の commit を公開範囲に含む push は halt する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: push 直前に公開範囲を合成 commit 台帳と照合する（egress backstop） > Scenario: 台帳未記録の commit を公開範囲に含む push は halt する

---

### TC-013: 合成 commit のみの公開範囲は push される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: push 直前に公開範囲を合成 commit 台帳と照合する（egress backstop） > Scenario: 合成 commit のみの公開範囲は push される

---

### TC-014: egress の git rev-list 失敗は halt する

**Category**: unit
**Priority**: should
**Source**: design.md > D4: egress = 公開範囲を合成 commit 台帳と照合する単一の壁 / tasks.md > T-03

**GIVEN** push 直前の `git rev-list HEAD --not --remotes=origin` が spawn 失敗または非 0 exit を返す
**WHEN** pipeline が egress 照合を試みる
**THEN** 黙殺せず `EGRESS_UNKNOWN_COMMIT` で halt し、`git push` は呼ばれない

---

## R5: git 操作 fail-closed 化

### TC-015: mixed reset 失敗は halt する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 合成・復帰経路の git 操作失敗を fail-closed 化する > Scenario: mixed reset 失敗は halt する

---

### TC-016: 実変更列挙の status 失敗は halt する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 合成・復帰経路の git 操作失敗を fail-closed 化する > Scenario: 実変更列挙の status 失敗は halt する

---

### TC-017: 合成経路の git add 失敗は halt する

**Category**: unit
**Priority**: should
**Source**: design.md > D5: 合成・復帰経路の git 操作を fail-closed 化する / tasks.md > T-06

**GIVEN** scoped または guarded 合成経路の `git add -A -- <paths>` が非 0 exit を返す
**WHEN** pipeline が明示 pathspec で staging を試みる
**THEN** 黙殺せず typed error（`commitEffectFailedError` 等）で halt する

---

### TC-018: 合成経路の git commit 失敗は halt する

**Category**: unit
**Priority**: should
**Source**: design.md > D5: 合成・復帰経路の git 操作を fail-closed 化する / tasks.md > T-06

**GIVEN** 合成経路の `git commit -- <paths>` が非 0 exit を返す
**WHEN** pipeline が合成 commit を作成しようとする
**THEN** 黙殺せず typed error で halt し、push は実行されない

---

## R6: 実 git E2E（封鎖証明）

### TC-019: R6-1 — 事前 stage 許可外ファイルの封鎖（実 git E2E）

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-12 / request.md > R6-1

**GIVEN** 実ローカル git repo（temp dir、push のみ intercept）で、scoped step 実行前に `src/secret.ts` を `git add` して index に stage した
**WHEN** step 合成 commit → checkpoint → finalize（`commitFinalState`）を順に実行し、`git rev-list HEAD --not --remotes=origin` 相当で公開範囲を列挙する
**THEN** いずれの commit にも `src/secret.ts` が含まれず、push 系列（公開範囲）の祖先に `src/secret.ts` の blob が存在しない

---

### TC-020: R6-2 — parallel reviewer 自己 commit 封鎖（実 git E2E）

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-13 / request.md > R6-2

**GIVEN** 実ローカル git repo で、parallel reviewer が round 中に `request.md` の内容を弱化して `git commit` し、worktree を clean にした
**WHEN** `ParallelReviewRound` が fan-out 後に HEAD を照合する
**THEN** `ROUND_HEAD_ADVANCED` で escalation halt し、退避証跡が生成され、`git rev-list HEAD --not --remotes=origin` 相当で弱化 commit が push 系列に存在しない（mixed reset で除外済み）

---

## 静的解析: 裸 `git add -A` 全廃

### TC-021: `src/` に裸の `git add -A` が存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: scoped / guarded 双方の staging は明示パス指定とし裸の `git add -A` を全廃する > Scenario: `src/` に裸の `git add -A` が存在しない

---

## 合成 commit 台帳（synthesizedCommits）

### TC-022: synthesizedCommits は既存 state.json と後方互換である

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `synthesizedCommits` field を持たない既存の `state.json`
**WHEN** state schema でパースまたは読み込む
**THEN** `synthesizedCommits` は `undefined` と扱われ、空集合相当として照合・append が正常動作する。既存の `StepRun.commitOid` 定義・docstring は無改変である

---

### TC-023: sequential 合成 commit OID が synthesizedCommits 台帳に append される

**Category**: unit
**Priority**: should
**Source**: design.md > D4: 台帳 append 点 / tasks.md > T-08

**GIVEN** scoped step または guarded step が合成 commit を作成した
**WHEN** `CommitOrchestrator.commitSuccess` が呼ばれる
**THEN** 合成 commit の HEAD OID が `synthesizedCommits` に append されており、重複 OID は加えられない

---

### TC-024: round 合成 commit OID が synthesizedCommits 台帳に append される

**Category**: unit
**Priority**: should
**Source**: design.md > D4: 台帳 append 点 / tasks.md > T-08

**GIVEN** `commitRoundArtifacts` が round の合成 commit を作成した
**WHEN** `CommitOrchestrator.commitRound` で OID を捕捉する
**THEN** round 合成 commit OID が `synthesizedCommits` に append される

---

### TC-025: verification（CLI step）commit OID が台帳に append され後続 push が誤 halt しない

**Category**: unit
**Priority**: should
**Source**: design.md > D4: 台帳 append 点（CLI step） / tasks.md > T-08

**GIVEN** `propagateVerificationResult` が commit + push を実行した
**WHEN** `runCliStep` が step.run 後の exit-HEAD を捕捉し、`CommitOrchestrator` 経由で台帳へ append する
**THEN** verification commit OID が `synthesizedCommits` に記録され、push 失敗 resume 後の後続 push で egress 照合が誤 halt しない

---

## \#888: bite-evidence-result.md

### TC-026: bite-evidence-result.md が合成 commit に取り込まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: bite-evidence-result.md を pipeline 管理パスに含める（#888 の同時解消） > Scenario: bite-evidence-result.md が合成 commit に取り込まれる

---

### TC-027: bite-evidence-result.md の残留が round guard を誤発火させない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: bite-evidence-result.md を pipeline 管理パスに含める（#888 の同時解消） > Scenario: bite-evidence-result.md の残留が round guard を誤発火させない

---

## write-scope 違反（guarded）

### TC-028: guarded step が保護正典を変更した場合 → 退避して halt

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: guarded の write-scope 違反は退避して fail-closed halt する > Scenario: guarded step が保護正典を変更 → 退避して halt

---

## commitOid 意味論不変

### TC-029: revision 束縛・canonHash 束縛の既存挙動が保存される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: commitOid の意味論を不変に保つ > Scenario: revision 束縛・canonHash 束縛の既存挙動が保存される

---

### TC-030: StepRun.commitOid の型定義・docstring が無改変である

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 / design.md > D4

**GIVEN** 本変更適用後の `src/state/schema/types.ts`
**WHEN** `StepRun.commitOid` の型定義と docstring を本変更前と diff する
**THEN** 変更が 0 行であり、`synthesizedCommits` は独立した新規 field として追加されている

---

## 破壊確認（Destruction Confirmation）

### TC-031: 裸 `git add -A` へ戻すと R6-1 E2E および checkpoint 混入テストが fail する

**Category**: unit
**Priority**: should
**Source**: design.md > D8: 破壊確認 / tasks.md > T-12 / T-16

**GIVEN** `commitFinalState` および scoped 合成経路を裸の `git add -A`（pathspec なし）へ戻した修正前挙動
**WHEN** TC-019（R6-1 E2E）および TC-007（checkpoint 混入なし）を実行する
**THEN** 両テストが fail する（封鎖の有効性の記録）

---

### TC-032: HEAD guard を除去すると R6-2 E2E および round halt テストが fail する

**Category**: unit
**Priority**: should
**Source**: design.md > D8: 破壊確認 / tasks.md > T-13 / T-16

**GIVEN** `ParallelReviewRound` の fan-out 前後 HEAD 照合ロジックを除去した修正前挙動
**WHEN** TC-020（R6-2 E2E）および TC-009（round halt）を実行する
**THEN** 両テストが fail する（封鎖の有効性の記録）

---

### TC-033: push-as-is 経路へ戻すと「agent 著 commit が歴史に無い」テストが fail する

**Category**: unit
**Priority**: should
**Source**: design.md > D8: 破壊確認 / tasks.md > T-16

**GIVEN** `commitAndPush` を push-as-is 経路（agent 著 commit を検査後そのまま push）へ戻した修正前挙動
**WHEN** TC-001（mixed reset 除外）および TC-002（作業内容無損失）を実行する
**THEN** 両テストが fail する（封鎖の有効性の記録）

---

## 全体検証

### TC-034: typecheck && test が green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-17 / request.md 受け入れ基準

**GIVEN** 全 T-01〜T-16 の実装変更を適用した状態
**WHEN** `typecheck && test` を実行する
**THEN** 全件 pass。revision 束縛（`select-pending-revision-binding` / `conformance-revision-binding` / `achieved-assurance-revision-binding-*`）・canonHash 束縛（`parallel-review-round-canon` / `canon-binding-e2e`）の既存テストが無改変（diff なし）で green のまま通過する

---

## Result

```yaml
result: completed
total: 34
automated: 34
manual: 0
must: 19
should: 15
could: 0
blocked_reasons: []
```
