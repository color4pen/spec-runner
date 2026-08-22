# halt checkpoint を未 push 作業 commit から分離して publish する

## Meta

- **type**: spec-change
- **slug**: halt-checkpoint-restack
- **base-branch**: main
- **adr**: false

## 背景

pipeline が halt（escalation / エラー停止）する際、awaiting-resume への遷移を含む halt checkpoint はローカル branch tip の上に commit され push される。tip に push 拒否された作業 commit が残っている場合、halt checkpoint の push はそれらを含むため同じ理由で再拒否され、halt 記録が publish されない。branch tip は `status: running` の checkpoint のまま残り、attach の quiescence guard に fail-closed で拒否されるため、local state を持たない環境（ephemeral runner）では job が回復不能になる（#1059 実測）。

checkpoint モデルの契約は「失ってよいのは中断された 1 step 分まで」である。halt 記録が作業 commit と push を相乗りする現構造は、作業 commit の push 失敗を halt 記録の喪失に伝播させ、この契約を破る。

## 現状コードの前提

- `src/core/runtime/local.ts:752` `commitFinalState` — terminal 遷移後に管理パス（state.json / events.jsonl / usage.json / bite-evidence-result.md）のみを明示 pathspec で commit（awaiting-resume は `checkpoint: <slug>`、それ以外は `finalize: <slug>`）し push（1 retry）。push 失敗は stderr warn のみで throw しない（local resume は保たれる）
- checkpoint commit の親はローカル branch tip。未 push の作業 commit が tip にあると push はそれらを道連れにする
- attach（`job resume --from-issue` / `job attach --branch`）は branch tip の checkpoint が awaiting-resume / awaiting-archive でないと `not-quiescent` で拒否する（`src/core/attach/checkpoint-policy.ts` attachQuiescentPolicy）
- 実測（#1059 / job c2c7ba44）: implementer の `.github/workflows/` 変更 commit が GITHub_TOKEN で push 拒否 → halt checkpoint も publish されず、復旧には branch の force-push 巻き戻しと 5 step 分の再走を要した

## 実装範囲

1. `commitFinalState` の push が失敗した場合、最後に push が成功している remote tip（`origin/<branch>`）を親として管理パスのみの checkpoint commit を積み直し、それを push する（同様に 1 retry）。積み直された checkpoint は attach 検証（generic integrity + attachQuiescentPolicy + identity）を通過する self-consistent な内容であること
2. 積み直しの発生を journal event として記録する（未 push 作業 commit が publish されなかったことが後から判別できること）
3. 通常経路（push 成功）と local state がある環境の挙動は不変。積み直し push も失敗した場合は現行同様 warn で継続する（これ以上悪化させない）

## 非目標

- push 拒否の原因側の対処（環境の push 能力 preflight は別 request）
- attach 側の operator override（#1059 対応方向 C）
- 未 push 作業 commit の救出・復元（損失を中断 step 1 個分に限定することが本 request の目的）
- archive / --with-merge 経路の変更

## 受け入れ条件

- [ ] 作業 commit の push が拒否される状況で halt した場合、publish される branch tip が awaiting-resume の quiescent checkpoint（親 = 最終 push 成功 tip、未 push 作業 commit を含まない）になることをテストで固定する
- [ ] 積み直された checkpoint に対して attach（rebind）検証が成立し、resume が拒否された step から再走できることをテストで固定する
- [ ] 積み直し push も失敗した場合に throw せず warn で継続することをテストで固定する
- [ ] push 成功の通常経路は既存テスト無変更で green
- [ ] `typecheck && test` が green

## 関連

- #1059（対応方向 A）
- #1054（発生事案）
