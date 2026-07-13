# Spec: 逐次経路の single-writer（StepExecutor producer 化 ＋ CommitOrchestrator 単一適用）

## Requirements

### Requirement: StepExecutor は state を永続化せず実行結果を値として返す

`StepExecutor`（`src/core/step/executor.ts`）は逐次 step 実行において、state を直接永続化する API（`store.persist` / `store.fail` / `store.update` および `store.appendHistory` / `store.appendInterruption` / `store.appendLineage` / `store.appendStepRun`）を **MUST NOT** 呼び出す。step 実行結果は値（成功は `StepCompletion` 由来の差分、失敗は `StepHalt`、activation skip は skip 理由）として返し、永続化は `CommitOrchestrator` に委ねる。executor は失敗遷移を手組み **MUST NOT**（`transitionJob` / `attachStateAndRethrow` を `executor.ts` で呼ばない）。

#### Scenario: 成功 step で executor が store 書き込みを行わない

**Given** agent step が成功（`completionReason === "success"`、drift/output 違反なし）する
**When** `StepExecutor.execute` が当該 step を実行する
**Then** executor（`executor.ts`）から `store.persist` / `store.fail` / `store.update` への call-edge が存在せず、state の最終永続化は `CommitOrchestrator` が1経路で行う

#### Scenario: 失敗 step で executor が遷移を手組みしない

**Given** agent step が失敗（例: `completionReason !== "success"` の non-success guard）する
**When** `StepExecutor.execute` が当該 step を実行する
**Then** executor は `StepHalt` 値を返し、`store.fail` / `transitionJob` / `attachStateAndRethrow` を executor 内で呼ばず、失敗の state 適用と rethrow は `CommitOrchestrator` が行う

### Requirement: CommitOrchestrator が成功・halt・skip の唯一の適用点である

`CommitOrchestrator`（`src/core/step/commit-orchestrator.ts`）は、逐次 step 実行結果を state へ適用し、history / interruption / lineage を記録し、persist する**唯一の経路**である。成功（`StepCompletion` 由来の差分）・halt（`StepHalt`）・activation skip・開始マーカー（begin）の全てを CommitOrchestrator が commit **SHALL**。

#### Scenario: 成功結果を CommitOrchestrator が適用する

**Given** producer が成功の実行結果（verdict / persistToolResult / session / branch 情報等）を返す
**When** `CommitOrchestrator` が成功を適用する
**Then** `pushStepResult`・`{step}-verdict` history・branch 設定・pullRequest・usage 追記・`store.persist`・lineage 追記・`verdict:parsed` emit が現 `finalizeStep` と同じ内容・順で行われ、返る最終 state が従来と一致する

#### Scenario: halt 結果を CommitOrchestrator が適用し throw する

**Given** producer が `StepHalt`（`failed` または `awaiting-resume`）を返す
**When** `CommitOrchestrator` が halt を適用する
**Then** `recordFailedStepResult` → （`failed` は `store.fail` ／ `awaiting-resume` は `transitionJob("awaiting-resume")` ＋ `store.appendInterruption`）→ 該当 guard の history → `store.persist` → `attachStateAndRethrow` が現 executor guard と同じ内容・順で行われ、投げられる error に `state` が attach される

#### Scenario: 開始マーカーが実行前に永続化される

**Given** step が実行を開始する
**When** `CommitOrchestrator.begin` が `runner.run`（agent 実行）より前に呼ばれる
**Then** state.step が当該 step 名に更新され開始 history が追記・persist され、実行中に `specrunner ps` が現在の step を表示できる（TC-012 の観測性が保たれる）

### Requirement: 逐次 step の観測可能な挙動を不変に保つ

本変更は所有権の再配置であり、逐次 step の**最終 state / verdict / history エントリ列 / persist 結果 / throw semantics** を変更 **MUST NOT**。並列 review round（`ParallelReviewRound`）は変更 **MUST NOT**。

#### Scenario: agent 成功 step の最終 verdict / history が従来と一致する

**Given** judge/producer 系 agent step が report tool で成功を確定する
**When** `StepExecutor.execute` を通す
**Then** 返る state の当該 step の verdict・`steps` 配列・history エントリ列が本変更前と一致する

#### Scenario: 並列 member 実行が従来どおり動作する

**Given** custom reviewer の並列 round で複数 member が実行される
**When** `ParallelReviewRound.run` が各 member を `executor.execute` で実行し merge・persist する
**Then** round の最終 state（reviewerStatuses / 各 member の StepRun / coordinator synthetic run）が本変更前と一致する

### Requirement: invariant B-13 / B-14 を歯と catalog で ratify する

invariant **B-13**（`StepExecutor` は state mutation / persist API を呼ばない）と **B-14**（step 失敗遷移は `StepHalt` を適用する commit orchestrator の単一適用点のみ）を、`core-invariants.test.ts` の歯・`model.md` §4 表・`conformance.md` (A) 表へ同時昇格 **SHALL**。`StepHalt` を `domain-model.md` の Value Object として追加 **SHALL**。

#### Scenario: catalog と歯の B-x ID が双方向一致する

**Given** B-13 / B-14 が歯（`describe("B-13")` / `describe("B-14")`）に追加される
**When** `invariant-catalog-parity.test.ts`（TC-ICS-02）が catalog（`model.md` §4 ＋ `conformance.md` (A)）と歯の B-x ID 集合を照合する
**Then** B-13 / B-14 が両 catalog 表にも存在し、undocumented / unenforced とも空で parity が green になる

#### Scenario: executor に禁止 call-site を再導入すると歯が red になる

**Given** B-13 / B-14 の歯が landing している
**When** `executor.ts` に `store.persist` または `transitionJob` の call-site を新規追加する
**Then** `core-invariants.test.ts` の該当 describe ブロックが違反を検出して red になる
