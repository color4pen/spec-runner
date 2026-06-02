# Tasks: github-host-config

## T-01: Precondition check — `resolveGitHubToken` が host 引数を持つことを確認

- [x] `src/core/credentials/github.ts` の `resolveGitHubToken` 関数シグネチャに `host?: string` パラメータが存在することを確認する（`github-token-gh-contract` マージ済みの前提）
- [x] 存在しない場合は実装を中止し、`github-token-gh-contract` が main にマージされるまで待つ旨を報告する

**Acceptance Criteria**:
- `resolveGitHubToken(env, opts?: { host?: string; spawn?: SpawnFn })` のシグネチャが main に存在する
- 本タスクは他の全タスクの前提条件であり、fail 時は以降のタスクを実行しない

## T-02: config schema に `github` セクションを追加

- [x] `src/config/schema.ts` に `GitHubHostConfig` interface を追加: `{ host?: string; apiBaseUrl?: string }`
- [x] `SpecRunnerConfig` に `github?: GitHubHostConfig` フィールドを追加
- [x] `RawConfig` に `github?: Partial<Record<string, unknown>>` を追加
- [x] `validateConfig` に `github` セクションの validation を追加:
  - [x] `github.host`: string, 非空, optional
  - [x] `github.apiBaseUrl`: string, 非空, URL 形式（`https://` prefix）, optional
  - [x] 不正値で `CONFIG_INVALID` を throw

**Acceptance Criteria**:
- `{ "version": 1, "github": { "host": "ghes.example.com" } }` が valid
- `{ "version": 1, "github": { "host": "" } }` が `CONFIG_INVALID`
- `{ "version": 1, "github": { "apiBaseUrl": "not-a-url" } }` が `CONFIG_INVALID`
- `github` セクション未設定でも後方互換（既存 config がそのまま通る）

## T-03: `resolveGitHubApiBaseUrl` ヘルパーを追加

- [x] `src/config/github-host.ts` に `resolveGitHubApiBaseUrl(config: { host?: string; apiBaseUrl?: string } | undefined): string` を実装
- [x] 導出ロジック:
  - `apiBaseUrl` 設定済み → そのまま返す（trailing slash 除去）
  - `host` が `github.com` または未設定 → `https://api.github.com`
  - `host` がそれ以外 → `https://{host}/api/v3`
- [x] `resolveGitHubHost(config: { host?: string } | undefined): string` も export（既定 `github.com`）
- [x] unit test を `src/config/__tests__/github-host.test.ts` に追加

**Acceptance Criteria**:
- `resolveGitHubApiBaseUrl(undefined)` → `https://api.github.com`
- `resolveGitHubApiBaseUrl({ host: "github.com" })` → `https://api.github.com`
- `resolveGitHubApiBaseUrl({ host: "ghes.corp.example.com" })` → `https://ghes.corp.example.com/api/v3`
- `resolveGitHubApiBaseUrl({ apiBaseUrl: "https://custom.proxy/gh/" })` → `https://custom.proxy/gh` (trailing slash 除去)
- `resolveGitHubApiBaseUrl({ host: "ghes.example.com", apiBaseUrl: "https://override/api" })` → `https://override/api`（apiBaseUrl 優先）

## T-04: `GitHubApiClient` に baseUrl を注入

- [x] `GitHubApiClient` constructor に `baseUrl: string` パラメータを追加（`token` の次）
- [x] `this.baseUrl` をインスタンス変数として保持
- [x] adapter 内の `https://api.github.com` 直書き 9 箇所を `${this.baseUrl}` に置換:
  - `verifyBranch`: L131
  - `getRawFile`: L152
  - `verifyTokenScopes`: L205
  - `getRefSha`: L235
  - `verifyPath`: L253
  - `listPullRequests`: L279
  - `createPullRequest`: L311
  - `getPullRequest`: L341
  - `mergePullRequest`: L384
- [x] `createGitHubClient` factory に `baseUrl: string` パラメータを追加し、constructor に渡す

**Acceptance Criteria**:
- `grep -r "api.github.com" src/adapter/github/` の結果が 0 件（コメント除く）
- `GitHubClient` port interface (`src/kernel/github-client.ts`) が変更されていない
- 既存の adapter unit test が green（baseUrl にデフォルト値を渡す）

## T-05: composition-root の配線を更新

- [x] `src/cli/bootstrap.ts`: config から host を解決し、`resolveGitHubApiBaseUrl(config.github)` で baseUrl を取得、`createGitHubClient(fetch, githubToken, baseUrl)` に渡す。`resolveGitHubToken` に `host` を渡す
- [x] `src/cli/run.ts`: 同様に baseUrl と host を渡す
- [x] `src/cli/finish.ts`: 同様に baseUrl と host を渡す
- [x] `src/cli/doctor.ts`: 同様に baseUrl と host を渡す
- [x] `src/cli/command-registry.ts`: 同様に baseUrl と host を渡す
- [x] `src/core/preflight.ts`: `resolveGitHubToken` に host を渡す

**Acceptance Criteria**:
- 全 `createGitHubClient` 呼び出しに baseUrl が渡されている
- 全 `resolveGitHubToken` 呼び出しに host が渡されている
- `bun run typecheck` が green

## T-06: auth URL を host 駆動にする

