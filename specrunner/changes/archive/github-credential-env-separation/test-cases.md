# Test Cases: github-credential-env-separation

## Overview

テスト対象: `config.github` フィールド削除 / `credentials.json` 分離 / `specrunner login` を統一 auth 入口にする変更。  
Source documents: request.md (要件 1-22 + 受け入れ基準) / design.md (D1-D10) / tasks.md (Task 1-9)。

---

## Category: Credentials File — loadCredentials

### TC-01

- **Category**: Credentials File / loadCredentials
- **Priority**: must
- **Source**: tasks.md Task 1, request.md 要件 7-8

**GIVEN** `~/.config/specrunner/credentials.json` が存在しない  
**WHEN** `loadCredentials()` を呼ぶ  
**THEN** エラーを throw せず空オブジェクト `{}` を返す

---

### TC-02

- **Category**: Credentials File / loadCredentials
- **Priority**: must
- **Source**: tasks.md Task 1, design.md D1

**GIVEN** `~/.config/specrunner/credentials.json` が `{ "github": { "token": "ghp_abc" } }` という内容で存在する  
**WHEN** `loadCredentials()` を呼ぶ  
**THEN** `{ github: { token: "ghp_abc" } }` を返す

---

### TC-03

- **Category**: Credentials File / loadCredentials / permission warning
- **Priority**: must
- **Source**: request.md 要件 22, design.md D10, tasks.md Task 1

**GIVEN** `~/.config/specrunner/credentials.json` が permission `0644` で存在する  
**WHEN** `loadCredentials()` を呼ぶ  
**THEN** stderr に 0600 permission warning が出力される（ファイルの読み込み自体は成功する）

---

### TC-04

- **Category**: Credentials File / loadCredentials / permission warning
- **Priority**: must
- **Source**: request.md 要件 22, design.md D10

**GIVEN** `~/.config/specrunner/credentials.json` が permission `0600` で存在する  
**WHEN** `loadCredentials()` を呼ぶ  
**THEN** permission warning は出力されない

---

### TC-05

- **Category**: Credentials File / loadCredentials
- **Priority**: should
- **Source**: tasks.md Task 1

**GIVEN** `~/.config/specrunner/credentials.json` が壊れた JSON（parse 不能）で存在する  
**WHEN** `loadCredentials()` を呼ぶ  
**THEN** `SpecRunnerError` を throw し、内容は credentials file が破損していることを示す

---

## Category: Credentials File — saveCredentials

### TC-06

- **Category**: Credentials File / saveCredentials
- **Priority**: must
- **Source**: request.md 要件 7-8, design.md D1-D2, tasks.md Task 1

**GIVEN** `~/.config/specrunner/credentials.json` が存在しない  
**WHEN** `saveCredentials({ github: { token: "ghp_new" } })` を呼ぶ  
**THEN** `~/.config/specrunner/credentials.json` が新規作成され、内容は `{ "github": { "token": "ghp_new" } }` で permission は `0600` である

---

### TC-07

- **Category**: Credentials File / saveCredentials / merge
- **Priority**: must
- **Source**: request.md 要件 9, design.md D1

**GIVEN** `~/.config/specrunner/credentials.json` が `{ "gitlab": { "token": "glpat_xyz" }, "github": { "token": "ghp_old" } }` で存在する  
**WHEN** `saveCredentials({ github: { token: "ghp_new" } })` を呼ぶ  
**THEN** `gitlab` キーは保持されたまま `github.token` が `"ghp_new"` に更新される（他 provider の credentials を破壊しない）

---

### TC-08

- **Category**: Credentials File / saveCredentials
- **Priority**: must
- **Source**: design.md D2, request.md 要件 7

**GIVEN** credentials file を書き込む  
**WHEN** `saveCredentials(...)` が完了する  
**THEN** 書き込まれたファイルの permission が `0600` である（atomic write）

---

## Category: Token Resolver — resolveGitHubToken

### TC-09

- **Category**: Token Resolver / priority chain
- **Priority**: must
- **Source**: request.md 要件 10, design.md D3, tasks.md Task 1

**GIVEN** `credentials.json` に `{ "github": { "token": "ghp_from_file" } }` が存在し、env var `GITHUB_TOKEN=ghp_from_env` も設定されている  
**WHEN** `resolveGitHubToken(process.env)` を呼ぶ  
**THEN** `{ token: "ghp_from_file", source: "credentials" }` を返す（credentials file が最優先）

