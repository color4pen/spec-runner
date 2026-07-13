# Test Cases: 並列 round の git 副作用を coordinator が round 単位で所有する（scoped staging・非宣言変更 halt）

## Summary

- **Total**: 27 cases
- **Automated** (unit/integration): 24
- **Manual**: 3
- **Priority**: must: 17, should: 10, could: 0

---

## Group 1: Pure Logic — partitionRoundChanges / pipelineManagedPaths (unit)

### TC-001: partitionRoundChanges — 宣言出力だけが changed のとき toStage に入り offending = []

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `changed = [declaredPath]`、`declared = [declaredPath]`、pipeline 管理 path を含まない
**WHEN** `partitionRoundChanges({ changed, declared, slug })` を呼ぶ
**THEN** `toStage = [declaredPath]`、`offending = []`

---

### TC-002: partitionRoundChanges — 宣言外 path が混入すると offending に入る

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `changed = [declaredPath, "src/foo.ts"]`、`declared = [declaredPath]`、pipeline 管理 path は含まない
**WHEN** `partitionRoundChanges({ changed, declared, slug })` を呼ぶ
**THEN** `offending = ["src/foo.ts"]`
**AND** `toStage` に `"src/foo.ts"` は含まれない

---

### TC-003: partitionRoundChanges — pipeline 管理 path は offending にも toStage にも入らない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `changed = [declaredPath, state.json, events.jsonl, usage.json]`（slug に対応する管理 path）、`declared = [declaredPath]`
**WHEN** `partitionRoundChanges({ changed, declared, slug })` を呼ぶ
**THEN** `offending = []`（簿記は halt 誘発しない）
**AND** `toStage = [declaredPath]`（簿記は stage 対象に含まれない）

---

### TC-004: partitionRoundChanges — 宣言出力の削除が toStage に入り offending に入らない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `changed = [declaredPath]`（削除として git status に現れる）、`declared = [declaredPath]`
**WHEN** `partitionRoundChanges({ changed, declared, slug })` を呼ぶ
**THEN** `toStage = [declaredPath]`
**AND** `offending = []`

---

### TC-005: partitionRoundChanges — declared にあるが changed に無い path は toStage に入らない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `changed = []`（member が宣言出力を書かなかった）、`declared = [declaredPath]`
**WHEN** `partitionRoundChanges({ changed, declared, slug })` を呼ぶ
**THEN** `toStage = []`（pathspec mismatch を回避するため）
**AND** `offending = []`

---

### TC-006: pipelineManagedPaths — state.json / events.jsonl / usage.json の 3 path を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 / design.md > D3

**GIVEN** `slug = "my-slug"`
**WHEN** `pipelineManagedPaths("my-slug")` を呼ぶ
**THEN** `slugStateJsonPath(slug)` / `slugEventsPath(slug)` / `usageJsonPath(slug)` の 3 path を含む配列を返す
**AND** 返される path の個数はちょうど 3

---

## Group 2: Spec Scenario — member commit 抑止 (integration)

### TC-007: round 所有下の member 実行は commit port を呼ばない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: member 実行経路は git stage/commit port を呼ばない > Scenario: round 所有下の member 実行は commit port を呼ばない

---

### TC-008: 逐次経路の step 実行は従来どおり commit port を呼ぶ

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: member 実行経路は git stage/commit port を呼ばない > Scenario: 逐次経路の step 実行は従来どおり commit port を呼ぶ

---

## Group 3: Spec Scenario — scoped staging (integration)

### TC-009: 宣言出力だけが round commit へ入る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: coordinator は round member の宣言出力 union だけを scoped stage する > Scenario: 宣言出力だけが round commit へ入る

---

### TC-010: 宣言範囲内の削除・置換を拾う

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: coordinator は round member の宣言出力 union だけを scoped stage する > Scenario: 宣言範囲内の削除・置換を拾う

---

## Group 4: Spec Scenario — 非宣言変更 halt (integration)

### TC-011: member が宣言外のファイルを変更したら round を halt する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 非宣言変更があれば round 全体を halt する > Scenario: member が宣言外のファイルを変更したら round を halt する

---

### TC-012: 変更が宣言範囲内なら halt せず commit する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 非宣言変更があれば round 全体を halt する > Scenario: 変更が宣言範囲内なら halt せず commit する

---

### TC-013: pipeline 管理 path の更新は halt を誘発しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 非宣言変更があれば round 全体を halt する > Scenario: pipeline 管理 path の更新は halt を誘発しない

---

## Group 5: Spec Scenario — 逐次不変 (integration)

### TC-014: 逐次 step の commit は byte-for-byte 不変

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 逐次経路の commit 挙動を変えない > Scenario: 逐次 step の commit は byte-for-byte 不変

---

## Group 6: Design / Tasks 由来 — executor & seam (unit / integration)

### TC-015: executor — roundOwnsGitEffects=true で finalize ブロック全体（cleanupOutputTemplates 含む）が skip される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 / design.md > D1

**GIVEN** `deps.roundOwnsGitEffects = true`、agent step が成功裏に完了する
**WHEN** `runAgentStep` を実行する
**THEN** `finalizeStepArtifacts`（`cleanupOutputTemplates` ＋ `commitAndPush`）が一切呼ばれない
**AND** commit mutex 経由の呼び出しも発生しない

