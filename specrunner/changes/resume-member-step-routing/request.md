# custom reviewer member step からの resume を coordinator 経由に修正し、シグナル停止時の interruption 二重記録を解消する

## Meta

- **type**: bug-fix
- **slug**: resume-member-step-routing
- **base-branch**: main
- **adr**: true

## 背景

custom reviewer の並列 fan-out 実行中にプロセスが中断されると、resumePoint は member step 名（例: `cross-boundary-invariants`）を指す。この状態から `job resume` すると member step は単体で再実行されるが、transition table には静的 step と coordinator（`custom-reviewers`）の行しか存在しないため、遷移解決が fallback の `escalate` に落ち、**member の verdict が approved でも pipeline が halt する**。resume を繰り返しても同じ経路を辿るため、workaround（`--from code-review` で正規遷移から入り直す）を知らなければ job は完成不能になる（issue #769、実例: job 8d5f9b5c で approved → 「cross-boundary-invariants escalated」を観測）。

併せて、同じ中断ライフサイクルの隣接不具合として、シグナル停止時に interruption record が同一 ts で 2 行重複して journal に記録される事象を解消する（同 job で観測）。

## 現状コードの前提

- `src/core/pipeline/pipeline.ts:386-390` — 遷移解決は `this.transitions.find(...)` で、該当行が無ければ `nextStep = "escalate"`。member step 名の行は静的 transitions にも composeReviewerDescriptor の合成後にも存在しない
- `src/core/resume/resolve-step.ts:16-27` — `buildAllowedStepSet(reviewers)` は AGENT/CLI step 名 + regression-gate + 各 reviewer member 名を許可する。coordinator 名 `custom-reviewers` は**含まれない**（`--from custom-reviewers` は拒否される）
- `src/core/resume/resolve-step.ts` — `resolveResumeStep(from, resumePoint, stateStep, allowedSteps)` の優先順は `--from` > `resumePoint.step` > `state.step`
- `src/core/pipeline/types.ts:209` — `CUSTOM_REVIEWERS_STEP_NAME = "custom-reviewers"`（virtual coordinator）。transitions の行は types.ts:195 付近に存在する
- `src/core/pipeline/pipeline.ts:732-` — `runCoordinatorFanOut()` は reviewerStatuses ledger から pending member を再計算し、pending が空なら synthetic approved を出す。member の最終 StepRun verdict を `memberVerdicts` として集計する
- `src/core/runtime/local.ts:959-985` — signal handler（layer 1）が `{type: "interruption", reason: "signal"}` を append し、awaiting-resume へ遷移・persist する
- `src/core/command/runner.ts:100-103` — `beforeExit` に exit-guard を登録。`src/core/lifecycle/exit-guard.ts:54-72, 121-140` は `state.status !== "running"` なら何もしない設計だが、signal handler の persist 完了前に load する **check-then-act race** があり、両者が同一シグナル停止で各 1 行（計 2 行）の interruption を append し得る（実例: 同一 ts の重複 2 行）
- `src/core/command/resume.ts:162-170` — 連続 escalation チェックは `resumePoint.step` の step 名で journal の StepRun 履歴を照合する

## 要件

1. resumePoint.step が custom reviewer の member 名を指す job の resume は、coordinator（`custom-reviewers`）経由で pipeline に入り直す。member が approved を返す場合、pipeline は regression-gate → conformance → 以降の正規遷移で終端（pr-create / awaiting-archive）まで進む。member step 単体実行から `escalate` への fallback 経路を残さない（マッピングの実装位置 — resolveResumeStep での変換 / pipeline 側の対応 — は design 判断）
2. `--from <member名>` が明示指定された場合も要件 1 と同じ挙動にする（coordinator へのマッピング）。または明示エラーで coordinator 指定を案内する — いずれかを design で選び理由を記録する
3. 静的 step（design / implementer / code-review 等）および regression-gate からの resume 挙動は不変
4. coordinator 経由の再入で、既に approved 済みの member が不必要に再実行されないこと（reviewerStatuses ledger の pending 再計算に従う。escalation / 未 approve の member のみ再実行される）
5. 1 回のシグナル停止で interruption record が 1 件に収まるようにする。signal handler（local.ts）と exit-guard（beforeExit）の二重 append を解消する。方式（単一 writer 化 / append 側の冪等化等）は design 判断。ただし exit-guard が担う「signal handler を経由しない停止の backstop」機能は維持すること

## スコープ外

- reviewerStatuses / regression-gate の意味論変更
- interruption record へのシグナル名記録（#764）
- スリープ抑止（#758）
- 連続 escalation チェック（`--force`）の仕様変更
- write-scope guard の再実装（別 request: write-scope-guard-redo）

## 受け入れ基準

- [ ] member 名の resumePoint を持つ state からの resume で、member が approved のとき pipeline が終端まで進む（escalate に落ちない）ことをテストで固定する（#769 の実例を再現する fixture）
- [ ] member 名の resumePoint からの resume で、approved 済み member が再実行されない（または pending のみ再実行される）ことをテストで固定する
- [ ] `--from <member名>` の挙動（マッピングまたは案内エラー）をテストで固定する
- [ ] 静的 step / regression-gate からの resume の既存テストが無変更で green
- [ ] シグナル停止経路で interruption record が 1 件に収まることをテストで固定する（signal handler と exit-guard が競合するシナリオ）
- [ ] exit-guard 単独経路（signal handler 不在の停止）で interruption が従来どおり 1 件記録されることをテストで固定する
- [ ] 既存テスト無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: member → coordinator へのマッピングで再入する — coordinator は reviewerStatuses から pending を再計算する再入可能な設計が既にあり（runCoordinatorFanOut）、これを唯一の member 実行経路として維持するのが最小修正。member 単体の遷移行を transitions に動的追加する案は、fan-out の合流・statuses 更新・approvedAtCommit 記録を coordinator の外に複製することになり却下
- **採用**: 二重 interruption は「1 停止 = 1 record」を契約にする — journal は truth であり、同一事象の重複記録は fold 消費者（resumePoint 材料・将来の verify）にノイズを渡す
- **却下**: resume 側での重複容認 + 表示側 dedupe — 記録時点で防げる重複を読み手全員に負担させる形になる