---

### TC-10

- **Category**: Token Resolver / fallback
- **Priority**: must
- **Source**: request.md 要件 10, design.md D3

**GIVEN** `credentials.json` が存在しない（または `github` キーが無い）、env var `GITHUB_TOKEN=ghp_from_env` が設定されている  
**WHEN** `resolveGitHubToken(process.env)` を呼ぶ  
**THEN** `{ token: "ghp_from_env", source: "env" }` を返す

---

### TC-11

- **Category**: Token Resolver / error
- **Priority**: must
- **Source**: request.md 受け入れ基準, design.md D3

**GIVEN** `credentials.json` が存在しない、`GITHUB_TOKEN` env var も未設定  
**WHEN** `resolveGitHubToken(process.env)` を呼ぶ  
**THEN** `SpecRunnerError` を throw し、エラーメッセージに `specrunner login` の実行を促す案内が含まれる

---

### TC-12

- **Category**: Token Resolver / subprocess independence
- **Priority**: should
- **Source**: request.md 要件 12, design.md D3

**GIVEN** `resolveGitHubToken` の実装  
**WHEN** 内部実装を確認する  
**THEN** subprocess（`which`, `gh` 等）を一切 spawn せず、pure file I/O + env access のみで完結している

---

## Category: Config Schema — github フィールド削除

### TC-13

- **Category**: Config Schema / type removal
- **Priority**: must
- **Source**: request.md 要件 1, 受け入れ基準, tasks.md Task 2

**GIVEN** `SpecRunnerConfig` 型定義  
**WHEN** 型を参照する  
**THEN** `github` フィールド（`GithubConfig`）が存在しない。`accessToken` / `tokenObtainedAt` / `scopes` フィールドも削除されている

---

### TC-14

- **Category**: Config Schema / saveConfig strip
- **Priority**: must
- **Source**: request.md 要件 3, 受け入れ基準, tasks.md Task 2

**GIVEN** `~/.config/specrunner/config.json` に `{ "github": { "accessToken": "ghp_old" }, "model": "claude-opus-4-5" }` が存在する  
**WHEN** `saveConfig(config)` を呼ぶ  
**THEN** 書き込まれた config.json に `github` フィールドが存在しない（`model` は保持される）

---

### TC-15

- **Category**: Config Schema / saveConfig strip — load is unaffected
- **Priority**: must
- **Source**: request.md 受け入れ基準

**GIVEN** `~/.config/specrunner/config.json` に `github.accessToken` フィールドが残っている古い config が存在する  
**WHEN** config を load する  
**THEN** エラーは発生しない（load 時は `github` フィールドを無視する）

---

### TC-16

- **Category**: Config Schema / checkConfigComplete
- **Priority**: must
- **Source**: request.md 要件 2, tasks.md Task 2

**GIVEN** `checkConfigComplete` の実装  
**WHEN** 関数を呼ぶ  
**THEN** `github.accessToken` のチェックロジックが含まれていない

---

### TC-17

- **Category**: Config Schema / 0600 warning removed from config
- **Priority**: must
- **Source**: request.md 要件 21, design.md D10

**GIVEN** `src/config/store.ts` の実装  
**WHEN** `loadConfig()` または `saveConfig()` を呼ぶ  
**THEN** config file に対する 0600 permission warning は出力されない

---

## Category: specrunner login — 出力先変更

### TC-18

- **Category**: Login / credentials file write
- **Priority**: must
- **Source**: request.md 要件 6-8, 受け入れ基準, tasks.md Task 3

**GIVEN** ユーザーが `specrunner login` を実行し、Device Flow OAuth が完了して access token `ghp_abc123` を取得した  
**WHEN** login フローが完了する  
**THEN** `~/.config/specrunner/credentials.json` に `{ "github": { "token": "ghp_abc123" } }` が 0600 で書き込まれる

---

### TC-19

- **Category**: Login / config not polluted
- **Priority**: must
- **Source**: request.md 受け入れ基準, tasks.md Task 3

**GIVEN** ユーザーが `specrunner login` を実行し、Device Flow OAuth が完了した  
**WHEN** login フローが完了する  
**THEN** `~/.config/specrunner/config.json` に `github` フィールドが書き込まれない

---

### TC-20

- **Category**: Login / re-login preserves other providers
- **Priority**: must
- **Source**: request.md 要件 9, tasks.md Task 3

