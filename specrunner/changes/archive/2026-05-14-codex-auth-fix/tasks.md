# Tasks: codex-auth-fix

## T1: [x] `CodexAgentRunnerDeps` から `apiKey` を削除する

**File**: `src/adapter/codex/agent-runner.ts`

- `CodexAgentRunnerDeps` インターフェースから `apiKey: string` フィールドを削除する
- `_codexFactory` の型を `(opts: { apiKey: string }) => CodexInstance` から `() => CodexInstance` に変更する
- クラスの `private readonly apiKey: string` フィールドを削除する
- `private readonly codexFactory` の型を `() => CodexInstance` に変更する
- コンストラクタを `constructor(deps: CodexAgentRunnerDeps = {})` に変更する（deps オプション化）
- コンストラクタ内の `this.apiKey = deps.apiKey` を削除する
- デフォルトファクトリを `() => new Codex() as unknown as CodexInstance` に変更する（引数なし）
- `run()` 内の `this.codexFactory({ apiKey: this.apiKey })` を `this.codexFactory()` に変更する

## T2: [x] SDK エラーメッセージの加工を除去する

**File**: `src/adapter/codex/agent-runner.ts`

- `run()` の catch ブロック内で `new Error(\`Codex SDK error: ${cause.message}\`)` を
  `new Error(cause.message)` に変更する
- エラーコード `CODEX_SDK_ERROR` と `cause` 付与は維持する

## T3: [x] `DispatchingAgentRunner` から `OPENAI_API_KEY` チェックを削除する

**File**: `src/adapter/dispatching/agent-runner.ts`

- `provider === "openai"` ブランチ内の lazy init ブロックを以下に置き換える：
  ```ts
  if (!this.codexRunner) {
    this.codexRunner = new CodexAgentRunner();
  }
  ```
- `OPENAI_API_KEY` 読み取りと `MISSING_OPENAI_API_KEY` エラー throw を削除する

## T4: [x] テストを `apiKey` 削除に合わせて更新する

**File**: `tests/adapter/codex/agent-runner.test.ts`

- `makeCodexFactory` の型シグネチャを `() => CodexInstance` に変更する
  （`vi.fn().mockReturnValue(...)` のシグネチャも合わせる）
- 全テストケースの `new CodexAgentRunner({ apiKey: "sk-test" })` を
  `new CodexAgentRunner()` に変更する
- 全テストケースの `new CodexAgentRunner({ apiKey: "sk-test", _codexFactory: factory })` を
  `new CodexAgentRunner({ _codexFactory: factory })` に変更する
- T2 の変更に合わせて、SDK エラーテストのアサーションを確認する
  （`cause.message` が `result.error?.message` に含まれることを検証している箇所）

## T4.5: [x] `tests/adapter/dispatching/agent-runner.test.ts` を更新する

**File**: `tests/adapter/dispatching/agent-runner.test.ts`

- `"routes openai model to CodexAgentRunner (lazy init)"` テスト（L87-109）から `OPENAI_API_KEY` 環境変数操作を除去する
  - `const originalEnv = process.env["OPENAI_API_KEY"]`、`process.env["OPENAI_API_KEY"] = "sk-test-key"` の行を削除する
  - `try/finally` ブロックを展開し、内部の assert ロジックをそのまま残す（`OPENAI_API_KEY` restore 処理を削除）
- `"throws MISSING_OPENAI_API_KEY when OPENAI_API_KEY is not set"` テスト（L111-125）をまるごと削除する

## T5: [x] doctor codex-cli チェックに認証確認を追加する

**File**: `src/core/doctor/checks/runtime/codex-cli.ts`

- `codex --version` 成功後、以下の認証チェックを追加する：
  - `codex auth whoami` を `AbortSignal.timeout(5000)` で実行する
  - 成功時: `{ status: "pass", message: \`codex ${version} (authenticated)\` }` を返す
  - 失敗時: `{ status: "warn", message: \`codex ${version} (not authenticated)\`, hint: "Run \`codex login\` to authenticate, or set the CODEX_API_KEY environment variable" }` を返す

## T6: [x] `bun run typecheck && bun run test` を通す

実装後、型エラーとテスト失敗がないことを確認する。
