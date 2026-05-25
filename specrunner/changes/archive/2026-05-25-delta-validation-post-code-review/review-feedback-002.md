# Code Review Feedback — delta-validation-post-code-review — iter 2

- **verdict**: needs-fix
- **reviewer**: code-review agent
- **date**: 2026-05-25

---

## Summary

イテレーション 1 の HIGH 5 件 (F-01〜F-05) はすべて修正済み。実装ロジック・型安全性・transition 設計は正しい。  
ただし **TC-PROMPT-01 / TC-PROMPT-02 / TC-INT-03 (いずれも must-priority)** が未カバーのまま残っており、 `delta-spec-fixer` prompt に追加した authority-spec-direct-edit 対処指示が自動検証されていない。

---

## Findings

| # | Severity | Status | Category | File | Description |
|---|----------|--------|----------|------|-------------|
| N-01 | HIGH | NEW | test-coverage | `tests/unit/step/delta-spec-fixer.test.ts` | TC-PROMPT-01 / TC-PROMPT-02 / TC-INT-03 (must): `buildDeltaSpecFixerInitialMessage()` と `buildDeltaSpecFixerContinuationMessage()` に追加した authority-spec-direct-edit 対処指示（`git checkout <baseBranch> -- <violated-path>` / delta path への書き直し）を検証するテストが存在しない。Task 10 の主要デリバラブルである prompt 拡張が自動検証されていない。 |
| F-06 | LOW | OPEN | prompt-quality | `src/core/step/delta-spec-fixer.ts` | `buildDeltaSpecFixerInitialMessage` 内の指示順: item 6「end_turn してください」が item 7「authority-spec-direct-edit の rollback」より前に現れる。agent が item 6 を作業完了シグナルと解釈して item 7 を読み飛ばすリスクがある。end_turn 指示を末尾に移動することを推奨。 |
| F-07 | LOW | OPEN | maintainability | `tests/unit/pipeline/transition-when.test.ts` | `expect(STANDARD_TRANSITIONS.length).toBe(31)` がハードコードのまま。transition 追加・削除のたびに壊れる脆弱なアサーション。削除か `toBeGreaterThanOrEqual(31)` への変更を推奨。 |

---

## Detail

### N-01: TC-PROMPT-01 / TC-PROMPT-02 / TC-INT-03 — prompt 拡張が未検証

`src/core/step/delta-spec-fixer.ts` の Task 10 変更点:

```typescript
// buildDeltaSpecFixerInitialMessage — item 7 として追加
7. If violations include `authority-spec-direct-edit`:
   a. Revert the authority spec edit: `git checkout ${baseBranch} -- <violated-path>`
   b. Write the intended changes to the delta path: `specrunner/changes/${slug}/specs/<capability>/spec.md`
```

```typescript
// buildDeltaSpecFixerContinuationMessage — 末尾に追加
violations に `authority-spec-direct-edit` が含まれる場合:
a. authority spec の編集を revert: `git checkout ${baseBranch} -- <violated-path>`
b. 意図した変更を delta path に書き直す: `specrunner/changes/${slug}/specs/<capability>/spec.md`
```

既存の `tests/unit/step/delta-spec-fixer.test.ts` は branch / slug / validation result path / user-request タグ / completionVerdict などを検証しているが、**authority-spec-direct-edit 対処指示の有無** を検証するテストが 1 件もない。  

`baseBranch` が prompt に正しく展開されることも未検証（`branch` (= state.branch) の存在テストはあるが `baseBranch` (= deps.request.baseBranch) のテストはない）。

**修正**: `tests/unit/step/delta-spec-fixer.test.ts` に以下を追加する。

