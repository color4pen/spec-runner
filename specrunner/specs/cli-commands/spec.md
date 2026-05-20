## Purpose

`specrunner` CLI のサブコマンド群（`init` / `login` / `run` / `ps` / `doctor` / `finish`）の振る舞い・引数・終了コード・stdout/stderr 出力を定義する。
## Requirements

### Requirement: `specrunner init` は Agent と Environment を作成または同期する

`specrunner init` は MUST Anthropic API key を環境変数 `ANTHROPIC_API_KEY` または既存 config から取得し、Agent と Environment を冪等に作成または更新し、ID を `~/.config/specrunner/config.json` に SHALL 保存する。

#### Scenario: API key が無い

- **WHEN** `ANTHROPIC_API_KEY` が未設定で config にも apiKey が無い状態で `specrunner init` を実行する
- **THEN** `ANTHROPIC_API_KEY を設定するか --api-key で渡してください` を stderr に出し、exit code 1 で終了する

#### Scenario: 初回実行（config 未作成）

- **WHEN** `~/.config/specrunner/config.json` が存在しない状態で `specrunner init` を実行する
- **THEN** Anthropic に Agent を 1 つ、Environment を 1 つ作成し、両 ID と apiKey を含む config をパーミッション 0600 で作成し、各ステップを stdout に表示し exit code 0 で終了する

#### Scenario: 既存 Agent / Environment があり差分がない

- **WHEN** config に agent.id と environment.id が記録された状態で `specrunner init` を実行し、CLI 側 Agent 定義と既存 Agent の definitionHash が一致する
- **THEN** 既存リソースを再利用する旨を stdout に出し、新規作成は行わず exit code 0 で終了する

#### Scenario: Agent 定義に差分がある

- **WHEN** CLI 側 Agent 定義のハッシュが既存 Agent と異なる
- **THEN** `agents.update` を実行して definitionHash を config に保存し、更新内容を stdout に表示する

### Requirement: `specrunner login` は GitHub Device Flow OAuth でトークンを取得する

`specrunner login` は MUST GitHub OAuth Device Flow を実行し、`repo` スコープのアクセストークンを config の `github.accessToken` に SHALL 保存する。

#### Scenario: 通常成功フロー

- **WHEN** ユーザーが `specrunner login` を実行し、表示された `verification_uri` で `user_code` を入力し承認する
- **THEN** access token を取得し config に `github.accessToken` / `tokenObtainedAt` / `scopes` を保存し、`Logged in as <login>` を stdout に表示し exit code 0 で終了する

#### Scenario: 認証コード期限切れ

- **WHEN** ユーザーが期限内に承認せず、GitHub からの応答が `expired_token` になる
- **THEN** `Authorization timed out. Run 'specrunner login' again.` を stderr に出力し exit code 1 で終了する

#### Scenario: ユーザーが拒否

- **WHEN** ユーザーが GitHub 上で承認を拒否し `access_denied` が返る
- **THEN** `Authorization denied by user.` を stderr に出力し exit code 1 で終了する

### Requirement: `specrunner job start` は起動前に fail-fast バリデーションを固定順序で実行する

`specrunner run` は MUST 以下の 5 段階を **この順序で** 実行し、最初に失敗したステップで即時終了する。後続ステップの評価は行わない。

1. `~/.config/specrunner/config.json` が存在すること（なければ `Run 'specrunner init' first.` + exit 1）
2. `apiKey` / `agentId` / `environmentId` / `githubToken` がすべて config に揃っていること（欠けた項目に応じて `Run 'specrunner init' first.` または `Run 'specrunner login' first.` + exit 1）
3. cwd が git リポジトリであること（`.git` 未発見なら `Not a git repository.` + exit 1）
4. `git remote get-url origin` が `github.com` を指すこと（非 GitHub なら `'origin' must point to github.com.` + exit 1）
5. 引数の `<request.md>` ファイルが存在しパース可能であること（存在しない場合は `Request file not found: <path>` + exit 1）

#### Scenario: config が存在しない（ステップ 1 で失敗）

- **WHEN** `~/.config/specrunner/config.json` が存在しない状態で `specrunner run req.md` を実行する
- **THEN** ステップ 1 で即時 exit 1 し、git repo チェック等は実行しない

#### Scenario: github token が欠けている（ステップ 2 で失敗）

- **WHEN** config は存在するが `github.accessToken` が未設定
- **THEN** ステップ 2 で `Run 'specrunner login' first.` を stderr に出し exit 1。cwd チェック等は実行しない

#### Scenario: origin が GitHub 以外（ステップ 4 で失敗）

- **WHEN** config と token は揃い cwd は git repo だが origin が gitlab.com を指す
- **THEN** ステップ 4 で `'origin' must point to github.com.` を stderr に出し exit 1

### Requirement: `specrunner job start <request.md|slug>` は propose と spec-review セッションを直列で実行する

`specrunner run` は MUST 引数で渡された request.md ファイルから request 情報を抽出し、cwd の git remote から repo を特定し、propose セッションを作成して完了を検知し、続いて spec-review セッションを作成して完了を検知する。spec-review 完了後、verdict を取得して stdout に表示し、SHALL 状態ファイルを各ステップ完了時に更新する。

