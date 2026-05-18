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

### Requirement: `specrunner run` は起動前に fail-fast バリデーションを固定順序で実行する

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

### Requirement: `specrunner ps` は実行中のジョブを一覧表示する

`specrunner ps [--all]` は MUST `~/.local/share/specrunner/jobs/` 以下の状態ファイルをすべて読み込み、`JOB_ID`、`SLUG`、`STEP`、`STATUS`、`BRANCH`、`AGE` の 6 列で SHALL テーブル表示する。`--all` flag を指定した場合は MUST `status=archived` のジョブも含めて表示する。`--all` 指定なしの場合は `status=archived` のジョブを SHALL NOT 表示する（デフォルトでは active / success / failed / terminated 状態のジョブのみ表示）。出力フォーマットの詳細は以下に従う:

- **ソート順**: `createdAt` 降順（新しいジョブが上）
- **JOB_ID**: uuid の先頭 8 文字に短縮する
- **SLUG**: `getJobSlug(state)` の戻り値（`state.request.slug` → `state.branch` の prefix strip → `path.basename(state.request.path)` の fallback chain）。truncate は SHALL NOT 行う（terminal 幅による wrap は許容）
- **BRANCH**: 40 文字を超える場合は 37 文字 + `...` に truncate する
- **AGE**: `createdAt` からの経過時間を人間可読形式（例: `2m`, `1h`, `3d`）で表示する
- **非 TTY 時**: TAB 区切りの固定フォーマットで出力する（ヘッダ行を含む）。列幅のパディングは不要

#### Scenario: TTY 出力（複数ジョブ）

- **WHEN** stdout が TTY でディレクトリに 3 件の状態ファイルが存在する
- **THEN** 3 行 + ヘッダ行を固定列幅でテーブル表示し、JOB_ID は先頭 8 文字、SLUG は `getJobSlug` の戻り値で truncate なし、BRANCH は 40 文字超で truncate、AGE は人間可読で表示し exit code 0 で終了する。createdAt 降順でソートされる

#### Scenario: 非 TTY 出力（パイプ等）

- **WHEN** stdout が非 TTY（パイプ先あり等）でジョブが 2 件存在する
- **THEN** ヘッダ行 + 2 行を TAB 区切りで出力する。列幅パディングは行わない。SLUG 列も含む

#### Scenario: ジョブが 1 件もない

- **WHEN** `~/.local/share/specrunner/jobs/` が存在しないか空
- **THEN** `No jobs found.` を stdout に出力し exit code 0 で終了する

#### Scenario: 複数ジョブが存在する

- **WHEN** ディレクトリに 3 件の状態ファイルが存在する
- **THEN** 3 行 + ヘッダ行をテーブル形式で stdout に表示し、JOB_ID は短縮 8 文字、SLUG は `getJobSlug` 戻り値、AGE は人間可読（例: `2m`, `1h`）で表示し exit code 0 で終了する

#### Scenario: 破損した状態ファイルがある

- **WHEN** ある状態ファイルが JSON パース不可
- **THEN** `Skipping malformed file: <path>` を stderr に出し、残りのジョブは表示し exit code 0 で終了する

#### Scenario: archived 状態のジョブが表示される

- **WHEN** `state.status=archived` の job が存在し `specrunner ps --all` を実行する
- **THEN** STATUS 列に `archived` を表示する row が含まれ、SLUG 列にも `getJobSlug` 戻り値が表示される

### Requirement: `specrunner run <request.md>` は propose と spec-review セッションを直列で実行する

`specrunner run` は MUST 引数で渡された request.md ファイルから request 情報を抽出し、cwd の git remote から repo を特定し、propose セッションを作成して完了を検知し、続いて spec-review セッションを作成して完了を検知する。spec-review 完了後、verdict を取得して stdout に表示し、SHALL 状態ファイルを各ステップ完了時に更新する。

#### Scenario: spec-review-result.md が見つからない

- **WHEN** propose は正常完了したが spec-review セッション完了後に `deps.githubClient.getRawFile` が adapter 内部リトライ後も null を返す
- **THEN** state.status を `failed`、error.code を `SPEC_REVIEW_RESULT_NOT_FOUND` で記録し、stderr に `Spec-review result file not found on branch '<branch>'.` を出力し exit code 1 で終了する

### Requirement: `specrunner` バイナリは 6 つのサブコマンドを提供する

`specrunner` CLI は SHALL `init`、`login`、`run`、`ps`、`doctor`、`finish` の 6 サブコマンドを提供する。引数なし、または不明なサブコマンドが渡された場合は usage を stderr に出力し、exit code 2 で MUST 終了する。usage 文字列には `doctor` の 1 行説明（例: `Diagnose environment / config / auth prerequisites`）と `finish` の 1 行説明（例: `Finalize a merged PR: archive openspec change and squash-merge feature PR (1-PR model)`）を含む。

`finish` サブコマンドの引数 / フラグは MUST 以下の形式である:

```
specrunner finish [<slug>] [--pr <num>] [--job <jobId>] [--dry-run]
```

- 第一引数 `<slug>` は推奨形（user の mental model に一致）
- `--pr <num>` は PR 番号からの逆引き（gh pr view 経由）
- `--job <jobId>` は forensics / debug 用（互換性のため残置）
- `--dry-run` は Phase 0 pre-flight のみ実行する非破壊モード

第一引数として jobId を直接渡す形（`specrunner finish <jobId>`）は SHALL NOT サポートされない。jobId 渡しは `--job` flag 経由のみ。

#### Scenario: 引数なしで実行された場合

- **WHEN** ユーザーが `specrunner` をサブコマンドなしで実行する
- **THEN** stderr に各サブコマンドの 1 行説明（init / login / run / ps / doctor / finish）を含む usage を出力し、exit code 2 で終了する

#### Scenario: 不明なサブコマンドが渡された場合

- **WHEN** ユーザーが `specrunner foobar` を実行する
- **THEN** `Unknown command: foobar` を stderr に出し、6 サブコマンドの usage を続けて表示し、exit code 2 で終了する

#### Scenario: `--help` または `-h` が渡された場合

- **WHEN** ユーザーが `specrunner --help` を実行する
- **THEN** stdout に 6 サブコマンド分の usage を出力し、exit code 0 で終了する

#### Scenario: `specrunner finish --help` の出力に新フラグが含まれる

- **WHEN** ユーザーが `specrunner finish --help` を実行する
- **THEN** stdout に `<slug>` 第一形・`--pr` `--job` `--dry-run` の説明が含まれる、exit code 0 で終了する

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

### Requirement: `specrunner run` の preflight は GitHub token 取得元を info ログに出力する

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
