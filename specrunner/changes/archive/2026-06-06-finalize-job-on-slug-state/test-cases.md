# Test Cases: job 終端処理を slug 正本に一本化する

## Summary

- **Total**: 20 cases
- **Automated** (unit/integration): 20
- **Manual**: 0
- **Priority**: must: 10, should: 10, could: 0

---

### TC-001: 終端後の最終 state が branch に乗る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 終端 phase 完了後に slug 正本を branch にコミットする > Scenario: 終端後の最終 state が branch に乗る

---

### TC-002: managed runtime では終端 commit が走らない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: 終端 phase 完了後に slug 正本を branch にコミットする > Scenario: managed runtime では終端 commit が走らない

---

### TC-003: awaiting-archive の slug 正本を archive すると archived になる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: archive の最終遷移は slug 正本を読み・遷移・永続化する > Scenario: awaiting-archive の slug 正本を archive すると archived になる

---

### TC-004: 最終遷移が events.jsonl に transition record を残す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: archive の最終遷移は slug 正本を読み・遷移・永続化する > Scenario: 最終遷移が events.jsonl に transition record を残す

---

### TC-005: gate 通過後に遷移が失敗しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: finishable gate と最終遷移は同一 state ソースを読む > Scenario: gate 通過後に遷移が失敗しない

---

### TC-006: archive 後の job が既定一覧から消える

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: archived の job は既定 job ls に表示されない > Scenario: archive 後の job が既定一覧から消える

---

### TC-007: --all では archived も表示される

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: archived の job は既定 job ls に表示されない > Scenario: --all では archived も表示される

---

### TC-008: 取り残し job の再実行が archived で完了する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: job archive の冪等な再実行で取り残し job を archived にする > Scenario: 取り残し job の再実行が archived で完了する

---

### TC-009: archived 済みへの再実行は no-op

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: job archive の冪等な再実行で取り残し job を archived にする > Scenario: archived 済みへの再実行は no-op

---

### TC-010: 観測可能挙動が不変・検証 green

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: pipeline 実行・画面出力・PR 生成が不変で検証が green > Scenario: 観測可能挙動が不変

---

### TC-011: resolveCanonicalStateDir — active dir を返す

**Category**: unit
**Priority**: must
**Source**: design.md > D2 / tasks.md > T-02

**GIVEN** `repoRoot/specrunner/changes/<slug>/state.json` が存在する
**WHEN** `resolveCanonicalStateDir(slug, repoRoot)` を呼ぶ
**THEN** `repoRoot/specrunner/changes/<slug>/` の絶対パスを返す

---

### TC-012: resolveCanonicalStateDir — archive dir を返す（日付 prefix 非依存）

**Category**: unit
**Priority**: must
**Source**: design.md > D2 / tasks.md > T-02

**GIVEN** active `changes/<slug>/state.json` は存在せず、`changes/archive/<YYYY-MM-DD>-<slug>/state.json` が存在する
**WHEN** `resolveCanonicalStateDir(slug, repoRoot)` を呼ぶ
**THEN** `changes/archive/<YYYY-MM-DD>-<slug>/` の絶対パスを返し、日付 prefix が変わっても同様に解決できる

---

### TC-013: resolveCanonicalStateDir — null を返す（正本不在）

**Category**: unit
**Priority**: should
**Source**: design.md > D2 / tasks.md > T-02

**GIVEN** active にも archive にも該当 slug の `state.json` が存在しない
**WHEN** `resolveCanonicalStateDir(slug, repoRoot)` を呼ぶ
**THEN** `null` を返し throw しない

---

### TC-014: changeDir seam — 指定 dir から load できる

**Category**: unit
**Priority**: must
**Source**: design.md > D3 / tasks.md > T-03

**GIVEN** archive location `changes/archive/<dated>-<slug>/` に `state.json` + `events.jsonl` が存在し、その dir を `changeDir` に指定した `JobStateStore` を構築する
**WHEN** `store.load()` を呼ぶ
**THEN** `changeDir` 直下の `state.json` + `events.jsonl` を fold した `NormalizedJobState` 相当が返り、slug 規約パスは参照されない

---

### TC-015: changeDir seam — 指定 dir に persist できる

**Category**: unit
**Priority**: must
**Source**: design.md > D3 / tasks.md > T-03

**GIVEN** `changeDir` を指定した `JobStateStore` で state 遷移後の状態を持つ
**WHEN** `store.persist()` を呼ぶ
**THEN** `changeDir/events.jsonl` に delta が append され、`changeDir/state.json` が overwrite される

---

### TC-016: changeDir 未指定 — slug-mode パスが不変

**Category**: unit
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-03

**GIVEN** `changeDir` を指定しない通常の slug-mode `JobStateStore`
**WHEN** `getStateJsonPath()` / `getEventsPath()` を呼ぶ
**THEN** 従来の slug 規約パス（`slugStateJsonPath` / `slugEventsPath` 由来）と完全一致し、挙動が不変である

---

### TC-017: commitFinalState — push 恒久失敗時は警告のみで throw しない

**Category**: integration
**Priority**: should
**Source**: design.md > D5 / tasks.md > T-01

**GIVEN** local runtime で `commitFinalState` を呼び、push が恒久失敗するよう模倣する
**WHEN** push が 1 回 retry 後も失敗する
**THEN** `commitFinalState` は throw せず、stderr に警告を出力して正常終了する（run 全体を失敗させない）

---

### TC-018: commitFinalState — staged 変更なし・HEAD 不変は no-op

**Category**: unit
**Priority**: should
**Source**: design.md > D5 / tasks.md > T-01

**GIVEN** local runtime で `commitFinalState` を呼ぶが、staged 変更が無く HEAD も進んでいない
**WHEN** `commitFinalState` を実行する
**THEN** git commit が作成されず、git 操作なしで正常終了する（冪等）

---

### TC-019: deps.runtimeStrategy 未注入 — 既存 pipeline テストが回帰しない

**Category**: unit
**Priority**: should
**Source**: design.md > D5 / tasks.md > T-01

**GIVEN** `PipelineDeps` に `runtimeStrategy` が注入されていない（既存のテスト構成）
**WHEN** pipeline が終端分岐に到達し `deps.runtimeStrategy?.commitFinalState(...)` が評価される
**THEN** `?.` ガードにより `commitFinalState` は呼ばれず、エラーも発生しない

---

### TC-020: job ls dedup — archived（新 updatedAt）が jobId ストアの running（旧 updatedAt）に勝つ

**Category**: unit
**Priority**: should
**Source**: design.md > D6 / tasks.md > T-06

**GIVEN** 同一 jobId が archive-location（`status=archived`、newer `updatedAt`）と jobId ストア（`status=running`、older `updatedAt`）の両方に存在する
**WHEN** `JobStateStore.list()` を呼ぶ
**THEN** その jobId のエントリは `status=archived` で返り、`job ls` 既定フィルタ（`!isTerminal`）により一覧に表示されない

---

## Result

```yaml
result: completed
total: 20
automated: 20
manual: 0
must: 10
should: 10
could: 0
blocked_reasons: []
```
