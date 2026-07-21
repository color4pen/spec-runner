# Cross-Boundary Invariants Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## レビュー対象

- Change: `step-write-scope-enforcement`
- Reviewer: `cross-boundary-invariants`
- Iteration: 2

## iter 1 からの変更確認

iter 1 の主要 finding（F-01 HIGH / F-03 MEDIUM）への対応を中心に検証した。

| iter 1 finding | 対応状況 |
|---|---|
| F-01 (HIGH): commitFinalState が WRITE_SCOPE_VIOLATION halt 後に違反ファイルをコミットする | `git checkout HEAD -- <violations>` を throw 前に呼ぶことで修正（既存ファイルの場合） |
| F-02 (MEDIUM): pipelineManagedPaths の意味的反転 | TC-022 で包含側（sequential）の挙動を regression pin として固定。非対称は設計文書化された |
| F-03 (MEDIUM): scoped step の残留汚染が後続 guarded step で誤帰属 halt を起こす | scoped staging 後に `getWorktreeChangedPaths` + `git checkout HEAD -- <residuals>` を追加して修正（既存ファイルの場合） |
| F-04 (LOW): stagePaths.length===0 early return が HEAD-advance 検出を迂回 | 未修正（実質非到達のため意図的残存） |
| F-001 (LOW): TC-017 の vi.doMock が vi.mock を上書きできない | 未修正（非ブロッキング as noted in review-feedback-001） |

## 実測確認

### guarded mode の修正機構（F-01 対応）

`commit-push.ts:216-231`:

```ts
// Restore violated paths to HEAD state before throwing.
// commitFinalState (checkpoint path) runs after every awaiting-resume exit...
// Without this restore, the violation content (e.g. agent-modified request.md)
// would leak into the remote branch via the checkpoint commit.
await gitExecResult(infra.spawnFn, cwd, ["checkout", "HEAD", "--", ...violations]);
throw writeScopeViolationError(step.name, branch, violations);
```

- `gitExecResult` の戻り値はチェックされず、checkout 失敗でも throw は必ず起きる ✓（fail-closed 維持）
- 既存ファイル（HEAD に存在）の場合: working tree と index が HEAD に戻り、`commitFinalState` の `git add -A` で差分なし → commit に含まれない ✓
- **新規作成ファイル（HEAD に不在）の場合**: `git checkout HEAD -- <newfile>` が失敗（pathspec not found）→ ファイルが working tree に残留 → `commitFinalState` が `git add -A` でステージ → checkpoint commit に含まれる ✗

TC-021 `tests/unit/step/commit-push-write-scope.test.ts:845-959`:
- "WRITE_SCOPE_VIOLATION always thrown even when git checkout fails" → throw は保証される ✓
- `commitFinalState` を呼んで違反ファイルが commit されないことを検証するテストは**なし**

### scoped mode の残留汚染対策（F-03 対応）

`commit-push.ts:187-199`:

```ts
const postStatus = await getWorktreeChangedPaths(infra.spawnFn, cwd);
if (postStatus.ok && postStatus.paths.length > 0) {
  const residualViolations = findWriteScopeViolations(step.name, slug, postStatus.paths, filePaths);
  if (residualViolations.length > 0) {
    await gitExecResult(infra.spawnFn, cwd, ["checkout", "HEAD", "--", ...residualViolations]);
  }
}
```

- `postStatus.ok === false` の場合: `if` ブロックをスキップ → 残留違反ファイルはそのまま → 次の guarded step が `git status` で検出して誤帰属 halt ✗
- guarded mode の pre-staging 失敗 → fail-closed halt と非対称
- 新規作成ファイルの場合: `git checkout HEAD -- <newfile>` 失敗 → 残留 → 誤帰属（同上）

TC-023 `tests/unit/step/commit-push-write-scope.test.ts:1059-1186`:
- "calls git checkout HEAD for request.md that was changed but excluded from scoped staging" → 既存ファイルの cleanup を確認 ✓
- `postStatus.ok === false` (git status 失敗) のシナリオはテストなし

### TC-017 の意図不整合（iter 1 F-001 継続）

`tests/unit/step/commit-push-write-scope.test.ts:625-650`:

```ts
describe("TC-017: scoped mode — empty stagePaths → no-op", () => {
  it("no git add is called when writes() is empty (stagePaths = [])", async () => {
    vi.doMock("../../../src/core/step/round-git-scope.js", () => ({
      pipelineManagedPaths: () => [],
    }));
```

`vi.doMock` はファイル先頭の `vi.mock`（ホイスト済み）を上書きしない。実行時 `pipelineManagedPaths` は依然 3 path を返す。TC-017 は "commit が呼ばれない理由" を誤認したまま green（diff mock が exit 0 を返すため）。`stagePaths.length === 0 → return` の不変は直接テストされていない。

