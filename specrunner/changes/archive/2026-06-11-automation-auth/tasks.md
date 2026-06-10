# Tasks: automation-auth

## T-01: README に 3 つの自動化認証ドアを文書化する

- [x] `README.md` の Environment Variables 表に GitHub token の行を追加する（`GH_TOKEN` / `GITHUB_TOKEN`、用途・優先順位を明記）
- [x] GitHub 認証の 3 ドアを表で記載する: 対話 `login`（device flow access token）/ GitHub Actions（注入される `GITHUB_TOKEN`）/ 自前サーバ・cron（`GH_TOKEN` + fine-grained PAT）
- [x] 各ドアに token 種別と設定方法を併記する。自前サーバ・cron のドアでは fine-grained PAT が最長 1 年で失効する点に触れる
- [x] 自動化ドアが対話 `login` とは独立であること（device flow を実行できない無人文脈向け）を明記する
- [x] 既存の Scheduling 節（cron / launchd / GitHub Actions の例）と整合させ、GitHub Actions 例が `GITHUB_TOKEN` を使う理由を 3 ドアの文脈に接続する
- [x] `doctor` で現在解決される source を確認できる旨を導線として 1 行添える

**Acceptance Criteria**:
- README に対話 / GitHub Actions / 自前サーバの 3 経路が記載され、各々の token 種別と設定方法が示される
- README の記述が `resolveGitHubToken` の実優先順位（`GH_TOKEN` 最優先）と矛盾しない

## T-02: login が既存トークンを無断で上書きしないようにする

- [x] `src/cli/login.ts` の `runLogin` を `runLogin(opts?: { force?: boolean; env?: Record<string, string | undefined> })` に変更する（`env` は既定 `process.env`、テスト注入可能にする）
- [x] device flow 実行前に `loadCredentials()` を読み、`credentials.github.token` が非空かを判定する
- [x] 保存済みトークンが存在し `force` が false の場合: device flow を実行せず、`logWarn` で「既存トークンを保持した／上書きするには `specrunner login --force`」を出力し、credentials も config も書かずに exit 0 で返す（no-op）
- [x] `env` に `GH_TOKEN` または `GITHUB_TOKEN` が非空で存在する場合: 「`$<VAR>` が credentials より優先される」旨を `logWarn` で出力する（`GH_TOKEN` を優先判定）。阻止はせず続行する
- [x] 保存済みトークンが存在し `force` が true の場合、または保存済みトークンが無い場合: 従来どおり device flow → save を行う
- [x] `src/cli/command-registry.ts` の `login` コマンドに `--force`（boolean）フラグを追加し、`runLogin({ force })` に渡す

**Acceptance Criteria**:
- env にトークンがある状態で `login` を実行しても既存トークン（env / credentials のいずれも）が無断で失われない
- 保存済み credentials トークンは `--force` 無しでは上書きされない
- `--force` 指定時は従来どおり上書きされる
- `runLogin` の env が引数で注入可能になっている

## T-03: login の上書き保護を検証するテスト

- [x] 既存 `tests/unit/cli/login.test.ts` の各ケースに制御された `env`（既定で空 `{}`）を注入し、実環境の env による flaky 化を防ぐ
- [x] 保存済みトークンあり・`force` 無し → device flow 未実行・`saveCredentials` 未呼び出し・`logWarn` 呼び出し・exit 0・トークン保持を検証
- [x] 保存済みトークンあり・`force` あり → device flow 実行・`saveCredentials` で上書き・exit 0 を検証
- [x] `GH_TOKEN` セット・保存済み無し → 優先警告（`GH_TOKEN` を含む）・device flow 実行・save・exit 0 を検証
- [x] `GITHUB_TOKEN` セット・保存済み無し → 優先警告（`GITHUB_TOKEN` を含む）・続行を検証
- [x] 既存 TC-LOGIN-001（保存済み無し・env 無し → 無警告 save・exit 0）と TC-LOGIN-007（device flow throw → exit 1・no save）が green のまま

**Acceptance Criteria**:
- 上記すべてのケースが green
- 既存 login テストが env 注入後も green

## T-04: doctor のトークン source 可視化を強化する

- [x] `src/core/doctor/checks/config/github-token-present.ts` の pass message 形式 `GitHub token is available (source: <source>)` を後方互換に保つ
- [x] source が `env` の場合、`ctx.env` から解決に使われた env var 名（`GH_TOKEN` 優先、無ければ `GITHUB_TOKEN`）を判定し、`details` 行で補足する（例: `Resolved via $GH_TOKEN`）
- [x] `tests/core/doctor/checks/config/github-token-present.test.ts` に gh source と env source（env var 名補足）の回帰テストを追加する
- [x] 既存の credentials / env / null source のテストが green のまま

**Acceptance Criteria**:
- `doctor` が解決トークンの source（env / gh / credentials）を表示する
- source が env のとき具体的な env var 名が示される
- 既存 message 形式 `(source: env)` / `(source: credentials)` の substring 検証が壊れていない

## T-05: 検証

- [x] `bun run typecheck` が green
- [x] `bun run test` が green

**Acceptance Criteria**:
- `typecheck && test` が green
