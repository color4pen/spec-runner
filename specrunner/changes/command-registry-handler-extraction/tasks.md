# Tasks: CommandSpec registry から inline handler を command module へ抽出する

## T-01: CLI contract pre-condition snapshot を作成する

> **改訂（operator-apply, PR #1109 review）**: 本タスクの snapshot は T-21 で base 由来 fixture との全項目比較に置き換える。

コードを変更する前に CLI 契約の構造スナップショットを確立し、抽出後も一致することを保証するテストを作成する。

- [x] `src/cli/__tests__/cli-contract-snapshot.test.ts` を新規作成する
- [x] COMMANDS ツリー全体を正規化形式（各 CommandSpec について `path`・`flags` キー一覧・`args` 名一覧・`requiresRepo`・`worktreeGuard`・`aliasOf`・`visibility` を含む）にシリアライズする `normalizeCommandsTree(commands)` ヘルパーを実装する
- [x] `expect(normalizeCommandsTree(COMMANDS)).toMatchSnapshot()` で vitest snapshot に固定する
- [x] テストを `bun run test` で実行し、snapshot ファイル（`cli-contract-snapshot.test.ts.snap`）を生成してコミット対象に含める
- [x] handler 関数の有無（`has handler: boolean`）を snapshot に含める（handler が named reference に変わっても shape は変わらないことを後で確認するため）

**Acceptance Criteria**:
- `cli-contract-snapshot.test.ts` が存在し、`bun run test` でグリーンになる
- snapshot ファイルがリポジトリに追加されている
- snapshot に全 top-level command（init, login, credentials, run, request, job, config, inbox, rules, reviewers, runtime, doctor, guide, usage）が含まれる

---

## T-02: src/cli/command-handler.ts（型中立モジュール）を作成する

`CommandHandler` 型を `command-registry.ts` から中立モジュールへ移動し、循環 import を防止する。

- [x] `src/cli/command-handler.ts` を新規作成する
- [x] `CommandHandler = (parsed: ParsedArgs, ctx?: CommandContext) => Promise<void>` 型を定義・export する（`ParsedArgs` は `./flag-parser.js`、`CommandContext` は `./command-context.js` から import する）
- [x] `command-registry.ts` の `CommandHandler` 型定義を削除し、`export type { CommandHandler } from "./command-handler.js"` に置き換える
- [x] 既存の `CommandHandler` を import しているファイルがある場合はパス変更が不要（re-export により `command-registry.ts` 経由での import 継続が可能）

**Acceptance Criteria**:
- `src/cli/command-handler.ts` が存在し、`CommandHandler` 型を export している
- `command-registry.ts` は `CommandHandler` 型の定義を持たず、re-export のみ行う
- `bun run typecheck` がエラーなく通る

---

## T-03: init・login・credentials.set の handler を抽出する

3 件の thin wrapper handler を対応する既存 CLI モジュールへ移動する。

