# Test Cases: github-host-config

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to design.md or tasks.md section

GIVEN/WHEN/THEN structure (required for each test case):
  **GIVEN** <preconditions>
  **WHEN** <action>
  **THEN** <expected result>

Category determination:
  unit        — pure logic, validation, helper functions (automated)
  integration — DB operations, API endpoints, multi-module interaction (automated)
  manual      — UI/UX confirmation, visual verification, build artifact check (not automated)

Priority determination:
  must   — core functionality; if broken, the feature does not work
  should — important but core still works; edge cases, error handling
  could  — nice to have; performance, UX details

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  result determination:
    completed — all testable behaviors are documented
    partial   — some cases could not be derived due to design ambiguity
    failed    — required design artifacts (design.md, tasks.md) are missing
-->

## Summary

- **Total**: 40 cases
- **Automated** (unit/integration): 40
- **Manual**: 0
- **Priority**: must: 36, should: 4, could: 0

---

### TC-001: Config Schema — host 設定が valid であること

**Category**: unit  
**Priority**: must  
**Source**: T-02 AC

**GIVEN** `specrunner.json` に `{ "version": 1, "github": { "host": "ghes.example.com" } }` を記述する  
**WHEN** `validateConfig` を呼び出す  
**THEN** エラーなく `SpecRunnerConfig.github.host === "ghes.example.com"` が返る

---

### TC-002: Config Schema — host が空文字で CONFIG_INVALID になること

**Category**: unit  
**Priority**: must  
**Source**: T-02 AC

**GIVEN** `specrunner.json` に `{ "version": 1, "github": { "host": "" } }` を記述する  
**WHEN** `validateConfig` を呼び出す  
**THEN** `CONFIG_INVALID` エラーが throw される

---

### TC-003: Config Schema — apiBaseUrl が URL 形式でなければ CONFIG_INVALID になること

**Category**: unit  
**Priority**: must  
**Source**: T-02 AC

**GIVEN** `specrunner.json` に `{ "version": 1, "github": { "apiBaseUrl": "not-a-url" } }` を記述する  
**WHEN** `validateConfig` を呼び出す  
**THEN** `CONFIG_INVALID` エラーが throw される

---

### TC-004: Config Schema — github セクション未設定で後方互換であること

**Category**: unit  
**Priority**: must  
**Source**: T-02 AC

**GIVEN** `github` セクションを含まない既存の config を渡す  
**WHEN** `validateConfig` を呼び出す  
**THEN** エラーなく既存の動作を維持し、`config.github` は `undefined` となる

---

### TC-005: Host Resolution — undefined のとき api.github.com を返すこと

**Category**: unit  
**Priority**: must  
**Source**: T-03 AC

**GIVEN** `resolveGitHubApiBaseUrl` に `undefined` を渡す  
**WHEN** 関数を実行する  
**THEN** `"https://api.github.com"` が返る

---

### TC-006: Host Resolution — host が github.com のとき api.github.com を返すこと

**Category**: unit  
**Priority**: must  
**Source**: T-03 AC

**GIVEN** `resolveGitHubApiBaseUrl({ host: "github.com" })` を呼ぶ  
**WHEN** 関数を実行する  
**THEN** `"https://api.github.com"` が返る

---

### TC-007: Host Resolution — GHES host のとき /api/v3 パスを返すこと

**Category**: unit  
**Priority**: must  
**Source**: T-03 AC

**GIVEN** `resolveGitHubApiBaseUrl({ host: "ghes.corp.example.com" })` を呼ぶ  
**WHEN** 関数を実行する  
**THEN** `"https://ghes.corp.example.com/api/v3"` が返る

---

### TC-008: Host Resolution — apiBaseUrl の trailing slash が除去されること

**Category**: unit  
**Priority**: must  
**Source**: T-03 AC

**GIVEN** `resolveGitHubApiBaseUrl({ apiBaseUrl: "https://custom.proxy/gh/" })` を呼ぶ  
**WHEN** 関数を実行する  
**THEN** `"https://custom.proxy/gh"` が返る（trailing slash 除去済み）

---

### TC-009: Host Resolution — host と apiBaseUrl 両方設定時は apiBaseUrl が優先されること

**Category**: unit  
**Priority**: must  
**Source**: T-03 AC

**GIVEN** `resolveGitHubApiBaseUrl({ host: "ghes.example.com", apiBaseUrl: "https://override/api" })` を呼ぶ  
**WHEN** 関数を実行する  
**THEN** `"https://override/api"` が返る

