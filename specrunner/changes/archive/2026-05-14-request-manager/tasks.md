## 1. `src/core/request/types.ts` 新設

- [x] 1.1 `src/core/request/` ディレクトリを作成し、`types.ts` を新規作成する。`ParsedRequestSections` と `ParsedRequest` のインターフェース定義を `src/parser/request-md.ts` から移植してそのまま記述する（内容は同一）。`RequestState = "active" | "merged"` 型エイリアスを追加する
- [x] 1.2 `src/parser/request-md.ts` を更新する。`ParsedRequestSections` と `ParsedRequest` のインターフェース定義本体を削除し、代わりに `export type { ParsedRequest, ParsedRequestSections } from "../core/request/types.js"` を先頭付近に追加する。`parseRequestMdContent` の内部で使われている型参照は変わらず動作する（同じ型が re-export されるため）。13 ファイルの既存 import は変更不要

## 2. `src/core/request/store.ts` 新設

- [x] 2.1 `src/core/request/store.ts` を新規作成する。module-level の定数として `const ACTIVE_SUBDIR = path.join("specrunner", "requests", "active")` と `const MERGED_SUBDIR = path.join("specrunner", "requests", "merged")` を定義する
- [x] 2.2 `resolve(cwd: string, slug: string): string` を実装する。`path.join(cwd, ACTIVE_SUBDIR, slug, "request.md")` を返す。存在確認は行わない
- [x] 2.3 `list(cwd: string): Promise<string[]>` を実装する。`path.join(cwd, ACTIVE_SUBDIR)` を readdir し、各エントリに `request.md` が存在するものの slug 名一覧を返す。active/ ディレクトリが存在しない場合（ENOENT）は空配列を返す
- [x] 2.4 `read(cwd: string, slug: string): Promise<ParsedRequest>` を実装する。`resolve(cwd, slug)` のパスを `fs.readFile` し、`parseRequestMdContent(content, filePath)` でパースして返す
- [x] 2.5 `write(cwd: string, slug: string, content: string): Promise<void>` を実装する。`path.join(cwd, ACTIVE_SUBDIR, slug)` ディレクトリを `fs.mkdir(..., { recursive: true })` で作成し、`resolve(cwd, slug)` に `fs.writeFile` する
- [x] 2.6 `checkSlugCollision(cwd: string, slug: string): Promise<void>` を実装する。`src/util/slugify.ts` の既存実装をそのまま移植し、パス参照を `ACTIVE_SUBDIR` / `MERGED_SUBDIR` 定数に置き換える。SLUG_COLLISION エラーの形式は変えない

## 3. `src/util/slugify.ts` 更新

- [x] 3.1 `src/util/slugify.ts` の `checkSlugCollision` 関数本体を削除し、`export { checkSlugCollision } from "../core/request/store.js"` に置き換える。`slugify()` 関数と既存 import は残す

## 4. `src/core/request/reviewer.ts` 新設

- [x] 4.1 `src/core/request/reviewer.ts` を新規作成する。`src/core/command/request-review.ts` から以下を移動（コピー）する: `RequestReviewVerdict` 型、`RequestReviewFinding` 型、`RequestReviewResult` 型、`isValidVerdict()` 内部関数、`parseReviewOutput()` 関数、`verdictToExitCode()` 関数、`buildInitialMessage()` 関数。必要な import（`@anthropic-ai/claude-agent-sdk` の型類、`REQUEST_REVIEW_SYSTEM_PROMPT`、`getStepExecutionConfig`、`projectMdPath` 等）も合わせて追加する
- [x] 4.2 `reviewer.ts` に `runReview(content: string, config: SpecRunnerConfig, cwd: string, queryFn: typeof query = query): Promise<RequestReviewResult>` を実装する。実装は `src/core/command/request-review.ts` の `executeReview()` の Step 3〜9（プロジェクトコンテキスト読み込み〜parseReviewOutput）を抽出する。Step 1（readFile）と Step 2（parseRequestMdContent）と Step 10〜12（出力・exit code）は含めない。lastResult が `success` でない場合は `SpecRunnerError` を throw する（エラーコードは `"REVIEW_SESSION_FAILED"` を新設するか既存コードに準ずる）

## 5. `src/core/command/request-review.ts` 更新

