# Design: 逐次経路の single-writer — StepExecutor は実行結果を返し CommitOrchestrator が唯一の commit 者になる

## Context

`StepExecutor.runAgentStep` / `runCliStep` は step の実行と **state の永続化**を同一関数内で混在させている。実行途中の各 guard・成功確定・skip 確定の各所で `store.update` / `store.fail` / `store.persist` / `store.appendHistory` / `store.appendInterruption` / `store.appendLineage` を直接呼び、`transitionJob` と `attachStateAndRethrow` も executor 内で手組みしている。

R1（executor 概念分解）で以下が値・純粋関数として抽出済み:

- `StepHalt`（`step-halt.ts`）: 6 guard の停止判断を `failed` / `awaiting-resume` の discriminated union として構築する factory 群。**適用（persist / transition / rethrow）は executor に残存**。
- `buildStepContext`（`step-context-builder.ts`）: 実行 context 組立。
- `StepCompletion` / `deriveStepCompletion`（`step-completion.ts`）: 成功時の verdict 導出（副作用なし）。

実行所有権モデル ADR（ADR-20260713, accepted）の D1（state commit の単一所有者）・D2（`StepHalt` 単一適用）は、対応する実装・architecture test（歯）・contract test が landing した時点で invariant **B-13 / B-14** を個別に ratify する設計になっている。R1 は「値化のみ・所有権不変」の下地であり、ratify は本 change が担う。

現状の呼び出し関係:

- 逐次経路: `Pipeline.runInternal` → `executor.execute(step, state, deps)` → `JobState`。`execute` 完了後に Pipeline 側でも crash resilience 用に `store.persist(state)` を1回呼ぶ（executor と Pipeline の二重 commit）。
- 並列経路: `ParallelReviewRound.run` → member ごとに `executor.execute(memberStep, state, deps)` → 返った `JobState` 群を merge → round が `store.persist(merged)` を1回。member の中間 persist は executor 内で行われる。

両経路が **同一の `executor.execute`** を通る。従って executor から state 書き込みを外すと両経路に波及する。

## Goals / Non-Goals

**Goals**:

- `StepExecutor` を **producer** に変える。step 実行結果を値（`StepExecutionResult` DU: 成功 / `StepHalt` / skip）として返し、state を直接 persist しない。
- **`CommitOrchestrator`（新設）** を、実行結果を state へ適用・history/interruption/lineage 記録・persist する**唯一の適用点**にする。開始マーカー（begin）・成功・halt・skip の全てを CommitOrchestrator が commit する。
- `StepExecutor`（`executor.ts`）から `store.*` 書き込み API・`transitionJob`・`attachStateAndRethrow` への call-edge を除去する。
- 逐次 step の観測可能な挙動（最終 state / verdict / history エントリ列 / persist 結果 / throw semantics）を**不変**に保つ。
- invariant **B-13 / B-14** を ratify する（歯 ＝ `core-invariants.test.ts` の describe ブロック ＋ catalog ＝ `model.md` §4 ＋ `conformance.md` (A) へ同時昇格。`domain-model.md` に `StepHalt` を Value Object として追加）。

**Non-Goals**:

- 並列 round の single-writer（member no-persist / round commit）＝ R6。`ParallelReviewRound` は本 change で**変えない**（member は `executor.execute` 経由で従来どおり CommitOrchestrator により per-member persist される。round の merge-persist も残す）。
- git 副作用の所有権（`finalizeStepArtifacts` ＝ commit/push、commitMutex）＝ R5。producer 内に現状のまま残す（state 書き込みではないため本 change の対象外）。
- optimistic revision / total patch / event channel 化（将来）。
- `StepExecutor` の public 構築 API（`execute` シグネチャ・コンストラクタ引数）の変更。並列経路・既存テストが依存するため不変に保つ。
- Pipeline 側の crash-resilience persist（`pipeline.ts` の `store.persist`）の除去。executor の責務ではなく、除去は挙動変化リスクを伴うため本 change の対象外。

## Decisions

### D1: `CommitOrchestrator` を `src/core/step/commit-orchestrator.ts` に新設

`StepHalt` / `StepCompletion` を適用する単一クラス。`StepExecutor` がコンストラクタで `storeFactory` ＋ `EventBus` を渡して内部に1インスタンス保持する。R6 で `ParallelReviewRound` が**同じクラスを再利用**して round-level commit に寄せられる足場とする。

責務（＝ 現状 executor が持つ state 書き込みの全部）:

| メソッド | 適用内容（現 executor の対応箇所） |
|----------|-----------------------------------|
| `begin(step, state)` | 開始マーカー: `store.update(state, { step })` ＋ 開始 history 追記（agent は `{step}-started`/"Starting …"、CLI は `step-transition`/"Transitioning to …"）。`runner.run` 前に呼ぶ（TC-012: `specrunner ps` が実行中 step を表示）|
| `commitSuccess(step, state, deps, result)` | `pushStepResult`（session/verdict/toolResult/…）→ `{step}-verdict` history → branch 設定（agentBranch / setsBranch）→ pullRequest → usage 追記 → `store.persist` → lineage 追記 → `verdict:parsed` emit。現 `finalizeStep` の副作用ブロックに一致 |
| `commitSkipped(step, state, reason)` | `pushStepResult`（verdict "skipped" ＋ skipReason）→ `{step}-skipped` warning history → `verdict:parsed`（"skipped"）emit → `store.persist`。現 `finalizeSkippedStep` に一致 |
| `commitHalt(step, state, halt)` | `recordFailedStepResult` → `failed`: `store.fail`／`awaiting-resume`: `transitionJob("awaiting-resume", patch)` ＋ `store.appendInterruption` → （`halt.history` があれば）`store.appendHistory` → `store.persist` → `attachStateAndRethrow(halt.thrownErr, state)`（必ず throw）。現 6+2 guard の適用ブロックに一致 |

**Rationale**: ADR D1 は「commit orchestrator を sequential 経路の recorder」と定義する。state 書き込みを1クラスに集約することで「1つの原子的な状態変更の境界」がコードで読める。`core/step/` 配置は、適用対象（`StepHalt` / `StepCompletion` / `StepRun`）が全て `core/step/` の概念であり、`executor.ts` の sibling（`step-halt.ts` 等）に倣うため。層は domain（`core/step/`）に留まり DSM edge を増やさない。

**Alternatives considered**:
- Pipeline が CommitOrchestrator を所有し executor は値だけ返す → `execute` の返り値契約が `JobState` から `StepExecutionResult` へ変わり、`ParallelReviewRound`（`execute` の `JobState` 返却に依存）を変更せざるを得ず「並列不変」に反するため却下。
- `executor.ts` に薄い wrapper メソッドを足して `store.persist` を間接化するだけ → 「実行結果を値として返す」（要件1）を満たさず、単一所有者の境界が生まれないため却下。

### D2: `StepExecutor` を producer に変換 — `StepExecutionResult` DU を返す内部 producer

`runAgentStep` / `runCliStep` を **`StepExecutionResult` を返す producer** に変える（`store.*` 呼び出しゼロ）。`execute` が begin → produce → apply を糊付けし、外向きには従来どおり `Promise<JobState>` を返す（halt 時は throw）。

```ts
// commit-orchestrator.ts（または step-execution-result.ts）
export type StepExecutionResult =
  | { kind: "success"; completion: StepCompletion; completedAt: string; startedAt: string;
      session: {...} | null; agentBranch?: string; modelUsage?: …;
      followUpAttempts?: number; transientRetryAttempts?: number;
      completionReportDiagnostics?: … }
  | { kind: "halt"; halt: StepHalt }
  | { kind: "skipped"; skipReason: string };
```

`execute` の骨格（シグネチャ不変）:

```
async execute(step, jobState, deps): Promise<JobState> {
  emit("step:start")
  try {
    const begun  = await this.orchestrator.begin(step, jobState)
    const result = await this.produce(step, begun, deps)   // runAgentStep/runCliStep: store.* を呼ばない
    const out    = await this.orchestrator.apply(step, begun, deps, result) // success/skip→JobState, halt→throw
    emit("step:complete"); return out
  } catch (err) { emit("step:error", err.state ?? jobState); throw err }
}
```

producer 内の各 guard は R1 の `makeXxxHalt(...)` で `StepHalt` を構築し、**適用せず** `return { kind: "halt", halt }` する。成功は `deriveStepCompletion` の結果を `{ kind: "success", … }` に載せて返す。activation skip は `{ kind: "skipped", skipReason }`。

**`名前衝突回避`**: producer 返り値 DU は `StepExecutionResult` とする。`StepOutcome` は既存で `StepRun.outcome`（verdict/findingsPath/error）を指すため再利用しない。

**Rationale**: `execute` シグネチャを保つことで Pipeline・`ParallelReviewRound`・既存 executor テスト（`new StepExecutor(events, runner, storeFactory, …)` ＋ `execute`）が無改変で通る（要件4・並列不変）。「値として返す」の実体は producer（`runAgentStep`/`runCliStep`）→ `apply` の受け渡しで満たす（要件1・2）。

**Alternatives considered**: producer を `execute` から分離し Pipeline が直接呼ぶ → Pipeline / round 両方の呼び出し側を書き換える広い blast radius。挙動不変の確認コストが上がるため却下。

### D3: begin（開始マーカー）は CommitOrchestrator が `runner.run` 前に適用する

