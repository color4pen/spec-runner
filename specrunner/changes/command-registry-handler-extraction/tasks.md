# Tasks: CommandSpec registry から inline handler を command module へ抽出する

## T-01: CLI contract pre-condition snapshot を作成する

コードを変更する前に CLI 契約の構造スナップショットを確立し、抽出後も一致することを保証するテストを作成する。

- [ ] `src/cli/__tests__/cli-contract-snapshot.test.ts` を新規作成する
- [ ] COMMANDS ツリー全体を正規化形式（各 CommandSpec について `path`・`flags` キー一覧・`args` 名一覧・`requiresRepo`・`worktreeGuard`・`aliasOf`・`visibility` を含む）にシリアライズする `normalizeCommandsTree(commands)` ヘルパーを実装する
- [ ] `expect(normalizeCommandsTree(COMMANDS)).toMatchSnapshot()` で vitest snapshot に固定する
- [ ] テストを `bun run test` で実行し、snapshot ファイル（`cli-contract-snapshot.test.ts.snap`）を生成してコミット対象に含める
- [ ] handler 関数の有無（`has handler: boolean`）を snapshot に含める（handler が named reference に変わっても shape は変わらないことを後で確認するため）

**Acceptance Criteria**:
- `cli-contract-snapshot.test.ts` が存在し、`bun run test` でグリーンになる
- snapshot ファイルがリポジトリに追加されている
- snapshot に全 top-level command（init, login, credentials, run, request, job, config, inbox, rules, reviewers, runtime, doctor, guide, usage）が含まれる

---

## T-02: src/cli/command-handler.ts（型中立モジュール）を作成する

`CommandHandler` 型を `command-registry.ts` から中立モジュールへ移動し、循環 import を防止する。

- [ ] `src/cli/command-handler.ts` を新規作成する
- [ ] `CommandHandler = (parsed: ParsedArgs, ctx?: CommandContext) => Promise<void>` 型を定義・export する（`ParsedArgs` は `./flag-parser.js`、`CommandContext` は `./command-context.js` から import する）
- [ ] `command-registry.ts` の `CommandHandler` 型定義を削除し、`export type { CommandHandler } from "./command-handler.js"` に置き換える
- [ ] 既存の `CommandHandler` を import しているファイルがある場合はパス変更が不要（re-export により `command-registry.ts` 経由での import 継続が可能）

**Acceptance Criteria**:
- `src/cli/command-handler.ts` が存在し、`CommandHandler` 型を export している
- `command-registry.ts` は `CommandHandler` 型の定義を持たず、re-export のみ行う
- `bun run typecheck` がエラーなく通る

---

## T-03: init・login・credentials.set の handler を抽出する

3 件の thin wrapper handler を対応する既存 CLI モジュールへ移動する。