- [x] 5.1 `src/core/command/request-review.ts` の型定義・ヘルパー関数（`RequestReviewVerdict`, `RequestReviewFinding`, `RequestReviewResult`, `parseReviewOutput`, `verdictToExitCode`, `buildInitialMessage`）の定義本体を削除し、`src/core/request/reviewer.ts` から re-export する: `export type { RequestReviewVerdict, RequestReviewFinding, RequestReviewResult } from "../../core/request/reviewer.js"` および `export { parseReviewOutput, verdictToExitCode, buildInitialMessage } from "../../core/request/reviewer.js"`
- [x] 5.2 `executeReview()` を `runReview()` のラッパーに変更する。Step 1（readFile）、Step 2（parseRequestMdContent バリデーション）、Step 3（loadConfig）、Step 10（出力）、Step 12（exit code 返却）を残し、Step 4〜9 を `const result = await runReview(content, config, process.cwd())` に置き換える。`import { runReview } from "../../core/request/reviewer.js"` を追加する
- [x] 5.3 `tests/unit/command/request-review.test.ts` が `src/core/command/request-review.ts` から import していることを確認する。re-export により既存テストはそのまま通ることを確認する（テスト側の変更不要）

## 6. `src/prompts/request-generate-system.ts` 新設

- [x] 6.1 `src/prompts/request-generate-system.ts` を新規作成する。`REQUEST_GENERATE_SYSTEM_PROMPT` 定数を export する。システムプロンプトには以下を記述する: (a) 役割: 入力テキストを読んで標準 request.md フォーマットに変換する、(b) 必須フォーマット: `# <title>`, `## Meta`（`type`・`slug`・`base-branch` フィールド）, `## Workflow Options`（`- enabled: []`）を必ず含める、(c) type は new-feature / bug-fix / spec-change / refactor から推定する、(d) slug フィールドには `<generated-slug>` を出力する（caller が実際の slug に置換する）、(e) base-branch は `main` を使う、(f) title・背景・要件・スコープ外・受け入れ基準を入力から導出する、(g) 出力は request.md の内容のみ（Markdown コードブロックや説明文は含めない）

## 7. `src/core/request/generator.ts` 新設

- [x] 7.1 `src/core/request/generator.ts` を新規作成する。`GeneratedRequest = { slug: string; content: string }` インターフェースを定義する
- [x] 7.2 `buildGeneratePrompt(text: string): string` を実装する。`"以下のテキストから request.md を生成してください:\n\n<input>\n${text}\n</input>"` 形式で返す
- [x] 7.3 `generate(text: string, cwd: string, config: SpecRunnerConfig, queryFn: typeof query = query): Promise<GeneratedRequest>` を実装する。フロー: (a) `slug = slugify(text)` — 入力テキストから slug 生成、(b) `await store.checkSlugCollision(cwd, slug)` — 衝突確認（throw on collision）、(c) `getStepExecutionConfig(config, "request-generate", { model: "claude-opus-4-5", maxTurns: 1, timeoutMs: 120_000 })` で実行設定解決、(d) `queryFn({ prompt: buildGeneratePrompt(text), options: { cwd, maxTurns: 1, allowedTools: [], permissionMode: "bypassPermissions", model: resolvedModel, systemPrompt: REQUEST_GENERATE_SYSTEM_PROMPT } })` 呼び出し、(e) ストリーム消費 → `SDKResultSuccess` の `result` 文字列を取得（失敗時は throw）、(f) result 内の `<generated-slug>` 文字列を実際の slug で置換、(g) `parseRequestMdContent(result, "<generated>")` でバリデーション（失敗時は `SpecRunnerError` を throw、リトライなし）、(h) `await store.write(cwd, slug, result)` で保存、(i) `{ slug, content: result }` を返す

## 8. `src/core/request/manager.ts` 新設