```typescript
// TC-PROMPT-01: initial message — authority-spec-direct-edit 対処指示
describe("TC-PROMPT-01: initial message contains authority-spec-direct-edit instructions", () => {
  it("contains git checkout with baseBranch for authority spec revert", () => {
    const state = makeMinimalState({ branch: "feat/my-change" });
    const deps = makeMinimalDeps("my-change"); // baseBranch: "main"
    const message = DeltaSpecFixerStep.buildMessage(state, deps);
    expect(message).toContain("authority-spec-direct-edit");
    expect(message).toContain("git checkout main");
  });

  it("contains delta path reference for rewrite destination", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps("my-change");
    const message = DeltaSpecFixerStep.buildMessage(state, deps);
    expect(message).toContain("specrunner/changes/my-change/specs/");
  });
});

// TC-PROMPT-02: continuation message — authority-spec-direct-edit 対処指示
describe("TC-PROMPT-02: continuation message contains authority-spec-direct-edit instructions", () => {
  it("continuation message contains authority spec revert instruction", () => {
    const state = makeStateWithPreviousDeltaSpecFixerRun("sess-001");
    const deps = makeMinimalDeps("my-change"); // baseBranch: "main"
    const message = DeltaSpecFixerStep.buildMessage(state, deps);
    expect(message).toContain("authority-spec-direct-edit");
    expect(message).toContain("git checkout main");
  });

  it("continuation message contains delta path reference", () => {
    const state = makeStateWithPreviousDeltaSpecFixerRun("sess-001");
    const deps = makeMinimalDeps("my-change");
    const message = DeltaSpecFixerStep.buildMessage(state, deps);
    expect(message).toContain("specrunner/changes/my-change/specs/");
  });
});
```

---

## Fixed from iter 1

| # | Status | Description |
|---|--------|-------------|
| F-01 | ✅ FIXED | TC-RULE-08: `createDeltaSpecRegistry()` に `no-authority-spec-direct-edit` が登録されていることを `registry.validate()` 経由で確認するテストを追加 |
| F-02 | ✅ FIXED | TC-INJ-01: `DeltaSpecValidationStep.run()` が spawn stdout を `changedFiles` として `validateDeltaSpecPaths()` に注入することを `vi.mock` + call args 検証で確認 |
| F-03 | ✅ FIXED | TC-INJ-02: git diff 失敗（非ゼロ exit code / spawn throw）時に `changedFiles = undefined` で graceful degradation し、pipeline がエラーにならないことを 2 ケースで確認 |
| F-04 | ✅ FIXED | TC-CP-01 / TC-CP-02 / TC-CP-03 (TC-AUTH-01〜03): staged files に authority spec が含まれるとき warning が stderr に出力され commit が続行することを確認 |
| F-05 | ✅ FIXED | TC-CP-04 / TC-CP-05 / TC-CP-06 (TC-AUTH-04〜06): agent self-commit の HEAD diff に authority spec が含まれるとき warning が stderr に出力され push が続行することを確認 |

---

## Positive Observations (iter 2)

- TC-INJ-01 / TC-INJ-02 は `vi.mock` + call args 検証で changedFiles injection を正確に確認している。
- TC-AUTH-01〜06 は `resolveGitResponse` helper を使って staged / HEAD-diff の両経路を明確に分離しており、テスト意図が読みやすい。
- TC-RULE-08 が `registry.validate()` 経由で動作検証になっているのは `rules` フィールドが private な registry 設計と整合しており適切。
- `baseBranch` の `buildMessage` への統合 (`deps.request.baseBranch` から取得) は Task 10 通り実装されており、continuation / initial 両 path で参照されている。

---

## How to Fix

1. `tests/unit/step/delta-spec-fixer.test.ts` に TC-PROMPT-01 / TC-PROMPT-02 相当のテストを追加（authority-spec-direct-edit 指示と baseBranch / delta path の存在を initial + continuation 両 message で確認）
2. F-06 (optional): `buildDeltaSpecFixerInitialMessage` で end_turn 指示を item リストの末尾に移動
3. F-07 (optional): `TC-WHEN-02` の `toBe(31)` アサーションを削除または `toBeGreaterThanOrEqual` に変更
