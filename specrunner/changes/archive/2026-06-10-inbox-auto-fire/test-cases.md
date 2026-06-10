# Test Cases: inbox auto-fire

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

Category determination:
  unit        — pure logic, validation, helper functions (automated)
  integration — DB operations, API endpoints, multi-module interaction (automated)
  manual      — UI/UX confirmation, visual verification, build artifact check (not automated)

Priority determination:
  must   — core functionality; if broken, the feature does not work
  should — important but core still works; edge cases, error handling
  could  — nice to have; performance, UX details

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

  result determination:
    completed — all testable behaviors are documented
    partial   — some cases could not be derived due to design ambiguity
    failed    — spec is absent AND design.md / tasks.md are also missing
-->

## Summary

- **Total**: 38 cases
- **Automated** (unit/integration): 38
- **Manual**: 0
- **Priority**: must: 27, should: 10, could: 1

---

## Scenario-derived Test Cases

### TC-001: 走査して終了する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: inbox run は 1 回の走査と発火で終了し、自身の状態を持たない > Scenario: 走査して終了する

---

### TC-002: dry-run は計画のみ表示し発火しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: inbox run は 1 回の走査と発火で終了し、自身の状態を持たない > Scenario: dry-run は計画のみ表示し発火しない

---

### TC-003: 承認ラベル付き・未紐付け issue から起動する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 承認ラベル付き・未紐付け issue から job を起動する > Scenario: 承認ラベル付き・未紐付け issue から起動する

---

### TC-004: 紐付け済み issue は二度起動しない（冪等性）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 承認ラベル付き・未紐付け issue から job を起動する > Scenario: 紐付け済み issue は二度起動しない（冪等性）

---

### TC-005: request.md として不正な issue 本文を差し戻す

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 不正な issue 本文を validate エラーとして差し戻す > Scenario: request.md として不正な issue 本文を差し戻す

---

### TC-006: /resume コメントで再開し本文を resumePrompt として渡す

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: awaiting-resume の job を /resume コメントで再開する > Scenario: /resume コメントで再開し本文を resumePrompt として渡す

---

### TC-007: resumePrompt のパース

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: awaiting-resume の job を /resume コメントで再開する > Scenario: resumePrompt のパース

---

### TC-008: escalation マーカーより古いコメントでは再開しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 再開は escalation マーカーの時刻と権限とマーカーで発火を絞る > Scenario: escalation マーカーより古いコメントでは再開しない

---

### TC-009: 権限のない author のコメントでは再開しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 再開は escalation マーカーの時刻と権限とマーカーで発火を絞る > Scenario: 権限のない author のコメントでは再開しない

---

### TC-010: bot 自身のコメントでは再開しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 再開は escalation マーカーの時刻と権限とマーカーで発火を絞る > Scenario: bot 自身のコメントでは再開しない

---

### TC-011: 再 escalation 後は古い /resume が再発火しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 再開は escalation マーカーの時刻と権限とマーカーで発火を絞る > Scenario: 再 escalation 後は古い /resume が再発火しない

---

### TC-012: 起動上限が効く

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 1 回の inbox run で新規起動する job 数の上限を config で制御する > Scenario: 起動上限が効く

---

### TC-013: 既定の承認ラベル

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 承認ラベル名は config で設定可能で既定を持つ > Scenario: 既定の承認ラベル

---

### TC-014: 紐付けのない awaiting-resume job は触らない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: issue 紐付けのない既存 job に影響しない > Scenario: 紐付けのない awaiting-resume job は触らない

---

### TC-015: ラベルで open issue を取得する（PR を除外）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: GitHubClient port を forge 中立な意味論で拡張する > Scenario: ラベルで open issue を取得する（PR を除外）

---

### TC-016: コメント一覧が author_association と作成時刻を含む

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: GitHubClient port を forge 中立な意味論で拡張する > Scenario: コメント一覧が author_association と作成時刻を含む

---

## Non-Scenario Test Cases

### Config

### TC-017: 空文字 approveLabel が CONFIG_INVALID で弾かれる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** config に `inbox.approveLabel` として空文字列が設定されている
**WHEN** config を読み込む
**THEN** `CONFIG_INVALID` エラーが投げられる

---

### TC-018: 負数の maxStartsPerRun が CONFIG_INVALID で弾かれる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** config に `inbox.maxStartsPerRun` として `-1` が設定されている
**WHEN** config を読み込む
**THEN** `CONFIG_INVALID` エラーが投げられる

---

### TC-019: 非整数の maxStartsPerRun が CONFIG_INVALID で弾かれる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** config に `inbox.maxStartsPerRun` として `1.5` が設定されている
**WHEN** config を読み込む
**THEN** `CONFIG_INVALID` エラーが投げられる

---

### TC-020: inbox 未設定の既存 config が回帰なく読み込める

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `inbox` セクションを持たない既存の config ファイルが存在する
**WHEN** config を読み込む
**THEN** エラーなく読み込まれ、`inbox.approveLabel` は `specrunner-approved`、`inbox.maxStartsPerRun` は `3` に解決される

---

### GitHubClient

### TC-021: ラベル検索が Link ヘッダのページネーションを完走する

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** ラベル付き open issue が 2 ページ分存在し、1 ページ目のレスポンスに `Link: <url>; rel="next"` ヘッダが含まれる
**WHEN** `searchOpenIssuesByLabel` を呼ぶ
**THEN** 両ページのすべての issue が結合されて返る

---

