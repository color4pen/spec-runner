# Regression Gate Evidence — step-write-scope-enforcement iter 1

## Verification methodology

1. Read `git diff main...HEAD --name-only` to identify all changed files.
2. Read `src/core/step/commit-push.ts` and `src/core/step/write-scope.ts` for production code.
3. Read `tests/unit/step/commit-push-write-scope.test.ts` lines 1–650 and 845–1150 for test coverage.
4. Read `tests/core/pipeline/pipeline.guard-halt.test.ts` for pipeline-level tests.

---

## Per-finding verification

### Finding #2 [HIGH]: commitFinalState が guarded halt 後の checkpoint commit で違反ファイルをコミットし write-scope 保護を無効化する

**Verdict: FIXED**

`commit-push.ts` lines 216–231: 違反検出後に `git checkout HEAD -- violations` を呼んでから `throw writeScopeViolationError` している。
`commitFinalState` の JSDoc（lines 252–265）に「guarded-mode commitAndPush has already restored violated files to HEAD via git checkout HEAD before throwing — so this git add -A does not pick up violation content」と明示されている。
TC-021（lines 845–959）がこの順序を3つのテストケースで機械的に固定している：
- `git checkout HEAD` が WRITE_SCOPE_VIOLATION throw の前に呼ばれること
- `checkout` の後に `commit`/`push` が呼ばれないこと
- checkout が失敗しても throw は必ず起きること

### Finding #3 [MEDIUM]: pipelineManagedPaths が sequential scoped（包含）と parallel round（除外）で意味的に反転して使われ

**Verdict: FIXED**

TC-022（lines 962–1044）が追加された。`state.json`/`events.jsonl`/`usage.json` が `writes()` に宣言されていなくても scoped `git add` の pathspec に含まれることを2テストで固定。`pipelineManagedPaths` 定義変更時にここで回帰検出される。

### Finding #4 [MEDIUM]: scoped step の境界違反が worktree に残存し後続の guarded step が誤帰属 WRITE_SCOPE_VIOLATION で halt する

**Verdict: FIXED**

`commit-push.ts` lines 193–199: scoped staging 後に `getWorktreeChangedPaths` → `findWriteScopeViolations` → `git checkout HEAD -- residualViolations` を実行する。
TC-023（lines 1059–1150）が「scoped step が request.md を変更したが scoped pathspec に含まれないため worktree に残留 → `git checkout HEAD` で復元される」シナリオを固定している。

### Finding #6 [MEDIUM]: 新規作成違反ファイルが git checkout HEAD で回復不能 → commitFinalState が checkpoint commit に混入させる

**Verdict: NOT FIXED**

`commit-push.ts` line 230: `await gitExecResult(infra.spawnFn, cwd, ["checkout", "HEAD", "--", ...violations])` のみ。`git clean -f -- <paths>` は実装されていない。コメント（lines 228–229）に "Best-effort: ignore if a violated file is not in HEAD (e.g. newly created protected file — a pathological but rare scenario)" と記載されており、意図的に best-effort として残している。

影響：新規作成（untracked）の保護ファイル（例：agent が `specrunner/changes/<slug>/request.md` を新規作成した場合）は `git checkout HEAD` が exit 非0で失敗し、ファイルが working tree に残留する。その後 `commitFinalState` の `git add -A` がこのファイルを拾い、checkpoint commit に混入させてリモートブランチへ push される。

TC-021（line 938–959）は「checkout が失敗しても throw は起きる」のみ検証しており、untracked ファイルの worktree 残留を確認していない。修正案（`git status --porcelain` の `??` エントリを `git clean -f -- <paths>` で削除する二段階処理）は未適用。

### Findings #1 / #8 [LOW]: TC-017 vi.doMock がホイスト済み vi.mock を上書きできず stagePaths=[] の不変が未テスト

**Verdict: NOT FIXED**

`tests/unit/step/commit-push-write-scope.test.ts` lines 45–51: ファイル先頭の `vi.mock("../../../src/core/step/round-git-scope.js", ...)` がホイストされ、`pipelineManagedPaths` が3 path を返す。

TC-017（lines 625–650）は `vi.doMock` で `pipelineManagedPaths: () => []` を試みるが、ホイスト済み `vi.mock` は上書きされない。実行時 `stagePaths` は3要素（managed paths 3件すべて `fs.access` mock で存在扱い）を持つ。テストが `not.toContain("commit")` で green になる理由は「`stagePaths.length === 0 → early return`」ではなく「`git diff --cached --quiet` が exit 0（staged changes なし）→ commit スキップ」である。`stagePaths.length === 0 → return` の経路は実際には通っておらず、この不変の機械的保証が欠如している。

### Finding #5 [LOW]: stagePaths.length === 0 の early return が HEAD-advance push-only invariant を迂回する

**Verdict: NOT FIXED**

`commit-push.ts` line 179: `if (stagePaths.length === 0) return;` が残存。`commitAndPushTail` を呼ばないため HEAD advance 検出・push-only パスをスキップする。現在は `pipelineManagedPaths` が常に3要素を返すため到達不能だが、hidden invariant として残る。finding で指摘された依存の明示化（テストまたはコメント）は未実施。

### Finding #7 [LOW]: scoped mode の post-staging git status 失敗 → 残留保護ファイルのサイレントスキップ

**Verdict: NOT FIXED**

`commit-push.ts` lines 193–194: `if (postStatus.ok && postStatus.paths.length > 0)` — `postStatus.ok === false` の場合は残留 violation 復元をサイレントスキップ。guarded mode の pre-staging status 失敗は fail-closed（line 205–208: `throw commitEffectFailedError`）であるのに対し、scoped mode の post-staging 失敗は best-effort スキップで非対称。この挙動に対するテストは追加されていない。コメント（line 192）に "Best-effort" と記載されており、意図的な設計選択として扱われている。

---

## Summary

| Finding | Severity | Fixed? |
|---------|----------|--------|
| #2: commitFinalState が checkpoint commit で違反ファイルをコミット | HIGH | ✅ FIXED |
| #3: pipelineManagedPaths の dual-semantics テスト欠如 | MEDIUM | ✅ FIXED |
| #4: scoped 残留違反が後続 guarded step に誤帰属 | MEDIUM | ✅ FIXED |
| #6: 新規作成違反ファイルが git checkout HEAD で回復不能 | MEDIUM | ❌ NOT FIXED |
| #1/#8: TC-017 vi.doMock がホイスト済み vi.mock を上書きできない | LOW | ❌ NOT FIXED |
| #5: stagePaths=0 early return が HEAD-advance 迂回 | LOW | ❌ NOT FIXED |
| #7: scoped post-staging status 失敗のサイレントスキップ | LOW | ❌ NOT FIXED |