現 `runAgentStep` 冒頭の `store.update(jobState, { step })` ＋ 開始 history は、`ps` が実行中 step を表示するための **実行前 persist**（TC-012）。single-writer 化でこれを関数末尾へ遅延させると実行中の観測性が失われる。従って begin は CommitOrchestrator の独立メソッドとして `produce`（agent 実行）**前**に呼ぶ。single-writer（begin も含め全 commit が orchestrator）を保ちつつ TC-012 を維持する。

**Rationale**: 「executor が値を返すのは末尾」という素朴形は開始マーカーを壊す。begin/apply の2相に分けることで開始 persist の時点を保存する。

**Alternatives considered**: begin を廃し apply 一括にする → `ps` が実行中 step を表示しなくなる観測性 regression のため却下。

### D4: `StepHalt` を自己完結値へ拡張し、`commitHalt` を値だけで駆動する

`commitHalt` が `StepHalt` 値のみから現 6+2 guard の適用を再現できるよう、`step-halt.ts` の `StepHalt` に以下を追加する:

- `recordOpts?: Omit<StepResultInput, "verdict" | "findingsPath" | "error">` — `recordFailedStepResult` の第4引数（`startedAt` / `completedAt` / `transientRetryAttempts` の差異を吸収）。
- `history?: Omit<HistoryEntry, "ts">` — 追記する history エントリ（`ts` は apply 時に付与）。**append する guard**（input-missing / agent-throw / output-gate / timeout / drift）は設定、**append しない guard**（non-success / commit-fail / cli-fail）は未設定。

R1 で未値化の2経路に factory を追加する:

- `makeInputMissingHalt(err, stepName, recordOpts)` — `validateRequiredInputs` 失敗（`kind:"failed"`, code 既定 `STEP_INPUT_MISSING`, history `{step}-failed`）。
- `makeCliStepFailHalt(err, stepName, recordOpts)` — `runCliStep` の `step.run` throw（`kind:"failed"`, code `CLI_STEP_FAILED`, history なし）。

既存 6 factory は `recordOpts` / `history` を埋めるよう拡張する（返す `ErrorInfo` / `thrownErr` は不変）。

**Rationale**: `commitHalt` を「`StepHalt` を受け取り適用するだけ」の dumb applier にすると、B-14「失敗遷移の単一適用点」が構造で明確になり、producer 側 guard は `return { kind:"halt", halt }` の1行に収束する。history メッセージ組立に必要な文脈（drift の pathSummary 等）は factory が既に保持しているため factory 内で history を組める。

**Alternatives considered**:
- producer が `recordFailedStepResult` / `appendHistoryEntry`（純粋関数）まで適用して state を返し、orchestrator は persist だけ → 適用が producer と orchestrator に割れ、B-14「単一適用点」の主張が弱まるため却下。
- orchestrator が halt kind から history メッセージを導出 → drift の history は `error.message` と別 format のため導出が脆く、guard との二重管理になるため却下。

### D5: executor 全経路（agent / cli / validate / skip）を移行する

B-13 の歯は `executor.ts` を file 単位で grep する。逐次 step が通る全経路（`runAgentStep`・`runCliStep`・`validateRequiredInputs`・activation skip）から `store.*` を外し切らないと歯が red になる。従って要件1 が名指す `runAgentStep` に留めず、executor 内の state 書き込みを**全て** CommitOrchestrator へ移す。`getStore` / `storeCache` は executor から除去し、store アクセスは orchestrator が所有する（executor は `storeFactory` を orchestrator コンストラクタへ渡すのみ）。

**Rationale**: 「executor は state を書かない」は file 単位でしか歯にできない。一部経路に `store.*` を残すと歯が成立しない。並列経路の member も同一 `execute` を通るため、この移行で member の persist も CommitOrchestrator 経由（per-member）になるが、**round の merge-persist は不変**なので並列の観測挙動は変わらない（member no-persist 化は R6）。

**Alternatives considered**: 歯を `runAgentStep` の行範囲に限定 → grep は file 単位が定石で、行範囲 grep は脆く維持困難。全経路移行が正道のため却下。

### D6: B-13 / B-14 の ratify — 歯 ＋ catalog ＋ domain-model を同時昇格

`invariant-catalog-parity.test.ts`（TC-ICS-02）が **`model.md` §4 の B-x ID 集合 ＝ `conformance.md` (A) の B-x ID 集合 ＝ `core-invariants.test.ts` の `describe("B-N")` 集合** を双方向一致で強制する。従って B-13 / B-14 の追加は3ファイル**同時**でなければ build が red になる。ratify は次を1バンドルで行う:

1. **歯**（`core-invariants.test.ts`）: `describe("B-13")` ＝ `executor.ts` に `store\.(persist|fail|update|appendHistory|appendInterruption|appendLineage|appendStepRun)` の call-site が無い。`describe("B-14")` ＝ `executor.ts` に `transitionJob\(` と `attachStateAndRethrow\(` の call-site が無い（失敗遷移の手組みが executor に無い）。各々に liveness（対象ファイルを実在確認）＋ T-04 系の合成 regression guard を付ける。
2. **catalog**（`model.md` §4 表 ＋ `conformance.md` (A) 表）: B-13 / B-14 行を追加。§4 冒頭の系統説明（B-5〜B-12 の列挙）へ B-13 / B-14 を「commit orchestration 所有の call-site 制約」として加える。
3. **domain-model.md**: `StepHalt`（`failed` / `awaiting-resume` の DU）を Value Object として追加する（ADR「ratify 時に追加」に対応）。

B-13 の歯は `executor.ts`（両経路共有）を検査するため、本 change 完了時点で B-13 は逐次・並列とも満たされる。並列 round の single-writer（round が唯一の commit 者）は別 invariant（B-15 系、R6）であり本 change の歯の対象外。

**Rationale**: ADR は ratify を「実装 ＋ 歯 ＋ contract ＋ catalog 昇格の同時」と定義し、parity 歯がそれを機械強制する。3ファイルを分けると parity が red になるため1バンドルが必須。

**Alternatives considered**: 歯だけ足して catalog 昇格を defer → parity（TC-ICS-02）が「undocumented」で red になり build が壊れるため不可。

### D7: 並列経路は不変・2 書き込みモデルの一時併存

`ParallelReviewRound` は改変しない。member は `executor.execute` 経由で CommitOrchestrator により per-member persist され、round は従来どおり merge 後に `store.persist(merged)` する。結果、**逐次（step 単位で CommitOrchestrator が単一 commit）** と **並列（per-member commit ＋ round merge-persist）** の2書き込みモデルが一時併存する。R6 が並列を round-level の CommitOrchestrator commit へ寄せて統一する。

**Rationale**: 本 change のスコープを逐次所有権の移設に限定し blast radius を抑える。並列の round 所有は別 invariant・別 blast radius（R6）。

## Risks / Trade-offs

- **[Risk] 適用順序のズレによる最終 state / history の差異**: 各 guard・成功・skip の副作用順（`recordFailedStepResult` → fail/transition → interruption → history → persist → rethrow）を CommitOrchestrator が正確に再現しないと history エントリ列や最終 state が変わる。→ **Mitigation**: `commitHalt` / `commitSuccess` / `commitSkipped` を現 executor の各ブロックと逐一照合。既存 executor テスト（`executor-commit-mutex` / `executor-drift-detection` / `executor-no-op` / `executor-resume-context` / `judge-verdict`）＋ 新規逐次 regression テストが差異を検出する。
- **[Risk] begin を末尾へ遅延させ TC-012（`ps` の実行中 step 表示）を壊す**: → **Mitigation**: begin は `produce`（agent 実行）前に呼ぶ（D3）。
- **[Risk] 並列 member の中間 persist 消失**: single-writer 化で member の中間 persist が per-member commit（`commitSuccess`/`commitHalt`）に置き換わる。round は merge-persist が authoritative なので最終 state は不変だが、実行順依存の on-disk 中間断面は変わりうる。→ **Mitigation**: 並列の最終 state は round merge-persist が決めるため観測契約は不変。`custom-reviewers-e2e` / `reviewer-activation-e2e` / `parallel` 系テストが回帰検出。
- **[Risk] catalog parity の red**: B-13 / B-14 を3ファイル同時に足さないと TC-ICS-02 が red。→ **Mitigation**: D6 を1タスクにまとめ、3ファイルを同一変更で追加。ID 表記（`| **B-13** |`）を parity 抽出正規表現に一致させる。
- **[Risk] `StepHalt` 拡張が R1 の値契約を壊す**: `recordOpts` / `history` 追加で既存 factory の `ErrorInfo` / `thrownErr` を変えてしまう。→ **Mitigation**: 追加は optional field のみ。既存 factory の返す `error` / `thrownErr` は不変であることを型 ＋ テストで固定。
- **[Risk] scenario-先 と interface 安定のタイミング衝突**: B-13/B-14 の歯（grep ベース）は orchestrator interface に非依存なので**先に**書ける。single-writer の behavioral テストは CommitOrchestrator interface 確定**後**に書く。→ **Mitigation**: タスク順で歯（構造 scenario）を先行、behavioral テストを interface 確定後に配置する。

## Open Questions

なし。ADR の architect 評価済み設計判断（逐次 single-writer / CommitOrchestrator 逐次導入・R6 再利用足場 / `StepHalt` 適用所有者の移動 ＝ B-14 ratify 点 / 並列不変）で主要分岐は確定済み。