#### Scenario: spec-review-result.md が見つからない

- **WHEN** propose は正常完了したが spec-review セッション完了後に `deps.githubClient.getRawFile` が adapter 内部リトライ後も null を返す
- **THEN** state.status を `failed`、error.code を `SPEC_REVIEW_RESULT_NOT_FOUND` で記録し、stderr に `Spec-review result file not found on branch '<branch>'.` を出力し exit code 1 で終了する

### Requirement: `specrunner` バイナリは noun-verb 体系のサブコマンド群を提供する

`specrunner` CLI は SHALL `request` / `job` / `runtime` の 3 名詞グループと `init` / `login` / `doctor` の環境系コマンドを提供する。引数なし、または不明なサブコマンドが渡された場合は usage を stderr に出力し、exit code 2 で MUST 終了する。

旧 top-level コマンド `ps` / `rm` / `resume` / `finish` は SHALL NOT 提供される（廃止）。不明なサブコマンドとして `Unknown command: ps` 等を返す。

#### Scenario: 引数なしで実行された場合

- **WHEN** ユーザーが `specrunner` をサブコマンドなしで実行する
- **THEN** stderr に request / job / 環境系の 3 グループにまとめた usage を出力し、exit code 2 で終了する

#### Scenario: 旧 top-level `ps` を実行した場合

- **WHEN** ユーザーが `specrunner ps` を実行する
- **THEN** `Unknown command: ps` を stderr に出し exit code 2 で終了する

#### Scenario: 旧 top-level `resume` を実行した場合

- **WHEN** ユーザーが `specrunner resume <slug>` を実行する
- **THEN** `Unknown command: resume` を stderr に出し exit code 2 で終了する

#### Scenario: 旧 top-level `finish` を実行した場合

- **WHEN** ユーザーが `specrunner finish <slug>` を実行する
- **THEN** `Unknown command: finish` を stderr に出し exit code 2 で終了する

### Requirement: `specrunner doctor` は 7 カテゴリの環境前提条件を診断する

`specrunner doctor` の `repo` カテゴリチェックは MUST 以下を検証する:

- cwd が git repository であること
- `origin` remote が GitHub を指していること
- `openspec/project.md` が存在すること
- `specrunner/changes/{active,merged}/` の 2 ディレクトリが存在すること（warn レベル、不在時も pass を妨げない）

The workflow structure check SHALL verify that the following directories exist:

- `specrunner/changes/active/`
- `specrunner/changes/merged/`

The check SHALL be implemented in `src/core/doctor/checks/repo/workflow-structure.ts` with:

```typescript
const REQUIRED_DIRS = ["active", "merged"] as const;
```

Path construction SHALL use `specrunner/changes/` as the base directory:

```typescript
const fullPath = path.join(ctx.cwd, "specrunner", "changes", dir);
```

The check SHALL return:
- `pass` status with message `"specrunner/changes/ structure is complete"` when all directories exist
- `warn` status with message `"specrunner/changes/ is missing dirs: ${missing.join(", ")}"` when directories are missing
- hint: `"Create the missing directories manually."`

#### Scenario: 全ての要求 dir が存在する

- **WHEN** `specrunner/changes/active/` と `specrunner/changes/merged/` がともに存在する
- **THEN** doctor の workflow-structure check は `pass` を返し、message は `"specrunner/changes/ structure is complete"`

#### Scenario: 一部 dir が不在

- **WHEN** `specrunner/changes/merged/` が不在
- **THEN** doctor の workflow-structure check は `warn` を返し、message は `"specrunner/changes/ is missing dirs: merged"`、hint は `"Create the missing directories manually."`

Note: The previous requirement for `openspec-workflow/requests/{active,awaiting-merge,merged,canceled}/` is superseded by this delta spec.

### Requirement: `specrunner doctor --json` は機械可読 JSON を stdout に出力する

`specrunner doctor` は MUST `--json` フラグを受け付け、指定された場合は人間向け装飾出力を抑止し、以下の schema に従う JSON を stdout に 1 行ずつではなく整形済みオブジェクトとして出力する。

```json
{
  "summary": { "pass": <number>, "warn": <number>, "fail": <number> },
  "results": [
    {
      "name": "<string>",
      "category": "runtime | config | env | auth | repo | agents | storage",
      "required": <boolean>,
      "status": "pass | warn | fail",
      "message": "<string>",
      "hint": "<string>?",
      "details": ["<string>", ...]?
    }
  ]
}
```

results 配列は SHALL 実行順を維持する。`hint` と `details` は省略可能フィールド（`undefined` 時は JSON object に出さない）。

#### Scenario: `--json` で全 pass

- **WHEN** ユーザーが健全環境で `specrunner doctor --json` を実行する
- **THEN** stdout に上記 schema に準拠した JSON を出力し、`summary.fail` は 0、exit code 0 で終了する

#### Scenario: `--json` で fail を含む

