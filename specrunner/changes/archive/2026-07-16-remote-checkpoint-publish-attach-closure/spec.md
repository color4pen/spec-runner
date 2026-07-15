# Spec: remote checkpoint publish / attach correctness closure

remote checkpoint を単一 immutable commit として publish し、その同じ commit を検証・materialize して
安全に再束縛する不変を behavior として閉じる。producer（quiescent checkpoint publisher）と consumer
（immutable OID を貫く attach ＋ 強化した述語 ＋ 非破壊 materialize）の対称性を規定する。

## Requirements

### Requirement: 制御された awaiting-resume 出口で checkpoint を単一 commit として publish する

pipeline が制御された `awaiting-resume` 出口（escalation / exhaustion / guard halt）に至ったとき、システムは
local persist の後に、state（`state.json`）・journal（`events.jsonl`）・resume に要る成果物を **同一 commit
（同一 HEAD）** に畳んだ self-consistent な checkpoint を origin へ commit+push SHALL する。publish は
**単一の seam** が所有し、複数の出口へ commit/push を散らしては MUST NOT ならない。commit/push の失敗は
local resume 可能性を壊しては MUST NOT ならない。

#### Scenario: escalation 出口で checkpoint が publish される

**Given** local runtime の pipeline が step 失敗で escalation に至り `awaiting-resume` へ遷移する
**When** pipeline が終端処理を行う
**Then** local persist の後、feature branch の origin へ single commit が push され、その commit の tree に
`state.json`（status = `awaiting-resume`）・`events.jsonl`・resume に要る成果物が揃っている

#### Scenario: exhaustion 出口で checkpoint が publish される

**Given** local runtime の pipeline が retry budget を使い切り `awaiting-resume` へ遷移する
**When** pipeline が終端処理を行う
**Then** local persist の後、single commit が origin へ push される

#### Scenario: guard halt 出口で checkpoint が publish される

**Given** local runtime の pipeline が guard halt（tool-driven completion halt / main-checkout drift 等）で
`awaiting-resume` へ遷移する
**When** pipeline が終端処理を行う
**Then** local persist の後、single commit が origin へ push される

#### Scenario: push 失敗でも local resume 可能性を保つ

**Given** 制御された `awaiting-resume` 出口に至り local persist は完了している
**When** checkpoint の commit または push が失敗する
**Then** システムは例外を投げず、local の `state.json` / `events.jsonl` は `awaiting-resume` の resumable な
状態のまま残り、`job resume` が local で開始できる

#### Scenario: 正常完了は awaiting-resume publisher を経由しない

**Given** pipeline が正常完了し `awaiting-archive` へ遷移する
**When** pipeline が終端処理を行う
**Then** publish は既存の awaiting-archive publish が担い、awaiting-resume 用の seam は起動しない

### Requirement: attach は fetch 直後に解決した commit OID を read・verify・materialize で貫く

attach は `git fetch origin <branch>` の直後に checkpoint の commit OID を **一度だけ** 解決し、checkpoint の
読み取り・検証・materialize はすべてその OID を対象に SHALL する。symbolic `origin/<branch>` を後段で
再評価しては MUST NOT ならない。`origin/<branch>` が検証後に別 commit へ動いても、materialize は検証した OID を
checkout する。

#### Scenario: fetch 後に解決した OID が read/verify/materialize を貫く

**Given** `origin/<branch>` に awaiting-resume の checkpoint が push 済み
**When** `specrunner job attach --branch <branch>` を実行する
**Then** fetch 直後に解決した commit OID が checkpoint の読み取り・検証に使われ、materialize は同じ OID を
checkout する

#### Scenario: 検証後に origin が動いても検証済み OID を materialize する

**Given** attach が fetch 後に commit OID を解決し、その checkpoint を検証済み
**When** materialize の前に `origin/<branch>` が別 commit へ進む
**Then** materialize は検証した OID の commit から worktree と local branch を作り、動いた後の commit は
使わない

### Requirement: attach は既存 local branch を破壊しない

attach の materialize（`git worktree add`）が失敗したとき、システムは「この呼び出しが作成したと証明できる
branch」のみを cleanup 対象と SHALL する。attach 前から存在した local branch を削除しては MUST NOT ならない。
new-run の自己作成 branch（一意名）の cleanup 挙動は変えては MUST NOT ならない。

