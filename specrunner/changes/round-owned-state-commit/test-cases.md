# Test Cases: 並列 round の state commit を coordinator が round 単位で所有する（member no-persist）

## Summary

- **Total**: 36 cases
- **Automated** (unit/integration): 32
- **Manual**: 4
- **Priority**: must: 26, should: 9, could: 1

---

## Group 1: member no-persist（spec Scenario 由来）

### TC-001: round member の実行は state を persist しない

- **Category**: integration
- **Priority**: must
- **Source**: spec.md > Requirement: member 実行経路は state を persist しない > Scenario: round member の実行は state を persist しない

### TC-002: 逐次経路の step 実行は従来どおり persist する

- **Category**: integration
- **Priority**: must
- **Source**: spec.md > Requirement: member 実行経路は state を persist しない > Scenario: 逐次経路の step 実行は従来どおり persist する

---

## Group 2: 単一 round commit（spec Scenario 由来）

### TC-003: fan-out round は単一 commit で確定する

- **Category**: integration
- **Priority**: must
- **Source**: spec.md > Requirement: coordinator は round 完了後に一度だけ CommitOrchestrator 経由で commit する > Scenario: fan-out round は単一 commit で確定する

### TC-004: 全 member approved の fast path も単一 commit で確定する

- **Category**: integration
- **Priority**: must
- **Source**: spec.md > Requirement: coordinator は round 完了後に一度だけ CommitOrchestrator 経由で commit する > Scenario: 全 member approved の fast path も単一 commit で確定する

---

## Group 3: crash 整合性（spec Scenario 由来）

### TC-005: fan-out 途中に部分 projection が残らない

- **Category**: integration
- **Priority**: must
- **Source**: spec.md > Requirement: crash 相当で on-disk state は member 部分 projection にならない > Scenario: fan-out 途中に部分 projection が残らない

---

## Group 4: verdict / reviewer status 不変（spec Scenario 由来）

### TC-006: aggregate verdict が従来と一致する

- **Category**: integration
- **Priority**: must
- **Source**: spec.md > Requirement: round の verdict 集約・reviewer status の結果を不変に保つ > Scenario: aggregate verdict が従来と一致する

### TC-007: member escalation / halt が aggregate escalation を導く

- **Category**: integration
- **Priority**: must
- **Source**: spec.md > Requirement: round の verdict 集約・reviewer status の結果を不変に保つ > Scenario: member escalation / halt が aggregate escalation を導く

---

## Group 5: verdictOfResult pure helper（T-01）

### TC-008: verdictOfResult — success(approved) → "approved"

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-01

**GIVEN** `StepExecutionResult { kind: "success", completion: { verdict: "approved", ... } }`
**WHEN** `verdictOfResult(result)` を呼ぶ
**THEN** `"approved"` が返る

### TC-009: verdictOfResult — success(needs-fix) → "needs-fix"

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-01

**GIVEN** `StepExecutionResult { kind: "success", completion: { verdict: "needs-fix", ... } }`
**WHEN** `verdictOfResult(result)` を呼ぶ
**THEN** `"needs-fix"` が返る

### TC-010: verdictOfResult — success(verdict: null) → "escalation"

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-01

**GIVEN** `StepExecutionResult { kind: "success", completion: { verdict: null, ... } }`
**WHEN** `verdictOfResult(result)` を呼ぶ
**THEN** `"escalation"` が返る

### TC-011: verdictOfResult — skipped → "skipped"

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-01

**GIVEN** `StepExecutionResult { kind: "skipped", ... }`
**WHEN** `verdictOfResult(result)` を呼ぶ
**THEN** `"skipped"` が返る

### TC-012: verdictOfResult — halt → "escalation"

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-01

**GIVEN** `StepExecutionResult { kind: "halt", ... }`
**WHEN** `verdictOfResult(result)` を呼ぶ
**THEN** `"escalation"` が返る

---

## Group 6: produceResult — producer-only 経路（T-02）

### TC-013: produceResult が store mutation API を一度も呼ばない

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-02

**GIVEN** fake store（`persist` / `update` / `appendHistory` / `fail` を spy）を `deps.storeFactory` に据えた `StepExecutor`
**WHEN** `produceResult(memberStep, baseState, roundDeps)` を呼ぶ
**THEN** `store.persist` / `store.update` / `store.appendHistory` / `store.fail` が一度も呼ばれない
**AND** 戻り値が `StepExecutionResult`（`success` / `skipped` / `halt` のいずれか）である

### TC-014: produceResult — producer guard halt は { kind: "halt" } を返し reject しない

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md > T-02

**GIVEN** producer が guard halt（非 success completion）を返すよう設定した step
**WHEN** `produceResult(step, baseState, deps)` を呼ぶ
**THEN** `{ kind: "halt", halt: ... }` が返る
**AND** Promise が reject されない

### TC-015: produceResult — producer 外 throw は halt へ正規化して reject しない

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md > T-02