---

### TC-010: Host Resolution — resolveGitHubHost が既定で github.com を返すこと

**Category**: unit  
**Priority**: should  
**Source**: T-03

**GIVEN** `resolveGitHubHost(undefined)` を呼ぶ  
**WHEN** 関数を実行する  
**THEN** `"github.com"` が返る

---

### TC-011: API Client Injection — adapter 内に api.github.com ハードコードが残らないこと

**Category**: integration  
**Priority**: must  
**Source**: T-04 AC

**GIVEN** T-04 の実装が完了している  
**WHEN** `grep -r "api\.github\.com" src/adapter/github/` を実行する（コメント行除外）  
**THEN** 結果が 0 件である

---

### TC-012: API Client Injection — GitHubClient port interface が不変であること

**Category**: integration  
**Priority**: must  
**Source**: T-04 AC, design D2

**GIVEN** T-04 の実装が完了している  
**WHEN** `src/kernel/github-client.ts` の `GitHubClient` interface を確認する  
**THEN** `host` / `baseUrl` を露出するパラメータやプロパティが存在しない

---

### TC-013: API Client Injection — createGitHubClient に baseUrl を渡すと adapter がその URL を使用すること

**Category**: unit  
**Priority**: must  
**Source**: T-04 AC

**GIVEN** `createGitHubClient(fetch, token, "https://ghes.example.com/api/v3")` でクライアントを作成する  
**WHEN** `listPullRequests` 等の API メソッドを呼び出す  
**THEN** リクエスト URL が `https://ghes.example.com/api/v3/...` で始まる

---

### TC-014: Composition Root — 全 createGitHubClient 呼び出しに baseUrl が渡されること

**Category**: integration  
**Priority**: must  
**Source**: T-05 AC

**GIVEN** T-05 の実装が完了している  
**WHEN** `src/cli/bootstrap.ts`、`run.ts`、`finish.ts`、`doctor.ts`、`command-registry.ts` の `createGitHubClient` 呼び出し箇所を確認する  
**THEN** すべての呼び出しに baseUrl 引数が渡されている

---

### TC-015: Composition Root — 全 resolveGitHubToken 呼び出しに host が渡されること

**Category**: integration  
**Priority**: must  
**Source**: T-05 AC

**GIVEN** T-05 の実装が完了している  
**WHEN** `src/cli/` および `src/core/preflight.ts` の `resolveGitHubToken` 呼び出し箇所を確認する  
**THEN** すべての呼び出しに `host` 引数が渡されている

---

### TC-016: Composition Root — typecheck が green であること

**Category**: integration  
**Priority**: must  
**Source**: T-05 AC

**GIVEN** T-02 〜 T-05 の実装が完了している  
**WHEN** `bun run typecheck` を実行する  
**THEN** exit 0 で終了する

---

### TC-017: Auth URL — getDeviceCodeUrl が github.com で正しい URL を返すこと

**Category**: unit  
**Priority**: must  
**Source**: T-06 AC

**GIVEN** `getDeviceCodeUrl("github.com")` を呼ぶ  
**WHEN** 関数を実行する  
**THEN** `"https://github.com/login/device/code"` が返る

---

### TC-018: Auth URL — getDeviceCodeUrl が GHES host で正しい URL を返すこと

**Category**: unit  
**Priority**: must  
**Source**: T-06 AC

**GIVEN** `getDeviceCodeUrl("ghes.corp.example.com")` を呼ぶ  
**WHEN** 関数を実行する  
**THEN** `"https://ghes.corp.example.com/login/device/code"` が返る

---

### TC-019: Auth URL — getTokenUrl が GHES host で正しい URL を返すこと

**Category**: unit  
**Priority**: must  
**Source**: T-06 AC

**GIVEN** `getTokenUrl("ghes.corp.example.com")` を呼ぶ  
**WHEN** 関数を実行する  
**THEN** `"https://ghes.corp.example.com/login/oauth/access_token"` が返る

---

### TC-020: Auth URL — 定数 GITHUB_DEVICE_CODE_URL / GITHUB_TOKEN_URL が削除されていること

**Category**: integration  
**Priority**: must  
**Source**: T-06 AC

**GIVEN** T-06 の実装が完了している  
**WHEN** `grep -r "GITHUB_DEVICE_CODE_URL\|GITHUB_TOKEN_URL" src/` を実行する  
**THEN** インポートと定義が 0 件である

