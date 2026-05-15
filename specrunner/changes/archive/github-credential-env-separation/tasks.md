# Tasks: github-credential-env-separation

## [x] Task 1: credentials file 基盤（型 + I/O + XDG パス）

### 目的
credentials file の read / write / permission check を提供する基盤を新設する。

### 変更ファイル
- `src/core/credentials/types.ts` — 新規
- `src/core/credentials/github.ts` — 新規
- `src/util/xdg.ts` — 変更

### 実装詳細

1. `src/core/credentials/types.ts` を新規作成:
   ```typescript
   export interface CredentialsFile {
     github?: {
       token: string;
     };
   }
   ```

2. `src/util/xdg.ts` に `getCredentialsPath()` を追加:
   ```typescript
   export function getCredentialsPath(): string {
     return path.join(resolveXdgConfigDir(), "specrunner", "credentials.json");
   }
   ```

3. `src/core/credentials/github.ts` を新規作成。以下の関数を実装:

   - `loadCredentials(): Promise<CredentialsFile>` — credentials file を読んで parse。ENOENT なら `{}` を返す。0600 でなければ stderr に warning（`src/config/store.ts` lines 34-45 の既存パターンを流用）
   - `saveCredentials(creds: CredentialsFile): Promise<void>` — `atomicWriteJson` で 0600 書き込み。既存ファイルがあれば read → merge → write（他 provider key を保持）
   - `resolveGitHubToken(env: Record<string, string | undefined>): Promise<{ token: string; source: "credentials" | "env" }>` — 優先順位: credentials file → `GITHUB_TOKEN` env → error throw（`specrunner login` 案内メッセージ付き `SpecRunnerError`）

### 検証
- `bun run typecheck` pass
- unit test: credentials file 不在時の fallback、env var 優先順位、permission warning 出力

---

## [x] Task 2: config schema から `github` フィールドを削除

### 目的
`SpecRunnerConfig` / `RawConfig` から `github` フィールドを型レベルで削除し、`saveConfig` で strip する。

### 変更ファイル
- `src/config/schema.ts` — 変更
- `src/config/store.ts` — 変更

### 実装詳細

1. `src/config/schema.ts`:
   - `GithubConfig` interface を削除
   - `SpecRunnerConfig` から `github?: GithubConfig` を削除
   - `RawConfig` から `github?: Partial<GithubConfig>` を削除
   - `checkConfigComplete` から `github.accessToken` チェックを削除（関数本体は `return null;` のみにする。GitHub token チェックは Task 5 で `runPreflight` に移行する）

2. `src/config/store.ts`:
   - `saveConfig` の legacy field strip に `delete toSave["github"]` を追加（line 98 の `delete toSave["anthropic"]` の直後）
   - lines 34-45 の loose permission warning ブロックを削除（config に secret が無くなるため不要）

### 検証
- `bun run typecheck` を実行し、`config.github` を参照している全箇所が型エラーとして検出されることを確認（Task 3〜7 で解消する）

---

## [x] Task 3: `specrunner login` の出力先変更

### 目的
`specrunner login` の token 保存先を config から credentials file に変更する。

### 変更ファイル
- `src/cli/login.ts` — 変更

### 実装詳細

1. `import { saveCredentials, loadCredentials } from "../core/credentials/github.js"` を追加
2. `config.github = { ... }` の代入と `await saveConfig(config)` による token 保存を削除
3. 代わりに `saveCredentials` を呼び出して credentials file に書き込む:
   ```typescript
   const creds = await loadCredentials();
   creds.github = { token: result.accessToken };
   await saveCredentials(creds);
   ```
4. config の load/save は維持する（login 時に config scaffold を作るロジックは残す。ただし `config.github` 代入は行わない）

### 検証
- `bun run typecheck` pass
- 手動確認: `specrunner login` 後に `~/.config/specrunner/credentials.json` が 0600 で作成され、`config.json` に `github` フィールドが無い

---

## [x] Task 4: CLI entry 層の token 注入（系統 B: createGitHubClient）

### 目的
`createGitHubClient` の呼び出し元で `config.github?.accessToken` を token resolver 出力に置き換える。

### 変更ファイル
- `src/cli/run.ts` — 変更
- `src/cli/bootstrap.ts` — 変更
- `src/cli/doctor.ts` — 変更

### 実装詳細

1. **`src/cli/run.ts`** (line 45):
   - `import { resolveGitHubToken } from "../core/credentials/github.js"` を追加
   - `const { token: githubToken } = await resolveGitHubToken(process.env as Record<string, string | undefined>);` を preflight 後に実行
   - `createGitHubClient(fetch, config.github?.accessToken ?? "")` → `createGitHubClient(fetch, githubToken)` に変更
   - resolved token を `createRuntime` にも渡す（Task 6 の ManagedAgentRunner 用）

