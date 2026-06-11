# Design: stale-running-recovery

## Context

pipeline 実行中にプロセスが死ぬと（スリープ・再起動・kill）、job は `status=running`
のまま残る。terminal 状態に達していないため:

- `notifyJobTerminal` は `awaiting-resume` / `awaiting-archive` のみ発火するため issue 通知が出ない
  （src/core/notify/issue-notifier.ts:152-164）
- inbox の resume 対象は `status=awaiting-resume` かつ issueNumber を持つ job のみ
  （src/core/inbox/planner.ts:176-178）

結果、孤児化した running job は無人ループで誰にも拾われず沈黙のまま停止する。

既存資産:

- `isStaleRunning(state, sidecarPath)` — `status=running` かつ記録 pid（state.pid または
  liveness sidecar の pid）のプロセスが生存していない場合に true を返す純粋寄りの判定
  （src/core/resume/safety.ts:40-67）。`process.kill(pid,0)` プローブ + sidecar 同期読み。
- `ResumeCommand.prepare()` — `status=running` かつ `isStaleRunning` が true のとき
  `running → awaiting-resume → running` と遷移して孤児を回復する経路を既に持つ
  （src/core/command/resume.ts:110-138）。inbox の `resumeJob` effect は
  `runResumeCore`（src/cli/resume.ts:39）経由でこの経路を呼ぶ。
- `transitionJob` / `canTransition` — `running → awaiting-resume` は許可されている
  （src/state/lifecycle.ts:37）。
- inbox orchestrator（src/core/inbox/run-inbox.ts）は既に I/O 層（issue 取得・
  `JobStateStore.list`・effect 実行）であり、planner（planner.ts）は純粋関数として分離されている。

本変更はこの孤児検出を inbox の tick に乗せ、無人で自動回復させる。

## Goals / Non-Goals

**Goals**:

- inbox run が `status=running` かつ記録 pid のプロセスが生存していない job を検出する
- 検出した job を既存 resume 回復経路（`runResumeCore` → `ResumeCommand` の孤児検出）で自動回復する
- 同一 job への自動 resume が「進捗なしで」連続する場合に上限を設け、超過時は
  `awaiting-resume` に倒して escalation 通知に委ねる（crash-loop 防止）

**Non-Goals**:

- pid のプロセスが生存している running job の扱い（従来どおり対象外）
- 他マシンで実行中の job の検出（pid はローカルプロセス前提）
- 自動回復の閾値を config 化すること（モジュール定数で固定。Open Questions 参照）
- crash-loop 用の新しい通知 kind の追加（既存 escalation 通知を再利用）

## Decisions

### D1: 孤児検出は orchestrator（I/O 層）で行い、判断は純粋 planner に委ねる

stale 判定（`isStaleRunning`）はプロセステーブルのプローブと sidecar 読みを伴うため純粋ではない。
既存アーキテクチャの「planner は純粋・orchestrator は I/O」境界を維持するため、orchestrator が
収集フェーズで各 running job の staleness を計算して `staleRunningJobIds: Set<string>` を構築し、
`planInbox` の入力として渡す。planner はこの集合に属する running job だけを対象に recover/escalate を
判定する純粋関数のまま保つ。

**Rationale**: planner に `process.kill` / fs 読みを持ち込むと既存の純粋性（planner.test.ts が I/O なしで
全網羅できる前提）が壊れる。orchestrator は既に `JobStateStore.list` 等の I/O を持つので追加コストが小さい。

**Alternatives**:
- planner 内で `isStaleRunning` を呼ぶ案 — planner の純粋性が失われ、テストが実プロセス依存になるため不採用。
- staleness 判定を `isStale(state): boolean` の注入可能 effect とし、orchestrator はそれを収集フェーズで呼ぶ。
  既定実装は sidecar path を解決して `isStaleRunning` に委譲。orchestrator テストを実プロセスに依存させず
  決定的に書けるようにする。

### D2: 回復は既存 resume 経路（runResumeCore → ResumeCommand）を再利用する

検出した stale-running job の自動回復は、inbox の既存 `resumeJob` effect
（`runResumeCore(slug)` → `ResumeCommand.prepare()`）を `resumePrompt=undefined` で呼ぶだけとする。
`running → awaiting-resume → running` の遷移・worktree 解決・pipeline 起動は
`ResumeCommand` 側の孤児検出ロジックがそのまま担う。inbox は「どの slug を resume するか」だけを決める。

**Rationale**: 回復経路を二重実装すると遷移・worktree・lifecycle binding のロジックが分岐し、
不整合の温床になる。受け入れ基準「resume コマンドの既存孤児検出と同等の回復経路に乗せる」にも合致。

**Alternatives**: inbox が直接 `transitionJob` で running→awaiting-resume→running を行い pipeline を起動する案 —
ResumeCommand の安全ゲート（consecutive escalation, request.md 再パース, worktree 再解決）を再実装する必要があり不採用。

### D3: crash-loop guard は「進捗フィンガープリント付きカウンタ」を state に持つ

JobState に optional field `staleRecovery?: { attempts: number; stepCount: number } | null` を追加する。

- `attempts`: 進捗なしで連続した自動回復の回数。
- `stepCount`: 直近の自動回復時に観測した step 実行記録の総数（= `Σ state.steps[*].length`）= 進捗の指標。

planner は stale-running job ごとに現在の `stepCount` を再計算し、保存値と比較する:

```
currentCount = countStepRuns(job)
stored       = job.staleRecovery
effective    = (stored && stored.stepCount === currentCount) ? stored.attempts : 0
```