---

### TC-021: Enterprise Token — GHES host で GH_ENTERPRISE_TOKEN が優先されること

**Category**: unit  
**Priority**: must  
**Source**: T-07 AC

**GIVEN** 環境変数に `GH_TOKEN=ghcom-token` と `GH_ENTERPRISE_TOKEN=ghes-token` の両方が設定されている  
**WHEN** `resolveGitHubToken(env, { host: "ghes.example.com" })` を呼ぶ  
**THEN** `"ghes-token"` が返る

---

### TC-022: Enterprise Token — github.com host で GH_TOKEN が優先されること

**Category**: unit  
**Priority**: must  
**Source**: T-07 AC

**GIVEN** 環境変数に `GH_TOKEN=ghcom-token` と `GH_ENTERPRISE_TOKEN=ghes-token` の両方が設定されている  
**WHEN** `resolveGitHubToken(env, { host: "github.com" })` を呼ぶ  
**THEN** `"ghcom-token"` が返る

---

### TC-023: Enterprise Token — host 未指定時に GH_TOKEN → GITHUB_TOKEN の既存動作を維持すること

**Category**: unit  
**Priority**: must  
**Source**: T-07 AC

**GIVEN** 環境変数に `GH_TOKEN=ghcom-token` が設定されている  
**WHEN** `resolveGitHubToken(env)` を host 引数なしで呼ぶ  
**THEN** `"ghcom-token"` が返る（後方互換）

---

### TC-024: Enterprise Token — GHES host で GH_TOKEN のみ設定されている場合エラーになること（B-10）

**Category**: unit  
**Priority**: must  
**Source**: T-07 AC

**GIVEN** 環境変数に `GH_TOKEN=ghcom-token` のみが設定され、`GH_ENTERPRISE_TOKEN` は未設定  
**WHEN** `resolveGitHubToken(env, { host: "ghes.example.com" })` を呼ぶ  
**THEN** token が見つからないエラーが返る（github.com 用 token を GHES に使わせない）

---

### TC-025: Enterprise Token — gh auth token に --hostname が渡されること

**Category**: unit  
**Priority**: should  
**Source**: T-07

**GIVEN** env var が未設定で、spawn 関数をモックする  
**WHEN** `resolveGitHubToken(env, { host: "ghes.example.com" })` を呼ぶ  
**THEN** `gh auth token --hostname ghes.example.com` が subprocess として実行される

---

### TC-026: Enterprise Token — エラーメッセージに host 情報が含まれること

**Category**: unit  
**Priority**: should  
**Source**: T-07, design Risks

**GIVEN** GHES host 用の token が一切存在しない  
**WHEN** `resolveGitHubToken(env, { host: "ghes.example.com" })` を呼ぶ  
**THEN** エラーメッセージに `ghes.example.com` と設定すべき env var 名（`GH_ENTERPRISE_TOKEN` 等）が含まれる

---

### TC-027: Remote URL Parsing — GHES HTTPS URL を解析できること

**Category**: unit  
**Priority**: must  
**Source**: T-08 AC

**GIVEN** `parseRemoteUrl("https://ghes.corp.example.com/o/r.git", "ghes.corp.example.com")` を呼ぶ  
**WHEN** 関数を実行する  
**THEN** `{ owner: "o", name: "r" }` が返る

---

### TC-028: Remote URL Parsing — GHES SSH URL を解析できること

**Category**: unit  
**Priority**: must  
**Source**: T-08 AC

**GIVEN** `parseRemoteUrl("git@ghes.corp.example.com:o/r.git", "ghes.corp.example.com")` を呼ぶ  
**WHEN** 関数を実行する  
**THEN** `{ owner: "o", name: "r" }` が返る

---

### TC-029: Remote URL Parsing — host 未指定時に github.com の既存動作を維持すること

**Category**: unit  
**Priority**: must  
**Source**: T-08 AC

**GIVEN** `parseRemoteUrl("https://github.com/o/r.git")` を host 引数なしで呼ぶ  
**WHEN** 関数を実行する  
**THEN** `{ owner: "o", name: "r" }` が返る

---

### TC-030: Remote URL Parsing — host 不一致で REMOTE_NOT_GITHUB エラーになること

**Category**: unit  
**Priority**: must  
**Source**: T-08 AC