**GIVEN** `credentials.json` に `{ "gitlab": { "token": "glpat_xyz" } }` が存在する状態で `specrunner login` を実行し完了した  
**WHEN** credentials file を確認する  
**THEN** `gitlab` キーが保持されたまま `github.token` が新しい token で追加/更新されている

---

### TC-21

- **Category**: Login / Device Flow maintained
- **Priority**: must
- **Source**: request.md 要件 6

**GIVEN** ユーザーが `specrunner login` を実行する  
**WHEN** login フローを観察する  
**THEN** Device Flow OAuth（`src/auth/github-device.ts`）が使われる（Device Code 表示 → ブラウザ認証 → token 取得フロー）

---

## Category: Token Resolver / CLI Entry — run.ts, bootstrap.ts, finish.ts

### TC-22

- **Category**: CLI Entry / run.ts token injection
- **Priority**: must
- **Source**: request.md 受け入れ基準, tasks.md Task 4

**GIVEN** `credentials.json` に `github.token` が存在する  
**WHEN** `specrunner run` を実行する  
**THEN** `createGitHubClient` が resolver から得た token で呼ばれる（`config.github?.accessToken` は参照されない）

---

### TC-23

- **Category**: CLI Entry / bootstrap.ts token injection
- **Priority**: must
- **Source**: request.md 受け入れ基準 (bootstrap.ts:32), tasks.md Task 4

**GIVEN** `credentials.json` に `github.token` が存在する  
**WHEN** `specrunner bootstrap` を実行する  
**THEN** `createGitHubClient` が resolver から得た token で呼ばれる

---

### TC-24

- **Category**: CLI Entry / doctor.ts token injection
- **Priority**: must
- **Source**: request.md 受け入れ基準 (doctor.ts:91), tasks.md Task 4

**GIVEN** `credentials.json` に `github.token` が存在する  
**WHEN** `specrunner doctor` を実行する  
**THEN** `DoctorContext.resolvedGitHubToken` に credentials file から解決した token が設定される

---

### TC-25

- **Category**: CLI Entry / doctor.ts graceful degradation
- **Priority**: must
- **Source**: tasks.md Task 4

**GIVEN** `credentials.json` が存在せず、`GITHUB_TOKEN` env var も未設定  
**WHEN** `specrunner doctor` を実行する  
**THEN** エラーで終了せず実行継続し、token-present check が fail として報告される

---

## Category: Preflight — GitHub token チェック

### TC-26

- **Category**: Preflight / token check pass
- **Priority**: must
- **Source**: request.md 要件 19, 受け入れ基準, tasks.md Task 5

**GIVEN** `credentials.json` に `github.token` が存在する  
**WHEN** `runPreflight` (または `checkRuntimePrereqs`) を実行する  
**THEN** GitHub token チェックが pass し、処理が続行する

---

### TC-27

- **Category**: Preflight / token check pass via env var
- **Priority**: must
- **Source**: request.md 要件 19, tasks.md Task 5

**GIVEN** `credentials.json` が存在しないが、`GITHUB_TOKEN=ghp_ci_token` が設定されている  
**WHEN** `runPreflight` を実行する  
**THEN** GitHub token チェックが pass する

---

### TC-28

- **Category**: Preflight / token check fail
- **Priority**: must
- **Source**: request.md 受け入れ基準, tasks.md Task 5

**GIVEN** `credentials.json` が存在せず、`GITHUB_TOKEN` env var も未設定  
**WHEN** `specrunner run` を実行する  
**THEN** preflight が fail し、`specrunner login` の実行を案内するエラーメッセージで停止する（PR 作成等の処理は行われない）

---

### TC-29

- **Category**: Preflight / both runtime coverage
- **Priority**: must
- **Source**: request.md 要件 19, design.md (checkRuntimePrereqs 両 runtime 共通)

**GIVEN** managed / local runtime いずれでも  
**WHEN** `specrunner run` で GitHub token が未設定の場合  
**THEN** runtime 種別に関わらず同一の token check エラーで停止する（managed 専用ガードではない）

---

## Category: ManagedAgentRunner — コンストラクタ注入

### TC-30

- **Category**: ManagedAgentRunner / constructor injection
- **Priority**: must
- **Source**: request.md 要件 14, 受け入れ基準 (agent-runner.ts:140/381/413), tasks.md Task 6

**GIVEN** `ManagedAgentRunner` のコンストラクタ定義  
**WHEN** コードを確認する  
**THEN** `githubToken: string` パラメータが追加されており、内部の 3 箇所（lines 140, 381, 413 付近）で `this.githubToken` を参照している（`config.github!.accessToken` の直参照はない）