- [x] 8.1 `src/core/request/manager.ts` を新規作成する。module-level functions として以下を実装する（クラスではない）
- [x] 8.2 `create(text: string, cwd: string, config: SpecRunnerConfig, queryFn?: typeof query): Promise<string>` を実装する。`generator.generate(text, cwd, config, queryFn)` を呼び、`result.slug` を返す
- [x] 8.3 `review(slugOrPath: string, cwd: string, config: SpecRunnerConfig, queryFn?: typeof query): Promise<RequestReviewResult>` を実装する。`fs.existsSync(path.resolve(cwd, slugOrPath))` が true なら直接パスを使い、false なら `store.resolve(cwd, slugOrPath)` で解決する。解決パスを `fs.readFile` して内容を取得し、`reviewer.runReview(content, config, cwd, queryFn)` を呼ぶ
- [x] 8.4 `list(cwd: string): Promise<Array<{ slug: string; type: string; state: RequestState }>>` を実装する。`store.list(cwd)` → 各 slug の `store.read(cwd, slug)` → `{ slug, type: parsed.type, state: "active" as const }` を返す（read 失敗の slug はスキップする）
- [x] 8.5 `resolve(cwd: string, slug: string): string` を実装する。`store.resolve(cwd, slug)` を呼んで返す

## 9. CLI コマンドハンドラ新設

- [x] 9.1 `src/core/command/request-create.ts` を新規作成する。`executeCreate(text: string | null, opts: { stdin: boolean; cwd: string }): Promise<number>` を実装する: (a) `text !== null` ならそのまま使う（positional が `--stdin` より優先 — REQ-CLI-RC-02）、(b) `text === null` かつ `opts.stdin` が true なら `process.stdin` を非同期ループで全読みして text とする（Bun.* API は使わない）、(c) `text === null` かつ `!opts.stdin` なら stderr に `Error: テキスト引数（"<text>"）または --stdin フラグが必要です\n` を書いて 1 を返す、(d) config を `loadConfig().catch(() => ({} as SpecRunnerConfig))` で読み込む、(e) `await manager.create(resolvedText, opts.cwd, config)` → slug を stdout に出力（末尾改行付き）して 0 を返す、(f) `SpecRunnerError` は stderr に `Error: ${err.message}\nHint: ${err.hint}\n` を書いて 1 を返す
- [x] 9.2 `src/core/command/request-list.ts` を新規作成する。`executeList(cwd: string): Promise<number>` を実装する: (a) `await manager.list(cwd)` を呼ぶ、(b) 結果が空なら `(no active requests)\n` を stdout に書いて 0 を返す、(c) 結果がある場合はヘッダー `SLUG                    TYPE          STATE\n` の後に各行を左揃え固定幅（SLUG: 24文字、TYPE: 14文字）でフォーマットして stdout に書いて 0 を返す

## 10. `src/cli/run.ts` 更新

- [x] 10.1 `src/cli/run.ts` に `import * as fs from "node:fs"` を追加する（同期 `existsSync` のため）
- [x] 10.2 `src/cli/run.ts` に `import { resolve as storeResolve } from "../core/request/store.js"` を追加する
- [x] 10.3 `runRunCore()` の `const absolutePath = path.resolve(cwd, requestMdPath)` を `let absolutePath = path.resolve(cwd, requestMdPath)` に変更する（let への変更が必要）
- [x] 10.4 上記の直後に以下を追加する: `if (!fs.existsSync(absolutePath)) { const slugResolved = storeResolve(cwd, requestMdPath); if (!fs.existsSync(slugResolved)) { process.stderr.write(\`Error: '${requestMdPath}' is neither a file path nor an active request slug.\n\`); process.stderr.write("Hint: Use 'specrunner request list' to see available slugs.\n"); return 1; } absolutePath = slugResolved; }`

## 11. `src/cli/command-registry.ts` 更新

- [x] 11.1 ファイル先頭の import 群に `import * as fs from "node:fs"` を追加する。`import { resolve as storeResolve } from "../core/request/store.js"` を追加する。`import { executeCreate } from "../core/command/request-create.js"` を追加する。`import { executeList } from "../core/command/request-list.js"` を追加する
- [x] 11.2 `request.subcommands.review` の handler を更新する: `parsed.positional!` を `input` に受け取り、`path.resolve(process.cwd(), input)` の existsSync で分岐し、ファイルでなければ `storeResolve(process.cwd(), input)` で slug 解決する。解決後パスの existsSync が false なら stderr にエラーを書いて `process.exit(1)`。最終的に `executeReview(filePath, { json: ... })` を呼ぶ。`positional: { name: "file" }` を `{ name: "file-or-slug" }` に変更する
- [x] 11.3 `request.subcommands.create` を追加する。`flags: { stdin: { type: "boolean" } }`、`positional: { name: "text", required: false }`。handler: `executeCreate(parsed.positional ?? null, { stdin: !!parsed.flags["stdin"], cwd: process.cwd() })` を呼ぶ
- [x] 11.4 `request.subcommands.list` を追加する。`flags: {}`、positional なし。handler: `executeList(process.cwd())` を呼ぶ
- [x] 11.5 `run` コマンドの `positional: { name: "request.md", required: true }` を `{ name: "request.md|slug", required: true }` に変更する
- [x] 11.6 `USAGE` 定数の `run <req.md>` を `run <request.md|slug>` に変更する。`request review <file>` を `request review <file-or-slug>` に更新する。`request create "<text>" [--stdin]` と `request list` の行を追加する