- **WHEN** config 不在状態で `specrunner doctor --json` を実行する
- **THEN** `results` 配列の該当 check が `status: "fail"` で含まれ、`summary.fail >= 1`、exit code 1 で終了する

#### Scenario: `--json` 出力は装飾文字を含まない

- **WHEN** ユーザーが `specrunner doctor --json` を実行する
- **THEN** stdout は `JSON.parse()` で完全にパース可能であり、`[✓]` / `[!]` / `[✗]` / カラーコードを含まない

### Requirement: `specrunner doctor` の exit code は pass/warn=0、fail=1、crash=2 で安定する

`specrunner doctor` の exit code は MUST 以下 3 値のいずれかでなければならない。

| Exit Code | 条件 |
|-----------|------|
| 0 | 全 result が `pass` または `warn`（fail が 0） |
| 1 | 1 つ以上の result が `fail`（required を問わず） |
| 2 | doctor runner / formatter 内部で unhandled exception |

`required: false` の check が `fail` を返した場合も exit 1 とする（fail は fail として扱う、warn と区別する）。

#### Scenario: 全 pass で exit 0

- **WHEN** 全 check が `pass` を返す
- **THEN** exit code 0 で終了する

#### Scenario: warn のみで exit 0

- **WHEN** 1 つ以上の check が `warn` を返し、`fail` を返す check が 1 つもない
- **THEN** exit code 0 で終了する

#### Scenario: 1 件でも fail で exit 1

- **WHEN** 1 つの check が `fail` を返し、他は全て `pass`
- **THEN** exit code 1 で終了する

#### Scenario: required=false の fail でも exit 1

- **WHEN** `required: false` の check が `fail` を返す
- **THEN** exit code 1 で終了する（required 属性は exit code を変えない）

### Requirement: 各 `DoctorCheck` は独立した object として export され、unit test 可能である

各 check は SHALL 以下の interface に従う独立 object として export されなければならない。`DoctorContext` を mock することで、外部依存（fetch / fs / child_process / config 読み出し / GitHub API / Anthropic API）をすべて差し替えて単独で unit test 可能でなければならない。

```typescript
interface DoctorCheck {
  name: string;
  category: "runtime" | "config" | "env" | "auth" | "repo" | "agents" | "storage";
  required: boolean;
  check(ctx: DoctorContext): Promise<DoctorResult>;
}

interface DoctorResult {
  status: "pass" | "warn" | "fail";
  message: string;
  hint?: string;
  details?: string[];
}
```

`DoctorContext` は SHALL `cwd` / `env` / `now` / `fetch` / `fs` / `execFile` / `config`（ConfigStore 経由）/ `githubClient`（既存 port）/ `anthropicClient`（既存 port）/ `homeDir` を提供する。core から adapter を直接 import してはならない。

#### Scenario: 各 check が単独でテストできる

- **WHEN** 開発者が `nodeVersionCheck.check(mockCtx)` を fake `DoctorContext` で呼ぶ
- **THEN** 実 process の node version に依存せず、mock が返す値に応じて `DoctorResult` を返す

#### Scenario: ネットワーク check が timeout で warn になる

- **WHEN** Anthropic / GitHub への HTTP request が 5 秒以内に応答しない
- **THEN** 該当 check は `warn` を返し（fail ではない）、message に `network timeout` を含み、`hint` で `Check connectivity and retry.` を提示する

#### Scenario: jobs ディレクトリが存在しない（親 dir は書き込み可）

- **WHEN** `~/.local/share/specrunner/jobs/` が存在しないが、親ディレクトリ `~/.local/share/specrunner/` は書き込み可能な状態で `specrunner doctor` を実行する
- **THEN** storage category の該当 check が `warn` を返し、hint で `Run 'specrunner ps' once to initialize storage.` を表示し、exit code 0 で終了する

#### Scenario: jobs 親ディレクトリが書き込み不可

- **WHEN** `~/.local/share/specrunner/jobs/` が存在せず、かつ親ディレクトリも書き込み不可な状態で `specrunner doctor` を実行する
- **THEN** storage category の該当 check が `fail` を返し、hint で `Parent directory is not writable. Check permissions.` を表示し、exit code 1 で終了する

### Requirement: `specrunner doctor` の `github-token-present` check は token 取得元を表示する

`github-token-present` check の pass message は MUST 解決元 (`resolveGitHubToken` の `source`) を含める。

- credentials.json 由来: `GitHub token is available (source: credentials)`
- `GITHUB_TOKEN` env var 由来: `GitHub token is available (source: env)`

`github-token-valid` check は scope 検証が責務のため source を出力しない。

#### Scenario: credentials.json から token が解決される

- **WHEN** `~/.config/specrunner/credentials.json` の `github.token` が存在し、env var が unset
- **THEN** `github-token-present` check は `pass` を返し、message は `GitHub token is available (source: credentials)`

#### Scenario: env var から token が解決される

- **WHEN** credentials.json は空または不在、かつ `GITHUB_TOKEN` env var が設定されている
- **THEN** `github-token-present` check は `pass` を返し、message は `GitHub token is available (source: env)`

### Requirement: `specrunner job start` の preflight は GitHub token 取得元を info ログに出力する

