# ADR-20260505: AgentRunner Port and Claude Code SDK Local Runtime

**Date**: 2026-05-05
**Status**: accepted

## Context

`StepExecutor` (`src/core/step/executor.ts`, ~600 LOC) は Anthropic Managed Agents API の session lifecycle（`createSession` → `sendUserMessage` → SSE stream → `custom_tool` dispatch → polling → `getResultFile`）に直接結合している。`register_branch` Custom Tool dispatch、`verifyPath` / `verifyBranch` の GitHub API 検証も同じ executor 内に集約されている。これにより 2 つの問題が顕在化した。

1. **コスト**: per-PR $3-5 の従量課金、cache write が全体コストの ~30% を占有。個人 dogfooding では持続不能。
2. **結合**: `core` 層が SDK protocol に直接依存しており、ローカル実行 runtime（Claude Code SDK）に差し替えできない。`module-boundary` の「`core` は `@anthropic-ai/sdk` を直接 import しない」invariant が `if/else` 分岐を入れた瞬間に破綻する。

Claude Code SDK (`@anthropic-ai/claude-code`) は `query({ cwd, prompt })` 1 呼び出しで agent を起動でき、agent は cwd 内で直接 git 操作する。MAX プラン定額枠で動かせるため、同一 pipeline を managed mode（cloud / 従量課金）と local mode（ローカル / 定額）で切り替えたい。

## Decision

`StepExecutor` から agent step の lifecycle 全体（session 通信・結果取得・register_branch dispatch・verifyPath / verifyBranch）を **AgentRunner port** 1 つに集約し、`ManagedAgentRunner` と `ClaudeCodeRunner` の 2 adapter で切替可能にする。

### Key sub-decisions

- **D1**: `AgentRunner` は単一メソッド `run(context: AgentRunContext): Promise<AgentRunResult>`。`StepExecutor` の dispatch は `await runner.run(ctx)` 1 行に縮約する。
- **D2**: `AgentRunResult` が `resultContent: string | null` を持ち、adapter が runtime 固有手段（managed: GitHub API、local: `fs.readFile`）で取得する。`ResultReader` 別 port は切らない。
- **D3**: `register_branch` Custom Tool を `src/core/tools/` から `src/adapter/managed-agent/tools/` へ移管。`core/step` は tool を知らない。tool definition は adapter が `agent.role === "propose"` を見て注入する。
- **D4**: branch 名は CLI が `feat/<slug>` で決定論的に決め、prompt に instruction として注入する。agent は branch を生成しない。`register_branch` は managed mode の ack 用途に格下げ、CLI 値が canonical。
- **D5**: `verifyPath` / `verifyBranch` を AgentRunner adapter 内に移す。managed: GitHub API、local: `fs.existsSync` / `git branch --list`。
- **D6**: `src/adapter/anthropic/` を `src/adapter/managed-agent/` に rename（runtime model 名で統一、SDK vendor 名から脱却）。
- **D7**: config schema に `runtime: "managed" | "local"`（default `"managed"`）を追加。未設定の既存 config は load 時に `"managed"` へ migrate（idempotent）。
- **D8**: CLI composition root が `config.runtime` を見て `ManagedAgentRunner` または `ClaudeCodeRunner` を `StepExecutor` に注入する。executor は runtime を知らない。
- **D9**: `prompts/` は runtime-neutral。runtime 固有の git 操作 instruction は adapter が `additionalInstructions` として prompt に append する。
- **D10**: 4 Phase（port 抽出 → managed adapter 完成 → CLI 統合 → propose local 対応）に分割。Phase 1 完了時点で managed mode 完全互換の中間状態を作り、revert 可能性を確保。spec delta は 1 change にまとめる。

## Alternatives Considered

### Alternative 1: AgentRunner を multi-method（`createSession` / `sendMessage` / `pollComplete` / `getResult`）に分割

- **Pros**: managed adapter には自然に hooks がはまる
- **Cons**: local adapter では `query()` がすべてを同期的に完結するため、`createSession` / `sendMessage` / `pollComplete` が空 method の羅列になる。Liskov 違反気味
- **Why not**: 2 runtime 間で method 構造の対称性が取れない。inversion of control が逆に複雑化。`StepExecutor` 側にも runtime ごとの呼び出し順違いが漏れる

### Alternative 2: `StepExecutor` 自体を runtime 別に 2 つ実装

- **Pros**: runtime 分岐が完全に消える。各 executor が単純化
- **Cons**: `StepExecutor` は `kind: "agent" | "cli"` の両 step を扱うため、CliStep（VerificationStep / PrCreateStep）の経路が二重実装になる。共通テスト資産も二重化
- **Why not**: CliStep は SDK 非依存で本来共有可能。ここを二重化するのはコスト過大

