# Tasks: resume-draft-path-fix

## Task 1: [x] `resolveRequestPath` 関数を新規作成する

**File**: `src/core/resume/resolve-request-path.ts`（新規）

純粋関数 `resolveRequestPath(statePath, slug, worktreePath, cwd)` を実装する。

- `statePath` が `/specrunner/drafts/` を含まない場合 → `statePath` をそのまま返す
- `/specrunner/drafts/` を含む場合:
  1. `worktreePath` が truthy かつ `<worktreePath>/specrunner/changes/<slug>/request.md` が存在 → そのパスを返す
  2. `<cwd>/specrunner/changes/<slug>/request.md` が存在 → そのパスを返す
  3. いずれも不在 → `statePath` をそのまま返す（呼び出し側で ENOENT）

パス組み立てには `requestMdPath(slug)` （`src/util/paths.ts`）を使用する。
ファイル存在チェックには `fs.existsSync` を使用する（同期で十分）。

## Task 2: [x] `local.ts` の setupWorkspace で `state.request.path` を永続パスに更新する

**File**: `src/core/runtime/local.ts`

`opts.requestFilePath` のコピー処理ブロック内（L208 `fs.cp` の直後、L226 `fs.rm` の前）に以下を追加:

```ts
// Update state.request.path to point to the permanent copy (not the draft)
await updateJobState(jobId, (s) => ({
  ...s,
  request: { ...s.request, path: changeFolderRequestPath },
}));
```

`changeFolderRequestPath` は既にローカル変数として存在する（L206）。`updateJobState` は既にインポート済み。

## Task 3: [x] `managed.ts` の setupWorkspace で `state.request.path` を永続パスに更新する

**File**: `src/core/runtime/managed.ts`

`opts.requestFilePath` のコピー処理ブロック内（L98 `fs.cp` の直後、L116 `fs.rm` の前）に以下を追加:

```ts
// Update state.request.path to point to the permanent copy (not the draft)
await updateJobState(jobId, (s) => ({
  ...s,
  request: { ...s.request, path: changeFolderRequestPath },
}));
```

`changeFolderRequestPath` は既にローカル変数として存在する（L96）。`updateJobState` は既にインポート済み。

## Task 4: [x] `ResumeCommand.prepare()` でパス解決を挿入する

**File**: `src/core/command/resume.ts`

L168-177 の `parseRequestMd` ブロックを修正:

1. `resolveRequestPath` と `getJobSlug` をインポート
2. `parseRequestMd` の前にパスを解決:

```ts
const resolvedSlug = getJobSlug(state);
const resolvedPath = resolveRequestPath(state.request.path, resolvedSlug, state.worktreePath, cwd);
```

3. `parseRequestMd(state.request.path)` → `parseRequestMd(resolvedPath)` に変更
4. エラーメッセージの `state.request.path` → `resolvedPath` に変更

## Task 5: [x] ユニットテストを追加する

**File**: `src/core/resume/resolve-request-path.test.ts`（新規）

以下のケースをカバー:

1. **新規 state（drafts/ を含まないパス）**: 入力パスがそのまま返る
2. **legacy + worktreePath あり（local runtime）**: worktreePath 配下の changes/ パスが返る
3. **legacy + worktreePath null（managed runtime）**: cwd 配下の changes/ パスが返る
4. **legacy + 両方不在（完全 ENOENT）**: 元の statePath がそのまま返る

テストでは `fs.existsSync` の挙動を制御するため、一時ディレクトリに実ファイルを作成する、または mock を使用する。

## Task 6: [x] delta spec を作成する

**File**: `specrunner/changes/resume-draft-path-fix/specs/cli-resume-command/spec.md`

`cli-resume-command` spec に以下の要件を追加:

- `resume` は `state.request.path` が drafts/ 配下を指す legacy state file に対してフォールバック解決を行う
- フォールバック順序: worktreePath 配下 → cwd 配下 → 元パス（ENOENT）
- scenario: local runtime (worktreePath あり) / managed runtime (worktreePath null) / 完全 ENOENT の 3 ケース
