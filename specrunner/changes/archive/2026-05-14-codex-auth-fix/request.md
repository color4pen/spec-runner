# CodexAgentRunner の認証を Codex CLI の認証チェーンに委ねる

## Meta

- **type**: bug-fix
- **slug**: codex-auth-fix
- **base-branch**: main
- **date**: 2026-05-14
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

PR #228 で導入した `CodexAgentRunner` は `OPENAI_API_KEY` 環境変数を必須としている。しかし Codex SDK のソースコード（`@openai/codex-sdk/dist/index.js` L222-237）を実測確認したところ:

- `Codex({ apiKey })` に apiKey を渡すと、CLI 起動時に `env.CODEX_API_KEY = args.apiKey` でセットされる
- apiKey を渡さなければ `process.env` をそのまま CLI プロセスに継承する
- CLI 側が `CODEX_API_KEY` / `~/.codex/auth.json` / `CODEX_ACCESS_TOKEN` の認証チェーンを処理する

つまり SDK に `apiKey` を渡さなければ、CLI の認証チェーン全体（API キー / ChatGPT OAuth / Agent Identity JWT）が使える。現在の実装は `OPENAI_API_KEY` がないとエラーになるため、`codex login` 済みのサブスクユーザーが使えない。

認証エラー時の挙動（L277-280）:
- CLI が exit code 非0で終了
- SDK が `Error("Codex Exec exited with code N: {stderr}")` を throw
- stderr に CLI の認証エラーメッセージが含まれる

## 目的

`CodexAgentRunner` から `apiKey` 必須を外し、認証を Codex CLI に委ねる。

## 要件

1. `CodexAgentRunner` のコンストラクタから `apiKey` 必須を外す。`CodexAgentRunnerDeps` の `apiKey: string` を削除する
2. `Codex()` をオプションなしで生成する（`process.env` が CLI に継承され、CLI 側の認証チェーンが動く）
3. `DispatchingAgentRunner` の lazy instantiation から `OPENAI_API_KEY` の存在チェックを削除する。`new CodexAgentRunner()` を引数なしで生成する
4. `CodexAgentRunner` の既存テスト（`_codexFactory` モックの型）を `apiKey` 削除に合わせて更新する
5. `specrunner doctor` の codex チェック（`codex-cli.ts`）に `codex auth whoami` の実行を追加する。成功すれば認証済み、失敗すれば warn（`codex login` を案内）。codex CLI バイナリが存在しない場合は従来通り fail
6. 認証エラー時は SDK が throw する Error の message（CLI の stderr 内容を含む）をそのまま stderr に出力する。spec-runner 側でメッセージを加工しない

## 受け入れ基準

- [ ] `OPENAI_API_KEY` / `CODEX_API_KEY` 未設定でも `codex login` 済みなら Codex ステップが実行できる
- [ ] `CODEX_API_KEY` が環境変数に設定されていれば CLI がそれを使う（SDK が process.env を継承するため）
- [ ] `specrunner doctor` が Codex の認証状態をチェックする
- [ ] 認証エラー時に CLI の stderr メッセージが表示される
- [ ] 既存の Claude パイプラインに影響なし
- [ ] `bun run typecheck && bun run test` が green
