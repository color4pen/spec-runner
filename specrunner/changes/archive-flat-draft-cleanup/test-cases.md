# Test Cases: archive の draft 削除を repo 本体側・両形式に直す

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual | gate
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
  gate TC:
    GWT は記述しない。充足を担う verification phase 名（または verification.commands の command 名）を本文に記録する。

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

- **Total**: 10 cases
- **Automated** (unit/integration): 10
- **Manual**: 0
- **Priority**: must: 6, should: 4, could: 0

---

### TC-001: フラット形式 untracked draft が repo 本体から削除される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: archive はフラット形式 draft を repo 本体から削除する > Scenario: フラット形式 draft が untracked で存在する場合

---

### TC-002: ディレクトリ形式 untracked draft が repo 本体から削除される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: archive はディレクトリ形式 draft を repo 本体から削除する > Scenario: ディレクトリ形式 draft が untracked で存在する場合

---

### TC-003: draft が一切存在しない場合 archive は無音で続行する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 両形式とも存在しない場合 archive は無音で続行する > Scenario: draft が一切存在しない場合

---

### TC-004: tracked なフラット形式 draft は削除せず警告を出す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: tracked な draft は削除せず警告を出す > Scenario: tracked なフラット形式 draft が存在する場合

---

### TC-005: tracked なディレクトリ形式 draft は削除せず警告を出す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: tracked な draft は削除せず警告を出す > Scenario: tracked なディレクトリ形式 draft が存在する場合

---

### TC-006: フラット形式とディレクトリ形式が同時に存在する場合、両方を削除する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: フラット形式とディレクトリ形式が同時に存在する場合、両方を削除する > Scenario: フラット形式とディレクトリ形式が同時に存在する場合

---

### TC-007: worktree-side fs.rm (recordDir 基準) が呼ばれない

**Category**: unit
**Priority**: should
**Source**: design.md > D4: worktree 側の draft 削除・staging を削除する

**GIVEN** draft が cwd(repo 本体)に存在する通常の archive 実行環境
**WHEN** `runArchiveOrchestrator` を実行する
**THEN** `fs.rm` が `FAKE_WORKTREE` 配下の drafts パスで呼ばれない（recordDir 基準の削除は実施されない）

---

### TC-008: worktree-side git add specrunner/drafts が呼ばれない

**Category**: unit
**Priority**: should
**Source**: design.md > D4: worktree 側の draft 削除・staging を削除する

**GIVEN** cwd(repo 本体)に draft が存在する通常の archive 実行環境
**WHEN** `runArchiveOrchestrator` を実行する
**THEN** `spawn("git", ["add", ...])` の引数に `specrunner/drafts` を含む呼び出しが一切ない（worktree-side staging は実施されない）

---

### TC-011: fs.rm の失敗が archive を失敗させない (best-effort)

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 / T-06 > "draft rm failure does not fail archive (best-effort)"

**GIVEN** `fs.rm` が `Promise.reject(new Error("EPERM"))` を返す
**WHEN** `runArchiveOrchestrator` を実行する
**THEN** `result.exitCode` が `0` である（draft 削除失敗は archive 完了を妨げない）

---

### TC-012: fs.rm の EACCES エラーが stderrWrite 警告を出す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 / T-07 > "draft rm EACCES emits a Warning via stderrWrite (best-effort)"

**GIVEN** `fs.rm` が `code: "EACCES"` を持つエラーで reject する
**WHEN** `runArchiveOrchestrator` を実行する
**THEN** `stderrWrite` が "Warning" と "draft" の両方を含むメッセージで呼ばれ、`result.exitCode` は `0` である

---

## Result

```yaml
result: completed
total: 10
automated: 10
manual: 0
must: 6
should: 4
could: 0
blocked_reasons: []
```
