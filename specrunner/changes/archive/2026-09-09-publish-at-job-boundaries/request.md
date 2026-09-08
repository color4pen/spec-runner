# local runtimeの各ステップpushを廃止し、成果公開と停止時の引き継ぎに集約する

## Meta

- **type**: spec-change
- **slug**: publish-at-job-boundaries
- **base-branch**: main
- **adr**: true

## 背景

現在は通常ステップ、並列レビューのラウンド、verificationで途中成果をcommit/pushする。これにより、対象プロジェクトの認証・トリガー設定によっては、実装途中やレビュー結果だけの更新でもCI・プレビューデプロイが繰り返される。

各ステップのローカルcommitには差分検査・revision束縛・再開の意味がある。一方、同じworktreeで後続ステップを実行するために毎回remoteへ送る必要はない。

利用者との合意は「各ステップではcommitだけにしてpushしない」。Actions上のlocal runtimeも同じ方針とする。突然終了への備えを理由に、毎ステップpushを既定・選択肢として残さない。

#1125 / #1126のGitHub任意化を維持する。本Issueで変更するのはpushのタイミングであり、GitHub非依存・remote非依存・Git非依存は別の軸である。#1125のstepごとのcommit/push維持という要件のうち、pushタイミングを本Issueで更新する。

## 目的

同一環境での処理中はローカルに成果と進捗を保存し、成果公開・別環境への再開引き継ぎ・archiveの区切りでまとめてpushする。Claude / GPT・Codex等、local runtimeで利用するagent providerによって方針を変えない。

## 確認した実装

調査基準: main `734d483a`。以下は起票前にコード確認済み。

- `src/core/step/executor.ts:454-463` → `src/core/runtime/local.ts:800-840` → `src/core/step/commit-push.ts:669,802`: 通常のagent stepの成果確定でcommit/pushする。
- `src/core/pipeline/parallel-review-round.ts:458-488` → `src/core/runtime/local.ts:1043-1060`: 並列メンバー単位ではなくラウンド単位でcommit/pushする。
- `src/core/step/verification.ts:61-82` → `src/core/verification/propagate.ts:63-96`: 検証結果をcommit/pushする。同一worktreeで結果を読むlocal経路にもこの処理がある。
- `src/core/pr-create/runner.ts:45-108`: PR APIを呼ぶがpushはしない。先行ステップでpush済みであることに依存する。既存OPEN PRではexisting-openを返すため、再実行でもAPI処理とは別に成果のpushが必要。
- `src/core/pipeline/pipeline.ts:408-418,635-649`: PR作成後のawaiting-archive、制御されたawaiting-resumeで最終状態を保存・pushする。停止通知はその後。
- `src/core/command/runner.ts:315-361`: pipeline実行前のissue-fidelity gateによるhaltにもcheckpoint公開経路がある。
- `src/core/step/commit-push.ts:856-902`: terminal commitは管理パスだけを対象とする。停止したstepの未commitな実装変更を丸ごと退避する仕組みではない。また、差分なしならreturnするため、commit済み・未pushの再送を「新しい差分がない」で省略してはならない。
- `src/core/runtime/local.ts:1575-1610`: signal停止はローカル状態保存後にexitし、checkpoint pushは行わない。
- `src/core/attach/checkpoint-policy.ts:47-54,155-166`: attachはquiescentな状態を要求し、running状態の途中pushだけでは再開保証にならない。
- `src/core/archive/orchestrator.ts:337-379`: archive recordのpush成功を確認して先へ進む。未送信成果をcleanupで失わないための契約。
- `src/core/runtime/managed.ts:379-394`: managed runtimeの成果公開は別の責務分担。Actions上でCLIを動かすこととmanaged runtimeを混同しない。

## ユーザーに見える動作

| 場面 | 要求する動作 |
|---|---|
| 通常step、修正ループ、並列レビューのラウンド終了 | ローカルcommit・記録を維持し、pushしない |
| local runtimeのverification終了 | 結果をローカル保存・commitし、後続処理は同じworktreeから読む。pushしない |
| 検証・レビュー完了後、PR作成・更新前 | 確定した成果をpushしてからPR API処理へ進む。push失敗時はPR処理に進まない |
| PR作成後の最終状態確定 | PR番号・URL・awaiting-archive等、別環境のattach/archiveに必要な最終記録をpushする |
| GitHub無効、または元からPRを作らないprofileの正常完了 | そのprofileの成果と最終記録をremote branchへ公開する。PRを新設しない |
| 制御されたhalt・エスカレーション | ローカルに再開状態を保存し、停止時公開が有効ならcheckpointをpushする |
| archive | 記録push → archived → cleanupの既存順序と安全条件を維持する |

PR作成前の成果pushと、PR作成後に初めて確定する記録pushは目的が異なる。現行のbranch-borne checkpoint形式を維持するため、完了付近に2回pushが必要になることは許容する。「完了時に必ず1回」へ無理にまとめない。

## 設計要求

### 1. ローカル保存とremote公開を分離する

