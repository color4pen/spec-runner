# Propose step の openspec CLI 対応 + step ごとの model / maxTurns 設定

**Date**: 2026-05-06
**Status**: proposed

## Context

spec-runner の propose agent は artifact（proposal.md, design.md, tasks.md, delta spec）を直接生成しており、openspec CLI（`openspec new change` / `openspec status` / `openspec instructions`）のスキーマ駆動ワークフローを使っていない。結果として delta spec の生成が agent の判断に委ねられ、PR #88 dogfood で実際に delta spec が欠落する failure mode が発覚した。

また全 step が `claude-sonnet-4-5` / `maxTurns: 30` でハードコードされており、step の性質（設計 vs 実装 vs レビュー）に応じた model grade と turn 上限の最適化ができていない。コミュニティのコンセンサスは「Opus で計画し、Sonnet で実行する」（opusplan パターン）。

## Decision

3 つの設計判断を一括で採用した。

**D1: propose system prompt を openspec CLI ワークフローに全面書き換え。** `PROPOSE_SYSTEM_PROMPT` に `openspec new change` → `openspec status --json` → `openspec instructions --json` → artifact 生成ループのフローを指示する。openspec CLI のスキーマが artifact を指示するため、agent の判断で delta spec を省略できなくなる。

**D2: opusplan パターンによる model 選定。** 設計/レビュー step（propose, spec-review, code-review）は `claude-opus-4-6[1m]`、実装/修正 step（spec-fixer, implementer, build-fixer, code-fixer）は `claude-sonnet-4-6` を使用する。

**D3: `AgentStep` interface に `maxTurns?: number` を追加。** `ClaudeCodeRunner` が `step.maxTurns ?? 30` で SDK の `query()` に渡す。各 step ファイルで宣言的に設定する（propose: 20, spec-review: 15, spec-fixer: 25, implementer: 60, build-fixer: 35, code-review: 20, code-fixer: 30）。

## Alternatives Considered

### Alternative 1: system prompt は変えず user message で openspec CLI 使用を指示

- **Pros**: 変更範囲が小さい
- **Cons**: system prompt と user message の責務が曖昧になる。agent の role と workflow を定義するのは system prompt の責務
- **Why not**: system prompt に集約するのが自然。openspec-workflow の openspec-propose スキルと同じフローを agent に実行させる

### Alternative 2: 全 step を Opus に統一

- **Pros**: 最高品質。model 選定の判断が不要
- **Cons**: コスト 5-10 倍増。実装/修正 step では ROI が低い（SWE-bench での差 1.2pt）
- **Why not**: Sonnet で十分な step にまで Opus を使う合理性がない

### Alternative 3: maxTurns を config ファイルで外部化

- **Pros**: runtime で調整可能。A/B テストしやすい
- **Cons**: 現段階では過剰。値が安定するまで定数で十分
- **Why not**: YAGNI。値が安定したら外部化を検討する

### Alternative 4: Opus 4.7 を採用

- **Pros**: SWE-bench 87.6%（最高スコア）
- **Cons**: MRCR v2 が 32.2% に崩壊。長文コンテキスト理解が致命的に劣化
- **Why not**: spec-runner は長文コンテキスト（spec + code + review findings）を正確に理解する能力が必須。Opus 4.6 の MRCR v2 78.3% が現時点で最適

## Consequences

### Positive

- delta spec 欠落の failure mode が構造的に解消される（openspec CLI のスキーマが指示するため省略不可）
- 設計/レビュー step で Opus の長文コンテキスト理解（MRCR v2 78.3%）を活用でき、subtle なバグや仕様の穴の検出精度が向上する
- step ごとの maxTurns により、暴走防止（implementer の 60 turns 上限）と無駄な turn 消費の抑制（spec-review の 15 turns）が両立する
- 各 step の model / maxTurns が宣言的に定義され、設定の見通しが良くなる

### Negative

- propose agent の system prompt が全面書き換えとなり、既存テストの assertion を全面更新する必要がある
- Opus 使用 step（propose, spec-review, code-review）のコストが増加する。ただし turn 数が少ない step に限定（20, 15, 20）しているためインパクトは限定的
- `openspec` CLI が worktree 環境に存在することが前提となる（`npx openspec` によるフォールバックあり）

### Risks

- **openspec CLI が未インストールの環境**: propose agent の Bash で `npx openspec` を使用するフォールバックあり。allowedTools に Bash は含まれている
- **maxTurns 上限到達**: SDK は `subtype: "error_max_turns"` で停止し、既存のエラーハンドリングで `completionReason: "error"` として捕捉される

### Known Design Debt

- **`StepDeps` の `undefined as any` パターン**: `ClaudeCodeRunner` の `buildMessage` / `resultFilePath` 呼び出しで `client: undefined as any`, `githubClient: undefined as any` を渡している。`maxTurns` の変更はこのパターンに依存しているわけではないが、同じコードパスを通る。将来 step の `buildMessage` が `client` や `githubClient` にアクセスすると runtime crash する。`LocalStepDeps` discriminated union の導入が必要（review-feedback-001 Finding #1, constraints.md に既知負債として記録済み）
- **`npx openspec` vs `node_modules/.bin/openspec` の暗黙的判断**: system prompt で "PATH に存在しない場合は `npx openspec` を使用" と指示しているが、デフォルトパスが明示的でない（review-feedback-001 Finding #2）
- **production コード内の change-slug 参照**: `types.ts` や各 step ファイルの JSDoc/コメントに `Design D3 (propose-openspec-cli-and-step-model-config)` という change-specific 参照がある。archive 後にリンクが stale になる（review-feedback-001 Finding #4, #5）
