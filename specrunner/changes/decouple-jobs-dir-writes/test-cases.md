# Test Cases: local runtime の state 書き込みを slug/sidecar に一本化する

## Summary

- **Total**: 28 cases
- **Automated** (unit/integration): 28 (unit: 18, integration: 10)
- **Manual**: 0
- **Priority**: must: 20, should: 8, could: 0

---

## bootstrap defer（D1 / T-01）

### TC-001: local run の bootstrap で jobId ストアに書かない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 初期 state 永続化は worktree 確立後に slug 正本 + sidecar へ defer する > Scenario: local run の bootstrap で jobId ストアに書かない

---

### TC-002: worktree 確立後に slug 正本 + sidecar へ初期 state が書かれる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 初期 state 永続化は worktree 確立後に slug 正本 + sidecar へ defer する > Scenario: worktree 確立後に slug 正本 + sidecar へ初期 state が書かれる

---

### TC-003: managed の bootstrap は jobId ストアへ書く（温存）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 初期 state 永続化は worktree 確立後に slug 正本 + sidecar へ defer する > Scenario: managed の bootstrap は jobId ストアへ書く（温存）

---

### TC-014: `buildInitialJobState` が I/O なしで JobState を構築する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `buildInitialJobState({ request, repository })` に正常なパラメータを渡す
**WHEN** 関数を実行する
**THEN** ファイルシステムへのアクセスなしに `JobState`（jobId / status=running / step=init / history[init]）が返り、`.specrunner/jobs/` は作成されない

---

### TC-015: `JobStateStore.create()` の外部挙動が適用前と同一

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** 既存の `JobStateStore.create()` テストセットアップ
**WHEN** `JobStateStore.create(repoRoot, params)` を呼ぶ
**THEN** `.specrunner/jobs/<jobId>/state.json` と `events.jsonl` が生成され、返り値の `JobState` が `buildInitialJobState` と同一内容を保持する

---

## setupWorkspace seeding と updateJobState 一本化（D2 / T-02）

### TC-004: updateJobState が jobId ストアに書かない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: local の updateJobState は slug 正本のみへ書く > Scenario: updateJobState が jobId ストアに書かない

---

### TC-016: `bootstrapState` 未指定時に seed をスキップ

**Category**: unit
**Priority**: should
**Source**: design.md > D2 / tasks.md > T-02

**GIVEN** `WorkspaceOptions` に `bootstrapState` を設定しない
**WHEN** `setupWorkspace()` を呼ぶ
**THEN** slug ストアへの fresh persist は行われず、既存の slug ストア内容が変化しない

---

### TC-017: worktree 再利用経路で seed をスキップ

**Category**: unit
**Priority**: should
**Source**: design.md > D2 / tasks.md > T-02

**GIVEN** 既存 worktree が存在する（resume-reuse 経路）かつ `bootstrapState` が設定されている
**WHEN** `setupWorkspace()` を呼ぶ
**THEN** 既存 slug ストアは上書きされず、seed は行われない

---

### TC-018: seed 後の `updateJobState` が slug ストアを正常ロード

**Category**: unit
**Priority**: must
**Source**: design.md > D2 / tasks.md > T-02

**GIVEN** `setupWorkspace()` で `bootstrapState` が新 worktree の slug ストアへ seed された状態
**WHEN** `updateJobState()` で branch / request.path を更新する
**THEN** slug ストアから正常に load → mutate → persist が完了し、エラーが発生しない

---

## machine-local / portable の writer 一貫化（D3 / T-03）

### TC-019: resume-reuse 後に sidecar pid が現プロセス値に更新

**Category**: unit
**Priority**: must
**Source**: design.md > D3 / tasks.md > T-03

**GIVEN** 既存 worktree を持つ local job の `.specrunner/local/<slug>/liveness.json` に古い pid が記録されている
**WHEN** resume の `setupWorkspace()` が worktree 再利用経路で走る
**THEN** `liveness.json` の `pid` が現プロセスの pid に更新される

---

### TC-020: slug 正本に machine-local フィールドが含まれない

**Category**: unit
**Priority**: must
**Source**: design.md > D3 / tasks.md > T-03

**GIVEN** `worktreePath` / `pid` / `session` を含む state
**WHEN** `updateJobState()` または `setupWorkspace` seed が slug ストアへ persist する
**THEN** worktree 内 `specrunner/changes/<slug>/state.json` に `worktreePath` / `pid` / `session` が含まれない

---

## cross-cutting persist 経路（D4 / T-04〜T-07）

### TC-005: runner の終端 persist が local で jobId ストアに書かない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: local の全 persist 経路が jobId ストアに書かない > Scenario: runner の終端 persist が local で jobId ストアに書かない

---

### TC-006: resume の遷移 persist が local で jobId ストアに書かない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: local の全 persist 経路が jobId ストアに書かない > Scenario: resume の遷移 persist が local で jobId ストアに書かない

---

### TC-007: exit-guard の global persist が local で jobId ストアに書かない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: local の全 persist 経路が jobId ストアに書かない > Scenario: exit-guard の global persist が local で jobId ストアに書かない

---

### TC-008: cancel の persist が local で jobId ストアに書かない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: local の全 persist 経路が jobId ストアに書かない > Scenario: cancel の persist が local で jobId ストアに書かない

