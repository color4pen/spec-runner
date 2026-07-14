# Test Cases: 並列 round の worktree 検査を fail-closed 化する（検査不能を clean と区別し escalation）

## Summary

- **Total**: 20 cases
- **Automated** (unit/integration): 14
- **Manual**: 6
- **Priority**: must: 12, should: 7, could: 1

---

### TC-001: 検査成功は変更集合を伴って返る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: worktree 検査 seam は「検査成功」と「検査不能」を戻り値で区別する > Scenario: 検査成功は変更集合を伴って返る

---

### TC-002: 検査不能は診断文字列を伴って返る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: worktree 検査 seam は「検査成功」と「検査不能」を戻り値で区別する > Scenario: 検査不能は診断文字列を伴って返る

---

### TC-003: git status が exit 0 なら検査成功

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: local runtime は git 失敗を検査不能として返す > Scenario: git status が exit 0 なら検査成功

---

### TC-004: git status が非ゼロ終了なら検査不能

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: local runtime は git 失敗を検査不能として返す > Scenario: git status が非ゼロ終了なら検査不能

---

### TC-005: spawn 例外なら検査不能

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: local runtime は git 失敗を検査不能として返す > Scenario: spawn 例外なら検査不能

---

### TC-006: managed は常に検査成功の空集合を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: managed runtime は検査成功の空集合を返す > Scenario: managed は常に検査成功の空集合を返す

---

### TC-007: 検査不能なら escalation し commit しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: coordinator は検査不能を受けたら round を fail-closed で escalation する > Scenario: 検査不能なら escalation し commit しない

---

### TC-008: 検査成功なら従来の宣言外変更検出・scoped commit が働く

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: coordinator は検査不能を受けたら round を fail-closed で escalation する > Scenario: 検査成功なら従来の宣言外変更検出・scoped commit が働く

---

### TC-009: 検査 seam 未実装の runtime では検査を skip する

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: coordinator は検査不能を受けたら round を fail-closed で escalation する > Scenario: 検査 seam 未実装の runtime では検査を skip する

---

### TC-010: WorktreeInspectionResult 型が port ファイルに定義され domain import を増やさない

**Category**: manual
**Priority**: should
**Source**: design.md > D1 / tasks.md > T-01 Acceptance Criteria

**GIVEN** `src/core/port/runtime-strategy.ts` に `WorktreeInspectionResult` が定義されている
**WHEN** 型定義と import 宣言を確認する
**THEN** `WorktreeInspectionResult` が同ファイルに `export` されており、`reason: string` のみで構成されている
**AND** domain 型（`ErrorInfo` 等）への import が増えていない（ports→domain 非依存を維持）

---

### TC-011: port の doc comment が新 contract に更新されている

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria / request.md > 受け入れ基準

**GIVEN** `src/core/port/runtime-strategy.ts` の `listWorktreeChanges` doc comment
**WHEN** コメント内容を確認する
**THEN** 「Never throws — returns [] on any error」の記述が消えている
**AND** 成功時は `{kind:"success", paths}`、検査不能時は `{kind:"unavailable", reason}` を返す旨の新 contract が記載されている
**AND** throw しない点が維持されている旨が記載されている

---

### TC-012: local で exit 0 かつ変更なし → success:[] を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria / design.md > D2

**GIVEN** local worktree で `git status --porcelain -z --no-renames` が exit 0 で完了し、出力が空（未 commit 変更なし）
**WHEN** `listWorktreeChanges(cwd)` を呼ぶ
**THEN** 戻り値は `{kind:"success", paths:[]}` であり、検査不能（`unavailable`）ではない

---

### TC-013: local で非ゼロ終了の reason に exit code が含まれる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria / design.md > D2

**GIVEN** local worktree で `git status` が exit code 128 で終了する
**WHEN** `listWorktreeChanges(cwd)` を呼ぶ
**THEN** 戻り値は `{kind:"unavailable", reason}` であり、`reason` に終了 exit code（128）が含まれる

---

### TC-014: local で spawn 例外の reason にエラー概要が含まれる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria / design.md > D2

**GIVEN** `git` コマンドが spawn できない（`ENOENT` 等の例外が throw される）
**WHEN** `listWorktreeChanges(cwd)` を呼ぶ
**THEN** 戻り値は `{kind:"unavailable", reason}` であり、`reason` にエラー概要（ENOENT / エラーメッセージ等）が含まれる
**AND** seam は例外を throw しない

---

### TC-015: consumer で unavailable の roundError.message が reason を反映する

**Category**: integration
**Priority**: should
**Source**: design.md > D4 / tasks.md > T-04 Acceptance Criteria

**GIVEN** fake が `{kind:"unavailable", reason:"git status exited with code 128"}` を返す
**WHEN** `ParallelReviewRound.run` を実行する
**THEN** `roundError.message` に `"git status exited with code 128"` を反映した文字列が含まれる（reason から `ErrorInfo.message` への写像が consumer 側で完結している）

---

### TC-016: consumer で unavailable の roundError に hint が含まれる

**Category**: integration
**Priority**: could
**Source**: design.md > D4 / tasks.md > T-04

**GIVEN** fake が `{kind:"unavailable", reason:"..."}` を返す
**WHEN** `ParallelReviewRound.run` を実行する
**THEN** `roundError.hint` が worktree 検査・git 復旧を促す操作上の手がかり文字列を持つ（空文字・undefined でない）

---

### TC-017: 全 test fake が DU を返すよう更新されており string[] の旧 fake が残らない

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-05 / design.md > Risks（fake 追随漏れで runtime エラー）

**GIVEN** `src/**/__tests__/` 配下に `listWorktreeChanges` を実装している全 fake
**WHEN** `grep -rn listWorktreeChanges src` で全実装・全 fake を列挙する
**THEN** `string[]` を直接返す旧 fake が残っていない（method 省略の fake = skip 経路は除く）
**AND** 全実装 fake が `{kind:"success", paths}` または `{kind:"unavailable", reason}` の形を返している

---

### TC-018: typecheck が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria / request.md > 受け入れ基準

**GIVEN** DU 型変更後のソースツリー全体
**WHEN** `bun run typecheck` を実行する
**THEN** 型エラーが 0 件で完了する

---

### TC-019: test suite が green（既存 regression なし）

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria / request.md > 受け入れ基準

**GIVEN** 全実装・全 test fake を DU へ追随させた後のテストスイート
**WHEN** `bun run test` を実行する
**THEN** 全テストが green（local-round-git / managed-round-git / parallel-review-round-git-effects の既存シナリオを含む）
**AND** parallel-review-round-resume.test.ts 等の method 省略 fake を持つテストが回帰しない

---

### TC-020: 変更ファイルがスコープ内に限られ architecture/ 配下が不変

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-06 Acceptance Criteria / request.md > スコープ外

**GIVEN** 本変更のコミット差分
**WHEN** 変更ファイル一覧を確認する
**THEN** 変更対象が `src/core/port/runtime-strategy.ts` / `src/core/runtime/local.ts` / `src/core/runtime/managed.ts` / `src/core/pipeline/parallel-review-round.ts` と対応テストファイルに限られる
**AND** `architecture/` 配下・`specrunner/adr/` 配下に変更が無い（B-15 §4 / conformance / 歯への反映はスコープ外）

---

## Result

```yaml
result: completed
total: 20
automated: 14
manual: 6
must: 12
should: 7
could: 1
blocked_reasons: []
```