**GIVEN** `parseRemoteUrl("https://github.com/o/r.git", "ghes.example.com")` を呼ぶ  
**WHEN** 関数を実行する  
**THEN** `REMOTE_NOT_GITHUB` エラーが返る

---

### TC-031: Doctor Check — GHES host で origin が設定 host を含めば pass すること

**Category**: unit  
**Priority**: must  
**Source**: T-09 AC

**GIVEN** config に `github.host: "ghes.corp.example.com"` が設定され、git origin が `https://ghes.corp.example.com/o/r.git` である  
**WHEN** `github-origin` doctor check を実行する  
**THEN** check が pass する

---

### TC-032: Doctor Check — GHES host 設定時に origin が github.com なら fail すること

**Category**: unit  
**Priority**: must  
**Source**: T-09 AC

**GIVEN** config に `github.host: "ghes.corp.example.com"` が設定され、git origin が `https://github.com/o/r.git` である  
**WHEN** `github-origin` doctor check を実行する  
**THEN** check が fail する

---

### TC-033: Doctor Check — config 未設定時に github.com で検証する既存動作を維持すること

**Category**: unit  
**Priority**: must  
**Source**: T-09 AC

**GIVEN** config に `github` セクションがなく、git origin が `https://github.com/o/r.git` である  
**WHEN** `github-origin` doctor check を実行する  
**THEN** check が pass する（既存動作を維持）

---

### TC-034: B-10 Invariant — composition-root の resolveGitHubToken に host が渡されることを機械検証すること

**Category**: unit  
**Priority**: must  
**Source**: T-10 AC

**GIVEN** `core-invariants.test.ts` に B-10 describe ブロックが追加されている  
**WHEN** `bun run test tests/unit/architecture/core-invariants.test.ts` を実行する  
**THEN** composition-root の全 `resolveGitHubToken` 呼び出しが host 引数を含むことが検証されてテストが green になる

---

### TC-035: B-10 Invariant — composition-root の createGitHubClient に baseUrl が渡されることを機械検証すること

**Category**: unit  
**Priority**: must  
**Source**: T-10 AC

**GIVEN** `core-invariants.test.ts` に B-10 describe ブロックが追加されている  
**WHEN** `bun run test tests/unit/architecture/core-invariants.test.ts` を実行する  
**THEN** composition-root の全 `createGitHubClient` 呼び出しが baseUrl 引数を含むことが検証されてテストが green になる

---

### TC-036: B-10 Invariant — host 引数なしの呼び出しを regression guard が検出すること

**Category**: unit  
**Priority**: must  
**Source**: T-10 AC

**GIVEN** `core-invariants.test.ts` に synthetic violation テスト（host 引数なし呼び出しパターンへのマッチ）が実装されている  
**WHEN** テストを実行する  
**THEN** synthetic violation が検出され、guard が機能していることが確認される

---

### TC-037: Integration — typecheck と全テストが green であること

**Category**: integration  
**Priority**: must  
**Source**: T-11 AC

**GIVEN** T-01 〜 T-10 の全実装が完了している  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN** exit 0 で終了する

---

### TC-038: Integration — adapter に api.github.com のハードコードが残らないこと

**Category**: integration  
**Priority**: must  
**Source**: T-11 AC

**GIVEN** T-04 の実装が完了している  
**WHEN** `grep -r "api\.github\.com" src/adapter/` をコメント行除外で実行する  
**THEN** 結果が 0 件である

---

### TC-039: Backward Compatibility — github.com 環境で既存動作が変わらないこと

**Category**: integration  
**Priority**: must  
**Source**: request.md 要件 1, design D1

**GIVEN** config に `github` セクションがない（既存ユーザー）  
**WHEN** CLI を実行して GitHub API を呼び出す  
**THEN** `https://api.github.com` を使った既存と同一の動作をする

---

### TC-040: Backward Compatibility — apiBaseUrl のみ設定で host 導出を上書きできること

**Category**: integration  
**Priority**: should  
**Source**: design D1 Rationale（reverse proxy 構成）

**GIVEN** config に `{ "github": { "apiBaseUrl": "https://proxy.internal/gh-api" } }` を設定し、host は未設定  
**WHEN** CLI を実行して GitHub API を呼び出す  
**THEN** `https://proxy.internal/gh-api/...` が使われる

---

## Result

```yaml
result: completed
total: 40
automated: 40
manual: 0
must: 36
should: 4
could: 0
blocked_reasons: []
```
