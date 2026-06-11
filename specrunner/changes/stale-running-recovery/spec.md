# Spec: stale-running-recovery

## Requirements

### Requirement: inbox run は孤児化した running job を検出して自動回復する

`inbox run` は `status=running` かつ記録 pid（state.pid または liveness sidecar の pid）の
プロセスが生存していない job を stale-running として検出し、既存 resume 回復経路
（`runResumeCore` → `ResumeCommand` の孤児検出）で自動 resume MUST する。pid のプロセスが
生存している running job は対象外と MUST する。

#### Scenario: running かつ pid 死亡の job が resume される

**Given** `status=running` で記録 pid のプロセスが生存していない job が存在する
**When** `inbox run` を実行する
**Then** その job の slug に対して resume（runResumeCore 経路）が呼ばれる

#### Scenario: pid が生存している running job は対象外

**Given** `status=running` で記録 pid のプロセスが生存している job が存在する
**When** `inbox run` を実行する
**Then** その job に対して resume も escalation も行われない

#### Scenario: issue-link が無い stale-running job も回復対象になる

**Given** issueNumber を持たない stale-running job が存在する
**When** `inbox run` を実行する
**Then** その job の slug に対して resume が呼ばれる

### Requirement: 進捗なしの連続自動回復に上限を設ける（crash-loop guard）

`inbox run` は同一 job への自動 resume が「回復間に進捗がない」状態で連続した回数を
`staleRecovery.attempts` として state に記録 MUST する。進捗の有無は step 実行記録の総数
（`Σ state.steps[*].length`）の変化で判定し、変化していれば連続回数を 0 にリセット MUST する。
連続回数が上限（`MAX_STALE_RECOVERY_ATTEMPTS`）未満の間は自動 resume を行い、上限以上では
自動 resume せず escalation に倒す MUST。

#### Scenario: 上限未満では自動 resume しカウンタを増やす

**Given** stale-running job の `staleRecovery` が未設定、または保存 stepCount が現在の step 実行総数と一致し attempts が上限未満
**When** `inbox run` を実行する
**Then** その job が resume され、`staleRecovery` が `{ attempts: 直前値+1, stepCount: 現在の step 実行総数 }` に更新される

#### Scenario: 回復間に進捗があればカウンタがリセットされる

**Given** stale-running job の保存 `staleRecovery.stepCount` が現在の step 実行総数と異なる
**When** `inbox run` を実行する
**Then** その job が resume され、`staleRecovery.attempts` が 1（= 0 からの再カウント）に更新される

#### Scenario: 進捗ゼロで上限到達すると escalation に倒れる

**Given** stale-running job の保存 stepCount が現在の step 実行総数と一致し、attempts が上限以上
**When** `inbox run` を実行する
**Then** その job は resume されず、`awaiting-resume` へ遷移する

### Requirement: 上限超過時は awaiting-resume へ遷移し escalation 通知に委ねる

連続自動回復が上限を超過した job について、`inbox run` は `running → awaiting-resume` へ遷移し、
`pid` を null・`staleRecovery` を null にクリアし、step と理由を埋めた `resumePoint` を設定 MUST する。
issueNumber を持つ場合は既存の terminal 通知器（`notifyJobTerminal`）経由で escalation コメントを
issue へ投稿 MUST する。

#### Scenario: issue-link がある job は escalation コメントが投稿される

**Given** 上限超過の stale-running job が issueNumber を持つ
**When** `inbox run` を実行する
**Then** その job は `awaiting-resume` へ遷移し、リンク先 issue に escalation コメントが 1 件投稿される

#### Scenario: issue-link が無い job はコメントを投稿せず遷移のみ行う

**Given** 上限超過の stale-running job が issueNumber を持たない
**When** `inbox run` を実行する
**Then** その job は `awaiting-resume` へ遷移し、issue コメントは投稿されない

#### Scenario: 上限超過後は human の /resume 経路で拾える状態になる

**Given** 上限超過で `awaiting-resume` へ倒れた issue-link 付き job が存在する
**When** escalation コメント以降に権限あるユーザーが `/resume` コメントを投稿し、次の `inbox run` が走る
**Then** その job が通常の resume（planResumes）経路で resume される
