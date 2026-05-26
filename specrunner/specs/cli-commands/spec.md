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

`specrunner job` は SHALL 以下のサブコマンドを提供する (`rm` を `cancel` に置換):

| サブコマンド | 機能 |
|---|---|
| `start <request-slug\|file>` | pipeline 開始、jobId 発行 |
| `ls` | 全 job 一覧 |
| `show <jobId\|slug>` | job state 詳細 |
| `cancel <jobId>` | job cancel + cleanup |
| `resume <slug>` | halted job を再開 |
| `finish <slug>` | PR merge + archive |

#### Scenario: `specrunner job rm` を実行した場合

- **WHEN** ユーザーが `specrunner job rm <jobId>` を実行する
- **THEN** `Unknown job subcommand: rm` を stderr に出し exit code 2 で終了する

#### Scenario: `specrunner rm` を実行した場合

- **WHEN** ユーザーが `specrunner rm <jobId>` を実行する
- **THEN** `Unknown command: rm` を stderr に出し exit code 2 で終了する

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

### Requirement: `request new` / `request validate` / `request review` は slug validation を実行する

`request new <slug>` / `request validate <slug>` / `request review <slug>` は slug 入力に対し MUST `/^[a-z0-9][a-z0-9-]{0,63}$/` でバリデーションを実行する。マッチしない入力は exit code 2 で拒否し、path traversal（`../../` 等）を防ぐ。

#### Scenario: 不正 slug（path traversal）を拒否する

- **WHEN** `specrunner request new "../../etc/passwd"` を実行する
- **THEN** stderr に validation error を出力し exit code 2 で終了する。ファイルシステム操作は実行されない

#### Scenario: 正常 slug は受理される

- **WHEN** `specrunner request new "my-feature-123"` を実行する（slug は `/^[a-z0-9][a-z0-9-]{0,63}$/` にマッチ）
- **THEN** slug validation を通過し、通常の処理に進む

### Requirement: `specrunner request` サブコマンド群が動作する（drafts パス対応）

**Replaces**: 「`specrunner request` サブコマンド群が動作する（drafts パス対応）」

drafts/ 化後、slug ベースのサブコマンドは MUST `specrunner/drafts/<slug>.md` を解決する。

#### Scenario: `specrunner request validate <slug>` が slug で解決する

- **WHEN** `specrunner request validate my-feature` を実行する（file path ではなく slug 指定）
- **THEN** `specrunner/drafts/my-feature.md` を対象として validation を実行する

#### Scenario: `specrunner request review <slug>` が slug で解決する

- **WHEN** `specrunner request review my-feature` を実行する（file path ではなく slug 指定）
- **THEN** `specrunner/drafts/my-feature.md` を対象としてレビューを実行する

### Requirement: `specrunner request` サブコマンド群が動作する（drafts テーブル更新）

**Replaces**: 「`specrunner request` サブコマンド群が動作する（drafts テーブル更新）」

`specrunner request` は SHALL 以下の 6 サブコマンドを提供する。

| サブコマンド | 機能 |
|---|---|
| `new <slug>` | template から request.md を `specrunner/drafts/` に作る |
| `generate "<text>"` | LLM 生成で request.md を `specrunner/drafts/` に作る |
| `ls` | `specrunner/drafts/` 配下の request 一覧 |
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

### Requirement: `specrunner --help` は主語別グルーピングで表示される

**Replaces**: 「`specrunner --help` は主語別グルーピングで表示される」

`specrunner --help` は MUST 以下の 4 ブロック構造で usage を stdout に出力する。exit code 0 で終了する。

