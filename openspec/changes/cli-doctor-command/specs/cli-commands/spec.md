## MODIFIED Requirements

### Requirement: `specrunner` バイナリは 5 つのサブコマンドを提供する

`specrunner` CLI は SHALL `init`、`login`、`run`、`ps`、`doctor` の 5 サブコマンドを提供する。引数なし、または不明なサブコマンドが渡された場合は usage を stderr に出力し、exit code 2 で MUST 終了する。usage 文字列には `doctor` の 1 行説明（例: `Diagnose environment / config / auth prerequisites`）を含む。

#### Scenario: 引数なしで実行された場合

- **WHEN** ユーザーが `specrunner` をサブコマンドなしで実行する
- **THEN** stderr に各サブコマンドの 1 行説明（init / login / run / ps / doctor）を含む usage を出力し、exit code 2 で終了する

#### Scenario: 不明なサブコマンドが渡された場合

- **WHEN** ユーザーが `specrunner foobar` を実行する
- **THEN** `Unknown command: foobar` を stderr に出し、5 サブコマンドの usage を続けて表示し、exit code 2 で終了する

#### Scenario: `--help` または `-h` が渡された場合

- **WHEN** ユーザーが `specrunner --help` を実行する
- **THEN** stdout に 5 サブコマンド分の usage を出力し、exit code 0 で終了する

## ADDED Requirements

### Requirement: `specrunner doctor` は 7 カテゴリの環境前提条件を診断する

`specrunner doctor` は MUST 以下 7 カテゴリの check をすべて実行し、各 check の結果を `pass` / `warn` / `fail` のいずれかで判定する。

| Category | 検証対象 |
|----------|---------|
| `runtime` | node version (>= 18)、bun version、git installed + version、openspec available（`npx openspec --version`） |
| `config` | `~/.config/specrunner/config.json` 存在 + permission 0600（darwin / linux のみ。Windows では warn / skip 扱い）、`anthropic.apiKey` 存在、`github.accessToken` 存在 |
| `env` | `SPECRUNNER_GITHUB_CLIENT_ID` 設定状況（warn — login 時のみ必須） |
| `auth` | Anthropic API key 有効性（軽量 GET 200 確認）、GitHub token 有効性（`GET /user` 200 + scope に `repo` 含む） |
| `repo` | cwd が git repository、`origin` remote が GitHub、`openspec/project.md` 存在、`openspec-workflow/requests/{active,awaiting-merge,merged,canceled}/` 構造存在（warn） |
| `agents` | 7 agents（propose / spec-review / spec-fixer / implementer / build-fixer / code-review / code-fixer）が config に登録済み、environment ID 登録済み、agent definition drift 検出 |
| `storage` | `~/.local/share/specrunner/jobs/` 書き込み可、古い job state file 数（情報のみ表示、100 超なら gc 推奨を warn） |

各 check は SHALL `DoctorCheck` interface（`{ name, category, required, check(ctx): Promise<DoctorResult> }`）に従い独立に export され、`DoctorContext` を mock することで単独で unit test 可能でなければならない。

#### Scenario: 全 check が成功する

- **WHEN** ユーザーが `specrunner doctor` を健全な環境で実行する
- **THEN** 全カテゴリの check が `pass` または `warn` を返し、stdout にカテゴリ別の結果と `Summary: <N> pass, <M> warn, 0 fail` を表示し exit code 0 で終了する

#### Scenario: 1 つ以上の check が fail する

- **WHEN** `~/.config/specrunner/config.json` が存在しない状態で `specrunner doctor` を実行する
- **THEN** config category の該当 check が `fail` を返し、stdout に該当 check の `[✗]` 表示と修復 hint（例: `Run 'specrunner init' first.`）を表示し、exit code 1 で終了する

#### Scenario: warn のみが発生する

- **WHEN** `SPECRUNNER_GITHUB_CLIENT_ID` が未設定だが他は健全な状態で `specrunner doctor` を実行する
- **THEN** env category の該当 check が `warn` を返し、stdout に `[!]` 表示で hint を併記し、`fail` が 0 のため exit code 0 で終了する

#### Scenario: doctor 自身が予期せぬ例外で crash する

- **WHEN** runner / formatter 内部で unhandled exception が発生する
- **THEN** `bin/specrunner.ts` の `doctor` case が `runDoctor` を wrap する `try/catch` の catch 経路で `Fatal: <message>` を stderr に出力し、`process.exit(2)` を呼ぶ（exit 1 と区別する）

#### Scenario: agent definition drift 検出

- **WHEN** config の `agents[role].definitionHash` が `src/prompts` の現在の system prompt から計算される hash と一致しない
- **THEN** agents category の該当 check が `warn` を返し、message に `definition drifted` を含み、hint で `Run 'specrunner init --resync' to update agent definitions.` を表示する

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