`runPreflight` 実行時、`resolveGitHubToken` が成功した直後に MUST 取得元を info ログに 1 行出力する。

- credentials.json 由来: `GitHub token source: credentials`
- env var 由来: `GitHub token source: env`

#### Scenario: preflight 成功時に取得元が stdout に出る

- **WHEN** `specrunner run` を起動し、preflight の token resolve が credentials.json で成功する
- **THEN** stdout に `GitHub token source: credentials` の info ログが 1 行出力される

#### Scenario: env var 経由でも取得元が表示される

- **WHEN** `specrunner run` を起動し、preflight の token resolve が `GITHUB_TOKEN` env var で成功する
- **THEN** stdout に `GitHub token source: env` の info ログが 1 行出力される

### Requirement: `specrunner request template` が scaffold に `adr` フィールドと判断基準コメントを出力する

以下を新規 Requirement として定義する:

---

`specrunner request template` が出力する scaffold の Meta セクションに `- **adr**: false` を `base-branch` の直後に含める。

scaffold には ADR 判断基準を HTML コメントとして含める:

```
<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->
```

#### Scenario: scaffold に adr フィールドが含まれる

- **WHEN** `specrunner request template` を実行する
- **THEN** stdout に `- **adr**: false` が出力される
- **AND** `base-branch` 行の直後に出力される

#### Scenario: scaffold に ADR 判断基準コメントが含まれる

- **WHEN** `specrunner request template` を実行する
- **THEN** stdout に `<!-- adr 判断基準:` で始まる HTML コメントが出力される

### Requirement: `specrunner request generate` / `specrunner request review` は LLM 呼び出しの進捗を stderr に出力する

`specrunner request create` と `specrunner request review` は MUST LLM query() 呼び出しの開始時と完了時に stderr へ進捗メッセージを出力する。

#### 進捗メッセージ仕様

| コマンド | タイミング | メッセージ |
|----------|-----------|-----------|
| `request create` | query() 呼び出し直前 | `Generating request.md...` |
| `request create` | 成功時 | `✓ Generated <slug>` |
| `request create` | 失敗時 | `✗ Failed: <error message>` |
| `request review` | query() 呼び出し直前 | `Reviewing request.md...` |
| `request review` | 成功時 | `✓ Reviewed` |
| `request review` | 失敗時 | `✗ Failed: <error message>` |

進捗メッセージは SHALL stderr に出力する（stdout は構造化結果のために予約）。

#### Scenario: request create の開始メッセージ

- **WHEN** ユーザーが `specrunner request create "..."` を実行する
- **THEN** LLM 呼び出し前に `Generating request.md...` が stderr に出力される

#### Scenario: request create の成功メッセージ

- **WHEN** `specrunner request create` が正常に完了する
- **THEN** `✓ Generated <slug>` が stderr に出力され、slug が stdout に出力される

#### Scenario: request create の失敗メッセージ

- **WHEN** `specrunner request create` の LLM 呼び出しが失敗する
- **THEN** `✗ Failed: <error message>` が stderr に出力される（既存の `Error:` / `Hint:` 出力に先行）

#### Scenario: request review の開始メッセージ

- **WHEN** ユーザーが `specrunner request review <file>` を実行する
- **THEN** LLM 呼び出し前に `Reviewing request.md...` が stderr に出力される

#### Scenario: request review の成功メッセージ

- **WHEN** `specrunner request review` が正常に完了する
- **THEN** `✓ Reviewed` が stderr に出力される（その後に verdict 等の通常出力が続く）

#### Scenario: request review の失敗メッセージ

- **WHEN** `specrunner request review` の LLM 呼び出しが失敗する
- **THEN** `✗ Failed: <error message>` が stderr に出力される

### Requirement: `--verbose` フラグによる詳細ログファイル出力

- `specrunner run --verbose <slug>` で詳細実行ログをファイルに書き出す
- `specrunner resume --verbose <slug>` でも同一 jobId のログファイルに追記する
- `SPECRUNNER_LOG_LEVEL=verbose` 環境変数でも `--verbose` と同じ動作になる
- CLI flag と環境変数の判定は `resolveVerboseFlag()` で 1 箇所に集約する
- verbose 有効時、`~/.local/state/specrunner/logs/<jobId>.log` に JSON Lines 形式でログを書き出す
  - `$XDG_STATE_HOME` が設定されている場合はそちらを使用する
  - ログディレクトリは初回書き込み時に自動作成する（`mkdirSync({ recursive: true })`）
- verbose 未指定時はログファイルを生成しない（既存 stderr 出力は変更なし）
- 同一 jobId の retry / resume でログファイルは追記モードで 1 ファイルに集約される
- ログ対象:
  - SSE event 種別（`session.status_idle` / `session.error` 等）と payload
  - ポーリング試行回数・間隔・セッション status
  - セッション作成・削除タイミング（managed / local 両 runtime）
  - step 遷移タイムスタンプ

### Requirement: `specrunner --help` は主語別グルーピングで表示される