```
request commands:
  request new <slug>            template から request.md を作る
  request generate "<text>"     LLM 生成で request.md を作る
  request ls                    drafts 配下の request 一覧
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

### Requirement: `specrunner request new <slug>` は template から request.md を作成する

**Replaces**: 「`specrunner request new <slug>` は template から request.md を作成する」

`specrunner request new <slug> [--type <type>]` は MUST 以下を実行する:

1. slug が `/^[a-z0-9][a-z0-9-]{0,63}$/` にマッチしない場合は slug validation error を stderr に出し exit code 2 で終了する
2. `checkSlugCollision(cwd, slug)` で drafts + changes/archive の 2 経路で slug 重複をチェックする。重複時は `SLUG_COLLISION` error で exit 1
3. `--type` で指定された type（デフォルト: `new-feature`）の template を生成する
4. `specrunner/drafts/<slug>.md` にファイルを書き出す
5. stderr に `Created: specrunner/drafts/<slug>.md` を出力する
6. exit code 0 で終了する

#### Scenario: 新規 slug で request new

- **WHEN** `specrunner request new my-feature` を実行し、`my-feature` slug が未使用
- **THEN** `specrunner/drafts/my-feature.md` が作成され、stderr に `Created: specrunner/drafts/my-feature.md` が出力され、exit code 0

#### Scenario: 既存 slug で request new（slug collision）

- **WHEN** `specrunner request new existing-slug` を実行し、`existing-slug` が drafts または changes/archive に存在
- **THEN** `SLUG_COLLISION` error メッセージが出力され、exit code 1

#### Scenario: 不正 slug で request new（path traversal 防止）

- **WHEN** `specrunner request new "../../evil"` を実行する
- **THEN** slug validation error を stderr に出し exit code 2 で終了する

### Requirement: `checkSlugCollision` は drafts + changes/archive の 2 経路で重複検出する

**New requirement**

`checkSlugCollision(cwd, slug)` は MUST `specrunner/drafts/` と `specrunner/changes/archive/` の 2 経路のみを走査し、slug の重複を検出する。`specrunner/requests/merged/` への参照は SHALL NOT 含まれる。

#### Scenario: drafts に同名 slug が存在する場合に衝突を検出する

- **WHEN** `specrunner/drafts/my-feature.md` が存在する状態で `checkSlugCollision(cwd, "my-feature")` を呼ぶ
- **THEN** `SLUG_COLLISION` を返す

#### Scenario: changes/archive に同名 slug が存在する場合に衝突を検出する

- **WHEN** `specrunner/changes/archive/my-feature/` ディレクトリが存在する状態で `checkSlugCollision(cwd, "my-feature")` を呼ぶ
- **THEN** `SLUG_COLLISION` を返す

#### Scenario: requests/merged/ は衝突チェック対象に含まれない

- **WHEN** `specrunner/requests/merged/` が存在しない状態で `checkSlugCollision(cwd, "any-slug")` を呼ぶ
- **THEN** `requests/merged/` 不在による ENOENT エラーは発生せず、正常に 2 経路チェックが完了する

### Requirement: `specrunner job cancel <jobId>` は job を cancel して cleanup する

`specrunner job cancel <jobId>` は MUST 対象 job の status に応じて以下の動作を実行する。

| status | 動作 |
|---|---|
| `running` | `state.pid` に SIGTERM 送信 → 5 秒待機 → 反応なければ SIGKILL → status を `canceled` に更新 + worktree 削除 + local/remote branch 削除 |
| `awaiting-resume` | status を `canceled` に更新 + worktree 削除 + local/remote branch 削除 |
| `awaiting-merge` | `--force` 必須。指定なければ stderr に `PR が open です。--force を付与してください` + exit 1。`--force` 指定時は remote branch 削除 (関連 PR は自動 close) + status=canceled + worktree 削除 |
| `failed` / `terminated` | status を `canceled` に更新 + worktree/branch 削除 (cleanup 用途、idempotent) |
| `archived` | reject: `既に archived です。cancel できません` を stderr + exit 1 |
| `canceled` | idempotent: worktree/branch の cleanup のみ実行 (state file は touch しない、`--purge` 指定時は例外: state file を削除する) |

cancel 動作の共通ルール:
- state file は保存 (削除しない、audit trail 保持)
- `error.code = "USER_CANCELED"` を state file に MUST 記録する
- `canceledAt` timestamp (ISO 8601) を state file に MUST 記録する
- worktree 削除前に `git worktree prune` 相当の cleanup を MUST 実行する
- local branch は `git branch -D <branch>` で削除 (best-effort)
- remote branch は `git push origin --delete <branch>` で削除 (best-effort)

#### Scenario: running job を cancel する

- **WHEN** status=running の job に `specrunner job cancel <jobId>` を実行する
- **THEN** SIGTERM → 5 秒待機 → (必要なら SIGKILL) → status=canceled に遷移、worktree/branch が削除される

#### Scenario: awaiting-merge job を --force なしで cancel する

- **WHEN** status=awaiting-merge の job に `specrunner job cancel <jobId>` を実行する (--force なし)
- **THEN** stderr にメッセージを出力し exit code 1 で終了する

#### Scenario: awaiting-merge job を --force 付きで cancel する

- **WHEN** status=awaiting-merge の job に `specrunner job cancel <jobId> --force` を実行する
- **THEN** remote branch 削除 → status=canceled に遷移、exit code 0

#### Scenario: archived job を cancel する

- **WHEN** status=archived の job に `specrunner job cancel <jobId>` を実行する
- **THEN** reject メッセージを stderr に出力し exit code 1 で終了する

#### Scenario: 既に canceled の job に cancel する

- **WHEN** status=canceled の job に `specrunner job cancel <jobId>` を実行する
- **THEN** worktree/branch の cleanup のみ実行し、state file は変更せず exit code 0

### Requirement: `specrunner job cancel --purge` は state file を物理削除する

`specrunner job cancel <jobId> --purge` は MUST cancel 動作の後に state file を物理削除する。

#### Scenario: --purge で cancel する

- **WHEN** `specrunner job cancel <jobId> --purge` を実行する
- **THEN** cancel 動作後に state file が物理削除される

### Requirement: `specrunner job cancel --all-terminated` は terminal state の job を一括削除する

`specrunner job cancel --all-terminated [--yes]` は MUST `failed` / `terminated` / `canceled` status の job の state file を一括削除する。`archived` は MUST 対象外とする。

- 非 TTY 環境では `--yes` MUST 必須
- TTY 環境では削除対象一覧を表示 → y/N 確認

#### Scenario: --all-terminated で bulk cleanup

- **WHEN** failed/terminated/canceled の job が 3 件、archived が 1 件ある状態で `specrunner job cancel --all-terminated --yes` を実行する
- **THEN** 3 件の state file が削除され、archived の 1 件は残存する

#### Scenario: 非 TTY で --yes なし

- **WHEN** 非 TTY 環境で `specrunner job cancel --all-terminated` を実行する (--yes なし)
- **THEN** reject メッセージを出力し exit code 1

### Requirement: `specrunner --help` は `job cancel` 行を含む

job commands セクションに `job rm <jobId>` 行の代わりに以下の行を含む:

```
  job cancel <jobId>             job を cancel して cleanup
