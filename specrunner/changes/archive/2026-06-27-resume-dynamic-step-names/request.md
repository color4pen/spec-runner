# resume の再開 step 検証を実 descriptor 由来にし、reviewer 段の hard-crash 回復不能を解消する

## Meta

- **type**: bug-fix
- **slug**: resume-dynamic-step-names
- **base-branch**: main
- **adr**: false

## 背景

resume-from-progress（#716, merged）は hard-crash 後の resume を `state.step` から再構築したが、許可集合が**静的な AGENT+CLI step 名のみ**で、動的注入される `regression-gate` と custom reviewer member 名を含まない。これらは `kind:"agent"` の step で、executor が `step.name` を無検証で `state.step` に書く。

そのため **custom reviewer / regression-gate 実行中の hard-crash** では `state.step` が非標準名となり、resume が "Cannot resolve resume step" で throw、`--from <その名前>` も同じ静的集合で弾かれて**手動回復もできない**。custom reviewer を使う構成（本 repo は scale-tolerance / cross-boundary-invariants を使用）では、#716 が解決対象としたパイプライン後半の hard-crash 回復がまさに機能しない。

これは #716 の取りこぼし（静的集合だけ見て動的生成 member を含めなかった）であり、対症療法でなく「許可集合を実 descriptor 由来にする」構造修正で塞ぐ。

## 現状コードの前提

- `src/core/resume/resolve-step.ts:5` — `ALL_STEP_NAMES_SET = new Set([...AGENT_STEP_NAMES, ...CLI_STEP_NAMES])`（静的のみ）。
- `src/core/resume/resolve-step.ts:26` — `--from` を `ALL_STEP_NAMES_SET.has(from)` で検証し、外れると "Invalid --from value"。
- `src/core/resume/resolve-step.ts:40` — `stateStep` も `ALL_STEP_NAMES_SET.has(stateStep)` で検証し、外れると throw（:44）。
- `src/kernel/step-names.ts` の `AGENT_STEP_NAMES` / `CLI_STEP_NAMES` は `regression-gate` を含まない。
- `src/core/step/regression-gate.ts` の `REGRESSION_GATE_STEP_NAME`（`kind:"agent"`）は動的注入 step。`src/core/pipeline/compose-reviewers.ts:50,88` で descriptor に合成される。
- custom reviewer member 名はユーザ定義の任意名で、job 開始時に `state.reviewers`（`src/state/schema.ts:315`、`ReviewerSnapshot[]`）へ snapshot され、resume 時に参照できる。
- `src/core/step/executor.ts:206` — `runAgentStep` は `step.name` を無検証で `state.step` に永続化する（custom reviewer member も coordinator fan-out 経由でここを通る）。

## 要件

1. resume の再開 step 検証を、静的 step 名集合でなく「**当該ジョブの実 pipeline descriptor に存在する step 名集合**」で行う。集合は static steps + `REGRESSION_GATE_STEP_NAME`（custom reviewer 存在時）+ `state.reviewers` の member 名を含める。`state.step` フォールバックと `--from` の**両方**にこの拡張集合を適用する。
2. これにより custom reviewer / regression-gate 実行中の hard-crash でも resume が `state.step` から再開でき、`--from <reviewer名 | regression-gate>` も受理される。
3. 集合の導出は resume の prepare で `state`（`state.reviewers` 含む）から行う、または `resolveResumeStep` に許可集合 / descriptor を渡す（機構は design）。実 descriptor に存在しない step 名（typo 等）は従来どおり拒否する。

## スコープ外

- `resumePoint` がある通常停止の挙動（不変）。
- reviewer snapshot の中身・検証ロジック（既存）。
- mid-step の途中再開（step 粒度のまま）。
- 他の confirmed finding（B-12 grep / doctor codex / github-client）— 別 request。

## 受け入れ基準

- [ ] `state.step = regression-gate` の hard-crash ジョブ（resumePoint なし）が resume でその step から再開できることをテストで固定する。
- [ ] `state.step =` custom reviewer member 名（`state.reviewers` に存在）の hard-crash ジョブが resume できることをテストで固定する。
- [ ] `--from regression-gate` / `--from <custom reviewer 名>` が受理されることをテストで固定する。
- [ ] 実 descriptor に存在しない step 名（typo 等）は従来どおり拒否されることをテストで固定する。
- [ ] `resumePoint` がある通常停止の resume に回帰がないことをテストで固定する。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- **採用**: 許可集合を「実 descriptor 由来」にする（static + regression-gate + state.reviewers member 名）。**却下: `ALL_STEP_NAMES_SET` に `regression-gate` を静的追加するだけ** — custom reviewer の任意名を救えず、同じ class（静的集合だけ見て動的 member を取りこぼす）の漏れが残る。動的 member を実 snapshot から導出するのが構造的に正しい。
- 外部制約なし（内部 state のみ）。