### TC-022: コメント一覧が Link ヘッダのページネーションを完走する

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** コメントが 2 ページ分存在し、1 ページ目のレスポンスに `Link: <url>; rel="next"` ヘッダが含まれる
**WHEN** `listIssueComments` を呼ぶ
**THEN** 両ページのすべてのコメントが結合されて返る

---

### TC-023: ラベル検索で 401 が GITHUB_TOKEN_EXPIRED になる

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** GitHub API が 401 を返す
**WHEN** `searchOpenIssuesByLabel` を呼ぶ
**THEN** `GITHUB_TOKEN_EXPIRED` エラーが投げられる

---

### TC-024: ラベル検索で非 2xx が GITHUB_API_ERROR になる

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** GitHub API が 500 を返す
**WHEN** `searchOpenIssuesByLabel` を呼ぶ
**THEN** `GITHUB_API_ERROR` エラーが投げられる

---

### Marker

### TC-025: isNotificationComment が bot コメントを true に判定する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** コメント本文が `<!-- specrunner:notification` で始まる
**WHEN** `isNotificationComment(body)` を呼ぶ
**THEN** `true` が返る

---

### TC-026: isNotificationComment が一般コメントを false に判定する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** コメント本文が通知マーカー接頭辞を含まない任意の文字列である
**WHEN** `isNotificationComment(body)` を呼ぶ
**THEN** `false` が返る

---

### TC-027: matchesEscalationMarker が対象 jobId のみ true にする

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** コメント本文が `jobId="job-A"` の escalation マーカーを含む
**WHEN** `matchesEscalationMarker(body, "job-A")` と `matchesEscalationMarker(body, "job-B")` をそれぞれ呼ぶ
**THEN** 前者が `true`、後者が `false` を返す

---

### TC-028: 差し戻しコメント本文が通知マーカー接頭辞と validate エラーを含む

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** issue 番号と validate エラーメッセージを引数に差し戻しコメント生成関数を呼ぶ
**WHEN** 生成された本文を検査する
**THEN** 本文が `<!-- specrunner:notification` 接頭辞と validate エラーメッセージの両方を含む

---

### Planner

### TC-029: 複数の qualifying /resume がある場合に最新が採用される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** escalation マーカーより新しく権限を満たす `/resume` コメントが 2 件あり、作成時刻がそれぞれ異なる
**WHEN** `planResumes` を呼ぶ
**THEN** 作成時刻が最新のコメントの resumePrompt が `ResumeAction` に設定される

---

### TC-030: escalation マーカーが存在しない job は resume 対象にしない

**Category**: unit
**Priority**: should
**Source**: design.md > D4（escalation マーカーが存在しない job は resume 対象にしない（安全側））

**GIVEN** awaiting-resume かつ issue 紐付けありの job の紐付け issue に、escalation マーカーコメントが 1 件も存在しない
**WHEN** `planResumes` を呼ぶ
**THEN** その job の `ResumeAction` は生成されない

---

### TC-031: starts は maxStarts で打ち切り、rejects は上限対象外

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** 承認ラベル付き未紐付け issue が 5 件あり、そのうち 3 件が valid・2 件が invalid で、maxStarts が 2 である
**WHEN** `planStarts` を呼ぶ
**THEN** `starts` が 2 件（上限）、`rejects` が 2 件（invalid 全件）を返す

---

### Orchestrator

### TC-032: 各 effect が独立して失敗しても他の発火が止まらない

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** InboxPlan に start 2 件と resume 1 件があり、1 件目の start effect が例外を投げる
**WHEN** orchestrator が plan を実行する
**THEN** 失敗は警告ログとして記録され、2 件目の start effect と resume effect は呼ばれる

---

### TC-033: awaiting-resume 以外の job についてコメント取得・resume を行わない

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** running / failed / archived 等の awaiting-resume 以外の status を持つ job が issue 紐付きで存在する
**WHEN** orchestrator が入力を収集する
**THEN** その job の紐付け issue に対して `listIssueComments` が呼ばれない

---

### CLI

### TC-034: specrunner inbox run がコマンドとして解決される

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** コマンドレジストリが初期化されている
**WHEN** `["inbox", "run"]` でコマンドを解決する
**THEN** inbox run の handler が返る（unresolved にならない）

---

### TC-035: worktree 内から実行すると WORKTREE_GUARD で拒否される

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** カレントディレクトリが git worktree 内（main worktree 以外）である
**WHEN** `specrunner inbox run` を実行する
**THEN** `WORKTREE_GUARD` エラーで終了し、発火処理は行われない

---

### TC-036: --limit に不正値を渡すと exit 2 になる

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** CLI を `specrunner inbox run --limit foo` で起動する
**WHEN** 引数パースが実行される
**THEN** 引数エラーとして exit code 2 で終了する

---

### TC-037: --help がサブコマンド usage を表示する

**Category**: integration
**Priority**: could
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** 通常の実行環境
**WHEN** `specrunner inbox run --help` を実行する
**THEN** inbox run のフラグ一覧（--dry-run / --limit / --json / --verbose / --quiet）を含む usage が表示される

---

### TC-038: --limit 0 で新規起動なし・resume のみの挙動になる

**Category**: integration
**Priority**: should
**Source**: design.md > D6（maxStartsPerRun: 0 は新規起動を行わない（resume のみ）を意味する）

**GIVEN** 承認ラベル付き未紐付け issue と awaiting-resume job が両方存在する
**WHEN** `specrunner inbox run --limit 0` を実行する
**THEN** start effect は一切呼ばれず、resume effect のみ呼ばれる

---

## Result

```yaml
result: completed
total: 38
automated: 38
manual: 0
must: 27
should: 10
could: 1
blocked_reasons: []
```