**GIVEN** `buildStepContext` 等 producer 外の処理で予期せぬ throw が発生するよう設定した step
**WHEN** `produceResult(step, baseState, deps)` を呼ぶ
**THEN** throw が捕捉され `{ kind: "halt", halt: makeAgentThrowHalt(err, ...) }` として返る
**AND** Promise が reject されない

### TC-016: produceResult — 正常終了時に step:start / step:complete が発火する

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md > T-02（event fidelity）

**GIVEN** event emitter を接続した `StepExecutor`
**WHEN** `produceResult` を呼び、正常な `StepExecutionResult` が返る
**THEN** `step:start` が先頭で emit され、`step:complete` が末尾で emit される

### TC-017: produceResult — halt / throw 正規化時に step:error が発火する

- **Category**: unit
- **Priority**: could
- **Source**: tasks.md > T-02（event fidelity）

**GIVEN** event emitter を接続した `StepExecutor`、producer guard halt または producer 外 throw が発生する step
**WHEN** `produceResult` を呼ぶ
**THEN** `step:error` が emit される（payload の `state` は引数の base state）

---

## Group 7: commitRound — 単一 persist と state 組み立て（T-03）

### TC-018: commitRound が store.persist をちょうど 1 回呼ぶ

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-03

**GIVEN** fake store（`persist` を counter spy）、2 member（success/approved と success/needs-fix）の `StepExecutionResult`、coordinator patch を渡した `CommitOrchestrator`
**WHEN** `commitRound(params)` を呼ぶ
**THEN** `store.persist` がちょうど 1 回呼ばれる

### TC-019: commitRound — members:[] の fast path でも coordinator patch + 単一 persist が成立する

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-03

**GIVEN** `members: []`（pending 無し）を渡した `commitRound`
**WHEN** 呼ぶ
**THEN** `store.persist` がちょうど 1 回呼ばれ、persist された state に coordinator `StepRun` と `reviewerStatuses` が含まれる

### TC-020: commitRound — persist された state に全 member + coordinator の StepRun と reviewerStatuses が含まれる

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-03

**GIVEN** 2 member（success/approved、success/needs-fix）、coordinator patch、`reviewerStatuses` を渡した `commitRound`
**WHEN** 呼ぶ
**THEN** persist された `state.steps` に両 member の `StepRun` と coordinator の `StepRun` が含まれる
**AND** `state.reviewerStatuses` が渡した `reviewerStatuses` と一致する

### TC-021: commitRound — member StepRun / history 形が commitSuccess / commitSkipped と同形である

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md > T-03（design.md > D2）

**GIVEN** `success` member と `skipped` member を持つ `commitRound`
**WHEN** 呼ぶ
**THEN** success member の history に `{member}-started` / `{member}-verdict` エントリが in-memory で記録されている
**AND** skipped member の history に `{member}-started` / `{member}-skipped` エントリが記録されている

### TC-022: commitRound — member halt は store.fail / transitionJob を呼ばない

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-03（design.md > D2 Risk）

**GIVEN** 1 member が halt した `StepExecutionResult` を渡した `commitRound`
**WHEN** 呼ぶ
**THEN** `store.fail` / `transitionJob` が一度も呼ばれない
**AND** 当該 member の `StepRun` に error が記録されている

### TC-023: commitRound — usage / lineage の append 失敗が commit を巻き込まない

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md > T-03（design.md > D2 Risk）

**GIVEN** `appendInvocation` / `appendLineage` が throw するよう fake する
**WHEN** `commitRound` を呼ぶ
**THEN** 例外が握り潰され `store.persist` は成功済みのまま（usage/lineage の失敗が round commit を巻き込まない）

### TC-024: commitRound — success member ごとに verdict:parsed を emit する

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md > T-03（design.md > D2）

**GIVEN** event emitter に `verdict:parsed` リスナーを接続し、2 success member を持つ `commitRound` を呼ぶ
**WHEN** round が完了する
**THEN** 各 member に対して `verdict:parsed` が 1 件ずつ emit される（計 2 件）

### TC-025: CommitOrchestrator の逐次メソッドは byte-for-byte 不変である

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-03 AC / T-06 AC

**GIVEN** T-03 で `commitRound` を追加した後の `CommitOrchestrator`
**WHEN** 既存の `commit-orchestrator.test.ts`（`begin` / `commitSuccess` / `commitSkipped` / `commitHalt` / `apply` を検証）を実行する
**THEN** 全件 green のまま（逐次メソッドに変更が無い）

---

## Group 8: ParallelReviewRound rewire（T-04 / T-05）

### TC-026: ParallelReviewRound — fan-out で store.persist がちょうど 1 回呼ばれる

- **Category**: integration
- **Priority**: must
- **Source**: tasks.md > T-05

**GIVEN** `produceResult` を返す fake executor と persist を counter spy にした fake store で `ParallelReviewRound.run` を構成する
**WHEN** fan-out round（2 member）を実行する
**THEN** `store.persist` が round 全体でちょうど 1 回呼ばれる

