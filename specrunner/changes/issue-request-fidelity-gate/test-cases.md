# Test Cases: issue 起点 run の開始前忠実性ゲート

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  所有権と書込時点: Result YAML は test-case-gen によるテストケース生成の結果記録である。
  生成時に一度だけ書かれ、後続ステップ（test-materialize を含む）は更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 28 cases
- **Automated** (unit/integration): 28
- **Manual**: 0
- **Priority**: must: 24, should: 4, could: 0

---

### TC-001: issue 連携 run の entrance で gate が動く

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: entrance gate は最初の pipeline step より前に issue と request.md を照合する > Scenario: issue 連携 run の entrance で gate が動く

---

### TC-002: undeclared drop あり — 全 step 未実行で halt

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: undeclared drop が 1 件以上あれば pipeline step を一つも実行せず escalation で halt する > Scenario: undeclared drop あり → 全 step 未実行で halt

---

### TC-003: スコープ外宣言済み要件は undeclared drop に含まれない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: undeclared drop が 1 件以上あれば pipeline step を一つも実行せず escalation で halt する > Scenario: スコープ外宣言済みは drop でない

---

### TC-004: undeclared drop ゼロ — gate 通過し request-review から通常開始

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: undeclared drop ゼロなら gate を通過し request-review から通常開始する > Scenario: undeclared drop ゼロ → 通常開始

---

### TC-005: gate 通過後に issue 本文が job state / change folder / step prompt に残らない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 照合に使った issue 本文を state / change folder / step prompt に保存・注入しない > Scenario: gate 通過後に issue 本文が残らない

---

### TC-006: --issue なし run で gate も issue fetch も実行されない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: `--issue` を指定しない run では gate も issue fetch も実行されない > Scenario: 未連携 run では gate 不発火

---

### TC-007: inbox job で gate が skip され skip 理由が log に残る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: inbox 経路では gate を skip し、skip 理由を log に残す > Scenario: inbox job は gate skip

---

### TC-008: issue fetch 失敗 — pass 扱いにならず halt する（fail-closed）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: issue fetch 失敗は pass 扱いにならず halt する（fail-closed）> Scenario: fetch 失敗 → halt

---

### TC-009: getIssue 200 応答 — endpoint / 認証 header / null body 射影

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: getIssue は単一 issue の title / body を返す > Scenario: 200 応答の射影

---

### TC-010: getIssue 404 — GITHUB_API_ERROR を throw（null を返さない）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: getIssue は単一 issue の title / body を返す > Scenario: 非 200 はエラーに変換

---

### TC-011: halt 後に request.md を修正して resume — gate が再評価されて通過

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: halt 後に request.md を修正して resume すると gate が再評価される > Scenario: 修正後 resume で再評価 → 通過

---

### TC-012: 照合 prompt の contract 文言が存在する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 照合 prompt は要件列挙・スコープ外尊重・差分ゼロ非要求の contract を持つ > Scenario: prompt contract の文言が存在する

---

### TC-013: getIssue 401 — GITHUB_TOKEN_EXPIRED を throw

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** GitHub API が 401 を返す
**WHEN** `getIssue(owner, repo, n)` を呼ぶ
**THEN** `GITHUB_TOKEN_EXPIRED` error が throw される（null を返さない）

---

### TC-014: ERROR_CODES に 2 code が存在し FATAL_ERROR_CODES に含まれない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** `src/errors.ts` の ERROR_CODES と FATAL_ERROR_CODES
**WHEN** 両 error code の存在と所属を検査する
**THEN** `ISSUE_FIDELITY_UNDECLARED_DROP` と `ISSUE_FETCH_FAILED` が ERROR_CODES に存在する
**THEN** 両 code は FATAL_ERROR_CODES に含まれない（resumable = awaiting-resume で stop する）

---

### TC-015: JobState.inboxOrigin の persist → load roundtrip

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `inboxOrigin: true` を持つ JobState
**WHEN** persist して load する
**THEN** `inboxOrigin: true` が失われずに保持される

---

### TC-016: legacy state（inboxOrigin absent）が false 相当で読める

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** `inboxOrigin` フィールドを持たない旧形式の state ファイル
**WHEN** その state を load する
**THEN** `inboxOrigin` は `false` 相当（undefined / false）として扱われ、gate applicable な条件下で gate が skip されない

---

