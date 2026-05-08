## 1. slug 導出ユーティリティ

- [x] 1.1 `src/util/slugify.ts` を新規作成する。`slugify(description: string, maxLength?: number): string` を export する。デフォルト maxLength は 50
  - 英数字以外をハイフンに置換（日本語文字は削除）
  - 連続ハイフンを 1 つに圧縮
  - 先頭・末尾のハイフンを除去
  - maxLength で切り詰め（ハイフン末尾にならないよう調整）
  - 空文字列になった場合は `"untitled"` を返す

- [x] 1.2 `src/util/slugify.ts` に `checkSlugCollision(cwd: string, slug: string): Promise<void>` を export する
  - `specrunner/requests/active/` と `specrunner/requests/merged/` を `fs.readdir` で走査
  - 同名ディレクトリが存在する場合は `SpecRunnerError` を throw（code: `SLUG_COLLISION`）
  - ディレクトリが存在しない場合はスキップ（衝突なし）

## 2. request パターン収集

- [x] 2.1 `src/context/request-patterns.ts` を新規作成する。以下の型と関数を export する

```typescript
interface RequestPattern {
  type: string;
  title: string;
  slug: string;
  content: string;
}

function collectRequestPatterns(
  cwd: string,
  targetType: string,
  maxSamples?: number,
): Promise<RequestPattern[]>
```

- [x] 2.2 `collectRequestPatterns` の実装
  - `specrunner/requests/merged/` 配下の各ディレクトリの `request.md` を `parseRequestMdContent()` でパースする
  - 同一 type の request をアルファベット順（slug 順）で最大 3 件取得する
  - 異なる type から 1 件追加し、最大 4 件を返す。maxSamples のデフォルトは 4
  - ディレクトリが存在しない / 空の場合は空配列を返す。個別ファイルの読み取り失敗はスキップ（throw しない）

## 3. QueryOptions の拡張

- [x] 3.1 `src/core/runtime/strategy.ts` の `QueryOptions` に `model?: string` と `allowedTools?: string[]` を追加する

## 4. LocalRuntime.query() の実装

- [x] 4.1 `src/adapter/claude-code/agent-runner.ts` から `QueryFn` 型をエクスポートする（既に export 済みなら確認のみ）

- [x] 4.2 `src/core/runtime/local.ts` の LocalRuntime コンストラクタを named options object に移行する

```typescript
interface LocalRuntimeOptions {
  cwd: string;
  githubClient: GitHubClient;
  manager?: ReturnType<typeof createWorktreeManager>;
  spawnFn?: SpawnFn;
  queryFn?: QueryFn;
}
```

constructor を `constructor(opts: LocalRuntimeOptions)` に変更し、内部フィールドを opts から取得する。`queryFn` は `opts.queryFn ?? (sdkQuery as unknown as QueryFn)` で初期化する。`sdkQuery` の import を追加する

- [x] 4.3 `src/core/runtime/factory.ts` の `createRuntime()` 内の `new LocalRuntime(...)` 呼び出しを named options に更新する

- [x] 4.4 `tests/unit/core/runtime/local.test.ts` の LocalRuntime コンストラクタ呼び出しを全て named options に更新する

- [x] 4.5 LocalRuntime の `query()` メソッドを実装する。`ClaudeCodeRunner.run()` の SDK 呼び出しパターン（L126-143）を参考に、以下の軽量版を実装する:
  - `this.queryFn({ prompt, options: { cwd: opts?.cwd ?? this.cwd, allowedTools: opts?.allowedTools ?? ["Read", "Grep", "Glob"], permissionMode: "bypassPermissions", model: opts?.model, systemPrompt: opts?.systemPrompt } })` で SDK を呼び出す
  - 各メッセージを `yield` する（呼び出し元がフィルタする）
  - エラー発生時は `throw` する（呼び出し元の try-catch で処理）

## 5. create コマンド本体

- [x] 5.1 `src/prompts/create-system.ts` を新規作成する。`buildCreateSystemPrompt(): string` を export する
  - request.md の構造ルール: title（`# ` 見出し）/ Meta セクション（type, slug）/ 背景 / 要件（番号付きリスト）/ スコープ外 / 受け入れ基準（チェックリスト形式）/ architect 評価済みの設計判断
  - 受け入れ基準の最後に `bun run typecheck && bun run test` が green を含めるよう指示
  - 「応答はマークダウンのみ。前後の説明文やコードフェンスで囲まない」と明示

- [x] 5.2 `src/prompts/create-system.ts` に `buildCreateUserMessage(params: { description: string; type: string; slug: string; dynamicContext: DynamicContext; patterns: RequestPattern[] }): string` を export する
  - description, type, slug をそのまま埋め込む
  - DynamicContext から specsList と changesList をセクションとして注入する（gitLog / diffStat は create 時点では不要なので省略）
  - request パターンを `<example-N>` タグで囲んで full text を注入する

- [x] 5.3 `src/core/command/create.ts` を新規作成する。`executeCreate(params: CreateParams): Promise<number>` を export する

```typescript
interface CreateParams {
  description: string;
  type: string;
  slug: string;
  cwd: string;
  noLlm: boolean;
  run: boolean;
  runtime: RuntimeStrategy;
}
```