---

### TC-016: commitScopedPaths — stagePaths が空のとき no-op

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 / design.md > D2

**GIVEN** `stagePaths = []`
**WHEN** `commitScopedPaths` を呼ぶ
**THEN** `git add` も `git commit` も実行されない

---

### TC-017: commitScopedPaths — pathspec なし `git add -A` を使わず scoped add のみ使用

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 / design.md > D2

**GIVEN** `stagePaths = ["some/declared/path.md"]`
**WHEN** `commitScopedPaths` を呼ぶ
**THEN** spawn に渡される git add コマンドは `git add -A -- some/declared/path.md` 形式であり、pathspec を持たない `git add -A` 単独は呼ばれない

---

### TC-018: commitScopedPaths — staged 変更がないとき commit を行わない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 / design.md > D2

**GIVEN** `stagePaths` が空でない、かつ `git diff --cached --quiet` が exit 0（staged 変更なし）
**WHEN** `commitScopedPaths` を呼ぶ
**THEN** `git commit` は実行されない

---

### TC-019: local.listWorktreeChanges — 追加・変更・削除を repo 相対 path で返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 / design.md > D2

**GIVEN** worktree に追加（`??`）・変更（` M`）・削除（`D`）の各ステータスのファイルが存在する
**WHEN** `listWorktreeChanges(cwd)` を呼ぶ
**THEN** 各変更ファイルの repo 相対 path がすべて列挙される
**AND** git status の NUL 区切りパースで取得される（`snapshotMainCheckoutGuard` と同じロジック）

---

### TC-020: local.listWorktreeChanges — エラー時に [] を返す（never-throw）

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 / design.md > D2

**GIVEN** git status コマンドが非 0 exit またはその他エラーを返す
**WHEN** `listWorktreeChanges(cwd)` を呼ぶ
**THEN** 例外を throw せず `[]` を返す

---

### TC-021: managed runtime — listWorktreeChanges は [] を返し、commitRoundArtifacts は no-op

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 / design.md > D2

**GIVEN** managed runtime の `listWorktreeChanges` / `commitRoundArtifacts` を呼ぶ
**WHEN** 各メソッドを実行する
**THEN** `listWorktreeChanges` は `[]` を返す（local worktree なし fail-safe）
**AND** `commitRoundArtifacts` は何も実行しない（no-op）

---

### TC-022: coordinator — listWorktreeChanges 不在のとき判定・commit を skip する（test fake 互換）

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-04 / design.md > D3

**GIVEN** `deps.runtimeStrategy` に `listWorktreeChanges` が実装されていない（test fake）
**WHEN** `ParallelReviewRound.run` を実行する
**THEN** `partitionRoundChanges` も `commitRoundArtifacts` も呼ばれない（従来挙動、no-op）
**AND** 既存 `parallel-review-round-resume.test.ts` が回帰しない

---

### TC-023: coordinator — roundDeps は deps の in-place 変更でなく新規オブジェクト（B-16 不変）

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 / design.md > D1

**GIVEN** `deps` オブジェクトが渡される
**WHEN** coordinator が `roundDeps = { ...deps, roundOwnsGitEffects: true }` を構築する
**THEN** `roundDeps !== deps`（別オブジェクト）
**AND** 元の `deps` は変更されない（共有 `deps` が round 内で in-place 変更されない）

---

### TC-024: 既存 parallel-review-round-resume.test.ts が回帰しない

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `RuntimeStrategy` に追加された `listWorktreeChanges?` / `commitRoundArtifacts?` が optional であり、既存 test fake が両メソッドを実装していない
**WHEN** `parallel-review-round-resume.test.ts` を実行する
**THEN** typecheck が通る（optional field のため fake に実装が不要）
**AND** 全テストが従来どおり通過する（commit / halt を skip する経路で実行）

---

## Group 7: Manual — 全体検証

### TC-025: typecheck && test が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** 実装完了後の状態
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 両コマンドが 0 exit（エラーなし）で終了する
**AND** 新規・更新 test 含む全テストが通過し、既存 parallel review / resume / executor / commit-and-push test の regression がない

---

### TC-026: 変更ファイルがスコープ内ファイルに限られること

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-06

**GIVEN** 実装完了後の git diff
**WHEN** 変更ファイル一覧を確認する
**THEN** 変更ファイルが `src/core/types.ts` / `src/core/step/executor.ts` / `src/core/step/commit-push.ts` / `src/core/port/runtime-strategy.ts` / `src/core/runtime/local.ts` / `src/core/runtime/managed.ts` / `src/core/pipeline/parallel-review-round.ts` / `src/core/pipeline/pipeline.ts` / `src/core/pipeline/round-git-scope.ts` と対応 test ファイルに限られる

---

### TC-027: architecture/ 配下に変更がないこと

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-06

**GIVEN** 実装完了後の git diff
**WHEN** `architecture/` 配下のファイルを確認する
**THEN** `architecture/` 配下に変更が 1 件も含まれない（B-15 の ratify は本 pipeline のスコープ外）

---

## Result

```yaml
result: completed
total: 27
automated: 24
manual: 3
must: 17
should: 10
could: 0
blocked_reasons: []
```
