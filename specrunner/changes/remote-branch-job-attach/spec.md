# Spec: `job attach --branch` — remote branch から quiescent job を attach する

## Requirements

### Requirement: attach は明示 branch の remote checkpoint を fetch して読む

`specrunner job attach --branch <branch>` は `origin/<branch>` を fetch し、その HEAD tree の branch-borne checkpoint（`specrunner/changes/<slug>/state.json` ＋ `events.jsonl` ＋ resume に要る成果物）を tree から読み取る。slug は tree 上の change folder（`archive` / `canceled` を除く、`state.json` を持つ dir）から導出する。branch は明示指定であり、`origin/*` の暗黙走査を **MUST NOT** 行う。

#### Scenario: 明示 branch のみを fetch する

**Given** `origin/feat/x-<id>` に awaiting-resume の checkpoint が push 済み
**When** `specrunner job attach --branch feat/x-<id>` を実行する
**Then** `git fetch origin feat/x-<id>` が実行され、`origin/*` 全体の走査は行われない

#### Scenario: tree から slug を導出する

**Given** `origin/<branch>` HEAD tree に `specrunner/changes/<slug>/state.json` が 1 件存在する
**When** attach が checkpoint を読む
**Then** slug は当該 change folder の dir 名から導出され、後段の identity 検証で `getJobSlug(state)` と一致することが確認される

#### Scenario: attach 可能な change folder が tree に存在しない

**Given** `origin/<branch>` HEAD tree に `archive` / `canceled` を除く state.json 付き change folder が 0 件、または 2 件以上存在する
**When** attach が slug を導出しようとする
**Then** attach は `CHECKPOINT_NOT_FOUND` の typed error で失敗し、job state・worktree・sidecar を一切作らない

### Requirement: attach は checkpoint tree の自己整合を検証してから初めてローカル状態を作る

attach は `origin/<branch>` HEAD tree が自己整合であることを検証してからでなければ、job state・worktree・liveness sidecar を **MUST NOT** 生成する。検証項目は (a) `state.status` が quiescent（`awaiting-resume`）、(b) journal（`events.jsonl`）と projection（`state.json`）の整合、(c) resume point / pipeline 定義が解決可能、(d) resume に必須の成果物（`request.md`）が tree に存在、(e) repository / jobId / branch identity の一致。いずれか不成立なら typed error で拒否する。

#### Scenario: 自己整合でない checkpoint を拒否し、何も作らない

**Given** `origin/<branch>` の checkpoint が検証項目 (a)-(e) のいずれかに違反する（status が quiescent でない / 必須成果物欠落 / identity 不一致 / journal 破損）
**When** `specrunner job attach --branch <branch>` を実行する
**Then** attach は typed error（`CHECKPOINT_NOT_ATTACHABLE`）で失敗し、job state・worktree・sidecar を一切作らない

#### Scenario: awaiting-resume のみを attach 対象とする

**Given** `origin/<branch>` の `state.status` が `running`
**When** attach が status を検証する
**Then** attach は `CHECKPOINT_NOT_ATTACHABLE` で失敗し、worktree・sidecar を作らない

#### Scenario: 検証成功後にのみローカル状態を作る

**Given** `origin/<branch>` の checkpoint が検証項目 (a)-(e) をすべて満たす
**When** attach を実行する
**Then** 検証通過後に worktree と liveness sidecar が生成される

### Requirement: attach は feature branch HEAD（checkpoint commit）から worktree を materialize する

attach は fetch した feature branch の HEAD（checkpoint commit）を checkout した worktree を作る。materialize 起点は base branch tip ではなく `origin/<branch>` HEAD であり、ローカル feature branch `<branch>` をその commit に作成する。この経路は新しい materialization plan variant として追加され、既存の resume 系 plan（base branch 起点）の挙動を **MUST NOT** 変更する。

#### Scenario: worktree が checkpoint commit を持つ

**Given** 検証済みの checkpoint（jobId `J`、slug `S`）
**When** attach が worktree を materialize する
**Then** worktree は `origin/<branch>` HEAD から checkout され、その worktree の `specrunner/changes/<S>/state.json` と `events.jsonl` が branch-borne checkpoint の内容と一致する（base branch tip ではない）

#### Scenario: 既存 resume 系 plan の挙動は不変

**Given** 既存の `resume-recreated` / `resume-without-recorded-worktree` plan（base branch 起点）
**When** 本 change を適用する
**Then** これらの plan の materialization 挙動は変わらず、既存テストは無改変で green

### Requirement: attach は liveness sidecar を pid=null で再構築する

attach は machine-local liveness sidecar（`.specrunner/local/<slug>/liveness.json`）を再構築する。`worktreePath` は規約（`<slug>-<jobId8>`）から導出、`jobId` は branch-borne state から、`pid` は `null` とする（ADR-20260715 D3 の reconstruction contract）。

#### Scenario: sidecar の形状

**Given** attach が worktree を materialize した直後
**When** liveness sidecar を書く
**Then** sidecar は `jobId`（branch-borne 由来）、`worktreePath`（規約 `<slug>-<jobId8>` 導出）、`pid=null` を持つ

### Requirement: attach と resume は別動詞であり、attach 後に resume が無改変で成立する

attach（tree 検証 → materialize → rebind）と resume（FSM 再開）は別動詞として分離する。attach は checkpoint job を自動 resume **MUST NOT**。attach 完了後、既存の `specrunner job resume <slug>` は変更なしで当該 job を発見・再開できる。

#### Scenario: attach は自動 resume しない

**Given** 検証済みの checkpoint
**When** `specrunner job attach --branch <branch>` が完了する
**Then** pipeline は実行されず、job は `awaiting-resume` のまま留まり、`specrunner job resume <slug>` の案内が表示される

#### Scenario: attach → resume が成立する

**Given** attach が worktree と sidecar を生成済み
**When** `specrunner job resume <slug>` を実行する
**Then** resume は当該 job を発見し（既存 discovery 経路のまま）、`awaiting-resume → running` に遷移して FSM を再開する