---

### TC-31

- **Category**: ManagedAgentRunner / no env/config direct access
- **Priority**: must
- **Source**: request.md 要件 15, design.md D8

**GIVEN** `src/adapter/managed-agent/agent-runner.ts` の実装  
**WHEN** コードを確認する  
**THEN** `process.env` や `config.github` を adapter 内部で直接読んでいる箇所が存在しない

---

### TC-32

- **Category**: ManagedAgentRunner / createRuntime relay
- **Priority**: must
- **Source**: tasks.md Task 6, design.md D8

**GIVEN** `src/core/runtime/index.ts` の `createRuntime` 実装  
**WHEN** managed runtime 用の `ManagedAgentRunner` を生成する  
**THEN** CLI entry 層から受け取った `githubToken` が `ManagedAgentRunner` のコンストラクタに relay される

---

## Category: gh CLI env injection — spawnCommand + 系統 A

### TC-33

- **Category**: spawnCommand / env merge strategy
- **Priority**: must
- **Source**: design.md D6, tasks.md Task 7

**GIVEN** `spawnCommand` に `opts.env = { GITHUB_TOKEN: "ghp_abc" }` を渡す  
**WHEN** subprocess が起動する  
**THEN** subprocess の env は `{ ...process.env, GITHUB_TOKEN: "ghp_abc" }` となる（`PATH` / `HOME` 等の system env が引き継がれる）

---

### TC-34

- **Category**: spawnCommand / env merge strategy — backward compat
- **Priority**: must
- **Source**: design.md D6

**GIVEN** `spawnCommand` に `opts.env` を渡さない（既存の全 call site）  
**WHEN** subprocess が起動する  
**THEN** subprocess の env は `process.env` のまま（既存の動作が変わらない）

---

### TC-35

- **Category**: gh CLI env injection / pr-create
- **Priority**: must
- **Source**: request.md 要件 16-17, 受け入れ基準, tasks.md Task 7

**GIVEN** credentials file から token `ghp_token` を解決した状態で PR 作成フローが実行される  
**WHEN** `gh pr create` が spawn される  
**THEN** subprocess の env に `GITHUB_TOKEN=ghp_token` が注入されている

---

### TC-36

- **Category**: gh CLI env injection / finish orchestrator
- **Priority**: must
- **Source**: request.md 要件 16-17, tasks.md Task 7

**GIVEN** credentials file から token を解決した状態で `specrunner finish` が実行される  
**WHEN** finish orchestrator が `gh` コマンドを spawn する（PR list / merge / view 等）  
**THEN** 全ての `gh` spawn に `GITHUB_TOKEN` env が注入されている

---

### TC-37

- **Category**: gh CLI env injection / UX — gh auth login 不要
- **Priority**: must
- **Source**: request.md 要件 18, 受け入れ基準

**GIVEN** ユーザーが `gh auth login` を実行していない状態で、`specrunner login` のみ完了している  
**WHEN** `specrunner finish` または PR 作成フローを実行する  
**THEN** `gh` CLI 経由の操作（PR 作成 / merge）が正常に完了する（`GITHUB_TOKEN` env 注入により認証される）

---

### TC-38

- **Category**: gh CLI env injection / GhPrCreateInput
- **Priority**: should
- **Source**: tasks.md Task 7, design.md D7

**GIVEN** `GhPrCreateInput` 型定義  
**WHEN** 型を参照する  
**THEN** `githubToken?: string` フィールドが追加されている

---

### TC-39

- **Category**: gh CLI env injection / FinishInput
- **Priority**: should
- **Source**: tasks.md Task 7, design.md D7

**GIVEN** `FinishInput` 型定義  
**WHEN** 型を参照する  
**THEN** `githubToken?: string` フィールドが追加されている

---

## Category: Doctor — checks 更新

### TC-40

- **Category**: Doctor / github-token-present check (credentials file)
- **Priority**: must
- **Source**: request.md 要件 20, 受け入れ基準, tasks.md Task 8

**GIVEN** `credentials.json` に `github.token` が存在する  
**WHEN** `specrunner doctor` を実行する  
**THEN** `github-token-present` チェックが pass する

---

### TC-41

- **Category**: Doctor / github-token-present check (env var)
- **Priority**: must
- **Source**: request.md 要件 20, tasks.md Task 8