### Alternative 3: `core` に runtime 分岐を `if/else` で残す（adapter port を切らない）

- **Pros**: 工数最小
- **Cons**: `core` が `@anthropic-ai/sdk` と `@anthropic-ai/claude-code` の両方を import する。`module-boundary` invariant 破壊
- **Why not**: hexagonal-lite 原則の根幹を崩す。将来 3 つ目の runtime（例: local Ollama）を足したくなった瞬間に再設計

### Alternative 4: `register_branch` を `core` に残し `runtime === "local"` のときだけ tool 登録を skip

- **Pros**: 既存 spec への変更が小さい
- **Cons**: `core` が runtime 概念を知ることになり、`module-boundary` 違反気味
- **Why not**: Custom Tool は Managed Agents の SSE protocol（`agent.custom_tool_use` event）に固有概念。local runtime の存在を core に漏らすべきでない

### Alternative 5: ResultReader を別 port として切り出す

- **Pros**: 単一責任の徹底
- **Cons**: `StepExecutor` が AgentRunner と ResultReader を呼び分ける必要があり、結局 runtime 分岐が両方に漏れる
- **Why not**: result の取得手段（GitHub fetch vs. local fs read）は session protocol と密結合しており、AgentRunner 内に閉じ込めるのが自然。将来必要になれば adapter 内 helper として再分離可能

## Consequences

### Positive

- `StepExecutor` が ~600 LOC → ~350 LOC に削減され、agent step lifecycle ロジックを含まない（`runner.run(ctx)` を呼んで結果を parse + state 更新するだけ）
- `core` 層が `@anthropic-ai/sdk` / `@anthropic-ai/claude-code` のどちらにも import 依存しない（`module-boundary` invariant 維持）
- managed / local 両 adapter が完全独立（相互 import なし）。3 つ目の runtime を追加する際も既存 adapter に手を入れない
- local mode で per-PR コストが $3-5 → $0（MAX プラン定額枠内）に削減見込み
- `specrunner init --runtime local` が API 呼び出しゼロで完了し、API key 不在でも起動可能
- branch 名が CLI canonical となり、`register_branch` で agent からの値を信用する曖昧さ（PR #42 slug single-source-of-truth の延長）が解消
- Phase 分割により Phase 1 完了時点で main マージ可能な中間状態が作れる（revert 容易）

### Negative

- AgentRunner port の責務が広い（session 通信・結果取得・branch / path 検証まで内包）。将来 lifecycle の一部だけ replace したい要求が出たら sub-port 分解が必要
- `branch-registration` spec の「last-write-wins で agent からの値を採用する」挙動を「CLI 値 canonical、agent 値は ignored / logged」に弱める変更を含む。MODIFIED Requirement として明記が必要
- `register_branch` の所有層が `core` から `adapter/managed-agent/tools/` に下る。`step-execution-architecture` spec の Scenario「register_branch handler is owned by ProposeStep」が MODIFIED 対象（RENAMED 併記）
- `package.json` に `@anthropic-ai/claude-code` 依存が増える（local runtime 専用、managed mode では未読込でも動作する設計）
- 4 spec の MODIFIED + 4 新 capability の delta + adapter rename の git mv を 1 change で扱うため、レビュー負荷は中程度

### Risks

- **Claude Code SDK の API 安定性**: `query()` signature や event model が想定と異なる可能性。Phase 2 着手前に verify-don't-trust 原則で SDK 仕様を実装前調査する。tasks.md 2.2 で SDK 調査 task を Phase 2 着手前に強制（partial mitigation）
- **既存 managed mode テストの regression**: AgentRunner port 経由になることで session lifecycle テストがブレイクする可能性。Phase 1 完了時点で `bun run typecheck && bun test` 全 green と既存 dogfood の regression なしを必須 gate に設定
- **runtime 切替時の API key 不在経路の漏れ**: `runtime: "local"` で `getAgentId(config, role)` 系経路に誤って入ると undefined エラーで止まる。CLI composition root で runtime に応じた gating を集中させ、`getAgentId` を呼ぶ全箇所が `runtime === "managed"` 限定の invariant を維持
- **CLI 主導 branch と agent 実態の乖離**: agent が指示と異なる branch を作るリスク。adapter 側で agent 完了後に `git rev-parse --abbrev-ref HEAD`（local）/ GitHub API branch existence（managed）で実態検証し、期待 branch と乖離していれば error / escalation
- **ConfigStore 0600 permission invariant の維持**: `runtime: "local"` で `apiKey` を空のまま許容しても、同ファイルに `github.accessToken` が残るため 0600 は維持必須。spec の Requirement 末尾に「runtime 切替に関わらず 0600 invariant は維持される」を追記する想定（Iter 2 LOW finding #9）