フロー:
  a. `checkSlugCollision(cwd, slug)` で衝突チェック
  b. `--no-llm` の場合はステップ 5.4 の scaffold テンプレートを出力して h へジャンプ
  c. `collectDynamicContext(cwd, "main")` で DynamicContext 収集
  d. `collectRequestPatterns(cwd, type)` でパターン収集
  e. `buildCreateSystemPrompt()` + `buildCreateUserMessage()` で prompt 組み立て
  f. `runtime.query(userMessage, { systemPrompt, cwd, model: "sonnet", allowedTools: ["Read", "Grep", "Glob"] })` で LLM 呼び出し
  g. 応答からコンテンツ抽出（5.6 の extractRequestContent）
  h. `specrunner/requests/active/<slug>/request.md` に書き出し（`fs.mkdir` + `fs.writeFile`）
  i. `parseRequestMdContent()` でバリデーション。失敗時はファイルを残してエラーメッセージを stderr に出力し exit code 1
  j. stdout にパスを出力
  k. `--run` なら `runRunCore(requestMdPath, { cwd })` を呼ぶ

- [x] 5.4 `src/core/command/create.ts` に `buildScaffoldTemplate(params: { title: string; type: string; slug: string }): string` を定義する
  - Meta セクション（type, slug）+ セクション見出し（背景 / 要件 / スコープ外 / 受け入れ基準）を含むマークダウンテンプレート
  - 受け入れ基準に `bun run typecheck && bun run test` が green の行を含める

- [x] 5.5 `src/core/command/create.ts` に型ガード関数を定義する

```typescript
function isResultMessage(v: unknown): v is { type: "result"; subtype: string; result?: string }
```

`typeof v === "object"` + `v !== null` + `"type" in v` + `v.type === "result"` + `"subtype" in v` で判定する。adapter 層の SDKMessage 型への直接依存は避ける

- [x] 5.6 `src/core/command/create.ts` に `extractRequestContent(messages: AsyncGenerator<unknown>): Promise<string>` を定義する
  - `for await` でメッセージを消費し、`isResultMessage(msg)` で result を検出
  - result.result（文字列）を取得
  - 3 段フォールバック:
    1. 全体を `parseRequestMdContent()` に通す → 成功ならそのまま返す
    2. 失敗 → `` ```markdown ... ``` `` または `` ``` ... ``` `` を正規表現で抽出 → 再度 `parseRequestMdContent()` → 成功なら抽出テキストを返す
    3. 失敗 → エラー throw
  - parseRequestMdContent はバリデーション目的で呼ぶだけ。返すのは raw text（ParsedRequest ではない）

## 6. CLI エントリポイント

- [x] 6.1 `src/cli/create.ts` を新規作成する。`runCreate(description: string, options: CreateOptions): Promise<void>` を export する

```typescript
interface CreateOptions {
  type?: string;
  slug?: string;
  noLlm?: boolean;
  run?: boolean;
  cwd?: string;
}
```

  - type のデフォルトは `"new-feature"`
  - slug 未指定時は `slugify(description)` で導出
  - `loadConfig()` + `getOriginInfo()` + `createGitHubClient()` + `createRuntime()` で RuntimeStrategy を構築
  - `executeCreate()` を呼び出す
  - exit code が 0 以外なら `process.exit(exitCode)`

- [x] 6.2 `bin/specrunner.ts` に `create` サブコマンドを追加する
  - switch case に `"create"` を追加
  - 第一引数（description）は必須。未指定時はエラーメッセージを stderr に出力して exit 1
  - `--type <type>`, `--slug <slug>`, `--no-llm`, `--run` をパースする
  - `runCreate(description, { type, slug, noLlm, run })` を呼び出す

## 7. テスト

- [x] 7.1 `tests/unit/util/slugify.test.ts` を新規作成する
  - 英語 description → kebab-case 変換
  - 日本語混じり → 日本語部分が除去され英語部分のみ残る
  - 記号（`!@#$%`）→ ハイフンに置換、連続ハイフン圧縮
  - 50 文字超 → 50 文字以内に切り詰め
  - 空文字列 → `"untitled"`
  - `checkSlugCollision()`: 衝突時に throw、衝突なし時に正常終了

- [x] 7.2 `tests/unit/context/request-patterns.test.ts` を新規作成する
  - merged requests から同一 type 3 件 + 異 type 1 件が返ること
  - 同一 type が 3 件未満の場合は存在する分だけ返ること
  - merged ディレクトリが存在しない場合に空配列を返すこと
  - 個別ファイルの読み取り失敗時にスキップすること

- [x] 7.3 `tests/unit/core/command/create.test.ts` を新規作成する
  - `buildScaffoldTemplate()`: 出力が `parseRequestMdContent()` のバリデーションを通ること
  - `extractRequestContent()`: 生マークダウン応答 → 正常抽出
  - `extractRequestContent()`: `` ```markdown ``` `` 囲み応答 → コードブロック内を抽出
  - `extractRequestContent()`: 不正応答 → エラー throw
  - `executeCreate()`: query() をモックして request.md が正しいパスに書き出されること
  - `executeCreate()` + `--no-llm`: scaffold テンプレートが出力されること

- [x] 7.4 `tests/unit/core/runtime/local.test.ts` を更新する
  - コンストラクタの named options 化に伴うテスト更新
  - `query()` メソッドのテスト追加: queryFn モックを注入して yield されたメッセージを検証

- [x] 7.5 `bun run typecheck` が green であること

- [x] 7.6 `bun run test` が green であること