`specrunner --help` は MUST 以下の 4 ブロック構造で usage を stdout に出力する。exit code 0 で終了する。

```
request commands:
  request new <slug>            template から request.md を作る
  request generate "<text>"     LLM 生成で request.md を作る
  request ls                    active 配下の request 一覧
  request show <slug>           request.md の本文を表示
  request rm <slug>             active 配下から削除
  request validate <file|slug>  構文 / 規律 check
  request template              雛形 markdown を stdout
  request review <slug|file>    architect agent によるレビュー

job commands:
  job start <request-slug|file>  pipeline 開始、jobId 発行
  job ls                         全 job 一覧
  job show <jobId|slug>          job state 詳細
  job rm <jobId>                 job state file 削除
  job resume <slug>              halted job を再開
  job finish <slug>              PR merge + archive

environment commands:
  init                           config scaffold
  login                          GitHub Device Flow OAuth
  doctor                         環境診断
  runtime setup|status|reset     Manage Anthropic runtime resources

Aliases:
  run <slug|file>                job start の互換 alias
```

#### Scenario: `--help` または `-h` が渡された場合

- **WHEN** ユーザーが `specrunner --help` を実行する
- **THEN** stdout に request / job / environment の 3 グループと Aliases セクションにまとめた usage を出力し、exit code 0 で終了する

#### Scenario: `--help` の Aliases セクションに `run` が記載されている

- **WHEN** ユーザーが `specrunner --help` を実行する
- **THEN** Aliases セクションに `run` が `job start` の互換 alias として記載されている

### Requirement: `specrunner request` サブコマンド群が動作する

`specrunner request` は SHALL 以下の 8 サブコマンドを提供する。

| サブコマンド | 機能 |
|---|---|
| `new <slug>` | template から request.md を作る |
| `generate "<text>"` | LLM 生成で request.md を作る（旧 `request create` の rename） |
| `ls` | active 配下の request 一覧（旧 `request list` の rename） |
| `show <slug>` | request.md の本文を stdout に表示 |
| `rm <slug>` | active 配下から削除 |
| `validate <file|slug>` | 構文 / 規律 check（静的、LLM 不使用）。slug で active 配下を解決する |
| `template` | 雛形 markdown を stdout |
| `review <slug|file> [--json]` | architect agent によるレビュー（one-shot LLM、state-less）。slug で active 配下を解決する。`--json` フラグで機械可読 JSON を stdout に出力する |

旧 `request create` は SHALL NOT 動作する（`Unknown request subcommand: create` を返す）。
旧 `request list` は SHALL NOT 動作する（`Unknown request subcommand: list` を返す）。

#### Scenario: `specrunner request show <slug>` が request.md を表示する

- **WHEN** `specrunner request show my-feature` を実行する
- **THEN** `specrunner/requests/active/my-feature/request.md` の本文を stdout に出力し exit code 0 で終了する

#### Scenario: `specrunner request validate <slug>` が slug で解決する

- **WHEN** `specrunner request validate my-feature` を実行する（file path ではなく slug 指定）
- **THEN** `specrunner/requests/active/my-feature/request.md` を対象として validation を実行する

#### Scenario: `specrunner request review <slug>` が slug で解決する

- **WHEN** `specrunner request review my-feature` を実行する（file path ではなく slug 指定）
- **THEN** `specrunner/requests/active/my-feature/request.md` を対象としてレビューを実行する

#### Scenario: 旧 `request create` を実行した場合

- **WHEN** ユーザーが `specrunner request create "..."` を実行する
- **THEN** `Unknown request subcommand: create` を stderr に出し exit code 2 で終了する

#### Scenario: 旧 `request list` を実行した場合

- **WHEN** ユーザーが `specrunner request list` を実行する
- **THEN** `Unknown request subcommand: list` を stderr に出し exit code 2 で終了する

### Requirement: `specrunner job` サブコマンド群が動作する

`specrunner job` は SHALL 以下の 6 サブコマンドを提供する。

| サブコマンド | 機能 |
|---|---|
| `start <request-slug\|file>` | pipeline 開始、jobId 発行（旧 `run` の主流名）。slug / file path 両方を受ける |
| `ls` | 全 job 一覧（旧 `ps`） |
| `show <jobId\|slug>` | job state の主要フィールド（jobId / status / branch / step / createdAt / updatedAt）を stdout に表示 |
| `rm <jobId>` | job state file 削除 |
| `resume <slug>` | halted job を再開 |
| `finish <slug>` | PR merge + archive |

不明な job サブコマンドは MUST `Unknown job subcommand: <name>` を stderr に出し exit code 2 で終了する。

#### Scenario: `specrunner job start <slug>` で pipeline を起動する

- **WHEN** `specrunner job start my-feature` を実行する（slug 指定）
- **THEN** `specrunner/requests/active/my-feature/request.md` を対象として pipeline を開始する

#### Scenario: `specrunner job start <file>` で pipeline を起動する

- **WHEN** `specrunner job start path/to/request.md` を実行する（file path 指定）
- **THEN** 指定された request.md ファイルを対象として pipeline を開始する

#### Scenario: `specrunner job ls` で job 一覧を表示する