### TC-017: runRunCore({ inboxOrigin: true }) で jobState.inboxOrigin が true に設定される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `inboxOrigin: true` を options に含む `runRunCore` 呼び出し
**WHEN** `PipelineRunCommand.prepare()` が実行される
**THEN** bootstrap 後の `jobState.inboxOrigin === true` が設定されている

---

### TC-018: inbox startJob が inboxOrigin: true を runRunCore に渡す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** inbox 経路の既定 `startJob` が呼ばれる（issue 連携あり）
**WHEN** `runRunCore` の呼び出し引数を spy / mock で取得する
**THEN** `inboxOrigin: true` が options に含まれている

---

### TC-019: comparator adapter — 正常 JSON 出力から undeclaredDrops を parse する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** `queryOneShot` 相当が空配列または複数要素を含む `undeclaredDrops` JSON を返す
**WHEN** `compare()` を呼ぶ
**THEN** 空配列の場合は `undeclaredDrops: []` が返る
**THEN** 複数要素の場合は全要素が文字列として含まれた配列が返る

---

### TC-020: comparator adapter — parse 不能な出力は throw する（fail-closed）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** `queryOneShot` 相当が JSON でない / `undeclaredDrops` キーを含まないテキストを返す
**WHEN** `compare()` を呼ぶ
**THEN** 例外が throw される（null や空配列を返さない — fail-closed）

---

### TC-021: comparator adapter の compare() が issueTitle / issueBody / requestMd を prompt builder に渡す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07

**GIVEN** `queryOneShot` を spy 化した comparator
**WHEN** `compare({ issueTitle: "T", issueBody: "B", requestMd: "R" })` を呼ぶ
**THEN** 生成された system prompt または user prompt に `issueTitle` / `issueBody` / `requestMd` の内容が含まれている

---

### TC-022: startStep !== request-review では gate も fetch も発火しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08

**GIVEN** `startStep` が `design` など request-review 以外の step、`issueNumber` 設定済み
**WHEN** `evaluateIssueFidelityGate` が呼ばれる
**THEN** `getIssue` が呼ばれず、`comparator.compare` も呼ばれず、`{ kind: "proceed" }` が返る

---

### TC-023: comparator 未注入（wiring 欠落）— fail-closed halt

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08

**GIVEN** entrance gate が applicable（startStep=request-review / issueNumber 設定済み / inboxOrigin=false）で `comparator` が undefined
**WHEN** `evaluateIssueFidelityGate` が呼ばれる
**THEN** `{ kind: "halt" }` が返る（wiring error として fail-closed）

---

### TC-024: request.md 読み取り失敗 — fail-closed halt

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08

**GIVEN** `readRequestMd` が例外を throw する（ファイル不在 / 権限エラー）
**WHEN** entrance gate が評価される
**THEN** `{ kind: "halt" }` が返る（gate を pass 扱いにしない）

---

### TC-025: comparator が throw — fail-closed halt

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08

**GIVEN** `comparator.compare()` が例外を throw する（LLM エラー / タイムアウト等）
**WHEN** entrance gate が評価される
**THEN** `{ kind: "halt" }` が返る（pass 扱いにしない）

---

### TC-026: 破壊確認 — halt 分岐を無効化するとテストが fail する

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-09

**GIVEN** TC-002 相当の結合テスト（comparator が drop ≥1 を返す / `pipeline.run` が呼ばれないことをアサート）
**WHEN** `CommandRunner` の halt 分岐を無効化（常に `{ kind: "proceed" }` に書き換え）した状態でテストを実行する
**THEN** テストが fail する（step が実行されたと検出される）— gate の halt 分岐が有効であることの証明

---

### TC-027: halt 時に linked issue へ escalation comment が書かれる

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-09

**GIVEN** `issueNumber` が設定された job で entrance gate が halt（undeclared drop または fetch 失敗）
**WHEN** halt state が確定し `notifyJobTerminal` が呼ばれる
**THEN** linked issue に escalation comment が書かれる（`githubClient` の comment 書き込みが呼ばれる）

---

### TC-028: IssueFidelityComparator port が core 層に閉じる（adapter を import しない）

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `src/core/port/issue-fidelity-comparator.ts` の import 依存グラフ
**WHEN** layering テスト / DSM 制約を実行する
**THEN** core port は adapter（`src/adapter/`）を直接 import せず、既存 layering 制約に違反しない

---

## Result

```yaml
result: completed
total: 28
automated: 28
manual: 0
must: 24
should: 4
could: 0
blocked_reasons: []
```