2. **`src/cli/bootstrap.ts`** (line 32):
   - 同パターンで resolver を呼び、`createGitHubClient(fetch, githubToken)` に変更

3. **`src/cli/doctor.ts`** (lines 90-97):
   - `resolveGitHubToken` を try/catch で呼ぶ（doctor は credential 不在でも動作継続する必要がある）
   - 解決できた場合は `githubClient` に token を渡す、できなければ空文字列
   - `DoctorContext` に `resolvedGitHubToken: string | null` を追加（Task 8 で doctor checks が使う）

### 検証
- `bun run typecheck` pass

---

## [x] Task 5: preflight の GitHub token チェック追加

### 目的
`checkRuntimePrereqs` と `runPreflight` を更新し、GitHub token の取得可能性を両 runtime 共通でチェックする。

### 変更ファイル
- `src/core/preflight.ts` — 変更

### 実装詳細

1. `checkRuntimePrereqs` を拡張（または `runPreflight` 内に新チェックを追加）:
   - `resolveGitHubToken` を呼び、token が取得できなければ `{ field: "GITHUB_TOKEN", hint: "Run 'specrunner login' first, or set GITHUB_TOKEN env var." }` を返す
   - このチェックは `cfg.runtime !== "managed"` ガードの **前** に配置（両 runtime 共通）
   - **注意**: `resolveGitHubToken` は async（file I/O）なので、`checkRuntimePrereqs` を async にするか、`runPreflight` 内で直接呼ぶかは実装者判断。既存の `checkRuntimePrereqs` が sync（`{ field, hint } | null` を返す）なので、`runPreflight` 内に別チェックとして追加する方が影響が小さい

2. `PreflightResult` に `githubToken: string` を追加し、下流（Task 4 の `run.ts`）で再利用可能にする

### 検証
- `bun run typecheck` pass
- credentials file 無し + env var 無しで `runPreflight` が適切なエラーを throw することを確認

---

## [x] Task 6: ManagedAgentRunner へのコンストラクタ注入（系統 B: managed runtime）

### 目的
`ManagedAgentRunner` が `config.github!.accessToken` を直参照する 3 箇所をコンストラクタ注入に置き換える。

### 変更ファイル
- `src/adapter/managed-agent/agent-runner.ts` — 変更
- `src/core/runtime/index.ts` — 変更

### 実装詳細

1. `ManagedAgentRunner` のコンストラクタに `githubToken: string` パラメータを追加:
   - private field `private readonly githubToken: string` を宣言
   - lines 140, 381, 413 の `config.github!.accessToken` を `this.githubToken` に置き換え

2. `src/core/runtime/index.ts` の `createRuntime` に `githubToken: string` 引数を追加し、`ManagedAgentRunner` のコンストラクタに relay する

3. Task 4 の CLI entry 層変更と合わせて、`run.ts` / `bootstrap.ts` から `createRuntime(config, cwd, githubClient, repo, sessionClient, githubToken)` を呼ぶ

### 検証
- `bun run typecheck` pass
- 既存の ManagedAgentRunner テストが `githubToken` パラメータ追加に対応していることを確認

---

## [x] Task 7: `spawnCommand` の env merge 戦略変更 + `gh` CLI への token 注入（系統 A）

### 目的
`gh` CLI subprocess に `GITHUB_TOKEN` env var を inject し、`specrunner login` だけで `gh` 経由の操作を動作させる。

### 変更ファイル
- `src/util/spawn.ts` — 変更
- `src/core/gh/pr.ts` — 変更
- `src/core/pr-create/runner.ts` — 変更
- `src/core/finish/orchestrator.ts` — 変更
- `src/core/finish/spawn-helper.ts` — 変更
- `src/core/finish/pr-status.ts` — 変更
- `src/core/finish/resolve-target.ts` — 変更
- `src/cli/finish.ts` — 変更

### 実装詳細

1. **`src/util/spawn.ts`** line 44:
   - `env: opts.env ?? process.env as Record<string, string>` を `env: opts.env ? { ...process.env, ...opts.env } as Record<string, string> : process.env as Record<string, string>` に変更
   - これにより `opts.env` は system env の上書き分だけ渡せばよくなる