**GIVEN** `credentials.json` が存在せず、`GITHUB_TOKEN` env var が設定されている  
**WHEN** `specrunner doctor` を実行する  
**THEN** `github-token-present` チェックが pass する

---

### TC-42

- **Category**: Doctor / github-token-present check (not found)
- **Priority**: must
- **Source**: request.md 要件 20, tasks.md Task 8

**GIVEN** `credentials.json` が存在せず、`GITHUB_TOKEN` env var も未設定  
**WHEN** `specrunner doctor` を実行する  
**THEN** `github-token-present` チェックが fail し、`specrunner login` の実行を促す hint が表示される

---

### TC-43

- **Category**: Doctor / github-token-present — config 参照なし
- **Priority**: must
- **Source**: tasks.md Task 8, design.md D9

**GIVEN** `github-token-present` チェックの実装  
**WHEN** コードを確認する  
**THEN** `ctx.config.get("github.accessToken")` の参照が存在しない（`ctx.resolvedGitHubToken` を参照している）

---

### TC-44

- **Category**: Doctor / github-token-valid check
- **Priority**: must
- **Source**: request.md 要件 20, 受け入れ基準, tasks.md Task 8

**GIVEN** `credentials.json` から有効な token が解決できる  
**WHEN** `specrunner doctor` が `github-token-valid` チェックを実行する  
**THEN** resolved token を使って GitHub API 疎通を行い、成功すれば pass を返す

---

### TC-45

- **Category**: Doctor / github-token-valid — no token early return
- **Priority**: must
- **Source**: tasks.md Task 8, design.md D9

**GIVEN** `ctx.resolvedGitHubToken` が null（token 未設定）  
**WHEN** `github-token-valid` チェックが実行される  
**THEN** API 疎通を試みず early return で fail を返す

---

### TC-46

- **Category**: Doctor / gh-cli-present check (found)
- **Priority**: must
- **Source**: request.md 要件 20, 受け入れ基準, tasks.md Task 8

**GIVEN** `gh` バイナリが PATH 上に存在する  
**WHEN** `specrunner doctor` を実行する  
**THEN** `gh-cli-present` チェックが pass する

---

### TC-47

- **Category**: Doctor / gh-cli-present check (not found)
- **Priority**: must
- **Source**: request.md 要件 20, 受け入れ基準, tasks.md Task 8

**GIVEN** `gh` バイナリが PATH 上に存在しない  
**WHEN** `specrunner doctor` を実行する  
**THEN** `gh-cli-present` チェックが fail する

---

### TC-48

- **Category**: Doctor / github-client-id check preserved
- **Priority**: should
- **Source**: request.md 要件 20 (削除しない旨の明記)

**GIVEN** `specrunner doctor` の checks 一覧  
**WHEN** チェック一覧を確認する  
**THEN** `github-client-id` チェック（`SPECRUNNER_GITHUB_CLIENT_ID` env var）が残存している（削除されていない）

---

### TC-49

- **Category**: Doctor / DoctorContext
- **Priority**: must
- **Source**: design.md D9, tasks.md Task 8

**GIVEN** `DoctorContext` 型定義  
**WHEN** 型を確認する  
**THEN** `resolvedGitHubToken: string | null` フィールドが追加されている

---

## Category: Permission Warning 移動

### TC-50

- **Category**: Permission Warning / config warning removed
- **Priority**: must
- **Source**: request.md 要件 21, 受け入れ基準, design.md D10

**GIVEN** `src/config/store.ts` の実装  
**WHEN** コードを確認する  
**THEN** config file に対する 0600 permission warning ブロック（旧 lines 34-45）が削除されている

---

### TC-51

- **Category**: Permission Warning / credentials file warning added
- **Priority**: must
- **Source**: request.md 要件 22, 受け入れ基準, design.md D10

**GIVEN** `credentials.json` が 0644 以上の permission で存在する  
**WHEN** `loadCredentials()` を呼ぶ  
**THEN** credentials file に対する 0600 permission warning が stderr に出力される

---

## Category: Backward Compatibility

### TC-52

- **Category**: Backward Compatibility / legacy config passthrough
- **Priority**: must
- **Source**: request.md 受け入れ基準

**GIVEN** 既存の `config.json` に `github.accessToken` フィールドが含まれている（旧バージョンで書かれた）  
**WHEN** `loadConfig()` を呼ぶ  
**THEN** エラーは発生せず config を正常に読み込む（`github` フィールドは型上無視される）

