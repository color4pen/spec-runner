# Tasks: pr248-followup-cleanup

## Task 1: Delete `src/core/gh/pr.ts`

**Files**: `src/core/gh/pr.ts`

- [x] 1.1 ファイル `src/core/gh/pr.ts` を削除する

**Verification**: `grep -r "runGhPrCreate" src/ tests/` で 0 hit。`bun run typecheck` が green。

---

## Task 2: Remove `githubToken` default from `createRuntime`

**Files**: `src/core/runtime/factory.ts`, `tests/unit/core/runtime/factory.test.ts`

- [x] 2.1 `src/core/runtime/factory.ts:34` の `githubToken: string = ""` を `githubToken: string` に変更する（`sessionClient?: SessionClient` → `sessionClient: SessionClient | undefined` に合わせて変更）
- [x] 2.2 `tests/unit/core/runtime/factory.test.ts:48` の `createRuntime(buildLocalConfig(), "/repo", githubClient, repo)` に第 5 引数 `undefined`、第 6 引数 `""` を追加する
- [x] 2.3 `tests/unit/core/runtime/factory.test.ts:60` の `createRuntime(config, "/repo", githubClient, repo, sessionClient)` に第 6 引数 `""` を追加する
- [x] 2.4 `tests/unit/core/runtime/factory.test.ts:72` の `createRuntime(config, "/repo", githubClient, repo, sessionClient)` に第 6 引数 `""` を追加する

**Verification**: `bun run typecheck` が green。

---

## Task 3: Remove `githubToken` default from `ManagedRuntime` constructor

**Files**: `src/core/runtime/managed.ts`, `tests/unit/core/runtime/managed.test.ts`

- [x] 3.1 `src/core/runtime/managed.ts:34` の `private readonly githubToken: string = ""` を `private readonly githubToken: string` に変更する（`spawnFn?: SpawnFn` → `spawnFn: SpawnFn | undefined` に合わせて変更）
- [x] 3.2 `tests/unit/core/runtime/managed.test.ts` の `new ManagedRuntime(...)` 呼び出し 5 箇所 (lines 53, 67, 80, 97, 114) に第 5 引数 `undefined`、第 6 引数 `""` を追加する

**Verification**: `bun run typecheck` が green。

---

## Task 4: Update TC-041 description

**Files**: `tests/unit/config/runtime-config.test.ts`

- [x] 4.1 line 344 の describe テキストを `"TC-041: checkConfigComplete always returns null (GitHub token check moved to runPreflight)"` に変更する

**Verification**: テスト名が新挙動を反映していること。`bun run test tests/unit/config/runtime-config.test.ts` が green。

---

## Task 5: Add mode assert to TC-CRED-004

**Files**: `tests/core/credentials/github.test.ts`

- [x] 5.1 TC-CRED-004 (line 78-85) の it ブロック内で `saveCredentials` 呼び出し後、`loadCredentials` の前に以下を追加:
  ```ts
  const stat = await fs.stat(credPath());
  expect(stat.mode & 0o777).toBe(0o600);
  ```

**Verification**: `bun run test tests/core/credentials/github.test.ts` が green。

---

## Task 6: Update `loadCredentials` catch block comment

**Files**: `src/core/credentials/github.ts`

- [x] 6.1 line 58-59 の catch block 内コメント `// Malformed JSON — treat as empty` を以下に変更:
  ```
  // Malformed JSON — return empty so resolveGitHubToken falls through
  // to env-var priority and eventually throws GITHUB_TOKEN_MISSING.
  ```

**Verification**: 動作変更なし。コメント内容が loadCredentials → resolveGitHubToken の意図を説明していること。

---

## Final Verification

- [x] `bun run typecheck` が green
- [x] `bun run test` が green
- [x] `grep -r "runGhPrCreate" src/ tests/` で 0 hit
