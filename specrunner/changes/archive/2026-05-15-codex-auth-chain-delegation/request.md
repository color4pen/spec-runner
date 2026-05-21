# CodexAgentRunner / DispatchingAgentRunner の OPENAI_API_KEY 固定を解消する

## Meta

- **type**: bug-fix
- **slug**: codex-auth-chain-delegation
- **base-branch**: main
- **date**: 2026-05-15
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

`src/adapter/codex/agent-runner.ts` と `src/adapter/dispatching/agent-runner.ts` が現在 `OPENAI_API_KEY` 環境変数を必須としている。これは PR #228（Codex 実行基盤）で導入された制約。

しかし Codex CLI 自体は以下の優先順位で認証を解決する：

1. `CODEX_API_KEY` 環境変数（最優先）
2. `~/.codex/auth.json`（`codex login` で保存された ChatGPT OAuth トークン）
3. `CODEX_ACCESS_TOKEN`（Agent Identity JWT、CI/CD 向け）

ChatGPT Pro サブスクで `codex login` 済みなら API キー不要で動く。`OPENAI_API_KEY` 必須にしているせいで、サブスクユーザーが spec-runner を使えない。

PR #231 で `CodexAgentRunner` 単体の auth は Codex CLI chain に委譲済みだが、`DispatchingAgentRunner` や `OPENAI_API_KEY` 必須チェックが残っている箇所がある（issue #230 で指摘）。

## 目的

Codex SDK にオプションなしで認証を委ね、`OPENAI_API_KEY` 必須を完全に廃止する。spec-runner は Codex の auth chain に乗るだけで、provider 固有 env var を抱え込まない（PR #231 / PR #238 と同じ原則）。

## 要件

### OPENAI_API_KEY 必須チェックの削除

1. `src/adapter/codex/agent-runner.ts` の `OPENAI_API_KEY` 必須チェックを削除する
2. `src/adapter/dispatching/agent-runner.ts` の同上チェックを削除する
3. `grep -rn 'OPENAI_API_KEY' src/` の全ヒット箇所を確認し、必須化している箇所があれば全て削除する（lazy instantiation の guard も含む）

### Codex SDK の生成方法

4. `new Codex()` を **オプションなし** で生成する（`process.env` がそのまま CLI プロセスに継承される、Codex SDK のソースコード調査済み）
5. spec-runner 側で apiKey を SDK に渡さない（PR #231 で `CodexAgentRunner` 単体には適用済み、本 request で残り全箇所を揃える）

### 認証エラー時の挙動

6. Codex CLI が認証エラーで非ゼロ exit を返した場合、SDK が throw する Error の message（CLI の stderr 内容を含む）をそのまま stderr に出力する
7. spec-runner 側でメッセージを加工しない（PR #231 と同じ流儀）

### `specrunner doctor` の codex チェック拡張

8. `src/core/doctor/checks/runtime/codex-cli.ts` を以下に拡張する:
   - `codex` バイナリの存在チェック（既存）
   - `codex auth whoami` の実行（新規）
     - 成功すれば認証済み → pass
     - 失敗すれば warn（`codex login` を案内）
   - バイナリが無ければ fail（既存）

### テスト更新

9. `tests/adapter/codex/agent-runner.test.ts` / `tests/adapter/dispatching/agent-runner.test.ts` の `OPENAI_API_KEY` モックを削除する
10. apiKey なしで `new Codex()` が動くことをテストする
11. `tests/core/doctor/checks/runtime/codex-cli.test.ts` で `codex auth whoami` の各 verdict を網羅する

## スコープ外

- Codex SDK 本体への変更
- `CODEX_API_KEY` / `~/.codex/auth.json` / `CODEX_ACCESS_TOKEN` の優先順位変更（Codex CLI 側の責務）
- `claude` CLI（Anthropic 側）の auth chain — PR #238 で別途対応済

## 受け入れ基準

- [ ] `OPENAI_API_KEY` / `CODEX_API_KEY` 未設定でも `codex login` 済みなら Codex ステップが実行できる
- [ ] `CODEX_API_KEY` が環境変数に設定されていれば CLI がそれを使う（SDK が `process.env` を継承するため）
- [ ] `src/adapter/codex/agent-runner.ts` / `src/adapter/dispatching/agent-runner.ts` から `OPENAI_API_KEY` の必須参照が削除されている
- [ ] `specrunner doctor` が Codex の認証状態をチェックする（`codex auth whoami`）
- [ ] 認証エラー時に CLI の stderr メッセージが加工なしで表示される
- [ ] 既存の Claude / managed runtime に影響なし
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **provider 固有 env var を spec-runner が抱え込まない**。auth は upstream CLI（Codex CLI）/ SDK（Anthropic SDK）の chain に委譲し、spec-runner は SDK 呼び出し時にオプションなしで生成する。PR #231（partial）/ PR #238（Anthropic）と同じ原則の完成

- **`new Codex()` をオプションなしで生成**する理由は SDK ソースコードで確認済み — apiKey 引数なしの場合 `process.env` がそのまま CLI プロセスに継承される。spec-runner が `OPENAI_API_KEY` を passthrough する必要すらない

- **doctor は `codex auth whoami` で検証**する。具体的な auth source（API key / OAuth / JWT）は Codex CLI 側の責務なので、spec-runner は単に「認証済みか否か」だけを確認すればよい

- **エラーメッセージは加工しない**。Codex CLI の stderr をそのまま伝播することで、ユーザーは Codex の慣れたエラー表記で原因を理解できる