### pipelineManagedPaths 非対称（F-02 対応確認）

TC-022 `commit-push-write-scope.test.ts:962-1043`:
- "state.json, events.jsonl, usage.json appear in git add pathspec even when not in writes()" → sequential scoped の包含を直接 assert ✓
- parallel round の `partitionRoundChanges` では除外（`offending` 計算で除外）→ 非対称は設計文書化かつ TC-022 で固定 ✓

## Findings

### F-001: 新規作成違反ファイルが checkpoint commit に混入する（MEDIUM）

**根拠**:

`git checkout HEAD -- <file>` はファイルが HEAD（最終 commit）に存在しない場合に失敗する。guarded step（implementer 等）が新規に保護パスを作成した場合（例: `specrunner/changes/<slug>/code-review-result-002.md`）:

1. `findWriteScopeViolations` → 新規ファイルは judge artifact 判定 → 違反検出 → throw は正しく起きる（halt 確定 ✓）
2. `git checkout HEAD -- <newfile>` → 失敗（exit 非 0、`gitExecResult` の戻りは未チェック）
3. ファイルが working tree に残留
4. `pipeline.ts:596` → `commitFinalState` 発火 → `git add -A` → 新規ファイルをステージ → checkpoint commit に含まれる

WRITE_SCOPE_VIOLATION halt は正しく起きる（pipeline は止まる）が、違反内容（新規作成ファイル）がリモートブランチの checkpoint commit に混入する。既存ファイルの修正（最も一般的な攻撃面）は iter 1 修正で防がれているが、新規作成ファイルは防げない。

**影響**: 悪意を持った/誤動作した agent が新規の result ファイルを作成 → checkpoint commit に混入 → branch にプッシュ。

**修正案**:
- Option A: `git checkout HEAD -- <newfile>` 失敗時に `git clean -f -- <violations>` で新規ファイルを削除（新規作成 = untracked → `git checkout HEAD` ではなく `git clean -f` が正しいコマンド）
- Option B: violations を tracked（`git checkout HEAD`）と untracked（`git clean -f`）に分類して各々処理

---

### F-002: scoped mode の post-staging git status 失敗 → 残留汚染のサイレントスキップ（LOW）

**根拠**:

```ts
const postStatus = await getWorktreeChangedPaths(infra.spawnFn, cwd);
if (postStatus.ok && postStatus.paths.length > 0) {  // ok:false でスキップ
```

scoped staging 後の `git status` が失敗（`ok: false`）すると cleanup ブロックがスキップされ、汚染ファイルが working tree に残る。次の guarded step の `git status` がそれを検出し、当該 step への誤帰属 WRITE_SCOPE_VIOLATION halt が発生する。

guarded mode の pre-staging 失敗は fail-closed（halt）なのに対し、scoped mode の post-staging 失敗はサイレントスキップで非対称。

テストなし。

---

### F-003: TC-017 のテスト意図と実行パスの不一致（LOW）

**根拠**:

TC-017 は「stagePaths が空のとき git add が呼ばれない」を検証する意図だが、`vi.doMock` がファイル先頭の `vi.mock` を上書きしないため `pipelineManagedPaths` は常に 3 path を返す。テストが green になる実際の理由は「git diff mock が exit 0 → hasChanges false → commit スキップ」であり、`stagePaths.length === 0 → return` は経由しない。生産コードは正しいが、不変の機械的な歯が欠如している。

---

## Observations

### O-01: F-01 修正は既存ファイルに対して論理的に正しい（INFO）

`git checkout HEAD -- <existing-file>` が成功した場合、working tree と index がともに HEAD 内容に戻る。その後 `commitFinalState` の `git add -A` は差分なし → checkpoint commit に含まれない。この論理は TC-021（checkout が throw 前に呼ばれる）と TC-CFS-002（diff exit 0 → commit なし）の組み合わせで間接的に検証されている。単一の統合テストはないが、git の基本的な保証（`git add -A` は HEAD と一致するファイルをステージしない）に依拠しており妥当。

### O-02: TC-022 が pipelineManagedPaths の非対称を明示的に固定（INFO）

TC-022 は sequential scoped mode での managed paths の**包含**を直接 assert する。`partitionRoundChanges`（parallel round）では**除外**という非対称が設計ドキュメントと regression pin の両方で固定された。`pipelineManagedPaths` に新エントリが追加された場合、TC-022 が sequential 側でも包含されることを検出する。

### O-03: spec-review.reads() の request.md 追加は validateRequiredInputs に影響する（INFO）

`spec-review.ts:83` の `{ path: requestMdPath(deps.slug) }` は `required` フィールドなし（= required: true）。`validateStepInputs` により request.md 不在で `STEP_INPUT_MISSING` halt。request.md はパイプラインの一次入力として実運用で欠落しない想定であり、net positive。
