# Regression Gate Result — Iteration 2

## Ledger Verification (8 findings)

### F-001 [LOW] TC-017: vi.doMock 上書き不可 → stagePaths=[] 不変未テスト（2件）

**対象ファイル**: `tests/unit/step/commit-push-write-scope.test.ts:625`

**検証結果**: FIXED（修正済み、回帰なし）

**根拠**:
- TC-017 は `vi.doMock` を廃止し、`vi.mocked(fs.access).mockRejectedValue(new Error("does not exist"))` に変更。
- `commit-push.ts` が `filterExistingFiles` 内で `fsAccess` を呼ぶため、モック拒否で `existingManaged = []` となり `stagePaths = []` が成立する。
- `afterEach` に `vi.mocked(fs.access).mockResolvedValue(undefined)` のリセットが追加され、後続テストへの汚染を防止。
- テストは `git add` が呼ばれないことと `git commit` が呼ばれないことを直接アサート。
- `stagePaths.length === 0` の early-return 経路を通過後も `commitAndPushTail` が呼ばれ（git add は呼ばれない）、diff exitCode 0 で commitAndPushTail は no-op となる。経路が実際に通っていることが確認できる。

---

### F-002 [HIGH] commitFinalState が WRITE_SCOPE_VIOLATION halt 後に違反ファイルをコミット

**対象ファイル**: `src/core/pipeline/pipeline.ts:596`

**検証結果**: FIXED（修正済み、回帰なし）

**根拠**:
- `commitAndPush` の guarded モードで、`violations.length > 0` 検出後に二段階リストアを実施してから throw する実装を確認（commit-push.ts:239-242）:
  ```
  await gitExecResult(infra.spawnFn, cwd, ["clean", "-f", "--", ...violations]);
  await gitExecResult(infra.spawnFn, cwd, ["checkout", "HEAD", "--", ...violations]);
  throw writeScopeViolationError(step.name, branch, violations);
  ```
- `commitFinalState` JSDoc に「guarded-mode commitAndPush has already restored violated files to their HEAD state via git checkout HEAD before throwing — so this git add -A does not pick up any violation content」を明記。
- `pipeline.ts:596-598` の `commitFinalState` 呼び出しは変更なし（待避済み前提で git add -A の副作用が消える）。
- TC-021（`git checkout HEAD` が throw 前に呼ばれることを検証）が回帰ガードを提供。

---

### F-003 [MEDIUM] pipelineManagedPaths が sequential scoped と parallel round で意味的に反転

**対象ファイル**: `src/core/step/round-git-scope.ts`

**検証結果**: ADDRESSED（テストによる回帰ガード追加済み、回帰なし）

**根拠**:
- TC-022 が `pipelineManagedPaths` の 3 パス（state.json / events.jsonl / usage.json）を scoped staging の `git add` pathspec に**含む**という不変をアサート。
- テスト冒頭コメントに意味的反転の事実を明記：
  ```
  // Regression guard for pipelineManagedPaths dual-semantics:
  //   - parallel round (partitionRoundChanges): managed paths are EXCLUDED from staging.
  //   - sequential scoped (commitAndPush): managed paths are INCLUDED in staging.
  ```
- 根本的な dual-semantics は設計上の意図（並列 round は coordinator owned scoped staging、sequential scoped は管理パス包含）であり、TC-022 が将来の定義変更を表面化させる。

---

### F-004 [MEDIUM] scoped step 残存違反ファイルが後続 guarded step の誤帰属 WRITE_SCOPE_VIOLATION を引き起こす

**対象ファイル**: `src/core/step/commit-push.ts`

**検証結果**: FIXED（修正済み、回帰なし）

