# Test Cases: sequential step の commit を write-set 境界で機械強制する

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
-->

## Summary

- **Total**: 22 cases
- **Automated** (unit/integration): 22
- **Manual**: 0
- **Priority**: must: 17, should: 4, could: 1

---

## write-scope 単一ソース ↔ 責任範囲表 整合性

### TC-001: 単一ソースが責任範囲表の禁止項目を下回らない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: write-scope は単一ソースで定義され責任範囲表と矛盾しない > Scenario: 単一ソースが責任範囲表の禁止項目を下回らない

### TC-002: 単一ソースが Touch 可能 path を禁止しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: write-scope は単一ソースで定義され責任範囲表と矛盾しない > Scenario: 単一ソースが Touch 可能 path を禁止しない

---

## 確定的 step の scoped staging

### TC-003: judge step の request.md 変更が commit に入らない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 確定的 step は宣言出力に限定して scoped stage する > Scenario: judge step の request.md 変更が commit に入らない

### TC-004: 正常経路の commit 内容が現行と同一（確定的 step）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 確定的 step は宣言出力に限定して scoped stage する > Scenario: 正常経路の commit 内容が現行と同一

---

## 広域 write step の fail-closed 差分検査

### TC-005: implementer の request.md 変更で commit されず halt する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 広域 write step は禁止領域変更を検出したら fail-closed で halt する > Scenario: implementer の request.md 変更で commit されず halt する

### TC-006: 境界内のみの変更なら従来どおり commit する（広域 step）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 広域 write step は禁止領域変更を検出したら fail-closed で halt する > Scenario: 境界内のみの変更なら従来どおり commit する

---

## spec-review reads() 宣言

### TC-007: spec-review の reads() に request.md が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review は request.md を入力として宣言する > Scenario: spec-review の reads() に request.md が含まれる

---

## write-scope module 単体

### TC-008: stagingModeFor が全 guarded step を "guarded" と分類する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `write-scope.ts` の `stagingModeFor` と `GUARDED_WRITE_STEPS`（implementer / build-fixer / code-fixer / test-materialize / adr-gen）が定義されている
**WHEN** GUARDED_WRITE_STEPS に含まれる各 step 名で `stagingModeFor` を呼ぶ
**THEN** 全 step に対して `"guarded"` が返る

### TC-009: stagingModeFor が未知の step 名を "scoped" に倒す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 / design.md > D2

**GIVEN** `stagingModeFor` の既定値が `"scoped"` である
**WHEN** GUARDED_WRITE_STEPS に含まれない任意の step 名（例: `"unknown-step"` / `"custom-reviewer-foo"`）で `stagingModeFor` を呼ぶ
**THEN** `"scoped"` が返る

### TC-010: write-scope module が leaf module であること

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 / design.md > D2

**GIVEN** `src/core/step/write-scope.ts` が存在する
**WHEN** module の import 文を静的解析する
**THEN** `src/util/paths.ts` 以外の `src/` 内 module を import していない

### TC-011: protectedCanonPaths が必須保護 path を全て含む

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** test slug `"test-slug"` で `protectedCanonPaths` を呼ぶ
**WHEN** 返された path 集合を検査する
**THEN** request.md / spec.md / design.md / tasks.md / test-cases.md / request-review-attestation.json に対応する全 path が含まれる

### TC-012: isJudgeArtifact がパターン一致と slug 外除外を正しく行う

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** slug `"test-slug"` と以下のファイルパス群が存在する: `specrunner/changes/test-slug/spec-review-result-001.md`（一致するべき）、`specrunner/changes/test-slug/review-feedback-001.md`（一致するべき）、`specrunner/changes/test-slug/spec.md`（一致しないべき）、`specrunner/changes/other-slug/spec-review-result-001.md`（slug 外・一致しないべき）
**WHEN** 各 path で `isJudgeArtifact(path, "test-slug")` を呼ぶ
**THEN** `*-result-*.md` / `review-feedback-*.md` は `true`、それ以外と slug 外は `false` を返す

### TC-013: forbiddenWritePaths が宣言 path を保護集合から差し引く

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 / design.md > D2