### TC-027: ParallelReviewRound — persist 時の state に常に全 member が反映済みである

- **Category**: integration
- **Priority**: must
- **Source**: tasks.md > T-05

**GIVEN** 2 member を fan-out する `ParallelReviewRound`、`store.persist` の呼び出し引数を capture する fake store
**WHEN** round を実行する
**THEN** `store.persist` が呼ばれた時点の `state.steps` に両 member の `StepRun` が含まれている
**AND** 一方の member のみが反映された中間状態での `persist` 呼び出しは存在しない

### TC-028: ParallelReviewRound — member halt → aggregate escalation / job が failed に落ちない

- **Category**: integration
- **Priority**: must
- **Source**: tasks.md > T-05

**GIVEN** 1 member が halt する `StepExecutionResult` を返す fake executor
**WHEN** `ParallelReviewRound.run` を実行する
**THEN** round outcome が escalation になる
**AND** `state.status` が `failed` にならない（job が落ちない）

### TC-029: ParallelReviewRound — R5 git 副作用は commitRound の前段で挙動不変

- **Category**: integration
- **Priority**: should
- **Source**: tasks.md > T-04 AC（design.md > D3）

**GIVEN** 非宣言変更を含む worktree を持つ round、`produceResult` を返す fake executor
**WHEN** `ParallelReviewRound.run` を実行する
**THEN** `listWorktreeChanges` → `partitionRoundChanges` → halt（非宣言変更検知）が `commitRound` 呼び出しの前に実行される
**AND** R5 の scoped staging / pipeline 管理 path 除外の挙動が変わらない

---

## Group 9: 既存テストの契約更新と回帰（T-05）

### TC-030: parallel-review-round-git-effects.test.ts が produceResult 契約で回帰しない

- **Category**: integration
- **Priority**: must
- **Source**: tasks.md > T-05

**GIVEN** fake executor を `execute`（JobState 返却）から `produceResult`（`StepExecutionResult` 返却）へ更新する
**WHEN** 既存の `parallel-review-round-git-effects.test.ts` を実行する
**THEN** scoped staging / 非宣言変更 halt / pipeline 管理 path 除外の assertion が全件 green

### TC-031: parallel-review-round-resume.test.ts が produceResult 契約で回帰しない

- **Category**: integration
- **Priority**: must
- **Source**: tasks.md > T-05

**GIVEN** fake executor を `produceResult` 時点で resume prompt を capture するよう更新する
**WHEN** 既存の `parallel-review-round-resume.test.ts` を実行する
**THEN** resume 入力配布（B-16）の assertion が全件 green

### TC-032: executor-round-commit.test.ts（R5）が execute 不変のため回帰しない

- **Category**: integration
- **Priority**: should
- **Source**: tasks.md > T-05

**GIVEN** R6 の変更後に既存 `executor-round-commit.test.ts` を実行する
**WHEN** `execute`（逐次経路）の finalize gate を検証するテストが走る
**THEN** `execute` は非改変のため全件 green

---

## Group 10: 全体検証（T-06）

### TC-033: bun run typecheck が green

- **Category**: manual
- **Priority**: must
- **Source**: tasks.md > T-06

**GIVEN** T-01〜T-05 の実装変更が完了している
**WHEN** `bun run typecheck` を実行する
**THEN** 型エラーが 0 件で終了する

### TC-034: bun run test が green（新規・更新テスト含む全件）

- **Category**: manual
- **Priority**: must
- **Source**: tasks.md > T-06

**GIVEN** T-01〜T-05 の実装変更および対応テストが完了している
**WHEN** `bun run test` を実行する
**THEN** 全テストが green（新規テスト・更新テスト・既存回帰テスト含む）

### TC-035: 変更ファイルがスコープ外に及んでいない

- **Category**: manual
- **Priority**: should
- **Source**: tasks.md > T-06

**GIVEN** 実装完了後の git diff を確認する
**WHEN** 変更ファイル一覧を出力する
**THEN** 変更は `src/core/step/executor.ts` / `src/core/step/commit-orchestrator.ts` / `src/core/pipeline/parallel-review-round.ts` / `src/core/pipeline/reviewer-status.ts`（または verdict helper）と対応テストに限られる
**AND** `Pipeline` / `StepExecutor` の constructor に変更がない

### TC-036: architecture/ 配下に変更が無い

- **Category**: manual
- **Priority**: must
- **Source**: tasks.md > T-06

**GIVEN** 実装完了後の git diff を確認する
**WHEN** `architecture/` 配下のファイル一覧を出力する
**THEN** `architecture/` 配下に一切の変更が無い（B-13 の ratify は本 pipeline 外）

---

## Result

```yaml
result: completed
total: 36
automated: 32
manual: 4
must: 26
should: 9
could: 1
blocked_reasons: []
```