#### Scenario: 既存 local branch は attach 失敗後も残る

**Given** attach 対象の feature branch と同名の local branch が既に存在し、未 push commit を持つ
**When** attach の `git worktree add` が失敗する
**Then** その local branch は削除されずに残り、未 push commit も失われない

#### Scenario: attach が作成した branch は失敗時に掃除される

**Given** attach 対象の feature branch 名の local branch が呼び出し前に存在しない
**When** attach が `-b <branch>` で worktree を作ろうとして失敗する
**Then** この呼び出しが作成した branch は cleanup で削除され、orphan を残さない

#### Scenario: new-run の自己作成 branch cleanup は不変

**Given** new-run が一意名 `<slug>-<jobId8>` の branch を `-b` で作ろうとして全 retry 失敗する
**When** worktree add の cleanup が走る
**Then** その一意 branch は `git branch -D` で掃除される（現行挙動どおり）

### Requirement: checkpoint 述語は tree の自己整合を D2 まで検証してから再束縛する

attach は `origin/<branch>` checkpoint tree の自己整合を検証してからでなければ、job state・worktree・
liveness sidecar を MUST NOT 生成する。version 2 checkpoint では `events.jsonl` の存在を、journal の counter
reversal（truncation）の不在を、解決した resume step の `reads()` が返す必須入力（file 参照）の tree 内存在を
SHALL 検査する。いずれの不成立も typed error（`CHECKPOINT_NOT_ATTACHABLE`）で拒否し、ローカル状態を一切
作っては MUST NOT ならない。

#### Scenario: version 2 で events.jsonl 欠落を拒否する

**Given** `origin/<branch>` の checkpoint が version 2 の `state.json` を持つが tree に `events.jsonl` が無い
**When** attach が checkpoint を検証する
**Then** attach は `CHECKPOINT_NOT_ATTACHABLE`（reason: events 欠落）で失敗し、job state・worktree・sidecar を
一切作らない

#### Scenario: counter reversal を拒否する

**Given** `origin/<branch>` の `state.json` の `_journal` counter に対し `events.jsonl` が truncate されている
**When** attach が checkpoint を検証する
**Then** attach は `CHECKPOINT_NOT_ATTACHABLE`（reason: counter reversal）で失敗し、ローカル状態を一切作らない

#### Scenario: resume step の必須入力欠落を拒否する

**Given** 解決した resume step の `reads()` が返す必須 file 入力の一つが checkpoint tree に存在しない
**When** attach が checkpoint を検証する
**Then** attach は `CHECKPOINT_NOT_ATTACHABLE`（reason: resume 入力欠落）で失敗し、ローカル状態を一切作らない

#### Scenario: attach 対象は awaiting-resume のみ

**Given** `origin/<branch>` の `state.status` が `awaiting-resume` 以外
**When** attach が status を検証する
**Then** attach は `CHECKPOINT_NOT_ATTACHABLE`（quiescent＝現在は `awaiting-resume` のみ）で失敗する

### Requirement: cross-environment resume が publish と attach で閉じる

システムは、マシンA相当が pipeline を `awaiting-resume` へ遷移させて自己整合な checkpoint を origin へ publish し、
マシンB相当が **同じ commit OID** を検証・materialize して既存の `job resume` を開始できることを SHALL 保証する。

#### Scenario: publish した checkpoint を別環境が同一 OID で attach・resume する

**Given** マシンA相当の pipeline が `awaiting-resume` へ遷移し、checkpoint を origin へ publish した
**When** マシンB相当が `specrunner job attach --branch <branch>` を実行し、続けて `job resume` を開始する
**Then** マシンB相当は publish された commit と同じ OID を検証・materialize し、`job resume` が resume step から
pipeline を開始できる

### Requirement: 既存の attach / commit / worktree 挙動を保存する

本 change は既存の attach 検証 / commit / worktree の挙動保存テストを無変更で green に SHALL 保つ。

#### Scenario: 既存挙動保存テストが無変更で green

**Given** attach / commit / worktree の既存挙動保存テスト（new-run cleanup、commitFinalState、worktree
manager 等）
**When** 本 change を適用してテストを走らせる
**Then** それらのテストはテスト側の改変なしに green のままである
