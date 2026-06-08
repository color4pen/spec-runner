# Tasks: adapter baseBranch fallback sourced from request.md

## T-01: `AgentRunInput` に `requestBaseBranch?` を追加する

- [x] `src/core/port/agent-runner.ts` の `AgentRunInput` インターフェースに optional フィールド `requestBaseBranch?: string` を追加する（`requestAdr?` の直後に配置）
- [x] JSDoc を付ける: `ParsedRequest.baseBranch` から伝搬され、adapter が StepContext を構築するために使う。未指定時は `"main"` に fallback（後方互換）する旨を記載する

**Acceptance Criteria**:
- `AgentRunInput` が `requestBaseBranch?: string` を持つ
- `requestAdr?` の記述スタイル（doc コメント）と一貫している
- `bun run typecheck` が green

## T-02: `StepExecutor` が `requestBaseBranch` を `deps.request.baseBranch` で埋める

- [x] `src/core/step/executor.ts` の `runAgentStep` 内、`ctx.input` を組み立てる箇所（`requestAdr: deps.request.adr` の直下）に `requestBaseBranch: deps.request.baseBranch` を追加する

**Acceptance Criteria**:
- `AgentRunContext.input.requestBaseBranch` に `deps.request.baseBranch` が設定される
- `requestContent` / `requestAdr` と同じ `input` オブジェクト内に配置されている
- `bun run typecheck` が green

## T-03: 3 つの adapter が `requestBaseBranch ?? "main"` で StepContext を構築する

- [x] `src/adapter/claude-code/agent-runner.ts:151` の `baseBranch: "main"` を `baseBranch: ctx.input.requestBaseBranch ?? "main"` に変更する
- [x] `src/adapter/codex/agent-runner.ts:128` の `baseBranch: "main"` を `baseBranch: ctx.input.requestBaseBranch ?? "main"` に変更する
- [x] `src/adapter/managed-agent/agent-runner.ts:542` の `baseBranch: "main"` を `baseBranch: ctx.input.requestBaseBranch ?? "main"` に変更する

**Acceptance Criteria**:
- 3 adapter とも `ctx.input.requestBaseBranch ?? "main"` を使って `StepContext.request.baseBranch` を設定する
- 他の `StepContext` フィールド（`type` / `title` / `slug` / `content` / `adr`）は変更しない
- ハードコードされた `baseBranch: "main"` がこの 3 ファイルに残っていない
- `bun run typecheck` が green

## T-04: 3 つの adapter に伝搬と fallback のテストを追加する

- [x] claude-code: `tests/unit/adapter/claude-code/agent-runner.test.ts` に、`input.requestBaseBranch: "develop"` 供給時に `buildMessage` が受け取る StepContext（`buildMessage.mock.calls[0][1]`）の `request.baseBranch` が `"develop"` であることを検証するケースを追加する
- [x] claude-code: 同テストに、`requestBaseBranch` 省略時に `request.baseBranch` が `"main"` であることを検証するケースを追加する
- [x] codex: `tests/adapter/codex/agent-runner.test.ts` に、`develop` 伝搬と省略時 `main` fallback の 2 ケースを追加する（既存の enrichContext テストと同じ `buildMessage = vi.fn()` パターンを踏襲）
- [x] managed-agent: `tests/unit/adapter/managed-agent/agent-runner.test.ts` に、`develop` 伝搬と省略時 `main` fallback の 2 ケースを追加する

**Acceptance Criteria**:
- 各 adapter について「`base-branch: develop` → `"develop"` 伝搬」「未供給 → `"main"` fallback」の両方が検証される
- 既存テストの StepContext 捕捉パターン（`buildMessage` を `vi.fn()` 化し第 2 引数を inspect）を再利用し、新しいテスト機構を導入しない
- `bun run test` が green

## T-05: ドキュメント DTO 記述を更新する

- [x] `architecture/components.md` の主要 DTO 記述 `input: { requestContent; requestAdr?; dynamicContext?; projectContext? }` に `requestBaseBranch?` を追加し、実装の `AgentRunInput` と一致させる

**Acceptance Criteria**:
- ドキュメント上の `AgentRunInput` 形状が実装と一致する
- 当該行以外の編集を行わない

## T-06: 検証ゲートを通す

- [x] `bun run typecheck` が green
- [x] `bun run test` が green
- [x] `bun run lint` が green

**Acceptance Criteria**:
- typecheck / test / lint がすべて green
- 受け入れ基準（3 adapter が request の base-branch を使用 / `develop` 伝搬テスト / 旧 state での `main` fallback）を満たす