- [ ] **`src/cli/init.ts`**: `handleInit(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する（現在の inline 実装をそのまま移動）
  - `runtimeRaw`・`providerRaw` の型キャスト、`process.exit(await runInit(...))` を維持する
- [ ] **`src/cli/login.ts`**: `handleLogin(parsed: ParsedArgs): Promise<void>` を追加・export する
  - `process.exit(await runLogin({ force: !!parsed.flags["force"] }))` を維持する
- [ ] **`src/cli/credentials.ts`**: `handleCredentialsSet(parsed: ParsedArgs): Promise<void>` を追加・export する
  - `process.exit(await runCredentialsSet(parsed.positional!))` を維持する
- [ ] `command-registry.ts` の `COMMANDS` 内:
  - `init.handler: async (parsed, ctx) => { ... }` → `handler: handleInit` に置換
  - `login.handler: async (parsed) => { ... }` → `handler: handleLogin` に置換
  - `credentials.set.handler: async (parsed) => { ... }` → `handler: handleCredentialsSet` に置換
- [ ] `command-registry.ts` に対応する import 文を追加する
- [ ] 既存テスト（`login.test.ts` 等）が引き続きグリーンであることを確認する

**Acceptance Criteria**:
- `COMMANDS.init.handler`・`COMMANDS.login.handler`・`COMMANDS.credentials.children.set.handler` がすべて named function reference になっている
- `bun run test` でグリーン

---

## T-04: src/cli/request-handlers.ts を作成し request.* handlers を抽出する

`request` command family の 5 件の inline handler を新規ファイルに抽出する。

- [ ] `src/cli/request-handlers.ts` を新規作成する
- [ ] 以下の関数を追加・export する（各実装は現在の inline 実装から移動）:
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
- [ ] `command-registry.ts` の `COMMANDS.request.children.*` handler を各 named handler に置換する
- [ ] `command-registry.ts` から `request-handlers.ts` へ移動した import（`executeTemplate`・`executeValidate`・`executePrompt`・`executeList`・`executeNew`）を削除する（`request-handlers.ts` 側に移動）

**Acceptance Criteria**:
- `COMMANDS.request` 配下 5 コマンドすべての handler が named reference になっている
- `bun run test` でグリーン

---

## T-05: job.start handler を run.ts へ抽出する

`runJobHandler` と `resolveSlugForDetach` を `command-registry.ts` から `run.ts` へ移動する。

- [ ] `resolveSlugForDetach(input: string, cwd: string): string | null` を `run.ts` へ移動する（`path`・`fs`・`storeResolve`・`parseRequestMdRaw`・`SLUG_REGEX` の必要な import を `run.ts` に追加する）
- [ ] `runJobHandler` を `run.ts` に移動し `handleJobStart` に改名して export する（実装は一切変更しない）
  - `from-issue` 経由の `runFromIssue` 呼び出しを含む全分岐を維持する
  - `getOriginInfo`・`loadConfigWithOverlay`・`resolveGitHubToken`・`createGitHubClient`・`resolveGitHubHost`・`resolveGitHubApiBaseUrl` の import を `run.ts` に追加する
  - dynamic import `startWithIssueLink` はそのまま維持する
- [ ] `command-registry.ts` の `job.start.handler` を `handleJobStart` に置換する
- [ ] `command-registry.ts` から削除できる import（`path`・`fs`・`storeResolve`・`parseRequestMdRaw`・`SLUG_REGEX`・`getOriginInfo`・`loadConfigWithOverlay`・`resolveGitHubToken`・`createGitHubClient`・`resolveGitHubHost`・`resolveGitHubApiBaseUrl`・`isDetachedChild`・`detachSelf`）を確認し、他の handler で使われている場合は後の T-16 まで保留する

**Acceptance Criteria**:
- `run.ts` に `handleJobStart` が export されている
- `resolveSlugForDetach` が `command-registry.ts` から消えている
- `COMMANDS.job.children.start.handler === handleJobStart` が成立する（runtime 確認）
- `bun run test` でグリーン

---

## T-06: job.ls・job.stats の handler を ps.ts へ抽出する

- [ ] **`src/cli/ps.ts`**: `handleJobLs(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - 現在の inline 実装（`loadConfigWithOverlay`・`resolveGitHubToken`・`createGitHubClient` を用いた try-catch フロー、`runPs` 呼び出し）をそのまま移動する
  - `loadConfigWithOverlay`・`resolveGitHubToken`・`createGitHubClient`・`resolveGitHubHost`・`resolveGitHubApiBaseUrl`・`resolveLogLevel` 等の必要な import を追加する
- [ ] **`src/cli/ps.ts`**: `handleJobStats(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - `process.exit(await runJobStats({ cwd: ctx!.repoRoot!, json: !!parsed.flags["json"] }))` を維持する
  - `runJobStats` の import を `ps.ts` に追加する
- [ ] `command-registry.ts` の対応 handler を置換し、不要になった import の候補を記録する

**Acceptance Criteria**:
- `ps.ts` に `handleJobLs`・`handleJobStats` が export されている
- `bun run test` でグリーン（`view-commands-worktree-guard.test.ts` 含む）

---

## T-07: job.show・job.wait・job.cancel の handler を抽出する

- [ ] **`src/cli/job-show.ts`**: `handleJobShow(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - `process.exit(await runJobShow(parsed.positional!, { repoRoot: ctx?.repoRoot ?? ctx?.invokerCwd }))` を維持する
- [ ] **`src/cli/job-wait.ts`**: `handleJobWait(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - slug の null チェック・`stderrWrite`・`process.exit` フローをそのまま移動する
  - `stderrWrite`・`EXIT_CODE` の import を追加する
- [ ] **`src/cli/cancel.ts`**: `handleJobCancel(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - `VALID_JOB_ID_CHARS` 定数を `cancel.ts` へ移動する
  - `logError`・`EXIT_CODE`・`runCancel` の import を維持する
- [ ] `command-registry.ts` の対応 handler を置換し、`VALID_JOB_ID_CHARS` の定義を `command-registry.ts` から削除する

**Acceptance Criteria**:
- 3 モジュールに各 handler が export されている
- `VALID_JOB_ID_CHARS` が `command-registry.ts` から消えている
- `bun run test` でグリーン

---

## T-08: job.resume handler を resume.ts へ抽出する

最も複雑な inline handler（100 行超）を抽出する。

- [ ] **`src/cli/resume.ts`**: `handleJobResume(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
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
- [ ] `command-registry.ts` の `job.resume.handler` を `handleJobResume` に置換する

**Acceptance Criteria**:
- `resume.ts` に `handleJobResume` が export されている
- `bun run test` でグリーン（`command-registry-resume.test.ts`・`resume-from-issue.test.ts` 含む）

---

## T-09: job.reopen・job.attach の handler を抽出する

- [ ] **`src/cli/reopen.ts`**: `handleJobReopen(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - `--reason` 必須チェック・`logLevel` 解決・`runReopen` 呼び出し・`SpecRunnerError` catch フロー全体を移動する
  - `logError`・`stderrWrite`・`resolveLogLevel`・`SpecRunnerError`・`EXIT_CODE` の import を追加する
- [ ] **`src/cli/attach.ts`**: `handleJobAttach(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - `--branch` 必須チェック・`logLevel` 解決・`runAttach` 呼び出し・`SpecRunnerError` catch フロー全体を移動する
  - `logError`・`stderrWrite`・`resolveLogLevel`・`SpecRunnerError`・`EXIT_CODE` の import を追加する
- [ ] `command-registry.ts` の対応 handler を置換する

**Acceptance Criteria**:
- `reopen.ts`・`attach.ts` に各 handler が export されている
- `bun run test` でグリーン（`command-registry-reopen.test.ts`・`attach.test.ts` 含む）

---

## T-10: job.archive handler を抽出し ARCHIVE_USAGE を移動する

- [ ] `ARCHIVE_USAGE` 文字列定数を `src/cli/archive.ts` へ移動し、export する
- [ ] **`src/cli/archive.ts`**: `handleJobArchive(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - slug / `--from-issue` の XOR チェック・`stderrWrite(ARCHIVE_USAGE)` 呼び出し・`mergeWaitMs` lenient parse・`runArchiveFromIssue` / `runArchive` 分岐・`SpecRunnerError` catch フロー全体を移動する
  - `logError`・`stderrWrite`・`SpecRunnerError`・`EXIT_CODE`・`runArchiveFromIssue` の import を追加する
- [ ] `command-registry.ts` の `ARCHIVE_USAGE` 定義を `export { ARCHIVE_USAGE } from "./archive.js"` に置換する（テストの import 互換性を維持）
- [ ] `command-registry.ts` の `job.archive.handler` を `handleJobArchive` に置換する

**Acceptance Criteria**:
- `archive.ts` に `ARCHIVE_USAGE`・`handleJobArchive` が export されている
- `command-registry.ts` が `ARCHIVE_USAGE` を re-export している
- `import { ARCHIVE_USAGE } from "../command-registry.js"` が引き続き解決できる
- `bun run test` でグリーン（`archive-from-issue.test.ts` 含む）

---

## T-11: job.prune・config.effective・inbox.run の handler を抽出する

- [ ] **`src/cli/prune.ts`**: `handleJobPrune(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - `runPrune` 呼び出し・`SpecRunnerError` catch フロー全体を移動する
- [ ] **`src/cli/config-effective.ts`**: `handleConfigEffective(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - `process.exit(await runConfigEffective({ requestType, json, repoRoot }))` を維持する
- [ ] **`src/cli/inbox.ts`**: `handleInboxRun(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - `limit` 整数チェック・`runInboxRun` 呼び出し・`process.exit` フローを移動する
- [ ] `command-registry.ts` の対応 handler を置換する

**Acceptance Criteria**:
- 3 モジュールに各 handler が export されている
- `bun run test` でグリーン

---

## T-12: runtime.setup・runtime.status・runtime.reset の handler を managed.ts へ抽出する

- [ ] **`src/cli/managed.ts`**: 以下 3 関数を追加・export する
  - `handleRuntimeSetup(): Promise<void>` → `process.exit(await runManagedSetup())`
  - `handleRuntimeStatus(): Promise<void>` → `process.exit(await runManagedStatus())`
  - `handleRuntimeReset(parsed: ParsedArgs): Promise<void>` → `process.exit(await runManagedReset({ force: !!parsed.flags["force"] }))`
- [ ] `command-registry.ts` の `runtime.*` handler を各 named handler に置換する

**Acceptance Criteria**:
- `managed.ts` に 3 handler 関数が export されている
- `bun run test` でグリーン

---

## T-13: doctor・doctor.repair の handler を doctor.ts へ抽出する

- [ ] **`src/cli/doctor.ts`**: `handleDoctor(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - `runDoctor` 呼び出し・try-catch・`process.exit` フローをそのまま移動する
- [ ] **`src/cli/doctor.ts`**: `handleDoctorRepair(parsed: ParsedArgs, ctx?: CommandContext): Promise<void>` を追加・export する
  - slug の null チェック・`stderrWrite` ガード・dynamic `import("../core/occupancy/repair.js")` 呼び出し・try-catch フローをそのまま移動する（dynamic import はそのまま維持する）
  - `stderrWrite`・`EXIT_CODE` の import を `doctor.ts` に追加する
- [ ] `command-registry.ts` の `doctor.handler` と `doctor.children.repair.handler` を各 named handler に置換する

**Acceptance Criteria**:
- `doctor.ts` に `handleDoctor`・`handleDoctorRepair` が export されている
- `bun run test` でグリーン（`doctor-config-overlay.test.ts` 含む）

---

## T-14: src/cli/scaffold-handlers.ts を作成し rules.new・reviewers.new の handler を抽出する

- [ ] `src/cli/scaffold-handlers.ts` を新規作成する
- [ ] 以下の関数を追加・export する:
  - `handleRulesNew(parsed: ParsedArgs): Promise<void>` → `process.exit(await executeRulesNew(parsed.positionals[0]!, parsed.positionals[1]!, process.cwd()))`
  - `handleReviewersNew(parsed: ParsedArgs): Promise<void>` → `process.exit(await executeReviewersNew(parsed.positional!, process.cwd()))`
- [ ] `executeRulesNew` は `../core/command/rules-new.js`、`executeReviewersNew` は `../core/command/reviewers-new.js` から import する
- [ ] `command-registry.ts` の対応 handler を置換し、`executeRulesNew`・`executeReviewersNew` の import を削除する

**Acceptance Criteria**:
- `scaffold-handlers.ts` が存在し 2 関数が export されている
- `bun run test` でグリーン

---

## T-15: src/cli/guide-handler.ts・src/cli/usage-handler.ts を作成する

- [ ] `src/cli/guide-handler.ts` を新規作成し、`handleGuide(parsed: ParsedArgs): Promise<void>` を export する
  - `process.exit(runGuide(parsed.positional))` を維持する
  - `runGuide` を `../core/command/guide.js` から import する
- [ ] `src/cli/usage-handler.ts` を新規作成し、`handleUsage(parsed: ParsedArgs): Promise<void>` を export する
  - `slug` 有無による分岐（`showUsage` / `showUsageSummary`）と `process.exit` を維持する
  - `showUsage`・`showUsageSummary` を各 core module から import する
- [ ] `command-registry.ts` の `guide.handler` と `usage.handler` を各 named handler に置換する
- [ ] `command-registry.ts` から `showUsage`・`showUsageSummary`・`runGuide` の import を削除する
- [ ] `GUIDE_TOPICS` は `guide.help.summary` の文字列テンプレートで使用しているため `command-registry.ts` の import に残す

**Acceptance Criteria**:
- 2 ファイルが存在し各 handler が export されている
- `bun run test` でグリーン

---

## T-16: command-registry.ts から business logic import を完全除去する

T-03〜T-15 の抽出完了後、`command-registry.ts` から残存するビジネスロジック import を整理する。

- [ ] `command-registry.ts` の import 一覧を精査し、COMMANDS ツリーの **handler 参照にのみ** 使われていたすべての import を削除する
  - 削除対象の候補: `* as path`・`* as fs`・`resolveWithFallback as storeResolve`・`FlagParseError`（class）・`resolveGitHubToken`・`createGitHubClient`・`resolveGitHubApiBaseUrl, resolveGitHubHost`・`logError, stderrWrite, resolveLogLevel`・`SpecRunnerError, EXIT_CODE`・`loadConfigWithOverlay`・`SLUG_REGEX`・`isDetachedChild, detachSelf`・`parseRequestMdRaw`・`getOriginInfo`
  - 注意: `FlagParseError` 型（type-only import）・`AGENT_STEP_NAMES`・`CLI_STEP_NAMES`・`GUIDE_TOPICS` は COMMANDS ツリーの宣言部分（flags/help.summary）で参照されているため残す
- [ ] handler モジュールへの import（`handleInit`・`handleLogin` 等）を追加する（T-03〜T-15 で追加済みなければ）
- [ ] `command-registry.ts` の全 inline handler 定義がゼロになったことを確認する（`handler: async` が 0 件）
- [ ] `command-registry.ts` の `process.exit` 呼び出しがゼロになったことを確認する
- [ ] `bun run typecheck` でエラーがないことを確認する

**Acceptance Criteria**:
- `command-registry.ts` 内の `handler: async` が 0 件
- `command-registry.ts` 内の `process.exit` が 0 件
- `command-registry.ts` 内の `import * as fs`・`import * as path` が消えている
- `bun run typecheck` クリーン
- `bun run test` でグリーン

---

## T-17: architecture ratchet test を追加する

T-16 完了後に architecture ratchet test を追加し、回帰を機械的に防止する。

- [ ] `src/cli/__tests__/architecture-ratchet.test.ts` を新規作成する
- [ ] **チェック 1: handler.name チェック（inline handler ゼロ検証）**
  - `COMMANDS` をインポートして全 CommandSpec ノードを再帰的に走査する
  - 各 `spec.handler` が存在する場合、`spec.handler.name === "handler"` でないことを `expect` する
  - 失敗メッセージに command path を含める（例: `"job.resume" has an anonymous handler`）
- [ ] **チェック 2: process.exit ゼロ検証**
  - `src/cli/command-registry.ts` のソーステキストを `fs.readFileSync` で読み込む
  - ラインコメント（`// ...`）とブロックコメント（`/* ... */`）を正規表現で除去する
  - 残りのテキストに `process.exit` が含まれないことを `expect` する
- [ ] **チェック 3: handler → registry value import cycle ゼロ検証**
  - `@typescript-eslint/parser` を使って handler モジュール（T-03〜T-15 で作成・変更した各 `src/cli/*.ts`）の import 宣言を解析する
  - `command-registry` を参照する `ImportDeclaration`（type-only でないもの）がゼロであることを確認する
- [ ] **チェック 4: 並行 CLI 契約正本ゼロ検証**
  - `src/cli/` 配下の全 `.ts` ファイルを列挙する
  - `export const COMMANDS` または `export const COMMANDS:` を持つファイルが `command-registry.ts` のみであることを確認する（コメント除去後のソーステキストで判定）
- [ ] テストが `bun run test` でグリーンになることを確認する

**Acceptance Criteria**:
- 全 4 チェックが `bun run test` でグリーン
- チェック 1 が inline handler を追加すると失敗することをコメントで説明している
- `command-registry.ts` に `handler: async` を追加した場合、チェック 1 が検出する

---

## T-18: CLI contract snapshot 一致検証と PR 掲載用メトリクス収集

- [ ] T-01 で作成した `cli-contract-snapshot.test.ts` を再実行し、snapshot が変更前後で完全一致することを確認する
  - mismatch が出た場合はハンドラの入れ替えミスを意味するため、command-registry.ts の COMMANDS ツリーを修正する
- [ ] 以下の before / after メトリクスを収集する（同一コマンド・方法で計測）:
  - `command-registry.ts` の行数（`wc -l`）
  - inline handler 数（`grep -c "handler: async" src/cli/command-registry.ts`）
  - named handler reference 数（COMMANDS ツリー内の `handler: handle` または `handler: run` のパターン数）
  - registry 内 `process.exit` 件数（`grep -c "process.exit" src/cli/command-registry.ts`）
  - repository 全体の `process.exit` 件数（`grep -r "process.exit" src/ --include="*.ts" | wc -l`）（R3a で意図せず削減していないことを確認）
  - registry の filesystem / credential / GitHub client 関連 value import 数（before: `import * as fs`・`createGitHubClient`・`resolveGitHubToken` 等を数える）
  - 抽出した handler module 数と command family 対応表
  - value-import SCC 数（循環なし = 0 を確認）
  - CLI contract snapshot 対象 command 数
- [ ] メトリクスを PR 本文の before / after 比較表として準備する

**Acceptance Criteria**:
- `bun run test` が全テストグリーン（既存テスト・T-01 snapshot・T-17 ratchet すべて）
- `bun run typecheck` クリーン
- `bun run build` が成功する
- メトリクスが揃っており、before / after 対比が明確
- repository 全体の `process.exit` 件数が before と after で一致する（R3a スコープ内で削減していない）
