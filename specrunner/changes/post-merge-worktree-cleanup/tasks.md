# Tasks: post-merge-worktree-cleanup

## T-01: merge-then-archive.ts の worktreePath 解決をフォールバック付きに変更

`src/core/archive/merge-then-archive.ts` の Step 1（state load ブロック）を修正する。

- [ ] `orchestrator.ts` から `resolveWorktreePathForArchive` を named import に追加する
  （既存の `runArchiveOrchestrator` と同じ import 文に追記）
- [ ] Step 1 の `worktreePath = state.worktreePath ?? null;`（現 151 行目付近）を
  `worktreePath = await resolveWorktreePathForArchive(state, cwd);` に置き換える
- [ ] `worktreePath` の型が `string | null` のままであることを確認する（`resolveWorktreePathForArchive` の戻り値と一致）

**Acceptance Criteria**:
- `state.worktreePath` が null / undefined の local ジョブで `job archive --with-merge` を実行したとき、
  liveness sidecar または規約パスから worktreePath が解決され `runPostMergeCleanup` に渡される
- typecheck / lint / build がエラーなしで通る

---

## T-02: post-merge-cleanup.ts に worktreePath 未解決時の警告を追加

`src/core/archive/post-merge-cleanup.ts` の worktree 削除ブロックを修正する。

- [ ] `if (worktreePath && !noWorktree)` ブロックの `else` 節を追加する。
  条件：`!noWorktree`（worktree モード）かつ `!worktreePath`（解決失敗）のとき
- [ ] `else` 節で `stderrWrite` を使い以下のメッセージを出力する：
  ```
  Warning: worktree path could not be resolved for <slug>. Worktree may remain on disk.
  Run 'git worktree list' to check and 'git worktree prune' to clean up if needed.
  ```
  `<slug>` は `input.slug` の実値に置き換える
- [ ] `--no-worktree` モード（`noWorktree === true`）では警告を出さない

**Acceptance Criteria**:
- `worktreePath: null`, `noWorktree: false` で `runPostMergeCleanup` を呼ぶと警告が stderr に出る
- `worktreePath: null`, `noWorktree: true` では警告が出ない

---

## T-03: post-merge-cleanup.ts の単体テストを新規作成

`tests/unit/core/archive/post-merge-cleanup.test.ts` を新規作成する。

- [ ] `runPostMergeCleanup` を直接 import して単体テストを書く（モジュールモックなし）
- [ ] `WorktreeManager` は injectable な `worktreeManagerFn` 経由で差し替える（`vi.fn()` ファクトリ）
- [ ] `spawn` は `vi.fn()` で全コマンド `exitCode: 0` を返すモックを使う
- [ ] `fs` は `unlink` / `rm` が `vi.fn()` のモックオブジェクトを使う
- [ ] `process.stderr.write` を `vi.spyOn` してモックし、警告メッセージの検証に使う

実装するテストケース：

**TC-PMC-001: worktreePath=null, noWorktree=false → 警告が出る、worktree 削除は呼ばれない**
- Given: `worktreePath: null`, `noWorktree: false`
- When: `runPostMergeCleanup` を呼ぶ
- Then: `stderrWrite` 相当（`process.stderr.write`）に worktree path 未解決の警告メッセージが含まれる
- Then: `worktreeManagerFn` から返した `manager.remove` は呼ばれない

**TC-PMC-002: worktreePath set, noWorktree=false → worktree 削除が呼ばれる、警告は出ない**
- Given: `worktreePath: "/tmp/wt/my-slug-abc12345"`, `noWorktree: false`
- When: `runPostMergeCleanup` を呼ぶ
- Then: `manager.remove` が `worktreePath` と `cwd` で呼ばれる
- Then: worktree 未解決警告は stderr に出ない

**TC-PMC-003: worktreePath=null, noWorktree=true → 警告なし、worktree 削除なし**
- Given: `worktreePath: null`, `noWorktree: true`
- When: `runPostMergeCleanup` を呼ぶ
- Then: `manager.remove` は呼ばれない
- Then: worktree 未解決警告は stderr に出ない（`--no-worktree` モードは警告対象外）

**Acceptance Criteria**:
- 全 3 ケースが vitest で green
- typecheck / lint / build がエラーなしで通る

---

## T-04: merge-then-archive.test.ts にフォールバック解決のテストを追加

既存の `tests/unit/core/archive/merge-then-archive.test.ts` を修正する。

- [ ] `vi.mock("...orchestrator.js", () => ({...}))` の factory に `resolveWorktreePathForArchive: vi.fn()` を追加する
  デフォルト戻り値は `Promise.resolve(null)` とする（既存テストのデフォルト `worktreePath: null` 相当を維持）
- [ ] 既存テストで `state.worktreePath` が null でも `runPostMergeCleanup` への引数として `null` が来ることを
  想定しているケースは、`resolveWorktreePathForArchive` が `null` を返すよう各テスト内でセットする
  （`beforeEach` で `resolveWorktreePathForArchive` のデフォルト戻り値を `null` にしておけば無変更で済む）

追加テストケース：

**TC-MTA-WORKTREE-FALLBACK: state.worktreePath=null でも sidecar 解決済みパスが cleanup に渡る**
- Given: `state.worktreePath: null`
- Given: `resolveWorktreePathForArchive` が `"/resolved/path/my-slug-abc12345"` を返すようにモック
- Given: PR が OPEN、checks success → merge 成功
- When: `runMergeThenArchive` を呼ぶ
- Then: `runPostMergeCleanup` が `worktreePath: "/resolved/path/my-slug-abc12345"` で呼ばれる
- Then: `exitCode: 0` が返る

**Acceptance Criteria**:
- TC-MTA-WORKTREE-FALLBACK が vitest で green
- 既存の TC-014 / TC-MTA-001〜013 / TC-MTA-ARCHIVE-SHA 等が引き続き green（既存テスト無変更で通ること）
- typecheck / lint / build がエラーなしで通る