---

### TC-53

- **Category**: Backward Compatibility / strip on save
- **Priority**: must
- **Source**: request.md 要件 3, 受け入れ基準

**GIVEN** 既存の `config.json` に `github.accessToken` フィールドが含まれている  
**WHEN** 何らかの操作で `saveConfig(config)` が呼ばれる  
**THEN** 書き込み後の `config.json` から `github` フィールドが消える（strip される）

---

## Category: Build & Type Safety

### TC-54

- **Category**: Build / typecheck
- **Priority**: must
- **Source**: request.md 受け入れ基準, tasks.md Task 9

**GIVEN** 全 Task (1-8) の実装が完了した状態  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で pass する

---

### TC-55

- **Category**: Build / test suite
- **Priority**: must
- **Source**: request.md 受け入れ基準, tasks.md Task 9

**GIVEN** 全 Task (1-9) の実装が完了した状態  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが green で pass する

---

### TC-56

- **Category**: Build / no config.github references
- **Priority**: must
- **Source**: request.md 受け入れ基準 (run.ts:45, bootstrap.ts:32, doctor.ts:91, agent-runner.ts:140/381/413)

**GIVEN** 全変更完了後のコードベース  
**WHEN** `grep -r "config\.github" src/` を実行する  
**THEN** 結果が 0 件（型ガードや コメントを除く実際の参照が存在しない）

---

## Category: New Unit Tests (tasks.md Task 9)

### TC-57

- **Category**: Unit Test / credentials-github.test.ts
- **Priority**: must
- **Source**: tasks.md Task 9

**GIVEN** `tests/credentials-github.test.ts` が存在する  
**WHEN** テストファイルの内容を確認する  
**THEN** 以下のテストケースが含まれている: (1) `loadCredentials` — file 不在 → `{}`, (2) `loadCredentials` — valid JSON parse, (3) `loadCredentials` — permission warning, (4) `saveCredentials` — 新規作成 0600, (5) `saveCredentials` — 既存ファイル merge（他 provider key 保持）, (6) `resolveGitHubToken` — credentials 優先, (7) `resolveGitHubToken` — env fallback, (8) `resolveGitHubToken` — 両方無しで error

---

### TC-58

- **Category**: Unit Test / doctor-gh-cli.test.ts
- **Priority**: must
- **Source**: tasks.md Task 9

**GIVEN** `tests/doctor-gh-cli.test.ts` が存在する  
**WHEN** テストファイルの内容を確認する  
**THEN** `gh` found → pass / not found → fail の 2 ケースが含まれている

---

### TC-59

- **Category**: Unit Test / ManagedAgentRunner
- **Priority**: must
- **Source**: tasks.md Task 9

**GIVEN** `ManagedAgentRunner` の既存テスト  
**WHEN** テストを確認する  
**THEN** コンストラクタに `githubToken` 引数が追加されており、テストが通過する

---

## Category: XDG Path

### TC-60

- **Category**: XDG Path / getCredentialsPath
- **Priority**: should
- **Source**: design.md D2, tasks.md Task 1

**GIVEN** `XDG_CONFIG_HOME` が未設定（デフォルト）  
**WHEN** `getCredentialsPath()` を呼ぶ  
**THEN** `$HOME/.config/specrunner/credentials.json` を返す

---

### TC-61

- **Category**: XDG Path / getCredentialsPath with XDG_CONFIG_HOME
- **Priority**: should
- **Source**: design.md D2

**GIVEN** `XDG_CONFIG_HOME=/custom/config` が設定されている  
**WHEN** `getCredentialsPath()` を呼ぶ  
**THEN** `/custom/config/specrunner/credentials.json` を返す

---

## Summary

| Priority | Count |
|----------|-------|
| must     | 52    |
| should   | 8     |
| could    | 0     |
| **Total**| **61**|

| Category                        | Count |
|---------------------------------|-------|
| Credentials File (load/save)    | 8     |
| Token Resolver                  | 4     |
| Config Schema                   | 5     |
| specrunner login                | 4     |
| CLI Entry (run/bootstrap/doctor)| 4     |
| Preflight                       | 4     |
| ManagedAgentRunner              | 3     |
| gh CLI env injection            | 7     |
| Doctor checks                   | 10    |
| Permission Warning              | 2     |
| Backward Compatibility          | 2     |
| Build & Type Safety             | 3     |
| New Unit Tests                  | 3     |
| XDG Path                        | 2     |