- **WHEN** `specrunner job ls` を実行する
- **THEN** `~/.local/share/specrunner/jobs/` 以下の job state をテーブル表示する（旧 `ps` と同等）

#### Scenario: `specrunner job show <jobId>` で job state を表示する

- **WHEN** `specrunner job show <jobId>` を実行する
- **THEN** jobId / status / branch / step / createdAt / updatedAt の主要フィールドを stdout に表示し exit code 0 で終了する

#### Scenario: 不明な job サブコマンドを実行した場合

- **WHEN** ユーザーが `specrunner job unknown` を実行する
- **THEN** `Unknown job subcommand: unknown` を stderr に出し exit code 2 で終了する

### Requirement: `specrunner run <slug>` は `job start <slug>` の唯一の互換 alias として動作する

`specrunner run <slug>` は MUST `specrunner job start <slug>` と同等に動作する唯一の互換 alias である。slug / file path 両方を受ける。それ以外の旧 alias（`ps` / top-level `rm` / top-level `resume` / top-level `finish`）は SHALL NOT 提供される。

#### Scenario: `specrunner run <slug>` が `job start` に展開される

- **WHEN** `specrunner run my-feature` を実行する
- **THEN** `specrunner job start my-feature` と同一の挙動で pipeline を開始する

### Requirement: `job start` / `job resume` / `job finish` は worktree guard の対象である

`job start` / `job resume` / `job finish` は MUST linked worktree 内から実行された場合 worktree guard error になる。`job ls` / `job rm` / `job show` は linked worktree 内でも実行できる。

subcommand dispatch path は MUST top-level command と同じ worktree guard を通す（既存の `WORKTREE_GUARDED_COMMANDS` set による guard を subcommand dispatch でも適用する）。

#### Scenario: linked worktree 内で `job start` を実行した場合

- **WHEN** linked worktree ディレクトリ内で `specrunner job start <slug>` を実行する
- **THEN** worktree guard error を出力し exit code 1 で終了する（pipeline は起動されない）

#### Scenario: linked worktree 内で `job ls` を実行した場合

- **WHEN** linked worktree ディレクトリ内で `specrunner job ls` を実行する
- **THEN** worktree guard をスキップし、通常通り job 一覧を表示する

#### Scenario: linked worktree 内で `job rm` を実行した場合

- **WHEN** linked worktree ディレクトリ内で `specrunner job rm <jobId>` を実行する
- **THEN** worktree guard をスキップし、通常通り job state file を削除する

#### Scenario: linked worktree 内で `job show` を実行した場合

- **WHEN** linked worktree ディレクトリ内で `specrunner job show <jobId>` を実行する
- **THEN** worktree guard をスキップし、通常通り job state を表示する

### Requirement: `specrunner request new <slug>` は template から request.md を作成する

`specrunner request new <slug> [--type <type>]` は MUST 以下を実行する:

1. slug が `/^[a-z0-9][a-z0-9-]{0,63}$/` にマッチしない場合は slug validation error を stderr に出し exit code 2 で終了する
2. `checkSlugCollision(cwd, slug)` で active / merged 配下の slug 重複をチェックする。重複時は `SLUG_COLLISION` error で exit 1
3. `--type` で指定された type（デフォルト: `new-feature`）の template を生成する
4. `specrunner/requests/active/<slug>.md` にファイルを書き出す
5. stderr に `Created: specrunner/requests/active/<slug>.md` を出力する
6. exit code 0 で終了する

#### Scenario: 新規 slug で request new

- **WHEN** `specrunner request new my-feature` を実行し、`my-feature` slug が未使用
- **THEN** `specrunner/requests/active/my-feature.md` が作成され、stderr に `Created: specrunner/requests/active/my-feature.md` が出力され、exit code 0

#### Scenario: 既存 slug で request new（slug collision）

- **WHEN** `specrunner request new existing-slug` を実行し、`existing-slug` が active に存在
- **THEN** `SLUG_COLLISION` error メッセージが出力され、exit code 1

#### Scenario: 不正 slug で request new（path traversal 防止）

- **WHEN** `specrunner request new "../../evil"` を実行する
- **THEN** slug validation error を stderr に出し exit code 2 で終了する

### Requirement: `specrunner request show <slug>` は request.md の本文を表示する

`specrunner request show <slug>` は MUST `specrunner/requests/active/<slug>.md` の内容を stdout に出力する。slug が active 配下に存在しない場合は `Request not found: <slug>` を stderr に出力し exit code 1 で終了する。

slug は `/^[a-z0-9][a-z0-9-]{0,63}$/` に MUST マッチする。マッチしない場合は exit code 2 で拒否する。

#### Scenario: 存在する slug で request show

- **WHEN** `specrunner request show my-feature` を実行し、active 配下に `my-feature.md` が存在する
- **THEN** request.md の全文が stdout に出力され、exit code 0

#### Scenario: 存在しない slug で request show

- **WHEN** `specrunner request show nonexistent` を実行し、active 配下に `nonexistent.md` が存在しない
- **THEN** stderr に `Request not found: nonexistent` を出力し、exit code 1

