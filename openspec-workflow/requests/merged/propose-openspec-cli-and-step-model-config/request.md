# propose step の openspec CLI 対応 + step ごとの model / maxTurns 設定

## Meta

- **type**: spec-change
- **date**: 2026-05-06
- **author**: color4pen

## ワークフローオプション

- **enabled**:
  - test-case-generator
  - adr

## 背景

### propose が openspec CLI を使っていない

spec-runner の propose agent は `proposal.md / design.md / tasks.md` を直接書き、`specs/` ディレクトリ（delta spec）の生成を agent の判断に委ねている。openspec-workflow の propose は `openspec new change` → `openspec status --json` → `openspec instructions` の流れで openspec CLI がスキーマに基づいて必要な artifact を指示する仕組み。

結果として spec-runner の propose は delta spec を省略しがちで、PR #88 の dogfood で実際に delta spec が欠落した。

### model / maxTurns が全 step で共通のハードコード

現在 ClaudeCodeRunner は全 step で `model: step.agent.model`（全部 claude-sonnet-4-5）、`maxTurns: 30` を固定で渡している。step の性質（設計 vs 実装 vs レビュー）に応じて最適な model grade（Opus vs Sonnet）と turns 上限が異なる。

コミュニティのコンセンサス: 「Opus で計画し、Sonnet で実行する」（opusplan パターン）。

## 目的

1. propose step が openspec CLI（`openspec new change` / `openspec status` / `openspec instructions`）を使って artifact を生成するようにする
2. 各 step の `agent.model` を step の性質に応じた最適値に変更する
3. `maxTurns` を step 定義から取得して ClaudeCodeRunner に渡す

## 要件

### 1. propose step の openspec CLI 対応

1. propose agent の system prompt を修正し、以下のワークフローで artifact を生成させる:
   - `openspec new change "<slug>"` で change folder を scaffold
   - `openspec status --change "<slug>" --json` で必要な artifact を確認
   - `openspec instructions <artifact-id> --change "<slug>" --json` で各 artifact の生成指示を取得
   - artifact を生成して `openspec/changes/<slug>/` に配置
2. `specs/` ディレクトリの生成が openspec CLI のスキーマによって指示される場合、agent は必ず生成する（agent の判断で省略しない）
3. 既存の `buildInitialMessage` / `PROPOSE_SYSTEM_PROMPT` を更新する
4. `allowedTools` に openspec CLI の実行に必要な `Bash` を含める（既に含まれている）

### 2. step ごとの model 設定

5. 各 step の `agent.model` を以下に変更する:

| Step | Model | 根拠 |
|------|-------|------|
| propose | `claude-opus-4-6[1m]` | 設計判断。長文コンテキスト理解が必要 |
| spec-review | `claude-opus-4-6[1m]` | 仕様の穴を見抜く判断力 |
| spec-fixer | `claude-sonnet-4-6` | 機械的適用 |
| implementer | `claude-sonnet-4-6` | SWE-bench で Opus との差 1.2pt。context で補う |
| build-fixer | `claude-sonnet-4-6` | エラーメッセージ駆動 |
| code-review | `claude-opus-4-6[1m]` | subtle なバグ検出 |
| code-fixer | `claude-sonnet-4-6` | 指摘適用 |

6. `step-execution-architecture` spec に model 選定の根拠と許容値を追加する（delta spec）

### 3. step ごとの maxTurns 設定

7. `AgentStep` interface に `maxTurns?: number` を追加する
8. 各 step に適切な `maxTurns` を設定する:

| Step | maxTurns | 根拠 |
|------|----------|------|
| propose | 20 | change folder 生成 + commit + push |
| spec-review | 15 | 読み + verdict 書き出し |
| spec-fixer | 25 | findings 適用 + commit + push |
| implementer | 60 | 複数ファイル編集。最も消費する |
| build-fixer | 35 | 試行錯誤あり |
| code-review | 20 | 読み + verdict |
| code-fixer | 30 | findings 適用 + commit + push |

9. ClaudeCodeRunner が `step.maxTurns ?? 30` を SDK の `query()` に渡す（デフォルト 30 維持）
10. `step-execution-architecture` spec に maxTurns の設計を追加する（delta spec）

## 受け入れ基準

- [ ] propose step が `openspec new change` / `openspec status` / `openspec instructions` を使う system prompt になっている
- [ ] delta spec 生成が openspec CLI のスキーマ指示に従う（agent の判断で省略しない）
- [ ] 各 step の `agent.model` が上記テーブルの値になっている
- [ ] `AgentStep.maxTurns` が定義され、ClaudeCodeRunner が使用している
- [ ] `bun run typecheck && bun test` が green
- [ ] delta spec が存在し `openspec validate` が pass

## 補足

### 外部 SDK 制約（@anthropic-ai/claude-agent-sdk）

- `query()` の `options.model` は文字列で任意の model ID を受け付ける
- `[1m]` suffix で 1M context を有効化（Opus 4.6 + MAX plan で利用可能）
- `options.maxTurns` は数値。上限到達時は `subtype: "error_max_turns"` で停止
- デフォルトは無制限（明示的に設定しないと永久に回る）

### model 選定の根拠（コミュニティ調査）

- Opus 4.6: MRCR v2 78.3%、長文コンテキスト理解が強い。設計・レビューに最適
- Opus 4.7: SWE-bench 87.6% だが MRCR v2 が 32.2% に崩壊。コミュニティで批判多数
- Sonnet 4.6: SWE-bench 79.6%（Opus との差 1.2pt）。実装フェーズで十分
- opusplan パターン: Opus で計画、Sonnet で実行が 2026 年のコンセンサス

### 関連 issue

- propose delta spec 欠落: PR #88 dogfood で発覚
- Issue #81: StepContext 型分離（本 request の scope 外）
