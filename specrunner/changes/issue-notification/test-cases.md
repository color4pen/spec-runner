# Test Cases: job を GitHub issue に紐付け、escalation / 完走を issue コメントで通知する

## Summary

- **Total**: 24 cases
- **Automated** (unit/integration): 24
- **Manual**: 0
- **Priority**: must: 14, should: 10, could: 0

---

### TC-001: `--issue` で起動した job の issue 番号が永続化・復元される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: job は `--issue` で GitHub issue に紐付き、状態に永続化される > Scenario: `--issue` で起動した job の issue 番号が永続化・復元される

---

### TC-002: `--issue` なしの job は issue 番号フィールドを持たない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: job は `--issue` で GitHub issue に紐付き、状態に永続化される > Scenario: `--issue` なしの job は issue 番号フィールドを持たない

---

### TC-003: 不正な `--issue` 値は引数エラーになる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: job は `--issue` で GitHub issue に紐付き、状態に永続化される > Scenario: 不正な `--issue` 値は引数エラーになる

---

### TC-004: adapter が issue へコメントを POST する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `GitHubClient` port は forge 中立な issue コメント作成メソッドを持つ > Scenario: adapter が issue へコメントを POST する

---

### TC-005: escalation 時に理由と再開手順が issue に書かれる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: escalation 遷移時に再開手順を含むコメントが書き込まれる > Scenario: escalation 時に理由と再開手順が issue に書かれる

---

### TC-006: 完走時に PR URL が issue に書かれる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 完走遷移時に PR URL を含むコメントが書き込まれる > Scenario: 完走時に PR URL が issue に書かれる

---

### TC-007: escalation コメントにマーカーが含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: コメントは種別と jobId の機械可読マーカーを含む > Scenario: escalation コメントにマーカーが含まれる

---

### TC-008: completed コメントにマーカーが含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: コメントは種別と jobId の機械可読マーカーを含む > Scenario: completed コメントにマーカーが含まれる

---

### TC-009: 紐付けなし job の完走で issue API が呼ばれない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: `--issue` なしの job では issue 関連 API を一切呼ばない > Scenario: 紐付けなし job の完走で issue API が呼ばれない

---

### TC-010: コメント書き込み失敗でも最終状態と exit code が不変

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 通知は best-effort であり、失敗は job の結果に影響しない > Scenario: コメント書き込み失敗でも最終状態と exit code が不変

---

### TC-011: managed runtime でも CLI プロセスが通知する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 通知は CLI プロセスから両 runtime で行う > Scenario: managed runtime でも CLI プロセスが通知する

---

### TC-012: buildMarker が `-->` を含む jobId に対してエラーを throw する

**Category**: unit
**Priority**: should
**Source**: design.md > D6: 機械可読マーカーの形式を SSOT 化する

**GIVEN** `buildMarker("escalation", "job-->id")` を呼ぶ
**WHEN** 引数を処理する
**THEN** Error が throw される（HTML コメント injection guard）

---

### TC-013: PR URL 不在で completion comment が graceful degrade する

**Category**: unit
**Priority**: should
**Source**: design.md > Risks / Trade-offs（完走したが PR URL 未記録）、tasks.md > T-05

**GIVEN** `state.pullRequest` が未設定の `awaiting-archive` 状態
**WHEN** `buildCompletionComment(state)` を呼ぶ
**THEN** 例外を throw せず、URL 行を省略または注記した body を返す

---

### TC-014: `state.status` が `running` のとき notifyJobTerminal が no-op になる

**Category**: unit
**Priority**: should
**Source**: design.md > D1: 通知の発火点は `runInternal` の terminal 収束点

**GIVEN** `state.status === "running"` かつ `state.issueNumber === 42`
**WHEN** `notifyJobTerminal(state, ctx)` を呼ぶ
**THEN** `createIssueComment` は一度も呼ばれない

---

### TC-015: 通知が commitFinalState の後に実行される