### Requirement: `specrunner request rm <slug>` は active 配下から request を削除する

`specrunner request rm <slug>` は MUST `specrunner/requests/active/<slug>.md` ファイルを削除する。slug が active 配下に存在しない場合は `Request not found: <slug>` を stderr に出力し exit code 1 で終了する。

slug は `/^[a-z0-9][a-z0-9-]{0,63}$/` に MUST マッチする。マッチしない場合は exit code 2 で拒否する（path traversal 防止）。

#### Scenario: 存在する slug で request rm

- **WHEN** `specrunner request rm my-feature` を実行し、active 配下に `my-feature.md` が存在する
- **THEN** ファイルが削除され、stderr に削除メッセージが出力され、exit code 0

#### Scenario: 存在しない slug で request rm

- **WHEN** `specrunner request rm nonexistent` を実行し、active 配下に `nonexistent.md` が存在しない
- **THEN** stderr に `Request not found: nonexistent` を出力し、exit code 1

#### Scenario: path traversal slug で request rm

- **WHEN** `specrunner request rm "../../etc"` を実行する
- **THEN** slug validation error を stderr に出し exit code 2 で終了する（ファイルシステム外への削除を防ぐ）

### Requirement: `specrunner job show <jobId|slug>` は job state の詳細を表示する

`specrunner job show <jobId|slug>` は MUST 以下の 6 フィールドを stdout に出力する:

- `Job ID`: 完全な UUID
- `Status`: job の現在ステータス
- `Branch`: 関連ブランチ名（未設定時は `(none)`）
- `Step`: 現在/最終ステップ名（未設定時は `(none)`）
- `Created`: createdAt タイムスタンプ
- `Updated`: updatedAt タイムスタンプ

入力が jobId（UUID 形式）の場合は直接 load する。slug の場合は全 job を走査し `getJobSlug()` で一致するものを解決する（複数該当時は最新 `updatedAt` 優先）。対象が存在しない場合は stderr にエラーを出力し exit code 1 で終了する。

#### Scenario: jobId で job show（6 フィールド表示）

- **WHEN** `specrunner job show abcd1234-...` を実行し、対応する job が存在する
- **THEN** Job ID / Status / Branch / Step / Created / Updated の 6 フィールドが stdout に出力され、exit code 0

#### Scenario: slug で job show

- **WHEN** `specrunner job show my-feature` を実行し、slug が `my-feature` の job が存在する
- **THEN** 6 フィールドが stdout に出力され、exit code 0

#### Scenario: 存在しない入力で job show

- **WHEN** `specrunner job show nonexistent` を実行し、該当 job が存在しない
- **THEN** stderr にエラーメッセージを出力し、exit code 1

### Requirement: job サブコマンドは jobId 引数を UUID 形式で検証する

`job rm` / `job show` / `job resume` / `job finish` の `<jobId>` 引数は `/^[a-f0-9-]{36}$/` にマッチしない場合、`Error: invalid jobId format` を stderr に出力し exit code 1 で終了する。これにより `~/.local/share/specrunner/jobs/` ディレクトリ外へのパス解決（`../` 等）を防ぐ。

#### Scenario: UUID でない jobId を渡した場合にエラーを返す

- **GIVEN** ユーザーが `specrunner job rm ../../../etc/passwd` を実行する
- **WHEN** jobId バリデーションが走る
- **THEN** `Error: invalid jobId format` を stderr に出力して exit code 1 で終了する
- **AND** ファイルシステムへのアクセスは行われない

#### Scenario: 正常 UUID は受理される

- **WHEN** ユーザーが `specrunner job rm abcd1234-ef56-7890-abcd-ef1234567890` を実行する
- **THEN** jobId validation を通過し、通常の削除処理に進む

### Requirement: `request new` / `request show` / `request rm` / `request validate` / `request review` は slug validation を実行する

`request new <slug>` / `request show <slug>` / `request rm <slug>` / `request validate <slug>` / `request review <slug>` は slug 入力に対し MUST `/^[a-z0-9][a-z0-9-]{0,63}$/` でバリデーションを実行する。マッチしない入力は exit code 2 で拒否し、path traversal（`../../` 等）を防ぐ。

#### Scenario: 不正 slug（path traversal）を拒否する

- **WHEN** `specrunner request rm "../../etc/passwd"` を実行する
- **THEN** stderr に validation error を出力し exit code 2 で終了する。ファイルシステム操作は実行されない

#### Scenario: 正常 slug は受理される

- **WHEN** `specrunner request new "my-feature-123"` を実行する（slug は `/^[a-z0-9][a-z0-9-]{0,63}$/` にマッチ）
- **THEN** slug validation を通過し、通常の処理に進む

### Requirement: `specrunner request` サブコマンド群が動作する（flat パス対応）

flat 化後、slug ベースのサブコマンドは `specrunner/requests/active/<slug>.md` を解決する。

#### Scenario: `specrunner request show <slug>` が request.md を表示する

- **WHEN** `specrunner request show my-feature` を実行する
- **THEN** `specrunner/requests/active/my-feature.md` の本文を stdout に出力し exit code 0 で終了する

