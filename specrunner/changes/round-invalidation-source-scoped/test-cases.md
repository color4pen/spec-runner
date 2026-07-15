# Test Cases: approvedAtCommit を reviewed source revision として固定し、round invalidation から pipeline 管理 path を除外する

## Summary

- **Total**: 13 cases
- **Automated** (unit/integration): 11
- **Manual**: 2
- **Priority**: must: 9, should: 4, could: 0

---

### TC-001: approvedAtCommit が findings commit 前の source revision であること

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: `approvedAtCommit` SHALL be the reviewed source revision, excluding the round's own findings commit > Scenario: approvedAtCommit is the pre-findings-commit revision

---

### TC-002: broad-activation reviewer は findings-only 変更では invalidate されない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Round invalidation SHALL exclude pipeline-managed change-folder paths from the touched-file set before activation matching > Scenario: broad-activation reviewer is not invalidated by findings-only changes

---

### TC-003: 同 prefix の別ディレクトリは除外されない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Round invalidation SHALL exclude pipeline-managed change-folder paths from the touched-file set before activation matching > Scenario: a same-prefix sibling path is not excluded

---

### TC-004: source activation path に触れる変更では reviewer が invalidate される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: True source changes SHALL still invalidate an approved reviewer > Scenario: fixer touching a source activation path invalidates the reviewer

---

### TC-005: always-activate reviewer は findings-only 変更でも invalidate される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: An always-activate reviewer SHALL always be invalidated regardless of the source-scoped touched files > Scenario: always-activate reviewer invalidates even with only findings changed

---

### TC-006: listChangedFiles seam の既存 consumer は影響を受けない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The `listChangedFiles` seam behavior SHALL remain unchanged > Scenario: scope-check consumers are unaffected

---

### TC-007: excludeChangeFolderPaths が change folder 配下の全ファイル種別を除外する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `excludeChangeFolderPaths` に `["specrunner/changes/<slug>/<name>-result-001.md", "specrunner/changes/<slug>/review-feedback-001.md", "specrunner/changes/<slug>/state.json"]` を渡す
**WHEN** 関数を呼び出す
**THEN** 戻り値が `[]` になる（findings・feedback・state のいずれも除外される）

---

### TC-008: excludeChangeFolderPaths が change folder 外の source path を保持する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `excludeChangeFolderPaths` に `["src/foo.ts", "specrunner/reviewers/x.md", "specrunner/project.md"]` を渡す
**WHEN** 関数を呼び出す
**THEN** 戻り値が入力と同一（すべて保持、順序不変）になる

---

### TC-009: excludeChangeFolderPaths に空配列を渡すと空配列が返る

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `excludeChangeFolderPaths` に `[]` を渡す
**WHEN** 関数を呼び出す
**THEN** 戻り値が `[]` になる

---

### TC-010: excludeChangeFolderPaths に source-only 配列を渡すと入力と同一が返る

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `excludeChangeFolderPaths` に `["src/a.ts", "src/b.ts"]` を渡す
**WHEN** 関数を呼び出す
**THEN** 戻り値が `["src/a.ts", "src/b.ts"]` と同一になる（フィルタ通過後も順序保持）

---

### TC-011: pipelineManagedPaths / partitionRoundChanges の既存挙動が変わらない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `round-git-scope.ts` に `excludeChangeFolderPaths` が追加された状態
**WHEN** 既存の `pipelineManagedPaths` / `partitionRoundChanges` に対する既存テストを実行する
**THEN** すべてのテストが無改変で green になる（新関数追加がモジュール既存エクスポートに影響しない）

---

### TC-012: typecheck が green になる

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** 実装（`round-git-scope.ts` への `excludeChangeFolderPaths` 追加、`parallel-review-round.ts` の invalidation site への配線）が完了した状態
**WHEN** `bun run typecheck` を実行する
**THEN** 型エラーが 0 件で終了する

---

### TC-013: 変更ファイルが指定 4 ファイルに限られる

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** 実装が完了した状態
**WHEN** `git diff main...HEAD --name-only` で変更ファイルを確認する
**THEN** 変更が `src/core/pipeline/round-git-scope.ts`、`src/core/pipeline/parallel-review-round.ts`、`src/core/pipeline/__tests__/round-git-scope.test.ts`、`src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts` の 4 ファイルのみで、`reviewer-status.ts` / `activation.ts` / `local.ts` / `scope.ts` / `runtime-capability-gate.ts` / `architecture/` / `specrunner/adr/` に変更がない

---

## Result

```yaml
result: completed
total: 13
automated: 11
manual: 2
must: 9
should: 4
could: 0
blocked_reasons: []
```