**根拠**:
- scoped モードの staging 後、`getWorktreeChangedPaths` を呼び出してワークツリー残存変更を確認（commit-push.ts:204）。
- `findWriteScopeViolations` で step 宣言 writes 外の保護パスを検出し、二段階リストアを実施（commit-push.ts:207-210）:
  ```
  await gitExecResult(infra.spawnFn, cwd, ["clean", "-f", "--", ...residualViolations]);
  await gitExecResult(infra.spawnFn, cwd, ["checkout", "HEAD", "--", ...residualViolations]);
  ```
- TC-023 が「spec-review が request.md を変更 → scoped staging で除外 → checkout HEAD で回復」シナリオを検証。
- 非対称性（guarded: fail-closed / scoped post: best-effort）は意図的設計として JSDoc とテストコメントに明記。

---

### F-005 [LOW] stagePaths.length === 0 の early return が HEAD-advance push-only 不変を迂回

**対象ファイル**: `src/core/step/commit-push.ts:155`

**検証結果**: FIXED（修正済み、回帰なし）

**根拠**:
- `stagePaths.length === 0` の場合、git add は呼ばない（`if (stagePaths.length > 0) { ... }` ブロックをスキップ）が、scoped モードの `if` ブロック全体を出た後、scoped/guarded 共通の `commitAndPushTail` が無条件に呼ばれる（commit-push.ts:253）。
- `commitAndPushTail` が `git diff --cached --quiet` → HEAD-advance 検出 → push-only を担う。
- TC-017 のテストで `commitAndPush` が reject なしに resolve することを確認（`git diff` exitCode 0 → no-op、HEAD-advance なし → return）。

---

### F-006 [MEDIUM] 新規作成違反ファイルが git checkout HEAD で回復不能 → commitFinalState が checkpoint commit に混入

**対象ファイル**: `src/core/step/commit-push.ts:229`

**検証結果**: FIXED（修正済み、回帰なし）

**根拠**:
- 二段階リストアで `git clean -f` を先行させ、untracked (新規作成) ファイルを削除してから `git checkout HEAD` を実行（commit-push.ts:240-241）。
- `git checkout HEAD` が exit 非 0 を返しても throw は確実に実行される（ベストエフォート）。
- TC-021 に「untracked (new) violation file is removed with git clean -f before git checkout HEAD」テストを追加（`?? request.md` → clean 呼び出し確認 → WRITE_SCOPE_VIOLATION throw 確認）。

---

### F-007 [LOW] scoped mode の post-staging git status 失敗 → 残留保護ファイルのサイレントスキップ

**対象ファイル**: `src/core/step/commit-push.ts:193`

**検証結果**: ADDRESSED（意図的設計、テスト追加済み、回帰なし）

**根拠**:
- `postStatus.ok === false` のときは残存リストアを silently skip する設計を維持（commit-push.ts:205: `if (postStatus.ok && postStatus.paths.length > 0)`）。
- JSDoc に「Asymmetry note: postStatus.ok===false → skip silently (best-effort). Scoped restoration is defensive (prevents cross-step false positives), not safety-critical. Guarded mode is the hard enforcement gate (fail-closed).」を明記。
- TC-023 の "git status failure after staging is silently skipped (best-effort asymmetry)" テストで asymmetry が仕様として固定されている。

---

### F-008 [LOW] TC-017 第2インスタンス（F-001 と同根）

**対象ファイル**: `tests/unit/step/commit-push-write-scope.test.ts:625`

**検証結果**: FIXED（F-001 と同一修正、回帰なし）

**根拠**: F-001 参照。同一テスト箇所への修正で両インスタンスが解消。

---

## サマリー

| 番号 | 重篤度 | 状態 |
|------|--------|------|
| F-001 | LOW | FIXED |
| F-002 | HIGH | FIXED |
| F-003 | MEDIUM | ADDRESSED |
| F-004 | MEDIUM | FIXED |
| F-005 | LOW | FIXED |
| F-006 | MEDIUM | FIXED |
| F-007 | LOW | ADDRESSED |
| F-008 | LOW | FIXED |

回帰なし。全 8 件が現コードで修正済みまたは意図的設計として固定。
