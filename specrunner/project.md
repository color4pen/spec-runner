# SpecRunner

request.md を投入すると PR が返る AI CI/CD ランナー（CLI ツール）。

## Stack

- **Runtime**: Bun (TypeScript)
- **Test**: vitest
- **Build**: tsc (型チェック + トランスパイル)
- **Dependencies**:
  - `@anthropic-ai/claude-agent-sdk` — Claude Agent SDK（local runtime の agent 実行）
  - `@anthropic-ai/sdk` — Anthropic API SDK（Managed Agents API 経由の agent 実行）

## Architecture

CLI-first の dual runtime アーキテクチャ。

- **Local runtime**: Claude Agent SDK 経由でローカルに agent セッションを実行
- **Managed runtime**: Anthropic Managed Agents API 経由でクラウド上の agent を実行
- **Pipeline**: 10 ステップの state-machine で request.md → PR を自動生成
  1. propose — ブランチ作成・仕様生成
  2. spec-review — 仕様レビュー
  3. spec-fixer — 仕様修正（spec-review が needs-fix の場合）
  4. test-case-gen — テストケース生成
  5. implementer — コード実装
  6. verification — ビルド・テスト検証
  7. build-fixer — ビルド修正（verification 失敗時）
  8. code-review — コードレビュー
  9. code-fixer — コード修正（code-review が needs-fix の場合）
  10. pr-create — GitHub PR 作成

### 設計パターン

- **Ports & Adapters**: core/port/ にインターフェース、adapter/ に実装を分離
- **遷移テーブル駆動**: pipeline の状態遷移をデータとして定義
- **Step as data / Executor as behavior**: ステップ定義（データ）と実行ロジック（振る舞い）を分離
- **CommandRunner Template Method**: CLI コマンドの共通実行フローをテンプレート化

### 状態管理

- ジョブ状態: `.specrunner/jobs/` に JSON で永続化（デフォルト。`config.jobs.location: "xdg"` 設定時は `~/.local/share/specrunner/jobs/`）
- ジョブ隔離: git worktree でジョブごとに独立した作業ディレクトリを確保

### 設定

- 設定ファイル: `~/.config/specrunner/config.json`（XDG_CONFIG_HOME 準拠）
- Step-config resolution chain（4 レベル）:
  1. `config.steps[stepName][field]` — ステップ単位のオーバーライド
  2. `config.steps.defaults[field]` — config レベルのデフォルト
  3. ステップ定義のハードコードデフォルト
  4. SDK デフォルト

## Directory Structure

```
src/
├── adapter/          # Ports & Adapters 実装
│   ├── managed-agent/  # Managed Agents API adapter
│   ├── claude-code/    # Local Claude Code adapter
│   └── github/         # GitHub API adapter
├── cli/              # CLI コマンドハンドラ
├── core/             # ビジネスロジック
│   ├── pipeline/       # State machine + 遷移テーブル
│   ├── step/           # Step 定義 + Executor
│   ├── command/        # 高レベルコマンド (run, resume, finish)
│   ├── runtime/        # RuntimeStrategy 抽象化
│   ├── port/           # Port インターフェース
│   ├── agent/          # Agent 定義レジストリ
│   ├── verification/   # ビルド検証
│   ├── finish/         # PR ファイナライズ
│   ├── pr-create/      # PR テンプレート
│   ├── resume/         # 中断再開
│   ├── tools/          # カスタムツール定義
│   ├── doctor/         # 環境診断
│   └── event/          # イベントバス
├── config/           # 設定解決 (step-config, schema)
├── state/            # ジョブ状態スキーマ
├── store/            # ジョブ状態永続化
├── auth/             # GitHub OAuth Device Flow
├── git/              # Git リモート解析
├── parser/           # request.md パーサー
├── prompts/          # ステップ別システムプロンプト
└── util/             # Atomic write, XDG パス
specrunner/
├── changes/          # Change proposals
└── specs/            # Specifications
docs/
└── adr/              # Architecture Decision Records
```
