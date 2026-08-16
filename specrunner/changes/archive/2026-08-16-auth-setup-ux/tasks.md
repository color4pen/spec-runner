# Tasks: auth/setup UX

> 各タスクの前提: `design.md` の D1–D10 を読むこと。ファイルパスは検証済み。
> 既存 credential I/O（`saveCredentials` は 0600 + deep-merge）を再利用し、新規依存は足さない。

## T-01: deprecated flag 概念を flag-parser に追加する

- [x] `src/cli/flag-parser.ts` の `FlagDef` に `deprecated?: { message: string }` を追加する。
- [x] `parseFlags` の flag 解決部で、`def.deprecated` を持つ flag に遭遇した時点（値の消費・enum 検証より前）で `throw new FlagParseError(def.deprecated.message)` する。
- [x] boolean/string どちらの deprecated flag でも値を消費せずに即 throw することを保証する。

**Acceptance Criteria**:
- `parseFlags(["--provider","claude"], { provider: { type: "string", deprecated: { message: "... credentials set claude-code ..." } } })` が `FlagParseError` を throw し、message に `credentials set claude-code` を含む。
- deprecated でない既存 flag の挙動は不変（既存 flag-parser テストが green）。

## T-02: login を GitHub 専用化し、有効性ベースで Device Flow を判定する（D1）

- [x] `src/cli/login.ts`: `LoginOpts` から `provider` / `promptToken` を削除し、`runClaudeLogin` と `promptLine` と claude 分岐を削除する。`saveClaudeCodeOAuthToken` import を削除する。
- [x] `--force` 未指定時の判定を実装する:
  - `resolveGitHubToken(env, { host })` で最優先 token と source（`env` | `gh` | `credentials`）を解決する（config から `resolveGitHubHost` / `resolveGitHubApiBaseUrl`）。
  - `createGitHubClient(fetch, token, apiBaseUrl)` を組み `verifyTokenScopes()` を呼び、`github-token-valid` check と同一分類で valid(200) / invalid(401) / unknown(その他・timeout・例外) に分ける。
  - valid → 出所を表示して Device Flow を省略し return 0（source が env の場合は GH_TOKEN/GITHUB_TOKEN のどちらかを表示）。
  - invalid かつ source==credentials → Device Flow へ進む。
  - invalid かつ source∈{env,gh} → その認証源の修正/解除を案内し return 非 0（Device Flow へ進まない）。
  - unknown → connectivity 案内し return 非 0（Device Flow へ進まない）。
  - `resolveGitHubToken` が throw（token 無し）→ Device Flow へ進む。
- [x] `--force` 指定時は解決/検証を飛ばし無条件で Device Flow を実行し credentials.json を上書きする（現行 force 挙動を維持）。
- [x] Device Flow 成功後の config scaffold 生成と credentials 保存（既存ロジック）は維持する。
- [x] token 値・secret を stdout/stderr に出さない。

**Acceptance Criteria**:
- valid 時: Device Flow が呼ばれず、source が表示され exit 0（テスト固定）。
- invalid + source env/gh 時: Device Flow が呼ばれず、認証源修正の案内が出て exit 非 0（テスト固定）。
- invalid + source credentials 時: Device Flow が呼ばれる（テスト固定）。
- token 無し時: Device Flow が呼ばれる。
- `--force` 時: 常に Device Flow が呼ばれる。
- `LoginOpts` に `provider` が存在しない。

## T-03: `credentials set <name>` サブコマンドと secret 入力ユーティリティを新設する（D3）

- [x] `src/util/secret-input.ts` を新設し、`readSecret({ isTTY, input, output }): Promise<string>` を実装する:
  - TTY: `input.setRawMode(true)` で 1 文字ずつ読み、`output` へ echo せず、改行/EOT(``)で確定、``(Ctrl-C)で中断、backspace 対応。確定時および ``(Ctrl-C) 中断時のいずれでも `setRawMode(false)` を呼んでから確定/中断すること（端末破壊防止）。確定時は末尾に改行のみ出力する。
  - 非 TTY: `input` を末尾まで読み、trim して返す。
  - stream を注入 seam にする（`process.stdin` / `process.stdout` を直接掴まない）。
