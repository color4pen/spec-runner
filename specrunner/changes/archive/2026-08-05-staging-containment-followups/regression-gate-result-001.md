# Regression Gate Result — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証対象 3 件の確認結果

### Finding 1: TC-034 が T-06 と T-07 で重複使用されている

**対象**: `specrunner/changes/staging-containment-followups/tasks.md`

**確認内容**:
- T-06（line 162）: `TC-034 (unit)` — `stagedBytesLimitExceededError` の error message/code の unit テスト ✓
- T-07（line 187）: `TC-042 (message)` — integration 版のメッセージ確認テスト ✓

`TC-034` は tasks.md に 1 箇所のみ（T-06）。T-07 の integration 版は `TC-042` に変更済み。**重複は解消されている。**

---

### Finding 2: TC-033 が tasks.md で `add` の不実行 assertion を欠く

**対象**: `specrunner/changes/staging-containment-followups/tasks.md:185-186`

**確認内容**:
```
TC-033 (measurement failure → fail-closed): probe throws a non-ENOENT error for a path → assert the
step halts (rejects) and `subcommands` contains NEITHER `add` NOR `commit` NOR `push`.
```

`add` が明示的に "NEITHER `add` NOR `commit` NOR `push`" に含まれている。**修正済み。**

---

### Finding 3: TC-033 第1サブテストが `add` の不実行を assert しない

**対象**: `src/core/step/__tests__/commit-push-staged-bytes-guard.test.ts`

**確認内容**:
TC-033 の describe ブロックには 2 つの `it` が存在する。

1. 第1サブテスト（EACCES、lines 366-401）:
   - `expect(subcommands).not.toContain("commit")` ✓
   - `expect(subcommands).not.toContain("push")` ✓
   - `not.toContain("add")` は直接 assert しない

2. 第2サブテスト（EPERM、lines 403-433）— タイトル "TC-033: no git add is invoked when measurement fails fail-closed":
   - `expect(subcommands).not.toContain("add")` ✓

Finding の resolution として、`add` を専用で assert する第2サブテストが追加された。`add` / `commit` / `push` の全 3 assertion が describe ブロック全体でカバーされており、受け入れ基準「add / commit / push が一切実行されずに halt」は充足されている。**修正済み。**

---

## 矛盾検査

- Finding 2（tasks.md に `add` 追記）と Finding 3（テストに `add` assertion 追加）は互いに整合している。
- Finding 1（TC-042 への改番）は他の findings と干渉しない。
- 矛盾・再導入なし。

## 検証方法

- `git diff main...HEAD --name-only` でスコープを確認
- `grep -n "TC-034\|TC-042"` で tasks.md の ID 重複を確認
- tasks.md の TC-033 行を直読みで `add` 言及を確認
- test file の TC-033 describe ブロック全体を精読して assertion の網羅性を確認