- [x] `src/auth/constants.ts` の `GITHUB_DEVICE_CODE_URL` / `GITHUB_TOKEN_URL` 定数を削除し、関数に置換:
  - `getDeviceCodeUrl(host: string): string` → `https://{host}/login/device/code`
  - `getTokenUrl(host: string): string` → `https://{host}/login/oauth/access_token`
- [x] `src/auth/github-device.ts` の `requestDeviceCode` / `pollAccessToken` / `runDeviceFlow` に `host` パラメータを追加（既定 `"github.com"`）
- [x] `src/cli/` 内の `runDeviceFlow` 呼び出しに config の host を渡す

**Acceptance Criteria**:
- `grep -r "GITHUB_DEVICE_CODE_URL\|GITHUB_TOKEN_URL" src/` がインポートと定義で 0 件（関数に置換済み）
- `getDeviceCodeUrl("github.com")` → `https://github.com/login/device/code`
- `getDeviceCodeUrl("ghes.corp.example.com")` → `https://ghes.corp.example.com/login/device/code`
- 既存の auth テストが green

## T-07: enterprise token 解決を `resolveGitHubToken` に追加

- [x] `src/core/credentials/github.ts` の `resolveGitHubToken` を修正:
  - host が `github.com`（または未指定）の場合: 既存の `GH_TOKEN` → `GITHUB_TOKEN` 順
  - host が `github.com` 以外の場合: `GH_ENTERPRISE_TOKEN` → `GITHUB_ENTERPRISE_TOKEN` 順
- [x] `gh auth token` subprocess 呼び出しに `--hostname {host}` を追加（host が指定されている場合）
- [x] エラーメッセージに host 情報を含める（「{host} 用の token が見つかりません」）
- [x] `src/core/credentials/__tests__/github.test.ts` に enterprise token のテストケースを追加

**Acceptance Criteria**:
- `resolveGitHubToken(env, { host: "ghes.example.com" })` で `GH_ENTERPRISE_TOKEN` を優先する
- `resolveGitHubToken(env, { host: "github.com" })` で `GH_TOKEN` を優先する（既存動作）
- host 未指定時は既存の `GH_TOKEN` → `GITHUB_TOKEN` 動作を維持（後方互換）
- GHES host で `GH_TOKEN` のみ設定されている場合、token が見つからないエラーになる（B-10）

## T-08: `parseRemoteUrl` を設定 host 対応にする

- [x] `src/git/remote.ts` の `parseRemoteUrl` に optional `host` パラメータを追加（既定 `"github.com"`）
- [x] SSH パターン: `git@{host}:owner/repo.git` に一般化
- [x] HTTPS パターン: `url.hostname === host` に変更
- [x] `getOriginInfo` に `host` パラメータを追加し、`parseRemoteUrl` に渡す
- [x] 呼び出し元（`src/cli/`、`src/core/preflight.ts`）で config の host を渡す
- [x] 既存 unit test を更新し、GHES host のテストケースを追加

**Acceptance Criteria**:
- `parseRemoteUrl("https://ghes.corp.example.com/o/r.git", "ghes.corp.example.com")` → `{ owner: "o", name: "r" }`
- `parseRemoteUrl("git@ghes.corp.example.com:o/r.git", "ghes.corp.example.com")` → `{ owner: "o", name: "r" }`
- `parseRemoteUrl("https://github.com/o/r.git")` → 既存動作を維持
- `parseRemoteUrl("https://github.com/o/r.git", "ghes.example.com")` → `REMOTE_NOT_GITHUB` エラー（host 不一致）

## T-09: doctor `github-origin` check を設定 host 対応にする

- [x] `src/core/doctor/checks/repo/github-origin.ts` を修正:
  - `DoctorContext` の `config` から `github.host` を取得（既定 `"github.com"`）
  - `url.includes("github.com")` を `url.includes(host)` に変更
  - fail 時の hint を設定 host に合わせる
- [x] 既存 unit test を更新（doctor tests はモックを使用 — 型チェックで確認済み）

**Acceptance Criteria**:
- config に `github.host: "ghes.corp.example.com"` が設定されている場合、origin が `ghes.corp.example.com` を含めば pass
- config 未設定時は `github.com` で検証（既存動作を維持）

## T-10: B-10 の歯を `core-invariants.test.ts` に追加

- [x] `tests/unit/architecture/core-invariants.test.ts` に `B-10: host↔token 束縛` の describe ブロックを追加
- [x] grep で `resolveGitHubToken` の composition-root 呼び出し（`src/cli/`、`src/core/preflight.ts`）を検索し、`host` 引数が渡されていることを検証
- [x] `createGitHubClient` の呼び出しに baseUrl が渡されていることを検証（adapter が host-aware）
- [x] T-04 regression guard: synthetic violation（host 引数なしの呼び出し）が検出されることを検証

**Acceptance Criteria**:
- composition-root の全 `resolveGitHubToken` 呼び出しが host 引数を含む
- composition-root の全 `createGitHubClient` 呼び出しが baseUrl 引数を含む
- `bun run test` が green

## T-11: typecheck と全テストの green 確認

- [x] `bun run typecheck` が green (exit 0)
- [x] `bun run test` が green (3317 tests passed)
- [x] `grep -r "api.github.com" src/adapter/` でコメント以外の結果が 0 件

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が exit 0