- [x] **`src/cli/init.ts`**: `handleInit(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する（現在の inline 実装をそのまま移動）
  - `runtimeRaw`・`providerRaw` の型キャスト、`process.exit(await runInit(...))` を維持する
- [x] **`src/cli/login.ts`**: `handleLogin(parsed: ParsedArgs): Promise<void>` を追加・export する
  - `process.exit(await runLogin({ force: !!parsed.flags["force"] }))` を維持する
- [x] **`src/cli/credentials.ts`**: `handleCredentialsSet(parsed: ParsedArgs): Promise<void>` を追加・export する
  - `process.exit(await runCredentialsSet(parsed.positional!))` を維持する
- [x] `command-registry.ts` の `COMMANDS` 内:
  - `init.handler: async (parsed, ctx) => { ... }` → `handler: handleInit` に置換
  - `login.handler: async (parsed) => { ... }` → `handler: handleLogin` に置換
  - `credentials.set.handler: async (parsed) => { ... }` → `handler: handleCredentialsSet` に置換
- [x] `command-registry.ts` に対応する import 文を追加する
- [x] 既存テスト（`login.test.ts` 等）が引き続きグリーンであることを確認する

**Acceptance Criteria**:
- `COMMANDS.init.handler`・`COMMANDS.login.handler`・`COMMANDS.credentials.children.set.handler` がすべて named function reference になっている
- `bun run test` でグリーン

---

## T-04: src/cli/request-handlers.ts を作成し request.* handlers を抽出する

`request` command family の 5 件の inline handler を新規ファイルに抽出する。

- [x] `src/cli/request-handlers.ts` を新規作成する
- [x] 以下の関数を追加・export する（各実装は現在の inline 実装から移動）:
  - `handleRequestNew(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>`
    - `slug = parsed.positional!`、`requestType = (parsed.flags["type"] as string | undefined) ?? "new-feature"` を解決し `process.exit(await executeNew(slug, requestType, ctx!.repoRoot!))` を呼ぶ
  - `handleRequestPrompt(): Promise<void>`
    - `process.exit(executePrompt())` を呼ぶ
  - `handleRequestLs(): Promise<void>`
    - `process.exit(await executeList(process.cwd()))` を呼ぶ
  - `handleRequestTemplate(parsed: ParsedArgs): Promise<void>`
    - `requestType = (parsed.flags["type"] as string | undefined) ?? "new-feature"` を解決し `process.exit(executeTemplate(requestType))` を呼ぶ
  - `handleRequestValidate(parsed: ParsedArgs): Promise<void>`
    - 現在の inline 実装（path 解決・SLUG_REGEX チェック・storeResolve・`fs.existsSync`・`process.exit(await executeValidate(...))` のすべて）をそのまま移動する
- [x] `command-registry.ts` の `COMMANDS.request.children.*` handler を各 named handler に置換する
- [x] `command-registry.ts` から `request-handlers.ts` へ移動した import（`executeTemplate`・`executeValidate`・`executePrompt`・`executeList`・`executeNew`）を削除する（`request-handlers.ts` 側に移動）

**Acceptance Criteria**:
- `COMMANDS.request` 配下 5 コマンドすべての handler が named reference になっている
- `bun run test` でグリーン

---

## T-05: job.start handler を run.ts へ抽出する

> **改訂（operator-apply, PR #1109 review）**: 最終配置は T-19 のとおり `src/cli/job-start-handler.ts`。本タスクでの `run.ts` 配置は暫定であり、T-19 で移し替える。

`runJobHandler` と `resolveSlugForDetach` を `command-registry.ts` から `run.ts` へ移動する。

- [x] `resolveSlugForDetach(input: string, cwd: string): string | null` を `run.ts` へ移動する（`path`・`fs`・`storeResolve`・`parseRequestMdRaw`・`SLUG_REGEX` の必要な import を `run.ts` に追加する）
- [x] `runJobHandler` を `run.ts` に移動し `handleJobStart` に改名して export する（実装は一切変更しない）
  - `from-issue` 経由の `runFromIssue` 呼び出しを含む全分岐を維持する
  - `getOriginInfo`・`loadConfigWithOverlay`・`resolveGitHubToken`・`createGitHubClient`・`resolveGitHubHost`・`resolveGitHubApiBaseUrl` の import を `run.ts` に追加する
  - dynamic import `startWithIssueLink` はそのまま維持する
- [x] `command-registry.ts` の `job.start.handler` を `handleJobStart` に置換する
- [x] `command-registry.ts` から削除できる import（`path`・`fs`・`storeResolve`・`parseRequestMdRaw`・`SLUG_REGEX`・`getOriginInfo`・`loadConfigWithOverlay`・`resolveGitHubToken`・`createGitHubClient`・`resolveGitHubHost`・`resolveGitHubApiBaseUrl`・`isDetachedChild`・`detachSelf`）を確認し、他の handler で使われている場合は後の T-16 まで保留する

**Acceptance Criteria**:
- `run.ts` に `handleJobStart` が export されている
- `resolveSlugForDetach` が `command-registry.ts` から消えている
- `COMMANDS.job.children.start.handler === handleJobStart` が成立する（runtime 確認）
- `bun run test` でグリーン

---

## T-06: job.ls・job.stats の handler を ps.ts へ抽出する

- [x] **`src/cli/ps.ts`**: `handleJobLs(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - 現在の inline 実装（`loadConfigWithOverlay`・`resolveGitHubToken`・`createGitHubClient` を用いた try-catch フロー、`runPs` 呼び出し）をそのまま移動する
  - `loadConfigWithOverlay`・`resolveGitHubToken`・`createGitHubClient`・`resolveGitHubHost`・`resolveGitHubApiBaseUrl`・`resolveLogLevel` 等の必要な import を追加する
- [x] **`src/cli/ps.ts`**: `handleJobStats(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - `process.exit(await runJobStats({ cwd: ctx!.repoRoot!, json: !!parsed.flags["json"] }))` を維持する
  - `runJobStats` の import を `ps.ts` に追加する
- [x] `command-registry.ts` の対応 handler を置換し、不要になった import の候補を記録する

**Acceptance Criteria**:
- `ps.ts` に `handleJobLs`・`handleJobStats` が export されている
- `bun run test` でグリーン（`view-commands-worktree-guard.test.ts` 含む）

---

## T-07: job.show・job.wait・job.cancel の handler を抽出する

- [x] **`src/cli/job-show.ts`**: `handleJobShow(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - `process.exit(await runJobShow(parsed.positional!, { repoRoot: ctx?.repoRoot ?? ctx?.invokerCwd }))` を維持する
- [x] **`src/cli/job-wait.ts`**: `handleJobWait(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - slug の null チェック・`stderrWrite`・`process.exit` フローをそのまま移動する
  - `stderrWrite`・`EXIT_CODE` の import を追加する
- [x] **`src/cli/cancel.ts`**: `handleJobCancel(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - `VALID_JOB_ID_CHARS` 定数を `cancel.ts` へ移動する
  - `logError`・`EXIT_CODE`・`runCancel` の import を維持する
- [x] `command-registry.ts` の対応 handler を置換し、`VALID_JOB_ID_CHARS` の定義を `command-registry.ts` から削除する

**Acceptance Criteria**:
- 3 モジュールに各 handler が export されている
- `VALID_JOB_ID_CHARS` が `command-registry.ts` から消えている
- `bun run test` でグリーン

---

## T-08: job.resume handler を resume.ts へ抽出する

> **改訂（operator-apply, PR #1109 review）**: 最終配置は T-19 のとおり `src/cli/job-resume-handler.ts`。本タスクでの `resume.ts` 配置は暫定であり、T-19 で移し替える。

最も複雑な inline handler（100 行超）を抽出する。

- [x] **`src/cli/resume.ts`**: `handleJobResume(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - 以下の分岐・処理を順序・内容そのままで移動する:
    - `--detach` / `--json` 排他チェック
    - `--from-issue` / 位置引数排他チェック
    - `--prompt` / `--prompt-file` 排他チェックと prompt ファイル読み込み（`fs.readFileSync`）
    - `logLevel` 解決
    - `--from-issue` パス: `runResumeFromIssue` 呼び出し → `process.exit(code)`
    - positional 未指定チェック（`FlagParseError` を投げる）
    - `--detach` パス: `isDetachedChild` チェック → `detachSelf` → `process.exit(code)`
    - normal slug パス: `runResume` 呼び出し、`SpecRunnerError` catch → `process.exit`
  - 必要な import（`fs`・`path`・`FlagParseError`・`isDetachedChild`・`detachSelf`・`resolveLogLevel`・`stderrWrite`・`logError`・`SpecRunnerError`・`EXIT_CODE`・`runResumeFromIssue`・`SLUG_REGEX`）を `resume.ts` に追加する
- [x] `command-registry.ts` の `job.resume.handler` を `handleJobResume` に置換する

**Acceptance Criteria**:
- `resume.ts` に `handleJobResume` が export されている
- `bun run test` でグリーン（`command-registry-resume.test.ts`・`resume-from-issue.test.ts` 含む）

---

## T-09: job.reopen・job.attach の handler を抽出する

- [x] **`src/cli/reopen.ts`**: `handleJobReopen(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - `--reason` 必須チェック・`logLevel` 解決・`runReopen` 呼び出し・`SpecRunnerError` catch フロー全体を移動する
  - `logError`・`stderrWrite`・`resolveLogLevel`・`SpecRunnerError`・`EXIT_CODE` の import を追加する
- [x] **`src/cli/attach.ts`**: `handleJobAttach(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - `--branch` 必須チェック・`logLevel` 解決・`runAttach` 呼び出し・`SpecRunnerError` catch フロー全体を移動する
  - `logError`・`stderrWrite`・`resolveLogLevel`・`SpecRunnerError`・`EXIT_CODE` の import を追加する
- [x] `command-registry.ts` の対応 handler を置換する

**Acceptance Criteria**:
- `reopen.ts`・`attach.ts` に各 handler が export されている
- `bun run test` でグリーン（`command-registry-reopen.test.ts`・`attach.test.ts` 含む）

---

## T-10: job.archive handler を抽出し ARCHIVE_USAGE を移動する

> **改訂（operator-apply, PR #1109 review）**: `handleJobArchive` の最終配置は T-19 のとおり `src/cli/job-archive-handler.ts`。`ARCHIVE_USAGE` の `archive.ts` 配置と re-export は変更しない。

- [x] `ARCHIVE_USAGE` 文字列定数を `src/cli/archive.ts` へ移動し、export する
- [x] **`src/cli/archive.ts`**: `handleJobArchive(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - slug / `--from-issue` の XOR チェック・`stderrWrite(ARCHIVE_USAGE)` 呼び出し・`mergeWaitMs` lenient parse・`runArchiveFromIssue` / `runArchive` 分岐・`SpecRunnerError` catch フロー全体を移動する
  - `logError`・`stderrWrite`・`SpecRunnerError`・`EXIT_CODE`・`runArchiveFromIssue` の import を追加する
- [x] `command-registry.ts` の `ARCHIVE_USAGE` 定義を `export { ARCHIVE_USAGE } from "./archive.js"` に置換する（テストの import 互換性を維持）
- [x] `command-registry.ts` の `job.archive.handler` を `handleJobArchive` に置換する

**Acceptance Criteria**:
- `archive.ts` に `ARCHIVE_USAGE`・`handleJobArchive` が export されている
- `command-registry.ts` が `ARCHIVE_USAGE` を re-export している
- `import { ARCHIVE_USAGE } from "../command-registry.js"` が引き続き解決できる
- `bun run test` でグリーン（`archive-from-issue.test.ts` 含む）

---

## T-11: job.prune・config.effective・inbox.run の handler を抽出する

- [x] **`src/cli/prune.ts`**: `handleJobPrune(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - `runPrune` 呼び出し・`SpecRunnerError` catch フロー全体を移動する
- [x] **`src/cli/config-effective.ts`**: `handleConfigEffective(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - `process.exit(await runConfigEffective({ requestType, json, repoRoot }))` を維持する
- [x] **`src/cli/inbox.ts`**: `handleInboxRun(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - `limit` 整数チェック・`runInboxRun` 呼び出し・`process.exit` フローを移動する
- [x] `command-registry.ts` の対応 handler を置換する

**Acceptance Criteria**:
- 3 モジュールに各 handler が export されている
- `bun run test` でグリーン

---

## T-12: runtime.setup・runtime.status・runtime.reset の handler を managed.ts へ抽出する

- [x] **`src/cli/managed.ts`**: 以下 3 関数を追加・export する
  - `handleRuntimeSetup(): Promise<void>` → `process.exit(await runManagedSetup())`
  - `handleRuntimeStatus(): Promise<void>` → `process.exit(await runManagedStatus())`
  - `handleRuntimeReset(parsed: ParsedArgs): Promise<void>` → `process.exit(await runManagedReset({ force: !!parsed.flags["force"] }))`
- [x] `command-registry.ts` の `runtime.*` handler を各 named handler に置換する

**Acceptance Criteria**:
- `managed.ts` に 3 handler 関数が export されている
- `bun run test` でグリーン

---

## T-13: doctor・doctor.repair の handler を doctor.ts へ抽出する

- [x] **`src/cli/doctor.ts`**: `handleDoctor(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - `runDoctor` 呼び出し・try-catch・`process.exit` フローをそのまま移動する
- [x] **`src/cli/doctor.ts`**: `handleDoctorRepair(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - slug の null チェック・`stderrWrite` ガード・dynamic `import("../core/occupancy/repair.js")` 呼び出し・try-catch フローをそのまま移動する（dynamic import はそのまま維持する）
  - `stderrWrite`・`EXIT_CODE` の import を `doctor.ts` に追加する
- [x] `command-registry.ts` の `doctor.handler` と `doctor.children.repair.handler` を各 named handler に置換する

**Acceptance Criteria**:
- `doctor.ts` に `handleDoctor`・`handleDoctorRepair` が export されている
- `bun run test` でグリーン（`doctor-config-overlay.test.ts` 含む）

---

## T-14: src/cli/scaffold-handlers.ts を作成し rules.new・reviewers.new の handler を抽出する

- [x] `src/cli/scaffold-handlers.ts` を新規作成する
- [x] 以下の関数を追加・export する:
  - `handleRulesNew(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` → `process.exit(await executeRulesNew(parsed.positionals[0]!, parsed.positionals[1]!, ctx!.invokerCwd))`
  - `handleReviewersNew(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` → `process.exit(await executeReviewersNew(parsed.positional!, ctx!.invokerCwd))`
  - cwd は `process.cwd()` を直接呼ばず `ctx!.invokerCwd` を渡す（`buildCommandContext` が dispatch 時に `process.cwd()` を capture した値であり同値。operator 裁定: code-review iter 1 Finding 2）
- [x] `executeRulesNew` は `../core/command/rules-new.js`、`executeReviewersNew` は `../core/command/reviewers-new.js` から import する
- [x] `command-registry.ts` の対応 handler を置換し、`executeRulesNew`・`executeReviewersNew` の import を削除する

**Acceptance Criteria**:
- `scaffold-handlers.ts` が存在し 2 関数が export されている
- `bun run test` でグリーン

---

## T-15: src/cli/guide-handler.ts・src/cli/usage-handler.ts を作成する

- [x] `src/cli/guide-handler.ts` を新規作成し、`handleGuide(parsed: ParsedArgs): Promise<void>` を export する
  - `process.exit(runGuide(parsed.positional))` を維持する
  - `runGuide` を `../core/command/guide.js` から import する
- [x] `src/cli/usage-handler.ts` を新規作成し、`handleUsage(parsed: ParsedArgs): Promise<void>` を export する
  - `slug` 有無による分岐（`showUsage` / `showUsageSummary`）と `process.exit` を維持する
  - cwd は `process.cwd()` を直接呼ばず `ctx!.invokerCwd` を渡す（T-14 と同じ operator 裁定）
  - `showUsage`・`showUsageSummary` を各 core module から import する
- [x] `command-registry.ts` の `guide.handler` と `usage.handler` を各 named handler に置換する
- [x] `command-registry.ts` から `showUsage`・`showUsageSummary`・`runGuide` の import を削除する
- [x] `GUIDE_TOPICS` は `guide.help.summary` の文字列テンプレートで使用しているため `command-registry.ts` の import に残す

**Acceptance Criteria**:
- 2 ファイルが存在し各 handler が export されている
- `bun run test` でグリーン

---

## T-16: command-registry.ts から business logic import を完全除去する

T-03〜T-15 の抽出完了後、`command-registry.ts` から残存するビジネスロジック import を整理する。

- [x] `command-registry.ts` の import 一覧を精査し、COMMANDS ツリーの **handler 参照にのみ** 使われていたすべての import を削除する
  - 削除対象の候補: `* as path`・`* as fs`・`resolveWithFallback as storeResolve`・`FlagParseError`（class）・`resolveGitHubToken`・`createGitHubClient`・`resolveGitHubApiBaseUrl, resolveGitHubHost`・`logError, stderrWrite, resolveLogLevel`・`SpecRunnerError, EXIT_CODE`・`loadConfigWithOverlay`・`SLUG_REGEX`・`isDetachedChild, detachSelf`・`parseRequestMdRaw`・`getOriginInfo`
  - 注意: `FlagParseError` 型（type-only import）・`AGENT_STEP_NAMES`・`CLI_STEP_NAMES`・`GUIDE_TOPICS` は COMMANDS ツリーの宣言部分（flags/help.summary）で参照されているため残す
- [x] handler モジュールへの import（`handleInit`・`handleLogin` 等）を追加する（T-03〜T-15 で追加済みなければ）
- [x] `command-registry.ts` の全 inline handler 定義がゼロになったことを確認する（`handler: async` が 0 件）
- [x] `command-registry.ts` の `process.exit` 呼び出しがゼロになったことを確認する
- [x] `bun run typecheck` でエラーがないことを確認する

**Acceptance Criteria**:
- `command-registry.ts` 内の `handler: async` が 0 件
- `command-registry.ts` 内の `process.exit` が 0 件
- `command-registry.ts` 内の `import * as fs`・`import * as path` が消えている
- `bun run typecheck` クリーン
- `bun run test` でグリーン

---

## T-17: architecture ratchet test を追加する

T-16 完了後に architecture ratchet test を追加し、回帰を機械的に防止する。

- [x] `src/cli/__tests__/architecture-ratchet.test.ts` を新規作成する
- [x] **チェック 1: handler.name チェック（inline handler ゼロ検証）**
  - `COMMANDS` をインポートして全 CommandSpec ノードを再帰的に走査する
  - 各 `spec.handler` が存在する場合、`spec.handler.name === "handler"` でないことを `expect` する
  - 失敗メッセージに command path を含める（例: `"job.resume" has an anonymous handler`）
- [x] **チェック 2: process.exit ゼロ検証**
  - `src/cli/command-registry.ts` のソーステキストを `fs.readFileSync` で読み込む
  - ラインコメント（`// ...`）とブロックコメント（`/* ... */`）を正規表現で除去する
  - 残りのテキストに `process.exit` が含まれないことを `expect` する
- [x] **チェック 3: handler → registry value import cycle ゼロ検証**
  - `src/cli/` 配下の全 `.ts` ファイルを `fs.readdirSync` 等で動的に列挙し、`command-registry.ts` 自身を除外する（ハードコードリストを使わない）
  - `@typescript-eslint/parser` を使って列挙した全ファイルの import 宣言を解析する
  - `command-registry` を参照する `ImportDeclaration`（type-only でないもの）がゼロであることを確認する
  - 動的列挙にすることで、将来 `src/cli/` に新規ハンドラモジュールが追加された場合も自動的に検査対象に含まれる
- [x] **チェック 4: 並行 CLI 契約正本ゼロ検証**
  - `src/cli/` 配下の全 `.ts` ファイルを列挙する
  - `export const COMMANDS` または `export const COMMANDS:` を持つファイルが `command-registry.ts` のみであることを確認する（コメント除去後のソーステキストで判定）
- [x] テストが `bun run test` でグリーンになることを確認する

**Acceptance Criteria**:
- 全 4 チェックが `bun run test` でグリーン
- チェック 1 が inline handler を追加すると失敗することをコメントで説明している
- `command-registry.ts` に `handler: async` を追加した場合、チェック 1 が検出する

---

## T-18: CLI contract snapshot 一致検証と PR 掲載用メトリクス収集

> **改訂（operator-apply, PR #1109 review）**: snapshot 一致検証は T-21 の fixture 比較に置き換える。メトリクスは T-23 で `metrics.md` として正典フォルダに置く。

- [x] T-01 で作成した `cli-contract-snapshot.test.ts` を再実行し、snapshot が変更前後で完全一致することを確認する
  - mismatch が出た場合はハンドラの入れ替えミスを意味するため、command-registry.ts の COMMANDS ツリーを修正する
- [x] 以下の before / after メトリクスを収集する（同一コマンド・方法で計測）:
  - `command-registry.ts` の行数（`wc -l`）
  - inline handler 数（`grep -c "handler: async" src/cli/command-registry.ts`）
  - named handler reference 数（COMMANDS ツリー内の `handler: handle` または `handler: run` のパターン数）
  - registry 内 `process.exit` 件数（`grep -c "process.exit" src/cli/command-registry.ts`）
  - repository 全体の `process.exit` 件数（`grep -r "process.exit" src/ --include="*.ts" | wc -l`）（R3a で意図せず削減していないことを確認）
  - registry の filesystem / credential / GitHub client 関連 value import 数（before: `import * as fs`・`createGitHubClient`・`resolveGitHubToken` 等を数える）
  - 抽出した handler module 数と command family 対応表
  - value-import SCC 数（循環なし = 0 を確認）
  - CLI contract snapshot 対象 command 数
- [x] メトリクスを PR 本文の before / after 比較表として準備する

**Acceptance Criteria**:
- `bun run test` が全テストグリーン（既存テスト・T-01 snapshot・T-17 ratchet すべて）
- `bun run typecheck` クリーン
- `bun run build` が成功する
- メトリクスが揃っており、before / after 対比が明確
- repository 全体の `process.exit` 件数が before と after で一致する（R3a スコープ内で削減していない）

---

## T-19: job.start / job.resume / job.archive の handler を独立 module へ移し、`./` dynamic import を撤去する

PR #1109 review Finding 1 への対応。design.md D7 を参照。

- [ ] `src/cli/job-start-handler.ts` を新規作成し、`run.ts` から `handleJobStart` と `resolveSlugForDetach` を移動する（実装は変更しない）。`runRun` / `runRunCore` は `./run.js`、`runFromIssue` は `./from-issue.js` から static import する。`await import("./from-issue.js")` を撤去する。`startWithIssueLink` の dynamic import（`../core/issue-target/start.js`）はそのまま維持する
- [ ] `src/cli/job-resume-handler.ts` を新規作成し、`resume.ts` から `handleJobResume` を移動する。`runResume` は `./resume.js`、`runResumeFromIssue` は `./resume-from-issue.js` から static import する。`await import("./resume-from-issue.js")` を撤去する
- [ ] `src/cli/job-archive-handler.ts` を新規作成し、`archive.ts` から `handleJobArchive` を移動する。`runArchive`・`ARCHIVE_USAGE` は `./archive.js`、`runArchiveFromIssue` は `./archive-from-issue.js` から static import する。`await import("./archive-from-issue.js")` を撤去する
- [ ] `run.ts` / `resume.ts` / `archive.ts` から移動した関数と、それにのみ使われていた import を削除する（`ARCHIVE_USAGE` は `archive.ts` に残す）
- [ ] `command-registry.ts` の `job.start` / `job.resume` / `job.archive` の handler import を新 module に付け替える
- [ ] `architecture-ratchet.test.ts` に design.md D4 のチェック 5（`src/cli` 内 value-import 循環ゼロ）とチェック 6（`./` 始まりの dynamic import ゼロ）を追加する。チェック 6 は `src/cli/run.ts` に `await import("./from-issue.js")` を戻すと失敗することをテストケースで確認する
- [ ] `grep -rn 'import("\./' src/cli --include=*.ts` が 0 件であることを確認する

**Acceptance Criteria**:
- `handleJobStart`・`resolveSlugForDetach`・`handleJobResume`・`handleJobArchive` が各新 module に named export されている
- `run.ts`・`resume.ts`・`archive.ts` は `*-from-issue.js` を import しない（static / dynamic とも）
- `src/cli/` 内で `import("./` が 0 件、ratchet チェック 5・6 がグリーン
- `bun run typecheck`・`bun run test` がグリーン

---

## T-20: テストの handler 複製 mock を撤去し、実 handler + primitive mock に置き換える

PR #1109 review Finding 2 への対応。design.md D7「テストの方針」を参照。

- [ ] 対象: `src/cli/__tests__/from-issue.test.ts`・`resume-from-issue.test.ts`・`archive-from-issue.test.ts`・`command-registry-adopt-commits.test.ts`・`command-registry-apply-canon.test.ts`・`command-registry-resume.test.ts`・`detach-flag-cli.test.ts`（`grep -ln 'mirrors the real\|vi.mock("../run.js"\|vi.mock("../resume.js"\|vi.mock("../archive.js"' src/cli/__tests__/*.ts` で列挙し、漏れがあれば加える）
- [ ] 各テストで `vi.mock("../run.js")` 等の factory 内に書かれた handler の写し（guard・routing・`process.exit` の再実装）を削除し、handler は `../job-start-handler.js` 等から実物を import する
- [ ] mock は primitive（`runRunCore`・`runRun`・`runFromIssue`・`runResume`・`runResumeFromIssue`・`runArchive`・`runArchiveFromIssue`・`detachSelf` 等）に限定する
- [ ] テストの assertion（どの primitive がどの引数で呼ばれるか、exit code）は変えない。テストが検証していた挙動が実 handler で通らない場合は handler の移動ミスであり、テストではなく実装を直す
- [ ] `src/cli/__tests__/*.test.ts` 内に `handleJob*` の関数本体を定義する `vi.mock` factory が残っていないことを確認する

**Acceptance Criteria**:
- 上記 7 ファイルの `vi.mock` factory に `handleJobStart` / `handleJobResume` / `handleJobArchive` の実装が存在しない
- 7 ファイルとも `bun run test` でグリーン（テスト数は減らさない）

---

## T-21: CLI contract 構造比較を base 由来 fixture との全項目比較に置き換える

PR #1109 review Finding 3 への対応。design.md D5（改訂）を参照。

- [ ] `src/cli/__tests__/cli-contract-normalize.ts` を新規作成し、`normalizeCommandsTree(commands)` を移す。正規化対象: `path`・`summary`・`visibility`・`aliasOf`・`requiresRepo`・`worktreeGuard`・`args`（`name`・`required`・`count`）・`flags`（名前順、各 `FlagDef` の `type`・`min`・`values`・`deprecated`。`deprecated.message` が関数なら `"<function>"`）・`help`（`group`・`summary`・`detail`）・`hasHandler`・`children`（key 順、再帰）
- [ ] D5 の手順で base `483c75f7` の `command-registry.ts` から `src/cli/__tests__/fixtures/cli-contract.base.json` を生成してコミットする。生成に使った一時ファイル（`command-registry.base.tmp.ts`・`dump-base.tmp.ts`）は削除する
- [ ] `cli-contract-snapshot.test.ts` を `expect(normalizeCommandsTree(COMMANDS)).toEqual(baseFixture)` に書き換え、ヘッダコメントに base SHA と生成手順を記録する
- [ ] `src/cli/__tests__/__snapshots__/cli-contract-snapshot.test.ts.snap` を削除する
- [ ] fixture に全 top-level command（init, login, credentials, run, request, job, config, inbox, rules, reviewers, runtime, doctor, guide, usage）と `help.detail`（`ARCHIVE_USAGE` を含む）が含まれることを確認する

**Acceptance Criteria**:
- `cli-contract.base.json` が存在し、D5 の手順で再生成しても差分がない
- `cli-contract-snapshot.test.ts` が `toMatchSnapshot` を使わず、`.snap` ファイルが存在しない
- `bun run test` でグリーン

---

## T-22: bin/specrunner.ts の duck-type guard を撤回し、テスト側で module registry の分裂を止める

PR #1109 review Finding 2（guard 部分）への対応。design.md D6（改訂）を参照。

- [ ] `bin/specrunner.ts` を base に戻す: `git checkout 483c75f7 -- bin/specrunner.ts`（`isFlagParseError` / `isSpecRunnerError` を削除し `instanceof` 判定に戻す）
- [ ] `bun run test` を実行し、`instanceof` 失敗で落ちる `tests/unit/cli/*.test.ts` を特定する
- [ ] 落ちたテストごとに、`main`（`bin/specrunner.ts`）と error class を `vi.resetModules()` の後に `await import()` で同一 registry から取得するよう改める（または当該テストの `resetModules` を外す）。production コード側での回避は行わない
- [ ] `git diff 483c75f7 -- bin/specrunner.ts` が空であることを確認する

**Acceptance Criteria**:
- `git diff 483c75f7 -- bin/specrunner.ts` が空
- `bun run test` でグリーン（テスト数は減らさない）

---

## T-23: 実測値の before / after 表を metrics.md として正典フォルダに置く

PR #1109 review Finding 4 への対応。request.md「PR本文に載せる実測値」を参照。

- [ ] `specrunner/changes/command-registry-handler-extraction/metrics.md` を作成し、request.md の各項目を before（base `483c75f7`）/ after（HEAD）の表にする。各行に計測コマンドをそのまま併記する
- [ ] 必須行: `command-registry.ts` 行数 / inline handler 数（`grep -c "handler: async"`）/ named handler reference 数 / registry 内 `process.exit` 件数 / repository 全体の `process.exit` 件数（T-18 の生 grep 件数と、`__tests__`・`*.test.ts` を除いた production 件数の両方）/ registry の fs・credential・GitHub client value import 数 / 抽出 handler module 数と command family 対応表 / `src/cli` value-import SCC 数 / contract 比較対象 command 数（fixture の leaf 数）/ `src/cli` 内 `./` dynamic import 数
- [ ] before の値は `git show 483c75f7:<path>` または base の一時 checkout に対して同一コマンドで計測する
- [ ] pr-create は既存 PR（existing-open）の本文を更新しないため、PR #1109 本文への転記は finalize 後に operator が行う（implementer の作業対象外）

**Acceptance Criteria**:
- `metrics.md` が存在し、全必須行に before / after / 計測コマンドがある
- repository 全体の production `process.exit` 件数が before と after で一致する

