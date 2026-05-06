## Context

spec-runner の propose agent は artifact を直接生成しており、openspec CLI（`openspec new change` / `openspec status` / `openspec instructions`）を使っていない。結果として delta spec が省略される failure mode がある（PR #88）。また全 step が `claude-sonnet-4-5` / `maxTurns: 30` 固定で、step 特性に応じた最適化がされていない。

現在の step 関連コード:
- `src/core/step/types.ts`: `AgentStep` interface に `maxTurns` フィールドなし
- `src/adapter/claude-code/agent-runner.ts`: `maxTurns: 30` ハードコード（L125）
- `src/prompts/propose-system.ts`: 直接書き方式の system prompt
- 各 step ファイル: 全て `claude-sonnet-4-5` を使用

## Goals / Non-Goals

**Goals:**

- propose agent が openspec CLI のスキーマ駆動で artifact を生成する（省略不可）
- step 特性に応じた model 選択（Opus で設計/レビュー、Sonnet で実装/修正）
- step ごとの maxTurns を宣言的に設定可能にする

**Non-Goals:**

- StepContext 型分離（Issue #81 — 別 request scope）
- model / maxTurns の動的切り替え（config ファイル等）。今回は定数値の変更のみ
- Opus 4.7 の採用（MRCR v2 が 32.2% に崩壊。見送り）

## Decisions

### D1: propose system prompt を openspec CLI ワークフローに全面書き換え

**採用案**: `PROPOSE_SYSTEM_PROMPT` を openspec CLI のコマンドフロー（`openspec new change` → `openspec status --json` → `openspec instructions --json` → artifact 生成ループ）を指示する内容に書き換える。

**却下案**: system prompt は変えず、user message 側で openspec CLI 使用を指示する → system prompt と user message の責務が曖昧になる。system prompt は agent の role と workflow を定義する場所であり、ここに書くのが自然。

**根拠**: openspec-workflow の openspec-propose スキル（本スキル）と同じフローを agent に実行させる。スキーマが artifact を指示するので、agent の判断で delta spec を省略できなくなる。

### D2: model 選定 — opusplan パターン

**採用案**: 設計/レビュー step は `claude-opus-4-6[1m]`、実装/修正 step は `claude-sonnet-4-6`。

| Step | Model | 根拠 |
|------|-------|------|
| propose | `claude-opus-4-6[1m]` | 設計判断 + 長文コンテキスト |
| spec-review | `claude-opus-4-6[1m]` | 仕様の穴を見抜く判断力 |
| spec-fixer | `claude-sonnet-4-6` | findings 適用は機械的 |
| implementer | `claude-sonnet-4-6` | SWE-bench 差 1.2pt、context で補う |
| build-fixer | `claude-sonnet-4-6` | エラーメッセージ駆動 |
| code-review | `claude-opus-4-6[1m]` | subtle バグ検出 |
| code-fixer | `claude-sonnet-4-6` | 指摘適用 |

**却下案**: 全 step を Opus に統一 → コスト 5-10 倍増。実装/修正 step では ROI が低い。

### D3: maxTurns を AgentStep interface に追加

**採用案**: `AgentStep` interface に `maxTurns?: number` optional フィールドを追加。`ClaudeCodeRunner` が `step.maxTurns ?? 30` でフォールバック。各 step ファイルで定数値として宣言。

**却下案**: config ファイルで外部化 → 今の段階では過剰。値が安定するまで定数で十分。

### D4: propose の初回メッセージからの slug/branch 伝達は維持

`buildInitialMessage` の signature は変更しない（slug / branch は引き続き executor から注入）。openspec CLI のワークフロー指示は system prompt に集約し、user message は request 内容 + slug/branch の伝達に専念する。

## Risks / Trade-offs

- **[Risk] openspec CLI がリポジトリに未インストール** → propose agent の Bash で `npx openspec` を使うか、事前に `openspec` コマンドの存在を前提とする。allowedTools に Bash は含まれているので実行可能。worktree 環境では `openspec` は `node_modules/.bin/` にある想定。
- **[Risk] Opus のコスト増** → 設計/レビュー 3 step のみ Opus。実装/修正 4 step は Sonnet 維持。propose + spec-review + code-review の 3 step が Opus で、これらは相対的に turn 数が少ない（20, 15, 20）。
- **[Risk] maxTurns 上限到達** → SDK は `subtype: "error_max_turns"` で停止。既存のエラーハンドリングで `completionReason: "error"` として捕捉される。implementer の 60 turns は実装タスクの最大値として十分。
- **[Trade-off] system prompt の大幅変更** → propose agent の行動が変わるため、既存テストの assertion を全面更新する必要がある。