---

### TC-009: managed の persist は jobId ストアへ書く（温存）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: local の全 persist 経路が jobId ストアに書かない > Scenario: managed の persist は jobId ストアへ書く（温存）

---

### TC-021: `resolveStateStoreByJobId` で sidecar kind=local かつ worktree 実在 → worktree slug ストアを返す

**Category**: unit
**Priority**: must
**Source**: design.md > D4 / tasks.md > T-05

**GIVEN** sidecar `kind="local"` を持ち、worktreePath に worktree が実在する jobId
**WHEN** `resolveStateStoreByJobId(repoRoot, jobId)` を呼ぶ
**THEN** worktree 内 slug ストアの `JobStateStore` が返される

---

### TC-022: `resolveStateStoreByJobId` で sidecar kind=local かつ worktree 消失 → changeDir 次点

**Category**: unit
**Priority**: should
**Source**: design.md > D4 / tasks.md > T-05

**GIVEN** sidecar `kind="local"` を持ち、worktree は消失しているが `resolveCanonicalStateDir` の changeDir が実在する jobId
**WHEN** `resolveStateStoreByJobId(repoRoot, jobId)` を呼ぶ
**THEN** changeDir の slug ストアが返される

---

### TC-023: `resolveStateStoreByJobId` で sidecar kind=local かつ両方消失 → null

**Category**: unit
**Priority**: should
**Source**: design.md > D4 / tasks.md > T-05

**GIVEN** sidecar `kind="local"` を持ち、worktree も changeDir も存在しない jobId
**WHEN** `resolveStateStoreByJobId(repoRoot, jobId)` を呼ぶ
**THEN** `null` が返され、`.specrunner/jobs/<jobId>/` への書き込みは発生しない

---

### TC-024: `resolveStateStoreByJobId` で sidecar kind=managed → jobId ストアを返す

**Category**: unit
**Priority**: must
**Source**: design.md > D4 / tasks.md > T-05

**GIVEN** sidecar `kind="managed"` を持つ jobId
**WHEN** `resolveStateStoreByJobId(repoRoot, jobId)` を呼ぶ
**THEN** jobId ストアの `JobStateStore` が返される

---

### TC-025: `resolveStateStoreByJobId` で sidecar なし（legacy）→ jobId ストアを安全網として返す

**Category**: unit
**Priority**: should
**Source**: design.md > D4 / tasks.md > T-05

**GIVEN** sidecar エントリが存在しない legacy jobId
**WHEN** `resolveStateStoreByJobId(repoRoot, jobId)` を呼ぶ
**THEN** jobId ストアの `JobStateStore` が返される（後方互換安全網）

---

### TC-026: WORKSPACE_SETUP_FAILED で local が persist を skip

**Category**: unit
**Priority**: should
**Source**: design.md > D4・D5 / tasks.md > T-04

**GIVEN** local runtime で sidecar が未生成（`writeLivenessSidecar` 到達前にクラッシュ）かつ worktree 未確立
**WHEN** `command/runner.ts` の WORKSPACE_SETUP_FAILED 終端 persist が走る
**THEN** `.specrunner/jobs/<jobId>/` は作成されず、`persistJobState` が best-effort skip される

---

### TC-028: `persistJobState` local 実装が workspace.worktreePath を優先して解決

**Category**: unit
**Priority**: should
**Source**: design.md > D4 / tasks.md > T-04

**GIVEN** `workspace.worktreePath` が設定されている local job
**WHEN** `persistJobState(jobId, slug, workspace, state)` を呼ぶ
**THEN** `workspace.worktreePath` の slug ストアへ portable state が persist され、`.specrunner/jobs/<jobId>/` は更新されない

---

## jobs-dir への書き込みゼロの end-to-end 検証（T-08）

### TC-010: local run 実行後に jobs-dir が存在しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: local の run / resume / cancel は .specrunner/jobs/ を生成・更新しない > Scenario: local run 実行後に jobs-dir が存在しない

---

### TC-011: local resume / cancel 実行後に jobs-dir が更新されない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: local の run / resume / cancel は .specrunner/jobs/ を生成・更新しない > Scenario: local resume / cancel 実行後に jobs-dir が更新されない

---

## cancel degraded（D6 / T-06）

### TC-027: cancel 後に sidecar の jobId が `resolveId` で解決できる

**Category**: unit
**Priority**: should
**Source**: design.md > D6 / tasks.md > T-06

**GIVEN** sidecar（`liveness.json`）を持つ active local job を cancel した後（worktree+branch 削除済み）
**WHEN** `resolveId(slug)` または短縮 jobId で解決を試みる
**THEN** sidecar の `liveness.json` から jobId が解決でき、canceled state の非永続化による `resolveId` の欠落は生じない

---

## 既存読み取り経路の温存（T-09）

### TC-012: 移行済み読み取り経路が引き続き state を取得する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: R1 の読み取り経路と managed 経路を温存し検証が green > Scenario: 移行済み読み取り経路が引き続き state を取得する

---

### TC-013: typecheck と test が green

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: R1 の読み取り経路と managed 経路を温存し検証が green > Scenario: 検証が green

---

## Result

```yaml
result: completed
total: 28
automated: 28
manual: 0
must: 20
should: 8
could: 0
blocked_reasons: []
```