- [x] `src/cli/credentials.ts` を新設し、`runCredentialsSet(name: string, opts?): Promise<number>` を実装する:
  - `name` が `claude-code` / `anthropic-api-key` 以外なら usage を出して return 非 0。
  - secret を `readSecret` で取得し、空なら logError して return 非 0。
  - `claude-code` → `saveClaudeCodeOAuthToken(value)`、`anthropic-api-key` → `saveSpecRunnerApiKey(value)` で保存する。
  - 保存後、値を出さずに doctor での検証案内（例 `Run 'specrunner doctor' to verify.`）を出し return 0。
- [x] `src/cli/command-registry.ts` に top-level parent command `credentials`（`set` サブコマンド、`positional: { name: "name", required: true }`、repo 不要）を追加し、`CREDENTIALS_USAGE` を新設する。handler は positional から name を取り `runCredentialsSet` を呼ぶ。

**Acceptance Criteria**:
- `credentials set claude-code` が `anthropic.claudeCodeOAuthToken` を credentials.json（0600）へ保存する（テスト固定）。
- `credentials set anthropic-api-key` が `anthropic.apiKey` を credentials.json（0600）へ保存する（テスト固定）。
- 既に別 key（例 github token）が在っても保存後に保持される。
- secret が output stream に一度も書かれない（TTY silent / 非 TTY stdin の両経路をテスト固定）。
- 未知の `<name>` は非 0 終了。

## T-04: login の migration flag を registry に登録し、usage / top-level help を更新する（D2, D6）

- [x] `src/cli/command-registry.ts` の `login` の flags で `provider` を deprecated marker（`{ type: "string", deprecated: { message } }`）に置換する。message は `specrunner login` が GitHub 専用になった旨と `credentials set claude-code` への誘導を含める。handler から provider の受け渡しを削除する。
- [x] `LOGIN_USAGE` を GitHub 専用へ書き換える（`--provider` 行と Claude Code セクションを削除）。
- [x] top-level `USAGE` の `login` 行を GitHub 専用の説明にし、Environment commands に `credentials set <name>` 行を追加する。

**Acceptance Criteria**:
- `login --provider claude` が dispatch で非 0 終了し、stderr に `credentials set claude-code` を含む（テスト固定）。
- `LOGIN_USAGE` / top-level `USAGE` に `--provider` の記載が無い。
- top-level `USAGE` に `credentials set` の記載がある。

## T-05: dead guidance を実在コマンドへ全置換する（D4, D6）

- [x] `login --provider anthropic` → `credentials set anthropic-api-key`（または `SPECRUNNER_API_KEY`）へ置換:
  - `src/core/doctor/checks/config/managed-key-present.ts`
  - `src/core/doctor/checks/auth/managed-key-valid.ts`
  - `src/core/doctor/checks/agents/environment-provider-alive.ts`
  - `src/core/doctor/checks/agents/agent-provider-alive.ts`
  - `src/core/runtime/prereqs.ts`
- [x] `src/core/credentials/anthropic.ts` の `ANTHROPIC_KEY_MISSING_HINT` から "future `login --provider anthropic`" 文言を削除し `credentials set anthropic-api-key` / `SPECRUNNER_API_KEY` の案内へ書き換える。
- [x] `login --provider claude` → `credentials set claude-code` へ置換:
  - `src/core/credentials/claude-code.ts`（`CLAUDE_CODE_TOKEN_MISSING_HINT`）
  - `src/core/runtime/provider-readiness.ts`（`auth-missing` / `auth-invalid` の 2 hint）
- [x] `src/` 全体で `login --provider anthropic` / `login --provider claude` の文字列が残っていないことを grep で確認する（usage / コメント含む）。

**Acceptance Criteria**:
- 上記全ファイルに `login --provider ...` の文字列が残らない。
- `PROVIDER_READINESS_HINTS` が実在コマンド（`credentials`）を参照し、既存 `tests/hint-command-existence.test.ts` が green。

## T-06: doctor を導線の中心にする（D5）

- [x] `src/core/doctor/checks/config/claude-code-token-present.ts`: warn ステータスは維持し、hint を「cron / inbox 利用時のみ必要」の注記 + `specrunner credentials set claude-code` へ書き換える。
- [x] `src/core/doctor/formatter.ts` `formatHuman`: Summary 行の後、`fail === 0` のとき `Ready to run.` と次の一歩 `specrunner request new <slug>` を 1 行出力する。`fail > 0` のときは出力しない（既存の fail 由来 Next steps は維持）。exit code ロジック（`runDoctor`）は変更しない。