## 12. Delta Spec

- [x] 12.1 `specrunner/changes/request-manager/specs/cli-commands/spec.md` を新規作成する。以下の Requirement を記述する: (a) `specrunner request create "<text>"` — テキストから request.md を生成して active/ に保存し slug を stdout に出力する、(b) `specrunner request create --stdin` — stdin からテキストを受け取って同上、(c) `specrunner request list` — active な request の slug / type / state を一覧表示する、(d) `specrunner request review <file-or-slug>` — slug 指定の場合は active/ から解決する（ファイルパス指定も引き続き動作する）、(e) `specrunner run <request.md|slug>` — ファイルパスが存在しない場合は slug として active/ から解決する（ファイルパス指定は後方互換で動作する）
- [x] 12.2 `specrunner/changes/request-manager/specs/request-management/spec.md` を新規作成する。以下の Requirement を記述する: (a) パス定数（ACTIVE_SUBDIR / MERGED_SUBDIR）は store.ts に集約する、(b) store は `resolve` / `list` / `read` / `write` / `checkSlugCollision` を提供する、(c) `checkSlugCollision` は active/ と merged/ の両方を確認する、(d) generator は `maxTurns: 1` の one-shot LLM 呼び出しでテキストから request.md を生成する、(e) generator はパース失敗時にリトライなしで SpecRunnerError を throw する、(f) reviewer の `runReview()` は query 関数を引数で注入できる（デフォルトは SDK の `query`）、(g) manager は store / generator / reviewer の thin coordinator であり、独自のドメインロジックを持たない

## 13. Tests

- [x] 13.1 `tests/unit/core/request/store.test.ts` を新規作成する。`vitest` を使用する。以下をテストする: TC-ST-001: `resolve()` が `specrunner/requests/active/<slug>/request.md` の絶対パスを返す、TC-ST-002: `list()` が active/ に request.md を持つエントリの slug 一覧を返す、TC-ST-003: `list()` が active/ ディレクトリ不在のとき空配列を返す、TC-ST-004: `write()` が tmp ディレクトリ配下に request.md を作成する（`fs.mkdtemp` で tmp dir を作成してテスト後に削除）、TC-ST-005: `checkSlugCollision()` が active/ に同名 slug が存在するとき SLUG_COLLISION を throw する、TC-ST-006: `checkSlugCollision()` が merged/ に同名 slug が存在するとき SLUG_COLLISION を throw する、TC-ST-007: `checkSlugCollision()` が衝突なしのとき正常終了する
- [x] 13.2 `tests/unit/core/request/reviewer.test.ts` を新規作成する。以下をテストする: TC-RVR-001〜010: `parseReviewOutput()` / `verdictToExitCode()` / `buildInitialMessage()` の同等テスト（`tests/unit/command/request-review.test.ts` の TC-RR-001〜010 と同内容、`src/core/request/reviewer.ts` から import）、TC-RVR-011: `runReview()` に mock queryFn（approve JSON を返す）を注入して `RequestReviewResult` を返すことを確認する
- [x] 13.3 `tests/unit/core/request/generator.test.ts` を新規作成する。以下をテストする: TC-GEN-001: `generate()` に有効な request.md を返す mock queryFn を注入したとき `{ slug, content }` が返ること（tmp dir 使用）、TC-GEN-002: `generate()` に parseRequestMdContent でバリデーション失敗するコンテンツを返す mock queryFn を注入したとき `SpecRunnerError` を throw すること

## 14. 型チェック・テスト

- [x] 14.1 `bun run typecheck` が green であることを確認する
- [x] 14.2 `bun run test` が green であることを確認する
