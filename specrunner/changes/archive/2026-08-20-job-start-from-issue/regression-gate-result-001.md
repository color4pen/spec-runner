# Regression Gate Result — Iteration 1

## Verification Summary

All 7 findings from the ledger were verified against the current code. No regressions found.

## Finding Verification

### [MEDIUM] GitHub API fetch 失敗（404/401/ネットワーク断）が spec に未定義

**Status: FIXED**

`specrunner/changes/job-start-from-issue/spec.md` lines 83–95 now contain:

```
### Requirement: GitHub API fetch 失敗は副作用ゼロで非ゼロ exit しなければならない
```

with a Scenario. `src/cli/__tests__/from-issue.test.ts` TC-008 pins fetch failure → non-zero exit, no draft/state created.

---

### [LOW] T-02 の parsed.positional! 代入移動が tasks に明示されていない

**Status: FIXED**

`specrunner/changes/job-start-from-issue/tasks.md` T-02 (lines 28–29) now contains the explicit item:

> `parsed.positional` の参照（`requestMdPath` 代入）は from-issue 委譲 return の後、positional が確実に存在する経路でのみ行う（現在 `runJobHandler` 冒頭にある `const requestMdPath = parsed.positional!` の非 null 断言を from-issue ルーティングの後に移動する）。

---

### [LOW] spec-fixer-deferred HTML コメントが完了済みのまま残存

**Status: FIXED**

`specrunner/changes/job-start-from-issue/design.md` has 170 lines. No `<!-- spec-fixer-deferred` HTML comments present anywhere in the file. Grep for `spec-fixer-deferred` in the change folder returns no matches in design.md.

---

### [LOW] spec-fixer-deferred HTML コメントが stale かつ誤記のまま残存 (design.md:172)

**Status: FIXED**

design.md ends at line 170. There is no line 172, and no HTML comments of any kind at the end of the file.

---

### [MEDIUM] `materializeDraftAndStart` が `inboxOrigin: true` を渡すことをテストが pin しない

**Status: FIXED**

`src/core/job/__tests__/start-from-issue.test.ts` was added. It contains tests that assert `runRunCore` is called with `expect.objectContaining({ inboxOrigin: true })` and `expect.objectContaining({ inboxOrigin: true, issue: N })`. Removing `inboxOrigin: true` from `start-from-issue.ts` would cause these tests to fail.

---

### [LOW] `getOriginInfo` モックのフィールド名誤り（`repo` → `name`）

**Status: FIXED**

`src/cli/__tests__/from-issue.test.ts` line 60 now correctly uses:

```typescript
getOriginInfo: vi.fn().mockResolvedValue({ owner: "test-owner", name: "test-repo" }),
```

`origin.name` is also what `src/cli/from-issue.ts` line 66 reads (`repo = origin.name`), consistent with `OriginInfo` type.

---

### [LOW] TC-013/TC-014 in from-issue.test.ts はモック自身をテストしており無効

**Status: FIXED**

TC-013 and TC-014 test blocks have been removed from `src/cli/__tests__/from-issue.test.ts`. Only a single comment remains at line 479:

```typescript
// TC-013/TC-014: getCurrentBranch の実装テストは src/git/__tests__/branch.test.ts が担保する。
```

The actual `getCurrentBranch` implementation is tested in `src/git/__tests__/branch.test.ts`.