**Acceptance Criteria**:
- headless Claude credential 未設定時の check 結果が `warn` で、hint に cron/inbox の注記と `credentials set claude-code` を含む（テスト固定）。
- `fail==0`（warn 有無に関わらず）の `formatHuman` 出力が `Ready to run.` と `specrunner request new` を含む（テスト固定）。
- `fail>0` の `formatHuman` 出力が `Ready to run.` を含まない（テスト固定）。

## T-07: init の provider flag 無言無視をやめる（D9）

- [x] `src/cli/init.ts` `runInit`: `configExists === true` かつ `flagProvider !== undefined` のとき、無視した事実と `getConfigPath()` の config を編集する旨を出力する（config は上書きしない）。
- [x] config 生成時（`!configExists` ブロック内）の `Run 'specrunner login'...` 案内を doctor 誘導（`Run 'specrunner doctor' to see what's still needed.`）へ書き換える。
- [x] flag 名は `--provider` のまま（改名しない）。registry の init flags は現状維持。

**Acceptance Criteria**:
- 既存 global config + `--provider` 指定の `runInit` が案内を出力し、config は不変（テスト固定）。
- 既存 `tests/init.test.ts` の "config exists, provider flag is ignored"（config 不変）が引き続き green。

## T-08: README Quick Start を doctor 中心導線へ書き換える（D10）

- [x] `README.md` の `## Quick Start` 節（"Joining an existing project" サブセクション含む）を `init → doctor → 不足分のみセットアップ → doctor → 最初の job` の導線へ書き換える。
- [x] 主手順から無条件 `npx specrunner login` を外し、`gh auth login` 済み / env 供給済みなら login 不要である旨を明記する。login は doctor が GitHub token 不足を指摘したときのみのステップとして提示する。
- [x] Quick Start 節以外は変更しない。

**Acceptance Criteria**:
- Quick Start が `specrunner doctor` を含む。
- Quick Start に無条件必須の `login` 手順が無い（テスト固定）。

## T-09: 既存 default-pin テストの更新（D8）

- [x] `src/cli/__tests__/login.test.ts`: TC-001/002/015/016/017（claude login 経路）と "provider dispatch" を削除し、GitHub 専用 + T-02 の validity 4 分岐 + `--force` をカバーするテストへ書き換える。
- [x] `src/core/doctor/checks/config/__tests__/claude-code-token-present.test.ts`: hint 期待を `login --provider claude` から `credentials set claude-code` へ更新し、cron/inbox 注記の assert を追加する。

**Acceptance Criteria**:
- 更新後の両テストが green で、旧文言（`login --provider claude`）を assert しない。

## T-10: 機械検証テストを追加する（D7）

- [x] `src/` 全体を走査し `login --provider anthropic` / `login --provider claude` の文字列が存在しないことを固定する grep 系テストを `tests/` に追加する（既存 grep テスト群のスタイルに倣う）。
- [x] doctor hint の実在性テストを追加/拡張する: `src/core/doctor/**` の hint 中の `specrunner <verb> [<sub>]` が `COMMANDS`（parent の subcommand 含む）に実在することを検証する（`tests/hint-command-existence.test.ts` の拡張可）。
- [x] `tests/hint-command-existence.test.ts` の TC-005 ブロックを subcommand まで検証するよう拡張する: `PROVIDER_READINESS_HINTS` 中の `specrunner <verb> <sub>` パターンについて、`<verb>` が top-level command として実在するだけでなく、`<sub>` が `COMMANDS[verb].subcommands` にも実在することを assert する（`extractCommandVerbs` の top-level 抽出に加え、`specrunner \w+ \w+` マッチで sub を抽出しサブコマンド存在を検証する）。
- [x] `credentials set` の 0600 保存と no-echo（TTY silent / 非 TTY stdin）を固定するテストを追加する（T-03 の受け入れを満たす）。
- [x] `login --provider claude` の migration 捕捉（非 0 + `credentials set claude-code` 案内）を固定するテストを追加する（parse もしくは dispatch レベル）。
- [x] doctor readiness（fail==0 → Ready + 次の一歩、fail>0 → Ready 無し）を `formatHuman` で固定するテストを追加する。
- [x] init 無言無視解消（案内出力 + config 不変）を固定するテストを追加する。
- [x] README Quick Start が doctor 中心（`specrunner doctor` を含み、無条件必須 login 手順が無い）を固定するテストを追加する。

**Acceptance Criteria**:
- 上記すべてのテストが実装挙動に対して green。
- `typecheck && test` が green。