**GIVEN** slug `"s"` で step `"spec-fixer"` の宣言 path が `["specrunner/changes/s/spec.md", "specrunner/changes/s/design.md"]` である
**WHEN** `forbiddenWritePaths("spec-fixer", "s", ["specrunner/changes/s/spec.md", "specrunner/changes/s/design.md"])` を呼ぶ
**THEN** 返される集合に `spec.md` と `design.md` の path が含まれない
**AND** `request.md` / `tasks.md` / `test-cases.md` の path は含まれる

### TC-014: findWriteScopeViolations が変更 path と禁止集合の積集合を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** changedPaths = `["src/foo.ts", "specrunner/changes/s/request.md", "specrunner/changes/s/spec-review-result-001.md"]`、宣言 path = `[]`、slug = `"s"`、step = `"implementer"`
**WHEN** `findWriteScopeViolations("implementer", "s", changedPaths, [])` を呼ぶ
**THEN** `src/foo.ts` は含まれず、`specrunner/changes/s/request.md` と `specrunner/changes/s/spec-review-result-001.md` が返される

---

## writeScopeViolationError

### TC-015: writeScopeViolationError の code が WRITE_SCOPE_VIOLATION

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `violatedPaths = ["specrunner/changes/s/request.md"]`
**WHEN** `writeScopeViolationError("implementer", "branch-name", violatedPaths)` を呼ぶ
**THEN** 返される error の `code` が `"WRITE_SCOPE_VIOLATION"` である

### TC-016: writeScopeViolationError の message に全 violatedPaths が含まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `violatedPaths = ["specrunner/changes/s/request.md", "specrunner/changes/s/spec.md"]`
**WHEN** `writeScopeViolationError("implementer", "branch-name", violatedPaths)` を呼ぶ
**THEN** 返される error の `message` に `"specrunner/changes/s/request.md"` と `"specrunner/changes/s/spec.md"` が両方含まれる

---

## commitAndPush 分岐動作

### TC-017: scoped mode で stagePaths が空の場合は commit しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 / design.md > D3

**GIVEN** scoped step の `writes()` が空配列を返し、pipeline 管理 path も存在しない（空）状態
**WHEN** `commitAndPush` が scoped mode で実行される
**THEN** `git commit` は呼ばれず、no-op で正常終了する（既存の空 stage 相当挙動）

### TC-018: guarded mode で HEAD-advance 検出（agent 自主 commit → push-only）が保存される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 / design.md > D4（検証済み前提）

**GIVEN** guarded step（implementer）が禁止領域を変更しておらず、かつ agent が自主 commit を行い HEAD が advance している状態
**WHEN** `commitAndPush` が guarded mode で実行される
**THEN** `git commit` は呼ばれず、`git push` のみ実行される（push-only 経路が保存される）

### TC-019: guarded mode で git status spawn が非 0 exit の場合に fail-closed

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 / design.md > D4

**GIVEN** guarded step の commit 処理中に `git status --porcelain -z --no-renames` の spawn が非 0 exit を返す
**WHEN** `commitAndPush` が guarded mode で stage 前検査を実行する
**THEN** commit も push も行われず、halt（throw）が発生する（fail-closed）

### TC-020: guarded step で request.md 以外の禁止領域（spec.md / design.md）変更も halt する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 / design.md > D4

**GIVEN** 広域 write step（implementer）が `specrunner/changes/<slug>/spec.md` を変更している
**WHEN** `commitAndPush` が guarded mode で commit 処理を行う
**THEN** commit されず halt が発生し、halt の message に `spec.md` の path が含まれる

---

## 回帰・統合

### TC-021: 既存 commit-and-push テスト群が無改変で green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-08 / T-11

**GIVEN** `tests/unit/step/commit-and-push.test.ts` の既存テスト群が存在する
**WHEN** `bun run test` を実行する（scoped / guarded 分岐追加後）
**THEN** 既存テストは全件 green であり、新規追加テストとの衝突がない

---

## アーキテクチャ不変

### TC-022: commitAndPush が write-scope 単一ソースを経由する（architecture grep-pin）

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-12

**GIVEN** `src/core/step/commit-push.ts` の `commitAndPush` 実装が存在する
**WHEN** ソースコードを静的解析する
**THEN** `stagingModeFor` および `findWriteScopeViolations`（write-scope 単一ソース関数）の呼び出しが `commitAndPush` の実装内に存在する

## Result

```yaml
result: completed
total: 22
automated: 22
manual: 0
must: 17
should: 4
could: 1
blocked_reasons: []
```