#### Scenario: `specrunner request validate <slug>` が slug で解決する

- **WHEN** `specrunner request validate my-feature` を実行する（file path ではなく slug 指定）
- **THEN** `specrunner/requests/active/my-feature.md` を対象として validation を実行する

#### Scenario: `specrunner request review <slug>` が slug で解決する

- **WHEN** `specrunner request review my-feature` を実行する（file path ではなく slug 指定）
- **THEN** `specrunner/requests/active/my-feature.md` を対象としてレビューを実行する

### Requirement: `specrunner job` サブコマンド群が動作する（flat パス対応）

flat 化後、slug ベースの job start は `specrunner/requests/active/<slug>.md` を解決する。

#### Scenario: `specrunner job start <slug>` で pipeline を起動する

- **WHEN** `specrunner job start my-feature` を実行する（slug 指定）
- **THEN** `specrunner/requests/active/my-feature.md` を対象として pipeline を開始する

### Requirement: `specrunner request` サブコマンド群が動作する（drafts パス対応）

**Replaces**: 「`specrunner request` サブコマンド群が動作する（flat パス対応）」

drafts/ 化後、slug ベースのサブコマンドは `specrunner/drafts/<slug>.md` を解決する。

#### Scenario: `specrunner request show <slug>` が request.md を表示する

- **WHEN** `specrunner request show my-feature` を実行する
- **THEN** `specrunner/drafts/my-feature.md` の本文を stdout に出力し exit code 0 で終了する

#### Scenario: `specrunner request show <slug>` が旧 path を fallback で解決する

- **GIVEN** `specrunner/drafts/my-feature.md` が存在しない
- **AND** `specrunner/requests/active/my-feature.md` が存在する
- **WHEN** `specrunner request show my-feature` を実行する
- **THEN** `specrunner/requests/active/my-feature.md` の本文を stdout に出力し exit code 0 で終了する
- **AND** stderr に deprecation warning を出力する

#### Scenario: `specrunner request validate <slug>` が slug で解決する

- **WHEN** `specrunner request validate my-feature` を実行する（file path ではなく slug 指定）
- **THEN** `specrunner/drafts/my-feature.md` を対象として validation を実行する

#### Scenario: `specrunner request review <slug>` が slug で解決する

- **WHEN** `specrunner request review my-feature` を実行する（file path ではなく slug 指定）
- **THEN** `specrunner/drafts/my-feature.md` を対象としてレビューを実行する

### Requirement: `specrunner request` サブコマンド群が動作する（drafts テーブル更新）

**Replaces**: 「`specrunner request` サブコマンド群が動作する」のうち request サブコマンドテーブル

`specrunner request` は SHALL 以下の 8 サブコマンドを提供する。

| サブコマンド | 機能 |
|---|---|
| `new <slug>` | template から request.md を `specrunner/drafts/` に作る |
| `generate "<text>"` | LLM 生成で request.md を `specrunner/drafts/` に作る |
| `ls` | `specrunner/drafts/` 配下の request 一覧 |
| `show <slug>` | request.md の本文を stdout に表示（`drafts/` 優先、旧 `requests/active/` fallback） |
| `rm <slug>` | `specrunner/drafts/` 配下から削除 |
| `validate <file\|slug>` | 構文 / 規律 check。slug で `specrunner/drafts/` 配下を解決する |
| `template` | 雛形 markdown を stdout |
| `review <slug\|file> [--json]` | architect agent によるレビュー。slug で `specrunner/drafts/` 配下を解決する |

### Requirement: `specrunner job` サブコマンド群が動作する（drafts パス対応）

**Replaces**: 「`specrunner job` サブコマンド群が動作する（flat パス対応）」

drafts/ 化後、slug ベースの job start は `specrunner/drafts/<slug>.md` を解決する。

#### Scenario: `specrunner job start <slug>` で pipeline を起動する

- **WHEN** `specrunner job start my-feature` を実行する（slug 指定）
- **THEN** `specrunner/drafts/my-feature.md` を対象として pipeline を開始する

#### Scenario: `specrunner job start <slug>` で pipeline を起動する (旧 path)

- **WHEN** `specrunner job start my-feature` を実行する（slug 指定）
- **AND** `specrunner/drafts/my-feature.md` が存在しない
- **THEN** `specrunner/requests/active/my-feature.md` が存在すればそれを対象として pipeline を開始する

### Requirement: `specrunner job finish` 引数なし呼び出しはエラーで終了する

**New requirement**

`specrunner job finish` を slug / --pr / --job いずれも指定せず呼び出した場合、MUST `No slug specified. Specify <slug>, --pr, or --job.` を stderr に出し exit code 2 で終了する。旧 auto-detect (= `requests/active/` の 1 件自動選択) は SHALL NOT 動作する。

#### Scenario: `specrunner job finish` 引数なしで実行した場合

- **WHEN** `specrunner job finish` を引数なしで実行する
- **THEN** `No slug specified. Specify <slug>, --pr, or --job.` を stderr に出し exit code 2 で終了する