- stepごとのcommit、OID台帳、検証・レビューのrevision束縛、staging範囲、除外設定を維持する。
- 通常step、ラウンド、verificationに散在するpushを除き、公開の区切りでまとめて送信する。agentへのpush指示や別の低水準経路で迂回しない。
- commitに差分がなくても未送信commitがあれば公開・再送できるよう、commit作成の要否とpushの要否を分ける。
- 複数stepのcommitが未送信で蓄積するため、egress検査・台帳・手動commit採用の既存契約をその条件で成立させる。未知のcommitを無条件で送る、台帳検査を無効化する等では解決しない。
- 新しいagent stepや巨大なruntime facadeを追加せず、既存の成果保存・公開の構成点を利用する。resumeにpush方針の制御を集中させない。

### 2. 停止時公開の契約を明示する

- 停止時のcheckpoint公開のみ、明示設定で有効・無効を選べるようにする。初期既定は有効として既存の別環境再開を維持する。手元の永続環境では無効にでき、Actions等の一時環境では有効にして運用する。
- runtime: local、GitHub有効/無効、特定agent provider、CI環境変数だけで停止時公開の要否を暗黙決定しない。設定名と配置は既存config構造に合わせて設計する。
- 解決した方針はjobへ保存し、resume/reopen/attachで再現する。既存stateに値がなければ停止時公開有効として扱う。設定を後から変えた場合の既存jobへの暗黙切替を避ける。
- 有効時は、quiescent状態・必要入力・journalを含むcheckpointを公開してから遠隔再開可能と案内する。push失敗を公開成功と表示せず、ローカル成果と再試行可能性を残す。pipeline前のgate haltも漏らさない。
- 無効時もローカルの変更・再開情報を保存し、同じ環境のresumeが成立する。自動で別環境から復旧できるとは案内しない。
- checkpointを口実に、haltしたstepの未検査変更や除外対象を全量stageしない。既存の保存範囲・安全条件を維持する。

### 3. 終了・公開の失敗を取り扱う

- PR作成前のpush失敗、PR API失敗、PR作成後の最終記録push失敗を区別する。成果公開が成功していないのに正常公開完了と表示しない。
- 再試行時に、新規差分がなくても未送信成果・記録を送信でき、PRの重複作成を避ける。
- signal/強制終了/runner消失からの復旧保証は拡張しない。現行のsignalローカル保存を維持し、毎step push廃止後は突然終了で当該実行の未送信成果が失われ得ることを運用文書へ明記する。
- managed runtimeは本Issueのpush集約対象外。remoteを介したagent間受け渡しを壊さず、local用の省略を一括適用しない。

## Acceptance Criteria

- [ ] local runtimeの通常step・修正ループ・並列ラウンド・verificationを通る実経路で、commit/記録が残る一方、途中のgit push呼び出しがゼロである
- [ ] 初回PR作成と既存PR更新で、必要な検証・レビュー完了 → 成果push成功 → PR API処理 → 最終記録公開の順序が成立する
- [ ] GitHub無効jobおよびPRを作らないprofileでも、正常完了時にそのprofileの成果・最終checkpointをremoteへ公開できる
- [ ] 停止時公開の有効/無効で、pipeline前gateを含む制御されたhaltのpush有無が切り替わる。有効時は別checkoutからattach/resume、無効時は同じ環境でresumeできる
- [ ] 複数stepの未送信commitが蓄積しても台帳・egress・revision束縛・除外設定が成立し、未知のcommitや未検査のhalt残余を無条件に公開しない
- [ ] 公開失敗後、新しい差分がない再試行で未送信commitを送れ、PR重複作成や成果・記録のcleanupによる消失を起こさない。公開失敗を成功と表示しない
- [ ] 保存済み公開方針のresume/reopen/attachとlegacy state互換が成立し、archiveのpush成功確認とmanaged runtimeの既存引き継ぎを維持する
- [ ] configの説明・有効値表示、README/guide、Actions運用、architectureを実装に追従させる。正常停止と突然終了の復旧可能性を区別する

検証はGitや認証を隔離したfixture・既存CLI/CommandRunner経路で行い、実GitHub/Vercelへのpushや実環境のcredentialを必須にしない。SpecRunner内で必要な検証と証跡作成を行い、レビュー側で同じtest/lint/typecheckを重複実行しない。

## Non-goals

- Git remote/origin不要化、fetchやbase revision選択の変更
- Git/worktree/commitの廃止、snapshot/artifact方式への置換
- base branchへの自動merge
- 毎ステップpushを残す設定、定期push・専用checkpoint branchの新設
- signal時の新しい遠隔復旧機構、Actions artifactを使う新しい復元方式
- 対象プロジェクトのCI/Vercel設定変更、すべての外部CI起動をゼロにする保証
- managed runtimeの公開方式変更、agent provider移行そのもの
- pipeline step追加、検証・レビューの省略、reopenからの自動resume

## 補足

GitHub ActionsのGITHUB_TOKENによるpushと、PAT等によるpushでは後続workflowの起動条件が異なる。CI実行回数そのものではなく、SpecRunnerがどの区切りでremoteへ公開するかを本Issueの契約とする。
