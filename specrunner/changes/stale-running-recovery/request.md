# inbox run が孤児化した running job を検出して自動回復する

## Meta

- **type**: new-feature
- **slug**: stale-running-recovery
- **base-branch**: main
- **adr**: true

## 背景

pipeline 実行中にプロセスが死ぬと（マシンのスリープ・再起動・kill）、job は status=running のまま残る。terminal 状態に達していないため issue への通知も出ず、inbox は awaiting-resume のみを resume 対象とするため、この job は無人ループの中で誰にも拾われず沈黙のまま停止する。job resume を手動実行した場合のみ孤児検出が働き回復する。無人運用ではこの検出を inbox の tick に乗せ、自動で回復させる。

## 現状コードの前提

- inbox の resume 対象は status が awaiting-resume かつ issueNumber を持つ job のみ（src/core/inbox/planner.ts:177）
- job resume は status=running かつ記録 pid のプロセスが生存していない場合に awaiting-resume へ遷移させて続行する孤児検出を持つ（src/core/command/resume.ts:110-136）
- job state は pid フィールドを持つ（src/state/schema.ts:215）
- pipeline の terminal 通知（escalation / completed）は awaiting-resume / awaiting-archive のみで発火する（src/core/notify/issue-notifier.ts:152-164）

## 要件

1. inbox run は status=running かつ記録 pid のプロセスが生存していない job を検出する
2. 検出した job を自動で resume する（resume コマンドの既存孤児検出と同等の回復経路に乗せる）
3. 同一 job への自動 resume が連続で失敗を繰り返す場合の上限を設け、超過時は awaiting-resume に倒して escalation 通知に委ねる（crash-loop 防止）

## スコープ外

- pid のプロセスが生存している running job の扱い（従来どおり対象外）
- 他マシンで実行中の job の検出（pid はローカルプロセス前提）

## 受け入れ基準

- [ ] running かつ pid 死亡の job が inbox run で resume される
- [ ] pid が生存している running job は対象外のまま
- [ ] 連続自動 resume の上限超過で escalation 通知に倒れる
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

TBD