2. **`gh` spawn の token 注入**:
   全ての `gh` spawn 箇所で opts に `env: { GITHUB_TOKEN: githubToken }` を渡す。具体的な注入方法は以下:

   a. **`src/core/gh/pr.ts`**: `GhPrCreateInput` に `githubToken?: string` を追加。spawn の opts に `env: input.githubToken ? { GITHUB_TOKEN: input.githubToken } : undefined` を渡す

   b. **`src/core/pr-create/runner.ts`**: `PrCreateInput` に `githubToken?: string` を追加。内部 spawn に同様に渡す

   c. **`src/core/finish/orchestrator.ts`**: `FinishInput` に `githubToken?: string` を追加。orchestrator 内の `gh` spawn（`spawnOrEscalate` / 直接 `spawn`）に env を渡す

   d. **`src/core/finish/spawn-helper.ts`**: `spawnOrEscalate` に `env?: Record<string, string | undefined>` を追加。spawn opts に relay する

   e. **`src/core/finish/pr-status.ts`**: `fetchPrViewWithRetry` / `pollMergeStateAfterPush` / `checkMergeableForMerge` に `env` パラメータ追加。spawn opts に relay する

   f. **`src/core/finish/resolve-target.ts`**: `--pr` 解決の `gh pr view` spawn に env を渡す

   g. **`src/cli/finish.ts`**: token resolver で解決した token を `FinishInput.githubToken` に渡す

### 検証
- `bun run typecheck` pass
- `bun run test` pass（既存テストの spawn mock は env を無視するため影響なし。新規テストで env 注入を検証）

---

## [x] Task 8: doctor checks の更新 + `gh` バイナリチェック新設

### 目的
doctor checks を credentials file ベースに移行し、`gh` バイナリ存在チェックを追加する。

### 変更ファイル
- `src/core/doctor/types.ts` — 変更
- `src/core/doctor/checks/config/github-token-present.ts` — 変更
- `src/core/doctor/checks/auth/github-token-valid.ts` — 変更
- `src/core/doctor/checks/runtime/gh-cli.ts` — 新規
- `src/core/doctor/checks/index.ts` — 変更

### 実装詳細

1. **`src/core/doctor/types.ts`**: `DoctorContext` に `resolvedGitHubToken: string | null` を追加

2. **`github-token-present.ts`**:
   - `ctx.config.get("github.accessToken")` → `ctx.resolvedGitHubToken` を参照
   - pass 条件: `resolvedGitHubToken` が non-null かつ non-empty
   - fail message: `"GitHub token not found in credentials file or GITHUB_TOKEN env var"`
   - hint: `"Run 'specrunner login' to authenticate with GitHub."`

3. **`github-token-valid.ts`**:
   - `ctx.config.get("github.accessToken")` → `ctx.resolvedGitHubToken` を参照
   - token が無ければ early return fail（token-present と同じメッセージ）
   - API 疎通ロジックは既存のまま維持

4. **`gh-cli.ts`** を新規作成:
   ```typescript
   export const ghCliPresentCheck: DoctorCheck = {
     name: "gh-cli-present",
     category: "runtime",
     required: true,
     async check(ctx: DoctorContext) {
       // ctx.execFile("which", ["gh"]) or similar
       // pass: gh found, fail: gh not found
     },
   };
   ```

5. **`index.ts`**: `commonChecks` に `ghCliPresentCheck` を runtime セクションに追加

### 検証
- `bun run typecheck` pass
- `bun run test` pass

---

## [x] Task 9: テスト更新 + 統合検証

### 目的
型エラーで検出された既存テストの修正と、新規機能のテスト追加。

### 変更ファイル
- `tests/credentials-github.test.ts` — 新規
- `tests/doctor-gh-cli.test.ts` — 新規
- 既存テストで `config.github` を参照しているファイル — 変更

### 実装詳細

1. **新規テスト `tests/credentials-github.test.ts`**:
   - `loadCredentials`: file 不在 → `{}`、valid JSON → parse、permission warning
   - `saveCredentials`: 新規作成、既存 file の merge（他 provider key 保持）
   - `resolveGitHubToken`: credentials file 優先、env fallback、両方無しで error

2. **新規テスト `tests/doctor-gh-cli.test.ts`**:
   - `gh` found → pass、not found → fail

3. **既存テスト修正**:
   - `config.github` を設定している箇所を削除 or token resolver モックに置き換え
   - `ManagedAgentRunner` テストに `githubToken` コンストラクタ引数追加
   - finish orchestrator テストは spawn mock で env 引数を受け取れるよう更新

### 検証
- `bun run typecheck && bun run test` が green

---

## Dependency Graph

```
Task 1 (credentials 基盤)
  ├─► Task 2 (config schema 削除) ── 型エラー発生
  │     ├─► Task 3 (login 出力先変更)
  │     ├─► Task 4 (CLI entry 層 token 注入)
  │     ├─► Task 5 (preflight チェック)
  │     ├─► Task 6 (ManagedAgentRunner 注入)
  │     └─► Task 8 (doctor checks)
  └─► Task 7 (spawn env merge + gh 注入) ── Task 2 と独立で着手可能
        └─► Task 9 (テスト)
```

Task 1 → Task 2 は順序必須（型が必要）。Task 3〜8 は Task 2 の型エラーを解消する作業として並行可能だが、typecheck が通るのは全て完了した時点。Task 9 は最後。