```

### Requirement: `job cancel` は worktree guard の対象外である

`job cancel` は worktree guard の対象外とする (linked worktree 内からも実行可能)。

#### Scenario: worktree 内から job cancel を実行する

- **WHEN** linked worktree 内から `specrunner job cancel <jobId>` を実行する
- **THEN** worktree guard による reject は発生せず、cancel が実行される

### Requirement: `assertJobFinishable` の STATUS_HINTS は `job cancel` を案内する

`STATUS_HINTS` の `failed` / `terminated` エントリを以下に更新する:

- `failed`: `"Run 'specrunner job cancel <jobId>' to cancel the failed job."`
- `terminated`: `"Run 'specrunner job cancel <jobId>' to cancel the terminated job."`

#### Scenario: failed job の hint が正しい

- **WHEN** `assertJobFinishable` が failed 状態の job で呼ばれる
- **THEN** hint に `specrunner job cancel <jobId>` を含むメッセージが表示される

### Requirement: `specrunner init` は `.gitignore` に `.specrunner/` を追記する

`specrunner init` は config 保存後、CWD が git repository の場合に MUST `.gitignore` に `.specrunner/` エントリを追記する。

- CWD が git repository か判定するには `git rev-parse --show-toplevel` の成否を使用する
- `.gitignore` に既に `.specrunner/` が含まれている場合は SHALL no-op（冪等）
- CWD が git repository でない場合は SHALL スキップ（warning 不要）
- `.gitignore` が存在しない場合は SHALL 新規作成して `.specrunner/` を記載する

#### Scenario: 初回 init で .gitignore に追記

- **WHEN** CWD が git repo で `.gitignore` に `.specrunner/` が含まれていない状態で `specrunner init` を実行する
- **THEN** `.gitignore` の末尾に `.specrunner/` が追記される
- **AND** config 保存のメッセージも表示される

#### Scenario: 二度目の init で冪等

- **WHEN** `.gitignore` に既に `.specrunner/` が含まれている状態で `specrunner init` を実行する
- **THEN** `.gitignore` は変更されない

#### Scenario: git repo 外での init

- **WHEN** CWD が git repository でない場所で `specrunner init` を実行する
- **THEN** config は正常に保存されるが `.gitignore` への追記はスキップされる

### Requirement: `specrunner run` は project mode 時に `.gitignore` を確保する

`specrunner run` は preflight 後、`config.jobs.location` が `"project"`（デフォルト）の場合に MUST `.gitignore` に `.specrunner/` エントリが存在することを確保する。

- 確保ロジックは `init` と同じ冪等 append を使用する
- `config.jobs.location === "xdg"` の場合は SHALL スキップ

#### Scenario: run 実行時に .gitignore が未設定

- **WHEN** `config.jobs.location` がデフォルト（project）で `.gitignore` に `.specrunner/` が無い状態で `specrunner run` を実行する
- **THEN** `.gitignore` に `.specrunner/` が追記された後にパイプラインが開始する

### Requirement: specrunner usage subcommand

`specrunner usage [<slug>]` SHALL be a top-level subcommand that aggregates and displays token usage.

- 引数なし: 全 archive を走査し、slug ごとの total token 数サマリを表示する
- slug 指定: 該当 slug の `usage.json` を読み込み、entry ごと / model 別 / total を詳細表示する

#### Scenario: slug 指定で usage 詳細を表示

- WHEN `specrunner usage my-feature` を実行する
- AND `specrunner/changes/archive/*-my-feature/usage.json` が存在する
- THEN `usage.json` の各 `commandInvocations` entry が行ごとに表示される
- AND model 別の total token 数が末尾に表示される
- AND exit code 0 を返す

#### Scenario: slug が active change にある

- WHEN `specrunner usage my-feature` を実行する
- AND `specrunner/changes/my-feature/usage.json` が存在する (archive にはない)
- THEN active change の `usage.json` が読み込まれて表示される
- AND exit code 0 を返す

#### Scenario: slug が見つからない

- WHEN `specrunner usage nonexistent` を実行する
- AND 該当する active change も archive も存在しない
- THEN stderr に "No usage data found for slug 'nonexistent'" を出力する
- AND exit code 1 を返す

#### Scenario: 同一 slug が複数日付の archive に存在

- WHEN `specrunner usage my-feature` を実行する
- AND `archive/2026-05-20-my-feature/` と `archive/2026-05-25-my-feature/` が存在する
- THEN 最新日付 (`2026-05-25`) の archive の `usage.json` が使用される

#### Scenario: 引数なしで全 archive サマリを表示

- WHEN `specrunner usage` を実行する
- THEN 全 archive ディレクトリを走査する
- AND `usage.json` が存在する archive ごとに slug + total token 数を 1 行で表示する
- AND `usage.json` が存在しない archive は silent skip する
- AND skip された archive 数を末尾に表示する
- AND exit code 0 を返す

### Requirement: request review の usage.json 副作用

`specrunner request review <slug>` SHALL append a `CommandInvocation` entry to `specrunner/drafts/<slug>/usage.json` after the LLM invocation completes.

#### Scenario: slug 指定での review 後に usage が記録される

- WHEN `specrunner request review my-slug` を実行する
- AND review が正常完了する
- THEN `specrunner/drafts/my-slug/usage.json` の `commandInvocations` に `command: "request-review"` の entry が追加される
- AND entry に `timestamp` (ISO 8601) と `modelUsage` が含まれる

#### Scenario: 2 回 review で entries が累積する

- WHEN `specrunner request review my-slug` を 2 回実行する
- THEN `usage.json` の `commandInvocations` に 2 entry 蓄積される (上書きされない)

#### Scenario: file path 指定で slug 解決できない場合

- WHEN `specrunner request review /tmp/random-request.md` を実行する
- AND file path から slug が特定できない
- THEN review は通常通り実行され結果が表示される
- AND usage.json への追記は silent skip される (warning ログのみ)

#### Scenario: usage tracking 失敗時にレビュー出力がブロックされない

- WHEN `specrunner request review my-slug` を実行する
- AND usage.json への書き込みが何らかの理由で失敗する
- THEN review 結果は通常通り stdout に出力される
- AND exit code は review verdict に基づいて決定される (usage 失敗の影響なし)

### Requirement: request generate の usage.json 副作用

`specrunner request generate "<text>"` SHALL append a `CommandInvocation` entry to `specrunner/drafts/<slug>/usage.json` after the LLM invocation completes.

#### Scenario: generate 後に usage が記録される

- WHEN `specrunner request generate "add dark mode"` を実行する
- AND generate が正常完了する
- THEN 生成された slug に対応する `specrunner/drafts/<slug>/usage.json` に `command: "request-generate"` の entry が追加される

### Requirement: SPECRUNNER_DEBUG=pipeline で pipeline 境界 diagnostic log を有効化する

`SPECRUNNER_DEBUG` 環境変数に `pipeline` が含まれる場合、PR #387 で実証された 13 ポイントの境界 diagnostic log を stderr に出力しなければならない (SHALL)。未設定時はゼロ overhead でなければならない (MUST)。

#### Scenario: SPECRUNNER_DEBUG=pipeline 設定時に diagnostic log が出力される
- **GIVEN** `SPECRUNNER_DEBUG=pipeline` が設定されている
- **WHEN** pipeline が実行される
- **THEN** 13 ポイントの境界で `[pipeline-diag <timestamp>] <point>: <detail>` 形式のログが stderr に出力される

#### Scenario: SPECRUNNER_DEBUG 未設定時に diagnostic log は出力されない
- **GIVEN** `SPECRUNNER_DEBUG` が設定されていない
- **WHEN** pipeline が実行される
- **THEN** diagnostic log は出力されない
- **AND** パフォーマンスへの影響はゼロ (env var check のみ)

#### Scenario: SPECRUNNER_DEBUG にカンマ区切りで複数値を指定できる
- **GIVEN** `SPECRUNNER_DEBUG=pipeline,other` が設定されている
- **WHEN** pipeline が実行される
- **THEN** pipeline 境界の diagnostic log が出力される
- **AND** 将来の別 debug category と共存可能
