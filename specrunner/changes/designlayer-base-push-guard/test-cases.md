# Test Cases: designLayer 有効時に未 push の設計コミットを run 前に警告する

## Summary

- **Total**: 13 cases
- **Automated** (unit/integration): 11
- **Manual**: 2
- **Priority**: must: 6, should: 6, could: 1

---

### TC-001: designLayer 有効 + ahead > 0 で警告が出る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: designLayer 有効かつ local base が origin base より ahead のとき run 前に未 push 警告を出す > Scenario: 有効 + ahead > 0 で警告が出る

---

### TC-002: designLayer 無効のとき ahead > 0 でも警告が出ない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: designLayer 無効のときは未 push 警告を出さない > Scenario: 無効なら ahead > 0 でも警告なし

---

### TC-003: designLayer 有効 + ahead == 0 で警告が出ない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: ahead が 0 のときは未 push 警告を出さない > Scenario: 有効 + ahead == 0 で警告なし

---

### TC-004: behind 警告は既存挙動のまま不変

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既存の behind 警告の挙動を保存する > Scenario: behind 警告は不変

---

### TC-005: docs に worktree base と push 順序の記述が存在する

**Category**: manual
**Priority**: should
**Source**: spec.md > Requirement: docs に worktree base と push 順序を明文化する > Scenario: docs に記述が存在する

---

### TC-006: designLayerEnabled: false のとき ahead 用 rev-list が spawn されない

**Category**: unit
**Priority**: must
**Source**: design.md > D1（enabled でないときは rev-list を一切 spawn しない）; tasks.md > T-05

**GIVEN** `designLayerEnabled` を渡さない（または `false`）で `setupWorkspace` の run path を実行する。`aheadCount = 2`（呼ばれれば正値を返す mock）。

**WHEN** `setupWorkspace` が完了する

**THEN** `git rev-list origin/<baseBranch>..<baseBranch> --count` が calls に現れず、stderr に未 push 警告が出ない

---

### TC-007: ahead rev-list が非 0 exit のとき警告が出ない

**Category**: unit
**Priority**: should
**Source**: design.md > Risks（local に baseBranch が存在しない場合の best-effort）; tasks.md > T-03 Acceptance Criteria

**GIVEN** `designLayerEnabled: true` で `setupWorkspace` の run path を実行する。`git rev-list origin/<baseBranch>..<baseBranch> --count` の `exitCode` が `1`（非 0）。

**WHEN** `setupWorkspace` が ahead 判定を行う

**THEN** stderr に未 push 警告が出ない（rev-list 非 0 exit は best-effort で無出力）

---

### TC-008: diverged（ahead かつ behind 両方 > 0）のとき両方の警告が出る

**Category**: unit
**Priority**: should
**Source**: design.md > Risks（diverged のとき両 warning を独立出力する意図）

**GIVEN** `designLayerEnabled: true` で、local `<baseBranch>` が `origin/<baseBranch>` より 1 commit behind かつ 2 commits ahead（diverged）の状態で `setupWorkspace` の run path を実行する

**WHEN** `setupWorkspace` が behind 判定と ahead 判定をそれぞれ実行する

**THEN** stderr に `behind origin/<baseBranch>` を含む warning と `ahead of origin/<baseBranch>` を含む warning の両方が出力される

---

### TC-009: WorkspaceOptions に designLayerEnabled フィールドが存在する

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `src/core/port/runtime-strategy.ts` の `WorkspaceOptions` 型定義を参照する

**WHEN** 型チェックを実行する（`bun run typecheck`）

**THEN** `WorkspaceOptions` に `designLayerEnabled?: boolean` が定義されており、型エラーが出ない

---

### TC-010: pipeline-run の prepare() が designLayerEnabled を workspaceOpts に詰める

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria; design.md > D3

**GIVEN** `designLayer.enabled: true` の config を持つプロジェクトで `pipeline-run.ts` の `prepare()` を呼ぶ

**WHEN** `prepare()` が `workspaceOpts` を生成する

**THEN** 返り値の `workspaceOpts.designLayerEnabled` が `true`（`resolveDesignLayerConfig(config).enabled` と一致する）

---

### TC-011: resume path の workspaceOpts は designLayerEnabled を持たない

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria; design.md > D3（resume 未設定 = disabled と同義）

**GIVEN** `resume.ts` の `prepare()` が `workspaceOpts` を生成する（変更対象外）

**WHEN** `prepare()` が完了する

**THEN** `workspaceOpts` に `designLayerEnabled` が含まれない（`undefined`）

---

### TC-012: ahead 警告文言に push コマンドと設計要素の欠落リスクが含まれる

**Category**: unit
**Priority**: should
**Source**: design.md > D4（warning 文言の自己完結要件）; tasks.md > T-03 Acceptance Criteria

**GIVEN** `designLayerEnabled: true` かつ `aheadCount = 2` で `setupWorkspace` の run path を実行する

**WHEN** ahead warning が stderr に出力される

**THEN** 出力に `ahead of origin/<baseBranch>` を含み、かつ `git push origin <baseBranch>` 相当の push コマンドと、worktree が `origin/<baseBranch>` から作られるため設計要素（`[[id]]` / ADR）を欠く可能性の旨が含まれる

---

### TC-013: typecheck + test が全 green

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** 本 change のすべての実装（T-01〜T-05）が適用された状態

**WHEN** `bun run typecheck && bun run test` を実行する

**THEN** すべての型チェックとテスト（新規・既存）が green で完了する

---

## Result

```yaml
result: completed
total: 13
automated: 11
manual: 2
must: 6
should: 6
could: 1
blocked_reasons: []
```
