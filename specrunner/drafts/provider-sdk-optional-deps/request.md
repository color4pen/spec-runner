# provider SDK を dynamic import + optionalDependencies 化し、未使用 provider のバイナリ 190MB を install から外せるようにする

## Meta

- **type**: spec-change
- **slug**: provider-sdk-optional-deps
- **base-branch**: main
- **adr**: true

## 背景

install footprint 実測 429MB のうち約 9 割は provider SDK が同梱する agent 実行バイナリ（claude-agent-sdk-darwin-arm64 197MB + codex-darwin-arm64 188MB、2026-06-12 実測）。specrunner 本体は 1MB 未満であり、片方の provider しか使わないユーザーにももう片方のバイナリが無条件で入る構造が、install サイズにおける唯一の specrunner 側設計起因の重さになっている。

provider SDK は static import のため、package.json で optionalDependencies に移すだけでは未 install 環境で起動時にモジュール解決エラーになる。provider 解決は DispatchingAgentRunner が実行時に行っているため、解決後に dynamic import する構造に適合する。

## 現状コードの前提

- static import 箇所: `src/adapter/claude-code/agent-runner.ts:32` と `src/adapter/claude-code/query-one-shot.ts:17`（`@anthropic-ai/claude-agent-sdk`）、`src/adapter/codex/agent-runner.ts:19`（`@openai/codex-sdk`）
- `src/adapter/dispatching/agent-runner.ts:23-37` — `resolveProvider` で provider を実行時判定し、`provider === "openai"` → CodexAgentRunner、それ以外 → ClaudeCodeRunner に routing
- `package.json` — 4 依存すべて `dependencies`（非 optional）
- managed runtime の `@anthropic-ai/sdk`（6.4MB、`src/adapter/managed-agent/`）は対象外とする規模
- 配布は tsup の単一バンドル（`dist/specrunner.js`）。dynamic import が bundle にどう扱われるか（external 指定の要否）は tsup 設定（`tsup.config.ts`）の確認が必要

## 要件

1. provider SDK（claude-agent-sdk / codex-sdk）への static import を dynamic import に変換し、provider が実際に選択されたときのみロードする
2. 両 SDK を optionalDependencies へ移行する（片方のみ optional とする判断も design で可。判断理由を記録する）
3. 未 install の provider のモデルを指定した場合、起動クラッシュではなく「どの package を install すべきか」を案内する明確なエラーにする
4. 通常環境（両方 install 済み）の挙動は変えない

## スコープ外

- managed runtime の `@anthropic-ai/sdk` の扱い
- README のサイズ表記更新（取り込み後に別途）
- install 手順のドキュメント整備

## 受け入れ基準

- [ ] SDK モジュール欠如を模した環境（import 失敗のモック）で、provider 指定時に案内付きエラーになることをテストで固定する
- [ ] 両 SDK が存在する環境で既存テストが無変更で green であることを確認する
- [ ] bundle 後の dist で dynamic import が機能すること（external 設定の検証方法は design で決定）
- [ ] `typecheck && test` が green

## 関連

- **codex-adapter-parity の取り込み後に着手する**（同一ファイル `src/adapter/codex/agent-runner.ts` を編集するため）
- minimal-deps North Star（install してすぐ使える・軽さが最大の長所）の深化