### Known Design Debt

spec-review iteration 2 で指摘された MEDIUM / LOW 12 件のうち、本 change のスコープ外として実装フェーズ後の小規模 spec-change で対応する項目を以下に列挙する。本 ADR では明示せず、それぞれが構造的な負債として識別されていることを記録する。

- **D-1 (MEDIUM completeness)**: `claude-code-runtime` spec の `requiresCommit` guard Scenario が ProposeStep ベースに偏っている。`step.requiresCommit === true` となる他 step（implementer / build-fixer / code-fixer）にも同 guard が適用される旨の Scenario が無い。実装段階で test-cases.md の must シナリオで補強する想定
- **D-2 (MEDIUM consistency)**: 「CLI 主導 branch が canonical」Requirement が `managed-agent-runtime` と `branch-registration` の 2 capability で重複所有されている。片方を変更したときに drift する構造が残る。実装後に `branch-registration` を authoritative にし、`managed-agent-runtime` 側を参照のみへ圧縮する spec-change を予定
- **D-3 (MEDIUM maintainability)**: `AgentRunContext` の `state: JobState` と `branch: string` の優先関係（`ctx.branch` が canonical で adapter は `ctx.state.branch` を読まない）が spec で明文化されていない。test-cases.md の must シナリオで実害を防ぐ想定だが、spec の field 説明に SHALL 句を追記する debt として残す
- **D-4 (MEDIUM feasibility)**: `runtime === "local"` 時の `SessionClient` 扱いが capability 間で非対称（`runtime-selection` は「生成しない」、`agent-syncer` は「コンストラクタ自体は呼ばれてもよい」）。実装段階で DI 構造を見て揃える
- **D-5 (LOW feasibility)**: `claude-code-runtime` spec が `query({ cwd, prompt, additionalInstructions, ...sdkOptions })` の引数 shape を断定している。SDK 型定義に従う形へ wording を緩める必要がある
- **D-6 (LOW security)**: `runtime` 切替後も ConfigStore の `0600` permission invariant が維持される旨が `cli-config-store` delta に明示されていない。Requirement 末尾への追記が debt として残る

## Phase Plan

### Phase 1: AgentRunner port 抽出（リファクタ・動作変更なし）

1. `src/core/port/agent-runner.ts` interface 定義
2. `src/adapter/anthropic/` → `src/adapter/managed-agent/` rename（git mv 履歴維持）
3. `executor.ts` から session lifecycle ロジックを `ManagedAgentRunner` に移動
4. `register_branch` を `src/core/tools/` → `src/adapter/managed-agent/tools/` 移動
5. CLI composition root で `ManagedAgentRunner` 注入
6. **Gate**: `bun run typecheck && bun test` 全 green、既存 dogfood で regression なし

### Phase 2: Claude Code SDK adapter 実装

7. `package.json` に `@anthropic-ai/claude-code` 追加
8. `src/adapter/claude-code/agent-runner.ts` 実装
9. polling-style step（spec-review 等）の単体テスト
10. **Gate**: `ClaudeCodeRunner` 単体テスト green

### Phase 3: config + CLI 統合

11. `cli-config-store` schema に `runtime` 追加
12. ConfigStore migration ロジック追加
13. CLI composition root で runtime → adapter 分岐
14. `specrunner init --runtime local` 経路追加
15. **Gate**: `specrunner init --runtime local` が API 呼び出しゼロで完了

### Phase 4: propose step の local 対応

16. ProposeStep の buildMessage を branch INPUT 対応に更新
17. `ClaudeCodeRunner` の `additionalInstructions`（git checkout / commit / push）追加
18. local mode で full pipeline 実行確認
19. **Gate**: local mode で propose → implementer → verification → code-review → pr-create が完走

### Rollback strategy

- Phase 1 PR: revert で元の `executor.ts` + `adapter/anthropic/` に戻る
- Phase 2-4: `runtime: "managed"` を default にしているため、新規 config を作らない既存ユーザは無影響。問題が起きても `runtime: "managed"` で回避可能

## References

- Request: `openspec-workflow/requests/active/add-local-runtime-agentrunner-port/request.md`
- Change proposal: `openspec/changes/add-local-runtime-agentrunner-port/proposal.md`
- Design doc: `openspec/changes/add-local-runtime-agentrunner-port/design.md`
- Spec review (iter 2 approved, 7.90 / 10): `openspec-workflow/requests/active/add-local-runtime-agentrunner-port/spec-review-result-002.md`
- Related: ADR-20260429-module-architecture-style.md（hexagonal-lite + module-boundary）
- Related: ADR-20260430-implementer-build-fixer-separation.md（Agent 分離方針）
- Related: PR #42（slug single-source-of-truth、本 change の D4 の延長元）
