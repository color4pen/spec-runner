# Tasks: archive-branch-delete-idempotent

## T-01: `isRemoteRefNotFound` ヘルパーを作成する

- [x] `src/util/git-push.ts` を新規作成する
- [x] `export function isRemoteRefNotFound(stderr: string): boolean` を実装する。`stderr.toLowerCase().includes("remote ref does not exist")` で判定する
- [x] `src/util/__tests__/git-push.test.ts` を新規作成し、以下のケースをカバーする:
  - 空文字列 → `false`
  - `"remote ref does not exist"` を含む文字列 → `true`
  - 大文字混じり (`"Remote Ref Does Not Exist"`) → `true`（case-insensitive）
  - 認証エラーメッセージ（`"Authentication failed"` 等） → `false`

**Acceptance Criteria**:
- `src/util/git-push.ts` が存在し、`isRemoteRefNotFound` がエクスポートされている
- 単体テストがすべて pass する

---

## T-02: archive orchestrator の remote branch 削除を冪等にする

対象: `src/core/archive/orchestrator.ts:308-311`

- [x] `isRemoteRefNotFound` を `../../util/git-push.js` からインポートする
- [x] `remoteDelResult.exitCode !== 0` の判定を `remoteDelResult.exitCode !== 0 && !isRemoteRefNotFound(remoteDelResult.stderr)` に変更する

変更前:
```ts
const remoteDelResult = await spawn("git", ["push", "origin", "--delete", branch], { cwd });
if (remoteDelResult.exitCode !== 0) {
  stderrWrite(`Warning: failed to delete remote branch ${branch}.`);
}
```

変更後:
```ts
const remoteDelResult = await spawn("git", ["push", "origin", "--delete", branch], { cwd });
if (remoteDelResult.exitCode !== 0 && !isRemoteRefNotFound(remoteDelResult.stderr)) {
  stderrWrite(`Warning: failed to delete remote branch ${branch}.`);
}
```

**Acceptance Criteria**:
- `isRemoteRefNotFound` が参照されている
- 条件式が `exitCode !== 0 && !isRemoteRefNotFound(...)` になっている

---

## T-03: cancel runner の remote branch 削除を冪等にする

対象: `src/core/cancel/runner.ts:192-194`

- [x] `isRemoteRefNotFound` を `../../util/git-push.js` からインポートする
- [x] `remoteResult.exitCode !== 0` の判定を `remoteResult.exitCode !== 0 && !isRemoteRefNotFound(remoteResult.stderr)` に変更する

変更前:
```ts
const remoteResult = await spawn("git", ["push", "origin", "--delete", branch], { cwd: repoRoot });
if (remoteResult.exitCode !== 0) {
  warnings.push(`Warning: failed to delete remote branch '${branch}': ${remoteResult.stderr.trim()}`);
}
```

変更後:
```ts
const remoteResult = await spawn("git", ["push", "origin", "--delete", branch], { cwd: repoRoot });
if (remoteResult.exitCode !== 0 && !isRemoteRefNotFound(remoteResult.stderr)) {
  warnings.push(`Warning: failed to delete remote branch '${branch}': ${remoteResult.stderr.trim()}`);
}
```

**Acceptance Criteria**:
- `isRemoteRefNotFound` が参照されている
- 条件式が `exitCode !== 0 && !isRemoteRefNotFound(...)` になっている

---

## T-04: archive orchestrator のテストを追加する

対象: `src/core/archive/__tests__/orchestrator.test.ts` に追記する

以下の 3 テストを `describe("archive orchestrator — remote branch deletion idempotency", ...)` ブロックとして追加する:

- [x] **T-branch-01**: remote branch が存在しない（`exitCode !== 0` かつ stderr に `remote ref does not exist`）→ `stderrWrite` が remote branch に関する warning を出力しない
  - `makeSpawn` の代わりに remote push だけ `{ exitCode: 1, stdout: "", stderr: "error: unable to delete 'refs/heads/fix/test': remote ref does not exist" }` を返す spy を用意する
  - `stderrWrite` の呼び出し内容を確認し、`"failed to delete remote branch"` を含む呼び出しがないことを assert する

- [x] **T-branch-02**: remote push が認証エラーで失敗（`exitCode !== 0` かつ stderr に `remote ref does not exist` を含まない）→ warning が出力される
  - remote push だけ `{ exitCode: 128, stdout: "", stderr: "remote: Repository not found." }` を返す spy を用意する
  - `stderrWrite` に `"failed to delete remote branch"` を含む呼び出しがあることを assert する

- [x] **T-branch-03**: remote push が成功（`exitCode === 0`）→ warning が出力されない
  - 全コマンド exitCode 0 の標準 `makeSpawn()` を使う
  - `stderrWrite` に `"failed to delete remote branch"` を含む呼び出しがないことを assert する

**Acceptance Criteria**:
- 3 テストすべてが pass する
- `stderrWrite` のモックが各テストで `mockClear()` されている

---

## T-05: cancel runner のテストを追加する

`src/core/cancel/__tests__/` ディレクトリを作成し、`runner-branch-delete.test.ts` を新規作成する。

cancel runner の branch 削除ロジックは `cleanupJobBranches` 関数（`runner.ts:154` 付近）にある。この関数を直接テストするのは dependencies が多いため、`cleanupJobBranches` が依存する `spawn` と `worktreeManager` を inject して `cancelSingleJob` 経由でテストする。

- [x] test ファイルを作成し、必要な vi.mock を設定する（`JobStateStore`, `loadStateByJobId`, `resolveStateStoreByJobId`, `transitionJob`, `stdoutWrite`, `gracefulKill`, `createTransportAuth` 等）
- [x] **T-cancel-branch-01**: remote branch が存在しない → `result.warnings` に remote branch の warning が含まれない
  - remote push に `{ exitCode: 1, stderr: "error: unable to delete 'refs/heads/fix/test': remote ref does not exist" }` を返す spawn spy
  - `result.warnings` の内容を確認する

- [x] **T-cancel-branch-02**: remote push が認証エラー → `result.warnings` に warning が含まれる
  - remote push に `{ exitCode: 128, stderr: "remote: Repository not found." }` を返す spawn spy

- [x] **T-cancel-branch-03**: remote push が成功 → `result.warnings` に remote branch の warning が含まれない
  - 全コマンド exitCode 0 の spawn spy

**Acceptance Criteria**:
- 3 テストすべてが pass する

---

## T-06: `typecheck && test` を green にする

- [x] `bun run typecheck` が 0 で終了する
- [x] `bun run test` が 0 で終了する

**Acceptance Criteria**:
- 両コマンドが正常終了する
