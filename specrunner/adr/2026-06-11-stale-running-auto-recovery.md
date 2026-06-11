# inbox run が孤児化した running job を自動回復する（stale-running recovery）

**Date**: 2026-06-11
**Status**: accepted
**Related**: `specrunner/adr/2026-06-10-inbox-auto-fire-inbound-transport.md`（inbox planner/orchestrator 分離の上位決定）

## Context

pipeline 実行中にプロセスが死ぬと（スリープ・再起動・kill）、job は `status=running` のまま残る。
terminal 状態に達していないため:

- `notifyJobTerminal` は `awaiting-resume` / `awaiting-archive` のみ発火するため issue 通知が出ない
- inbox の resume 対象は `status=awaiting-resume` かつ issueNumber を持つ job のみ

結果、孤児化した running job は無人ループで誰にも拾われず沈黙のまま停止する。
手動 `job resume` を実行した場合のみ孤児検出が働き回復する。

既存資産として以下が利用可能だった:

- `isStaleRunning(state, sidecarPath)` — `process.kill(pid,0)` + sidecar 読みによるプロセス生存確認
  （`src/core/resume/safety.ts`）
- `ResumeCommand.prepare()` — `status=running` かつ `isStaleRunning=true` のとき
  `running → awaiting-resume → running` と遷移して孤児を回復する経路
- `transitionJob` / `canTransition` — `running → awaiting-resume` は許可済み
- inbox は既に `planner`（純粋関数）/ `orchestrator`（I/O 層）に分離されている

## Decisions

### D1: 孤児検出は orchestrator で行い、判断は純粋 planner に委ねる

staleness 判定（`isStaleRunning`）はプロセステーブルのプローブと sidecar 読みを伴うため純粋ではない。
orchestrator が収集フェーズで各 running job の staleness を計算して `staleRunningJobIds: Set<string>` を
構築し、`planInbox` の入力として渡す。planner はこの集合に属する running job だけを対象に
recover / escalate を判定する純粋関数のまま保つ。

**Rationale**: planner に `process.kill` / fs 読みを持ち込むと既存の純粋性（planner.test.ts が I/O なしで
全網羅できる前提）が壊れる。orchestrator は既に `JobStateStore.list` 等の I/O を持つので追加コストが小さい。
`isStale` 判定を注入可能 effect として定義することで、orchestrator テストを実プロセスに依存させない。

**Alternatives**:
- planner 内で `isStaleRunning` を直接呼ぶ案 — planner の純粋性が失われ、テストが実プロセス依存になる。却下。

### D2: 回復は既存 resume 経路（runResumeCore → ResumeCommand）を再利用する

stale-running job の自動回復は、inbox の既存 `resumeJob` effect（`runResumeCore(slug)` →
`ResumeCommand.prepare()`）を `resumePrompt=undefined` で呼ぶだけとする。
`running → awaiting-resume → running` の遷移・worktree 解決・pipeline 起動は
`ResumeCommand` 側の孤児検出ロジックがそのまま担う。

**Rationale**: 回復経路を二重実装すると遷移・worktree・lifecycle binding のロジックが分岐し、
不整合の温床になる。inbox は「どの slug を resume するか」だけを決める。

**Alternatives**:
- inbox が直接 `transitionJob` で `running→awaiting-resume→running` を行い pipeline を起動する案 —
  `ResumeCommand` の安全ゲート（consecutive escalation, request.md 再パース, worktree 再解決）を
  再実装する必要があり不採用。

### D3: crash-loop guard は「進捗フィンガープリント付きカウンタ」を state に持つ

`JobState` に optional field `staleRecovery?: { attempts: number; stepCount: number } | null` を追加する。

- `attempts`: 進捗なしで連続した自動回復の回数
- `stepCount`: 直近の自動回復時に観測した step 実行記録の総数（`Σ state.steps[*].length`）= 進捗の指標

planner は stale-running job ごとに現在の `stepCount` を再計算し、保存値と比較する:

```
currentCount = countStepRuns(job)
stored       = job.staleRecovery
effective    = (stored && stored.stepCount === currentCount) ? stored.attempts : 0
```

`effective` が上限未満なら recover（`attempts = effective + 1`, `stepCount = currentCount` を記録）、
上限以上なら escalate。回復後に pipeline が 1 step でも進めば StepRun が増えて fingerprint が変化し、
次 tick で `effective = 0` に自動リセットされる。進捗ゼロで死に続ける job のみ `attempts` が単調増加し
上限到達で escalate する。

**Rationale**: 「連続失敗 = 回復間に進捗がない」を厳密に表現できる。リセットを fingerprint 比較で
planner 内に閉じるため、pipeline / ResumeCommand 側にリセットフックを足さずに済み、
本機能を inbox モジュール + state field 1 つに完全内包できる（blast radius 最小）。

**Alternatives**:
- 単調増加カウンタ（進捗で減らさない）案 — 正常に進捗している job も N 回 crash すると誤って
  escalate する false positive を生む。却下。
- `history` から `stale-detection` trigger エントリ数を数える案 — 手動 resume 分も混入し、
  進捗リセットも表現できず脆い。却下。

### D4: 上限超過時は awaiting-resume へ遷移し既存 notifyJobTerminal を再利用して escalation する

escalate アクションでは orchestrator が `transitionJob(job, "awaiting-resume", …)` を呼び、
`pid: null` / 合成 `resumePoint`（step・理由を埋めて escalation コメントを有意にする）/
`staleRecovery: null`（カウンタクリア）を patch で適用して persist し、`notifyJobTerminal(state, ctx)` を呼ぶ。
`status=awaiting-resume` なので escalation コメントが投稿され、以後は通常の human `/resume` 経路で拾える。

