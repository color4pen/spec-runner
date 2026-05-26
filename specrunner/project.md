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

- ジョブ状態: `.specrunner/jobs/` に JSON で永続化
- ジョブ隔離: git worktree でジョブごとに独立した作業ディレクトリを確保

### Lifecycle binding

spec-runner は pipeline / process lifecycle の明示的な binding を使い、Bun event loop の premature exit (silent exit) を防止する。
`KeepAlive` sentinel timer が pipeline 実行中は event loop を alive に保ち、pipeline 完了時（正常 / timeout / error の全 case）に解放する。
exit 時 invariant として `process.on('beforeExit')` が running 状態の job を検出し `awaiting-resume` に遷移する。
`SPECRUNNER_DEBUG=pipeline` env var で pipeline 境界の診断ログを有効化できる。

### 設定

#### Config ファイル（2 層）

| 層 | パス | 用途 |
|----|------|------|
| User global | `~/.config/specrunner/config.json`（XDG_CONFIG_HOME 準拠） | ユーザー全体の設定 |
| Project local | `<repo-root>/.specrunner/config.json` | リポジトリ単位の上書き（partial overlay） |

両方存在する場合は **deep merge** で project local が user global の値を上書きする。
不在 key は user global を継承するため、project local には差分のみ記述すればよい。

#### Step-config resolution chain（6 レベル）

1. `config.steps[stepName].byRequestType[requestType][field]` — request type 別 step 設定（最優先）
2. `config.steps[stepName][field]` — ステップ単位のオーバーライド
3. `config.steps.defaults.byRequestType[requestType][field]` — request type 別デフォルト
4. `config.steps.defaults[field]` — config レベルのデフォルト
5. ステップ定義のハードコードデフォルト
6. SDK デフォルト

#### byRequestType 設定例

```jsonc
// <repo-root>/.specrunner/config.json
{
  "version": 1,
  "steps": {
    "defaults": { "model": "claude-sonnet-4-6" },
    "design": {
      "model": "claude-sonnet-4-6",
      "byRequestType": {
        "spec-change": { "model": "claude-opus-4-6[1m]" },
        "new-feature": { "model": "claude-opus-4-6[1m]" }
      }
    },
    "code-review": {
      "model": "claude-sonnet-4-6",
      "byRequestType": {
        "spec-change": { "model": "claude-opus-4-6[1m]" }
      }
    }
  }
}
```

この例では `spec-change` / `new-feature` タイプの request で design と code-review に opus を使い、
`bug-fix` など他のタイプでは sonnet を使う。

> Note: **managed** runtime では `model` / `byRequestType.model` は無視される（managed agent は事前登録済の model を使う）。これらのフィールドは **local** runtime でのみ有効。

#### verification.commands 設定（language-agnostic verification）

`verification.commands` を指定すると、verification step で任意の command 列を実行できる（language-agnostic）。

**schema**: `(string | { name?: string; run: string })[]`

- `string`: `"ruff check"` → `sh -c "ruff check"` で実行（シンプル）
- `{ run: "cmd" }`: object 形式（name 省略）
- `{ name: "label", run: "cmd" }`: object 形式 + name ラベル（失敗時に `Step 'label' failed` と表示）

**実行モデル**:
- 各 command は `sh -c <command>` 経由で実行（POSIX shell、パイプ / リダイレクト / 環境変数展開 OK）
- 配列順に sequential 実行、fail-fast（1 件失敗で残り skip）
- exit code 0 → passed、非 0 → failed

**未定義時の fallback**: `verification.commands` が未定義の場合、package.json の `build / typecheck / test / lint / security` script を `bun run` で順次実行する（既存挙動、regression なし）

**設定例（project local config）**:

```jsonc
// <repo-root>/.specrunner/config.json
{
  "verification": {
    "commands": [
      "bun run build",
      "bun run typecheck",
      "bun run test",
      { "name": "lint", "run": "bun run lint" }
    ]
  }
}
```

他言語 project（Python / Go / Rust 等）でも同様に任意の command を指定できる:

```jsonc
{
  "verification": {
    "commands": [
      "ruff check",
      { "run": "pytest -v" },
      { "name": "type", "run": "mypy" }
    ]
  }
}
```

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