`effective` が上限未満なら recover（`attempts = effective + 1`, `stepCount = currentCount` を記録）、
上限以上なら escalate。回復後 pipeline が 1 step でも進めば StepRun が増えて `stepCount` が変化し、
次 tick で fingerprint 不一致 → `effective = 0` に自動リセットされる。プロセスが進捗ゼロで死に続ける
（poison job）場合のみ `attempts` が単調増加し、上限到達で escalate する。

**Rationale**: 「連続失敗 = 回復間に進捗がない」を厳密に表現できる。リセットを fingerprint 比較で
planner 内に閉じ込めるため、pipeline / ResumeCommand 側にリセットフックを足さずに済み、本機能を
inbox モジュール + state field 1 つに完全内包できる（blast radius 最小）。各 step の再試行も
attempt として StepRun が追加されるため、step 内進捗も fingerprint に反映される。

**Alternatives**:
- 単調増加カウンタ（進捗で減らさない）案 — 正常に進捗している job も N 回 crash すると誤って escalate する
  false positive を生むため不採用。
- `history` から `stale-detection` trigger エントリ数を数える案 — 手動 resume 分も混入し、進捗リセットも
  表現できず脆いため不採用。

### D4: 上限超過時は awaiting-resume へ遷移し既存 notifyJobTerminal を再利用して escalation する

escalate アクションでは orchestrator が純粋関数 `transitionJob(job, "awaiting-resume", …)` を呼び、
patch で `pid: null` / 合成 `resumePoint`（step・理由を埋めて escalation コメントを有意にする）/
`staleRecovery: null`（カウンタクリア）を適用して persist し、`notifyJobTerminal(state, ctx)` を呼ぶ。
`status=awaiting-resume` なので escalation コメントが投稿され、以後は通常の human `/resume` 経路
（planResumes）で拾える状態になる。

**Rationale**: 「escalation 通知に委ねる」をそのまま実現する最小手段。通知本文の生成
（`buildEscalationComment`）と投稿（`createIssueComment`）を再実装せず、pipeline 終端と同じ通知器を再利用する。
`staleRecovery` をクリアすることで、human が `/resume` した後の job に自動回復バジェットを再付与する。

**Alternatives**: escalation コメントを inbox 独自に組み立てる案 — 通知フォーマットが二系統に分岐するため不採用。

### D5: 回復は全 stale-running job を対象とし、通知のみ issue-link を要件とする

自動 resume（recover）は issueNumber の有無に関わらず全 stale-running job を対象にする
（無人回復の目的に合致し、resume 自体は issue を必要としない）。escalate の遷移も issueNumber 無しで実行するが、
escalation コメントは `notifyJobTerminal` が issueNumber 不在時に no-op になるため、issue-link がある job のみ
通知される。

**Rationale**: 要件 1「running かつ pid 死亡の job を検出する」に issue-link の制約はない。issue 無しの job も
回復対象とし、上限超過時は少なくとも `awaiting-resume`（= `job list` / `ps` で可視）に倒すことで、現状の
誤解を招く "running" 表示よりは改善する。

### D6: 上限はモジュール定数（既定 3）とする

planner に `MAX_STALE_RECOVERY_ATTEMPTS = 3` を定義し export する（テスト用）。
既存の consecutive-escalation 閾値（safety.ts の 3）と整合させる。

**Rationale**: 依存・設定面を最小化する North Star に沿い、まず定数で固定する。config 化は後続で検討可能
（Open Questions）。

### D7: カウンタの所有権は inbox（自動経路）に置き、手動 resume は対象外とする

`staleRecovery` の increment は inbox の recover 実行時のみ行い、`ResumeCommand` には手を入れない。
crash-loop guard は「自動 resume の連続」に対する上限であり、human の手動 `job resume` は意図的な操作なので
カウントしない。`isStale` 判定 effect も注入可能にし、orchestrator テストを実プロセスに依存させない。

**Rationale**: 要件 3 は「同一 job への自動 resume が連続」を対象とする。手動 resume を巻き込むと、運用者が
明示的に再開した job が不意に escalate される。inbox にロジックを閉じることで ResumeCommand を無変更に保つ。

## Risks / Trade-offs

- [Risk] pid も sidecar も無い legacy running state は `isStaleRunning` の 15 分 updatedAt フォールバックに
  落ち、長時間 running な legacy job を誤って stale と判定し得る → Mitigation: 現行コードで開始した job は
  pid または sidecar pid を必ず持つ。判定は手動 resume と同一セマンティクスであり新規の劣化はない。legacy 限定。
- [Risk] recover 前の `staleRecovery` persist で `resolveStateStoreByJobId` が null（sidecar index 欠落の
  degraded）の場合カウンタが進まず crash-loop が無限化し得る → Mitigation: 同じ degraded は既存
  ResumeCommand の persist でも発生する既知条件。null 時は warning を出して skip する（best-effort）。
- [Risk] ローカルで死んだ pid が他マシンでは生存 pid と衝突し得る → Mitigation: 「他マシンの job 検出は
  非対象（pid はローカルプロセス前提）」として Non-Goals に明記済み。
- [Risk] 回復は `maxStartsPerRun` の対象外で実行されるため、多数の孤児が一度にマシン負荷を生み得る →
  Mitigation: 1 tick あたり対象は実在する stale-running job 数に限られ、回復は sequential 実行。

## Open Questions

- `MAX_STALE_RECOVERY_ATTEMPTS` を `InboxConfig`（config.inbox）へ昇格すべきか。当面は定数で固定する。
- crash-loop 起因の escalation を通常 escalation と区別する telemetry / 通知文言を将来分けるか。現状は
  既存 escalation 通知を再利用する。
