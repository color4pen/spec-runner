# Phase 1: Managed Agents 上での OpenSpec 実行検証

## Meta

- **type**: new-feature
- **date**: 2026-04-16
- **author**: color4pen
- **depends-on**: なし

## 影響チェック

- **spec**: no — 新規プロジェクトのため既存仕様なし
- **security**: no — Phase 1 は認証なし。API キーは環境変数で管理（サーバーサイドのみ）
- **data-model**: no — Phase 1 では DB を使用しない
- **public-api**: no — Web アプリ内部の API Routes。外部公開 API ではない

## 背景

SpecRunner は OpenSpec ワークフローを Claude Managed Agents 上で実行する Web アプリケーション。Phase 1 では、Managed Agents 上で OpenSpec が正しく動作することを最小限の構成で検証する。

Phase 1 はローカル環境または限定環境で自分だけが使う PoC。認証・認可は Phase 2 以降で追加する。

## 目的

Managed Agents 上で OpenSpec ワークフローが実行できることを Web アプリとして検証する。

## 要件

### Web アプリ

1. **Next.js App Router で構築**: UI と API Routes を一体で開発
2. **シンプルな UI**: セッション作成、メッセージ送信、結果表示ができる画面

### Managed Agents 連携

3. **Agent 作成**: OpenSpec 用の Agent を作成できる
4. **Environment 作成**: OpenSpec CLI がインストールされた Environment を作成できる
5. **Session 作成**: Agent + Environment + GitHub リポジトリで Session を開始できる
6. **メッセージ送受信**: SSE ストリーミングで対話できる

### OpenSpec 実行

7. **CLI 実行**: Session 内で `openspec list` などのコマンドが実行できる
8. **ファイル操作**: マウントしたリポジトリに対してファイル読み書きができる

## 受け入れ基準

- [ ] Web アプリを起動して UI にアクセスできる
- [ ] UI から Session を作成できる
- [ ] メッセージを送信して Agent からの応答を受け取れる
- [ ] `openspec list` コマンドの実行結果が表示される
- [ ] リポジトリ内のファイルを読み書きできる

## 補足

### 技術スタック

- Node.js + Next.js (App Router) + TypeScript
- @anthropic-ai/sdk v0.89.0（Managed Agents API 対応）
- Tailwind CSS（UI）

### 環境変数

```
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...（リポジトリマウント用）
```

### Phase 1 のスコープ外

- 認証・認可（Phase 2 以降）
- マルチテナント（Phase 5）
- レビューエージェント（Phase 2）
- Agent Teams（Phase 3）
- Memory Store（Phase 4）

### 参考ドキュメント

- `docs/managed-agents/guide.md` — Managed Agents API リファレンス
- `docs/openspec-guide.md` — OpenSpec CLI リファレンス
- `docs/adr/ADR-20260416-tech-stack.md` — 技術スタック選定
