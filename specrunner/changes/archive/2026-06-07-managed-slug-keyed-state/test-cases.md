# Test Cases: managed runtime の machine-local state を slug キーに移す

## Summary

- **Total**: 20 cases
- **Automated** (unit/integration): 19
- **Manual**: 1
- **Priority**: must: 15, should: 5, could: 0

---

### TC-001: managed run 後に state が local/slug に書かれる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: managed の machine-local state は slug キーの `.specrunner/local/<slug>/` に置く > Scenario: managed run 後に state が local/slug に書かれる

---

### TC-002: managed resume 後に state が local/slug に書かれる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: managed の machine-local state は slug キーの `.specrunner/local/<slug>/` に置く > Scenario: managed resume 後に state が local/slug に書かれる

---

### TC-003: managed state が full state として保持される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: managed の machine-local state は slug キーの `.specrunner/local/<slug>/` に置く > Scenario: managed state が full state として保持される

---

### TC-004: bootstrap が jobs-dir に書かない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: managed の初期 state 永続化を setupWorkspace に defer する > Scenario: bootstrap が jobs-dir に書かない

---

### TC-005: setupWorkspace の run 経路で local/slug に seed される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: managed の初期 state 永続化を setupWorkspace に defer する > Scenario: setupWorkspace の run 経路で local/slug に seed される

---

### TC-006: pipeline step persist が local/slug に書く

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: managed の全 persist 経路が local/slug に着地する > Scenario: pipeline step persist が local/slug に書く

---

### TC-007: SIGINT/SIGTERM で local/slug に awaiting-resume が書かれる

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: managed の全 persist 経路が local/slug に着地する > Scenario: SIGINT/SIGTERM で local/slug に awaiting-resume が書かれる

---

### TC-008: job ls が managed job を local/slug から読む

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: managed の read / resolve 経路が local/slug を起点にする > Scenario: job ls が managed job を local/slug から読む

---

### TC-009: job show / finish が jobId から managed state を解決する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: managed の read / resolve 経路が local/slug を起点にする > Scenario: job show / finish が jobId から managed state を解決する

---

### TC-010: resume / cancel / exit-guard の persist が managed を local/slug に解決する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: managed の read / resolve 経路が local/slug を起点にする > Scenario: resume / cancel / exit-guard の persist が managed を local/slug に解決する

---

### TC-011: marker は jobId index として state.json と一致する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: marker.json は index、state.json が full state（重複・不整合なし） > Scenario: marker は jobId index として state.json と一致する

---

### TC-012: managed cancel が canceled state を local/slug に書く

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: cancel が managed job を local/slug 起点で正しく扱う > Scenario: managed cancel が canceled state を local/slug に書く

---

### TC-013: managed cancel --purge が local/slug を物理削除する

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: cancel が managed job を local/slug 起点で正しく扱う > Scenario: managed cancel --purge が local/slug を物理削除する

---

### TC-014: typecheck と test が green

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: 検証が green > Scenario: typecheck と test が green

---

### TC-015: localSlugStateJsonPath が正しいパスを返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `localSlugStateJsonPath("my-feature")` を呼ぶ
**WHEN** 関数が評価される
**THEN** `".specrunner/local/my-feature/state.json"` を返す（`LOCAL_SIDECAR_BASE` 定数由来）

---

### TC-016: localSlugEventsPath が正しいパスを返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `localSlugEventsPath("my-feature")` を呼ぶ
**WHEN** 関数が評価される
**THEN** `".specrunner/local/my-feature/events.jsonl"` を返す（`LOCAL_SIDECAR_BASE` 定数由来）

---

### TC-017: changeDir 単独ストアが load() で changeDir/state.json を読む

**Category**: unit
**Priority**: must
**Source**: design.md > D2 / tasks.md > T-02

**GIVEN** `slug` / `stateRoot` を渡さず `changeDir` のみを指定した `JobStateStore` を構築し（`isSlugMode()` = false）、`changeDir/state.json` に state を配置する
**WHEN** `.load()` を呼ぶ
**THEN** `changeDir/state.json` + `events.jsonl` から state が読まれ、jobs-dir（`getJobStateJsonPath` 経路）は参照されない

---

### TC-018: changeDir + slug + stateRoot（isSlugMode=true）利用時の load() 挙動が不変

**Category**: unit
**Priority**: should
**Source**: design.md > D2 / tasks.md > T-02

**GIVEN** `changeDir` + `slug` + `stateRoot` を渡した `JobStateStore`（`isSlugMode()` = true）を構築する
**WHEN** `.load()` を呼ぶ
**THEN** 従来の slug-mode load（`changeDir/state.json` + slugInject 適用）が実行され、本変更前との挙動差異がない

---

### TC-019: bootstrapState 不在時に setupWorkspace が seed をスキップする

**Category**: unit
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-03

**GIVEN** managed run 経路で `opts.bootstrapState` が `undefined` の状態で `setupWorkspace(slug, branchName, opts)` を呼ぶ
**WHEN** setupWorkspace が完了する
**THEN** `.specrunner/local/<slug>/state.json` が作成されず、seed の I/O が発生しない（防御的スキップ）

---

### TC-020: local cancel の degraded skip 挙動が不変

**Category**: integration
**Priority**: should
**Source**: design.md > D6 / tasks.md > T-06

**GIVEN** local runtime の active job に対して cancel を実行し、worktree 削除後に persist が走る状況を作る
**WHEN** `cancelSingleJob` が実行される
**THEN** managed marker unlink ロジックは local job に対して no-op となり、worktree 削除後の degraded skip（`decouple-jobs-dir-writes` D6）が従来通り機能する

---

## Result

```yaml
result: completed
total: 20
automated: 19
manual: 1
must: 15
should: 5
could: 0
blocked_reasons: []
```
