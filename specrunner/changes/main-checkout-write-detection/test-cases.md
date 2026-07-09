# Test Cases: worktree job による main checkout 逃避書き込み検出

## Summary

- **Total**: 22 cases
- **Automated** (unit/integration): 21
- **Manual**: 1
- **Priority**: must: 15, should: 7, could: 0

---

### TC-001: agent step 中に監視対象ファイルが変更されると検出される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The system SHALL compare main-checkout guarded paths across each agent step boundary in worktree mode > Scenario: agent step 中に監視対象ファイルが変更されると検出される

---

### TC-002: 既に dirty な監視対象ファイルへの追加変更も content hash で検出される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system SHALL compare main-checkout guarded paths across each agent step boundary in worktree mode > Scenario: 既に dirty な監視対象ファイルへの追加変更も検出される

---

### TC-003: standard pipeline でも forbiddenSurfaces が監視される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The system SHALL monitor forbiddenSurfaces paths plus `.specrunner/`, independent of pipeline profile > Scenario: standard pipeline でも forbiddenSurfaces が監視される

---

### TC-004: 監視対象外 path の変更では escalation しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The system SHALL monitor forbiddenSurfaces paths plus `.specrunner/`, independent of pipeline profile > Scenario: 監視対象外 path の変更は無視される

---

### TC-005: gitignore された machine-local 書き込みは drift として検出されない

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: The system SHALL monitor forbiddenSurfaces paths plus `.specrunner/`, independent of pipeline profile > Scenario: gitignore された machine-local 書き込みは検出されない

---

### TC-006: drift 検出で run が awaiting-resume になり検出 path が state に残る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The system SHALL escalate to awaiting-resume and record detected paths when drift is detected > Scenario: drift 検出で run が awaiting-resume になり検出 path が state に残る

---

### TC-007: CLI が検出差分と resume 案内を出力する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The system SHALL escalate to awaiting-resume and record detected paths when drift is detected > Scenario: CLI が検出差分と resume 案内を出力する

---

### TC-008: 変更なしの worktree run は従来どおり完走する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The system SHALL preserve observable behavior when no drift is detected > Scenario: 変更なしの worktree run は従来どおり完走する

---

### TC-009: スナップショット取得エラーで検出を skip して run を継続する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: The system SHALL preserve observable behavior when no drift is detected > Scenario: スナップショット取得エラーで検出を skip する

---

### TC-010: no-worktree mode では検査が走らない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The system SHALL NOT run the check in no-worktree mode or managed runtime > Scenario: no-worktree mode では検査が走らない

---

### TC-011: managed runtime では検査が走らない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system SHALL NOT run the check in no-worktree mode or managed runtime > Scenario: managed runtime では検査が走らない

---

### TC-012: resolveMonitoredGuardGlobs が forbiddenSurfaces + `.specrunner/**` を dedupe して返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** config に `pipeline.fast.forbiddenSurfaces` が複数 path で宣言されており、一部は `.specrunner/` 配下と重複している
**WHEN** `resolveMonitoredGuardGlobs(config)` を呼ぶ
**THEN** forbiddenSurfaces の全 paths を flatten したものに `.specrunner/**` を加えた集合が dedupe 済みで返される（実行 pipeline 種別への依存なし）

---

### TC-013: diffGuardSnapshots が created 種別を正しく返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** before スナップショットに該当 path のエントリが存在せず、after スナップショットに hash 付きエントリが存在する
**WHEN** `diffGuardSnapshots(before, after)` を呼ぶ
**THEN** `drifted: true`、changes に `{ path, kind: "created" }` が含まれる

---

### TC-014: diffGuardSnapshots が modified 種別を正しく返す（hash 相違）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** before と after の両スナップショットに同一 path のエントリが存在し、hash 値が異なる
**WHEN** `diffGuardSnapshots(before, after)` を呼ぶ
**THEN** `drifted: true`、changes に `{ path, kind: "modified" }` が含まれる

---

### TC-015: diffGuardSnapshots が deleted 種別を正しく返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** before スナップショットに hash 付きエントリが存在し、after スナップショットに同 path の `hash: null`（DELETED sentinel）エントリが存在する
**WHEN** `diffGuardSnapshots(before, after)` を呼ぶ
**THEN** `drifted: true`、changes に `{ path, kind: "deleted" }` が含まれる

---

### TC-016: diffGuardSnapshots が変更なしのとき drifted: false を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** before と after のスナップショットが同一エントリ（path・hash ともに一致）を持つ
**WHEN** `diffGuardSnapshots(before, after)` を呼ぶ
**THEN** `drifted: false`、changes が空配列で返される

---

### TC-017: cli step では snapshot seam が呼ばれない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07 / design.md > D7

**GIVEN** executor が `runCliStep`（pr-create 等）を実行する
**WHEN** cli step のフロー全体が完了する
**THEN** `snapshotMainCheckoutGuard` が一度も呼ばれない

---

### TC-018: drift なしの awaiting-resume 出力が従来と同一

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-08

**GIVEN** job が drift 以外の理由（timeout 等）で `awaiting-resume` になり、`finalState.mainCheckoutDrift` が存在しない
**WHEN** CLI が最終結果を描画する
**THEN** drift に関する出力が一切追加されず、従来の awaiting-resume 描画（`resumePoint.reason` + resume 案内）のみが表示される

---

### TC-019: guardBefore が null のとき既存フローに素通りする

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07 / design.md > D6

**GIVEN** `snapshotMainCheckoutGuard` が before スナップショット取得時に `null` を返す（seam 未実装または一過性エラー）
**WHEN** `runAgentStep` が agent を実行して成功する
**THEN** `guardAfter` の取得も行われず、`diffGuardSnapshots` も呼ばれず、run は通常の後続フローへ進む

---

### TC-020: `.specrunner/local/` 配下の書き込みは entries に現れない

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-04 / design.md > D3

**GIVEN** LocalRuntime の `snapshotMainCheckoutGuard` を呼ぶ worktree モードの実行中に、main checkout の `.specrunner/local/<slug>/liveness.json` が書き込まれる（`.gitignore` 対象）
**WHEN** `git status --porcelain` が実行される
**THEN** ignore ファイルは列挙されないため、そのエントリは snapshot の `entries` に含まれない

---

### TC-021: ManagedRuntime の `snapshotMainCheckoutGuard` が常に null を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** ManagedRuntime のインスタンスが存在する
**WHEN** 任意の `cwd` と `config` を渡して `snapshotMainCheckoutGuard` を呼ぶ
**THEN** 常に `null` が返され、例外を投げない

---

### TC-022: `mainCheckoutDrift` 不在の既存 state が後方互換で parse できる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06

**GIVEN** `mainCheckoutDrift` フィールドを含まない既存フォーマットの JobState JSON が存在する
**WHEN** state schema の validation / parse を行う
**THEN** エラーなく parse でき、`mainCheckoutDrift` は `undefined` として扱われる

---

## Result

```yaml
result: completed
total: 22
automated: 21
manual: 1
must: 15
should: 7
could: 0
blocked_reasons: []
```
