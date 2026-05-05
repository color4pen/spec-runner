## Why

spec-runner は現在 Anthropic Managed Agents API のみをサポートし、`StepExecutor` が session lifecycle（createSession / sendUserMessage / pollUntilComplete / streamEvents / register_branch dispatch）に直接結合している。これは 2 つの問題を生む:

1. **コスト**: 1 PR あたり $3-5 の従量課金で、cache write が全体コストの ~30% を占める。個人利用の dogfooding では持続不能。
2. **結合**: `executor.ts` が session protocol に直接依存しているため、別 runtime（Claude Code SDK によるローカル実行）に差し替えられない。

Claude Code SDK (`@anthropic-ai/claude-code`) を local runtime として組み込めば、MAX プランの定額枠で実行できる。同一 pipeline を managed mode（cloud / 従量課金）と local mode（local / 定額）で切り替え可能にする。

## What Changes

- `src/core/port/agent-runner.ts` に **AgentRunner port** を新設し、`run(context): Promise<AgentRunResult>` の単一メソッドを定義する
- `StepExecutor` の agent step 経路から session lifecycle ロジック（~250 LOC）を切り出し、`AgentRunner` に委譲する。`StepExecutor` は `runner.run()` を呼んで結果を parse + state 更新するだけになる
- `src/adapter/anthropic/` を `src/adapter/managed-agent/` に rename し、`ManagedAgentRunner` として既存 SessionClient を内部利用する `AgentRunner` 実装を提供する
- **register_branch Custom Tool は managed-agent adapter 内のみに残す**（session protocol の一部であり core の concern ではない）。core/step から register_branch dispatch ロジックを撤去
- 新規 `src/adapter/claude-code/` 配下に `ClaudeCodeRunner` を実装し、`@anthropic-ai/claude-code` の `query()` を呼ぶ。worktree path を cwd として渡し、agent が直接 git 操作する
- **branch 名は CLI が `feat/<slug>` で決定論的に決め、prompt に注入する**。local mode では register_branch tool は不要（agent が直接 checkout / commit / push する）
- config schema に `runtime: "managed" | "local"`（default: `"managed"`）を追加
- `specrunner init --runtime local` は API 呼び出しゼロで config を書くだけ。`AgentSyncer` は `runtime === "managed"` の場合のみ実行
- prompts/ は runtime-neutral に保つ。runtime 固有の git 操作 instruction は adapter が `additionalInstructions` として inject する
- propose step の GitHub verification（verifyPath / verifyBranch）は AgentRunner adapter 内に吸収する。managed は GitHub API、local は fs.existsSync / `git branch --list`

## Capabilities

### New Capabilities

- `agent-runner-port`: AgentRunner port の interface 定義、AgentRunContext / AgentRunResult の型定義、StepExecutor との統合契約
- `managed-agent-runtime`: ManagedAgentRunner adapter（既存 session lifecycle を AgentRunner として packaging したもの）と register_branch の adapter-internal scope への移動
- `claude-code-runtime`: Claude Code SDK を利用した ClaudeCodeRunner adapter、cwd / additionalInstructions / 直接 git 操作モデル
- `runtime-selection`: config の runtime field、CLI による adapter 選択・注入、`specrunner init --runtime local` の API 呼び出し回避

### Modified Capabilities

- `step-execution-architecture`: agent step 経路の lifecycle 委譲先を AgentRunner port に変更（`StepExecutor` が `runner.run()` を呼ぶ形へ）。`step.kind === "agent"` のときの 1〜10 番ステップが AgentRunner 内部に移動する
- `module-boundary`: `src/adapter/anthropic/` → `src/adapter/managed-agent/` rename、`src/adapter/claude-code/` 新設、新 port `agent-runner.ts` の追加。core が `@anthropic-ai/claude-code` を直接 import しない invariant を追加
- `cli-config-store`: `runtime: "managed" | "local"` field の追加（default `"managed"`、未設定時の後方互換 migration を含む）
- `agent-syncer`: `runtime === "local"` の場合に `syncAll()` を skip する条件分岐の追加（CLI composition root 側で gating する）
- `branch-registration`: register_branch の存在条件を `runtime === "managed"` のみに限定。local mode では tool 自体が登録されない
- `register-branch-tool`: tool の所有層を core/step から adapter/managed-agent/tools/ に移動（module ownership の更新）

## Impact

- **コード**: `src/core/step/executor.ts`（~600 LOC → ~350 LOC）、`src/adapter/anthropic/` rename、`src/adapter/claude-code/` 新設、`src/core/port/agent-runner.ts` 新設、`src/cli/` の composition root で adapter 選択分岐
- **API / 動作変更**: managed mode では完全に regression なし（Phase 1 の受け入れ基準）。local mode は新 runtime
- **依存追加**: `@anthropic-ai/claude-code` を package.json に追加（local runtime 専用、managed mode では未読込でも動作する design）
- **テスト**: 既存 SessionClient ベースのテストはほぼ無変更（adapter 内部に閉じ込めるため）。新規に AgentRunner port の contract test と ClaudeCodeRunner の単体テスト
- **ドキュメント**: ADR で AgentRunner port の境界と register_branch の所有層変更を記録
- **後方互換性**: 既存 config（runtime field なし）は `runtime: "managed"` として扱う migration を ConfigStore に追加
