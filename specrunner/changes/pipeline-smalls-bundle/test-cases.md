# Test Cases: pipeline 運用の小粒不具合 3 件の一括修正

## Summary

- **Total**: 15 cases
- **Automated** (unit/integration): 15
- **Manual**: 0
- **Priority**: must: 12, should: 2, could: 1

---

## Fixer Prompt: lcov 変更行 gate 手順

### TC-001: test-coverage failed 時の手順に lcov 変更行が記載されている

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: build-fixer prompt が lcov 変更行 gate 手順を使う > Scenario: test-coverage failed 時の手順に lcov 変更行が記載されている

---

### TC-002: 旧 TC-ID 手順が残っていない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: build-fixer prompt が lcov 変更行 gate 手順を使う > Scenario: 旧 TC-ID 手順が残っていない

---

## Fixer Prompt: coverage gate 回避禁止

### TC-003: build-fixer prompt に gate 回避禁止規律が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: build-fixer と code-fixer の両 prompt が coverage gate 回避を禁止する > Scenario: build-fixer prompt に gate 回避禁止規律が含まれる

---

### TC-004: code-fixer prompt に gate 回避禁止規律が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: build-fixer と code-fixer の両 prompt が coverage gate 回避を禁止する > Scenario: code-fixer prompt に gate 回避禁止規律が含まれる

---

## exit-guard: resumePoint 書き込み

### TC-005: no-worktree 経路で resumePoint が書かれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: exit-guard が awaiting-resume 遷移時に resumePoint を書く > Scenario: no-worktree 経路で resumePoint が書かれる

---

### TC-006: per-job 経路で resumePoint が書かれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: exit-guard が awaiting-resume 遷移時に resumePoint を書く > Scenario: per-job 経路で resumePoint が書かれる

---

### TC-007: global scan 経路で resumePoint が書かれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: exit-guard が awaiting-resume 遷移時に resumePoint を書く > Scenario: global scan 経路で resumePoint が書かれる

---

### TC-008: step が空の job では resumePoint を書かない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: exit-guard が awaiting-resume 遷移時に resumePoint を書く > Scenario: step が空の job では resumePoint を書かない

---

### TC-009: resumePoint.iterationsExhausted が 0 で書かれる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04, design.md > D3

**GIVEN** no-worktree / per-job / global scan いずれかの経路で、running 状態かつ `state.step` が truthy の job が存在する
**WHEN** exit-guard ハンドラが実行される
**THEN** 遷移後 state の `resumePoint.iterationsExhausted === 0` である

---

## view コマンド: worktree cwd guard

### TC-010: worktree cwd からの job ls がエラーになる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: view コマンドが worktree cwd から実行された場合に明示エラーで拒否する > Scenario: worktree cwd からの job ls がエラーになる

---

### TC-011: worktree cwd からの job stats がエラーになる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: view コマンドが worktree cwd から実行された場合に明示エラーで拒否する > Scenario: worktree cwd からの job stats がエラーになる

---

### TC-012: worktree cwd からの job show がエラーになる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: view コマンドが worktree cwd から実行された場合に明示エラーで拒否する > Scenario: worktree cwd からの job show がエラーになる

---

### TC-013: main checkout cwd からの view コマンドは正常動作する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: view コマンドが worktree cwd から実行された場合に明示エラーで拒否する > Scenario: main checkout cwd からの view コマンドは正常動作する

---

### TC-014: view コマンド worktree guard の exit code が 2 である

**Category**: unit
**Priority**: should
**Source**: design.md > D4

**GIVEN** `detectSpecrunnerWorktree` が `{ isSpecrunnerWorktree: true, mainCheckoutPath: "/repo" }` を返す条件下で `runPs` / `runJobStats` / `runJobShow` のいずれかを呼ぶ
**WHEN** guard ブロックが発火する
**THEN** 戻り値（exit code）が厳密に `2` である（非 0 の任意値ではなく `WORKTREE_GUARD` の規定値）

---

### TC-015: mainCheckoutPath が null の場合にフォールバック文字列が案内に使われる

**Category**: unit
**Priority**: could
**Source**: design.md > D4

**GIVEN** `detectSpecrunnerWorktree` が `{ isSpecrunnerWorktree: true, mainCheckoutPath: null }` を返す
**WHEN** `runPs` / `runJobStats` / `runJobShow` を呼ぶ
**THEN** stderr の案内メッセージが `<main checkout>` のフォールバック文字列を含み、クラッシュしない

---

## Result

```yaml
result: completed
total: 15
automated: 15
manual: 0
must: 12
should: 2
could: 1
blocked_reasons: []
```