**Rationale**: 「escalation 通知に委ねる」をそのまま実現する最小手段。`buildEscalationComment` と
投稿（`createIssueComment`）を再実装せず、pipeline 終端と同じ通知器を再利用する。
`staleRecovery` をクリアすることで、human が `/resume` した後の job に自動回復バジェットを再付与する。

**Alternatives**:
- escalation コメントを inbox 独自に組み立てる案 — 通知フォーマットが二系統に分岐する。却下。

### D5: 回復は全 stale-running job を対象とし、通知のみ issue-link を要件とする

自動 resume（recover）は issueNumber の有無に関わらず全 stale-running job を対象にする。
escalate の遷移も issueNumber 無しで実行するが、`notifyJobTerminal` が issueNumber 不在時に
no-op になるため escalation コメントは issue-link がある job のみ投稿される。

**Rationale**: 要件「running かつ pid 死亡の job を検出する」に issue-link の制約はない。
issue 無しの job も回復対象とし、上限超過時は少なくとも `awaiting-resume`（`job list` / `ps` で可視）に
倒すことで、誤解を招く "running" 表示よりは改善する。

### D6: 上限はモジュール定数（既定 3）とする

planner に `MAX_STALE_RECOVERY_ATTEMPTS = 3` を定義し export する（テスト用）。
既存の consecutive-escalation 閾値（safety.ts の 3）と整合させる。
config 化は後続で検討可能（`InboxConfig` 昇格の Open Question として残す）。

**Rationale**: 依存・設定面を最小化する North Star に沿い、まず定数で固定する。

### D7: カウンタの所有権は inbox（自動経路）に置き、手動 resume は対象外とする

`staleRecovery` の increment は inbox の recover 実行時のみ行い、`ResumeCommand` には手を入れない。
crash-loop guard は「自動 resume の連続」に対する上限であり、human の手動 `job resume` は
意図的な操作なのでカウントしない。

**Rationale**: 要件「同一 job への自動 resume が連続」を対象とする。手動 resume を巻き込むと、
運用者が明示的に再開した job が不意に escalate される。inbox にロジックを閉じることで
`ResumeCommand` を無変更に保つ。

## Alternatives Considered

### Alternative 1: planner 内で staleness 判定を行う

- **Pros**: planner が自律的に stale job を識別できる
- **Cons**: `process.kill(pid, 0)` / sidecar 読みが planner に混入し、テストが実プロセス依存になる。
  inbox-auto-fire ADR（D1）が確立した「planner は純粋関数」原則が壊れる
- **Why not**: 却下（D1）

### Alternative 2: inbox が transitionJob を直接呼んで独立した回復経路を実装する

- **Pros**: ResumeCommand に依存しない
- **Cons**: `ResumeCommand` の安全ゲート（consecutive escalation, worktree 再解決）を再実装する必要があり、
  遷移ロジックの二重管理が生まれる
- **Why not**: 却下（D2）

### Alternative 3: 単調増加カウンタ（進捗リセットなし）

- **Pros**: シンプルな実装
- **Cons**: 正常に進捗している job が N 回 crash すると誤って escalate される false positive を生む
- **Why not**: 却下（D3）

### Alternative 4: `history` エントリ数で連続回数を数える

- **Pros**: state 拡張なし
- **Cons**: 手動 resume 分も混入し、進捗リセットも表現できない。脆くなる
- **Why not**: 却下（D3）

## Consequences

### Positive

- 無人運用中に孤児化した running job が次の `inbox run` tick で自動回復される
- planner の純粋性（I/O なしの全網羅テスト）が維持される
- crash-loop（進捗ゼロで無限再起動）を `MAX_STALE_RECOVERY_ATTEMPTS` 回で上限化し、
  escalation 通知で人間に委ねる構造になる
- 既存の resume 経路・通知器をそのまま再利用し、blast radius を inbox モジュール + state field 1 つに限定できる
- `staleRecovery: null` クリアで human が `/resume` した後の job に自動回復バジェットが再付与される

### Negative / Known Debt

- pid も sidecar も無い legacy running state は `isStaleRunning` の 15 分 `updatedAt` フォールバックに落ちる。
  現行コードで開始した job は pid または sidecar pid を必ず持つため新規の劣化はない
- `resolveStateStoreByJobId` が null（sidecar index 欠落の degraded）の場合、
  カウンタが進まず crash-loop が無限化し得る。同じ degraded は既存 `ResumeCommand` の persist でも発生する
  既知条件。null 時は warning を出して skip する（best-effort）
- 回復は `maxStartsPerRun` の対象外で実行されるため、多数の孤児が一度に存在するとマシン負荷が
  一時的に高まり得る。recovery は sequential 実行のため並列暴走は起きない
- `MAX_STALE_RECOVERY_ATTEMPTS` は未設定。`InboxConfig` への昇格は Open Question

## References

- Request: `specrunner/changes/stale-running-recovery/request.md`
- Design: `specrunner/changes/stale-running-recovery/design.md`
- Related ADR: `specrunner/adr/2026-06-10-inbox-auto-fire-inbound-transport.md`（planner 純粋性・orchestrator I/O 分離の上位決定）
- Related ADR: `specrunner/adr/2026-05-26-process-lifecycle-keepalive.md`（`beforeExit` safety net — running のまま exit する job の救済）