**Category**: integration
**Priority**: should
**Source**: design.md > D1、tasks.md > T-06

**GIVEN** `issueNumber` を持つ state で完走する pipeline（`awaiting-archive` への遷移）
**WHEN** `runInternal` が完走する
**THEN** `commitFinalState`（PR 情報記録）が完了した後に `createIssueComment` が呼ばれ、body に PR URL が含まれる

---

### TC-016: adapter が 201 以外のレスポンスで githubApiError を throw する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-09: adapter `createIssueComment` のユニットテスト

**GIVEN** `POST /repos/{owner}/{repo}/issues/{issueNumber}/comments` が 404 を返す
**WHEN** `createIssueComment(owner, repo, issueNumber, body)` を呼ぶ
**THEN** `githubApiError` が throw される

---

### TC-017: `run` alias でも `--issue` が機能する

**Category**: integration
**Priority**: should
**Source**: design.md > D4: `--issue` フラグの CLI 配線、tasks.md > T-04

**GIVEN** `specrunner run <slug> --issue 42` を実行する
**WHEN** CLI が引数を解析し job を起動する
**THEN** `jobState.issueNumber === 42` が設定される

---

### TC-018: `--issue 0`（ゼロ）で exit code 2 になる

**Category**: unit
**Priority**: should
**Source**: design.md > D4、tasks.md > T-04

**GIVEN** `specrunner job start <slug> --issue 0` を実行する
**WHEN** CLI が引数を解析する
**THEN** exit code 2 で終了し、job は起動しない

---

### TC-019: `--issue -1`（負数）で exit code 2 になる

**Category**: unit
**Priority**: should
**Source**: design.md > D4、tasks.md > T-04

**GIVEN** `specrunner job start <slug> --issue -1` を実行する
**WHEN** CLI が引数を解析する
**THEN** exit code 2 で終了し、job は起動しない

---

### TC-020: issueNumber なしの legacy state が validateJobState を通過する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: `JobState` に `issueNumber` フィールドを追加する

**GIVEN** `issueNumber` フィールドを持たない旧形式の JobState JSON
**WHEN** `validateJobState` を呼ぶ
**THEN** エラーなく pass-through する（backward compat）

---

### TC-021: issueNumber が正の整数でない場合 validateJobState がエラーになる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `issueNumber: -5` または `issueNumber: 0` を含む JobState
**WHEN** `validateJobState` を呼ぶ
**THEN** 検証エラーを throw する

---

### TC-022: loop 上限到達（経路3）でも notifyJobTerminal が呼ばれる

**Category**: integration
**Priority**: must
**Source**: design.md > D1（経路3: loop 上限到達 → handleExhausted）、tasks.md > T-06

**GIVEN** `issueNumber` を持つ state で pipeline が loop 上限（handleExhausted）に達する
**WHEN** `runInternal` が終了する
**THEN** `createIssueComment` が `awaiting-resume` の escalation コメントで呼ばれる

---

### TC-023: アーキテクチャ不変条件テストが pass する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-12: 最終検証

**GIVEN** `src/core/notify/issue-notifier.ts` が実装済み
**WHEN** architecture invariant テストを実行する
**THEN** `src/core/notify/` が adapter を import せず、`logWarn` seam 経由で stderr を扱い、`config.runtime` を分岐しないことが検証される（B-1 / B-7 / B-8 / DSM 適合）

---

### TC-024: `--issue "42abc"`（trailing garbage）で exit code 2 になる

**Category**: unit
**Priority**: should
**Source**: design.md > D4（`Number` を使って trailing garbage を NaN として拒否）、tasks.md > T-04

**GIVEN** `specrunner job start <slug> --issue 42abc` を実行する
**WHEN** CLI が引数を解析する
**THEN** exit code 2 で終了し、job は起動しない

---

## Result

```yaml
result: completed
total: 24
automated: 24
manual: 0
must: 14
should: 10
could: 0
blocked_reasons: []
```
