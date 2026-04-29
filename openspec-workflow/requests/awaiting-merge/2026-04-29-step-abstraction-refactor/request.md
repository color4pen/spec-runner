# Step 抽象化 + Pipeline 状態機械 — Argo 準拠リアーキテクチャ Phase 1

## Meta

- **type**: refactoring
- **date**: 2026-04-29
- **author**: color4pen
- **depends-on**: openspec-workflow/requests/merged/2026-04-29-spec-fixer-iteration-loop

## ワークフローオプション

- **enabled**:
  - test-case-generator
  - adr
  - module-architect
  - security-reviewer

## 背景

直近 4 PR（#19 cli-core-pipeline、#22 spec-review-pipeline、#24 spec-fixer-iteration-loop、+ archives）で propose / spec-review / spec-fixer の 3 ステップが実装された。これにより以下の構造的問題が顕在化:

1. **Step 単位のコピペが 3 ファイルで増殖**: `src/core/steps/propose.ts`（386 行）、`spec-review.ts`（310 行）、`spec-fixer.ts`（185 行）。セッション生成・try/catch・`failJobState` + `appendHistory` + `err.state` 装着のパターンが各ファイル 45–55 行ずつ重複
2. **Verdict 分岐が `pipeline.ts` に inline**: spec-review iteration loop は `runLoopUntil` で抽象化できたが、step 間の verdict 分岐は依然として if 連鎖で表現
3. **Custom Tool spec と handler が分離管理**: `agent-definition.ts` が tool spec を作り、`tools/registry.ts` が handler を保持。両者の対応はグローバル registry 経由で暗黙
4. **AgentDefinition が単数前提だった構造を引きずっている**: spec-fixer 専用 Agent は追加できたが、step ごとに必要な capability が異なる現実への構造的対応が未着手
5. **学習層 / observability の plug-in 点が無い**: ADR-20260429-positioning D5 の「observation → instinct → rule の継承」を後付けする際の hook が存在しない

implementer / code-review を加える前にこれを解消する。3 step での痛みは管理可能だが、5 step に増えると手戻りコストが急増する。

設計は `ADR-20260429-step-and-agent-class-architecture` で D1〜D10 として確定済み。本 request は **D10 の手順 1〜4**（D8a + D8b、D1 + D2 + D9、D3、D7）を実装する。Agent 関連の D4〜D6 は config schema migration を含むため後続 request に分離する。

## 目的

spec-runner の core 層を `ADR-20260429-step-and-agent-class-architecture` の D1〜D3 + D7 + D8 + D9 に従って再構成する。**振る舞い不変**（既存 pipeline の入出力・stdout・状態ファイルフォーマット・エラーコードを維持）。

## 要件

### 必須実装範囲（D10 の手順 1〜4）

#### 手順 1: JobStateStore class + StepRun[] schema（D8a + D8b）

1. `src/state/store.ts` の関数群を `JobStateStore` class として再構成する
   - load / persist / appendHistory / appendStepRun を method として持つ
   - `atomic-write` を内部実装に隠蔽する
2. `JobState.steps` schema を `Record<StepName, StepRun[]>` に変更する
   - 既存の `Record<StepName, StepResult[]>`（PR #24 で導入）から `StepRun` interface への移行
   - StepRun は `attempt / sessionId / outcome / startedAt / endedAt` を持つ
   - 後方互換: 旧 schema の load 時に normalization する
3. JobStateStore は ADR-20260429-module-architecture-style の `store/` モジュールに配置する

#### 手順 2: Step interface + StepExecutor class + Tool spec/handler 同居（D1 + D2 + D9）

4. `Step` interface を定義する（`src/core/step/types.ts` 等）
   - `name: StepName` / `agent: AgentDefinition` / `toolHandlers?: Map<string, ToolHandler>`
   - `buildMessage(state, deps): string`
   - `resultFilePath(state): string`
   - `parseResult(content): StepOutcome`
5. `StepExecutor` class を実装する
   - I/O lifecycle（セッション生成・完了 polling・結果 fetch・parse・state 永続化・event emit）を集約
   - 既存 propose.ts / spec-review.ts / spec-fixer.ts の 45–55 行ずつのコピペ箇所を集約
6. propose / spec-review / spec-fixer を `Step` interface 実装に移植する
   - 各 step は `buildMessage` / `resultFilePath` / `parseResult` のみ持つ
   - 既存の `runProposeStep` / `runSpecReviewStep` / `runSpecFixerStep` は廃止
7. Custom Tool の spec と handler を Step に同居させる
   - 既存の global registry（`core/tools/registry.ts`）は廃止
   - register_branch tool は `ProposeStep.toolHandlers.get("register_branch")` で取得

#### 手順 3: Pipeline class + transition table（D3）

8. `Pipeline` class を実装する
   - `Map<StepName, Step>` と `Transition[]` を constructor で受け取る
   - `run(start, state, deps)` で state machine として実行
   - `maxIterations` を loop guard として持つ（spec-review ↔ spec-fixer の cycle 用）
9. 既存 `pipeline.ts:78-86` の inline if と `runLoopUntil` の組み合わせを transition table に置換する
10. Transition は `{ step, on: Verdict, to: StepName | "end" | "escalate" }` 形式

#### 手順 4: EventBus 予約席（D7）

11. `EventBus` class を最小実装する
    - `on(event, handler)` / `emit(event, payload)` のみ
    - subscriber は v1 まで空で良いが、interface だけ確立する
12. StepExecutor が `step:start` / `step:complete` / `step:error` / `verdict:parsed` を emit
13. Pipeline が `pipeline:start` / `pipeline:complete` / `pipeline:fail` を emit
14. CLI 層では subscribe しない（後続 request の学習層実装で使う）

### モジュール構造（D7 関連 + ADR-module-architecture-style 適用）

15. ディレクトリ構造を ADR-20260429-module-architecture-style D4 に従って再編する
    ```
    src/
    ├── core/
    │   ├── pipeline/              # Pipeline class + Transition table
    │   ├── step/                  # Step interface + StepExecutor + step 実装
    │   │   ├── propose.ts
    │   │   ├── spec-review.ts
    │   │   └── spec-fixer.ts
    │   ├── agent/                 # AgentDefinition (interface のみ。registry は後続 request)
    │   ├── event/                 # EventBus + DomainEvent 型
    │   └── port/                  # SessionClient / GitHubClient interface
    ├── adapter/
    │   ├── anthropic/             # SessionClient 実装
    │   └── github/                # GitHubClient 実装
    ├── store/                     # JobStateStore / ConfigStore
    └── cli/                       # composition root + argv parser
    ```
16. core が依存できるのは `store/`, `util/`, `core/port/` のみ。逆向きの依存を作らない
17. SDK 直接依存は `adapter/anthropic/` 内に閉じる。core 層から `@anthropic-ai/sdk` を import しない

### 振る舞い不変の確認

18. 全既存テスト（168 tests）が PASS することを必須要件とする
19. CLI の stdout 出力フォーマット（`[iter N/M]` 進捗、最終サマリ）を維持する
20. 状態ファイル（`~/.local/share/specrunner/jobs/<id>.json`）のフォーマットは旧 schema を読めること（normalization は手順 1 で実装）
21. エラーコード（`SESSION_TIMEOUT` / `SESSION_TERMINATED` / `BRANCH_NOT_REGISTERED` / `SPEC_REVIEW_RETRIES_EXHAUSTED` / `CONFIG_INCOMPLETE` 等）を維持する
22. 既存の Custom Tool 仕様（`register_branch` の input_schema）を維持する

## 受け入れ基準

- [ ] 全 168 既存テストが PASS する（振る舞い不変の確認）
- [ ] Step interface と StepExecutor class が実装されている
- [ ] propose / spec-review / spec-fixer が Step interface 実装として再構成されている
- [ ] 各 step ファイルが以前の 1/3 程度の LOC に縮小している
- [ ] Pipeline class + transition table で pipeline.ts の inline if が置換されている
- [ ] EventBus interface が確立し、step / pipeline lifecycle イベントが emit される
- [ ] JobStateStore class + StepRun[] schema が実装されている
- [ ] global tool registry（`core/tools/registry.ts`）が廃止され、Step が tool handler を所有している
- [ ] core 層が `@anthropic-ai/sdk` を直接 import しない（adapter/anthropic 経由のみ）
- [ ] ディレクトリ構造が ADR-20260429-module-architecture-style D4 に整合している
- [ ] CLI 動作の振る舞いが変わらない（stdout / 状態ファイル / エラーコード維持）

## 補足

### Managed Agents の制約（既知の前提）

- `SessionCreateParams` には `system` 上書きフィールドがない（per-session の system prompt 上書き不可）
- Agent の `system` / `tools` / `model` は Agent バージョンに固定される
- 同一 Agent を異なる role で再利用すると system prompt と user message が矛盾する（PR #22 で表面化、PR #24 で構造的に解消）
- Custom Tool は Agent レベルで定義されるため、role-specific に出し分けできない

これらは `Step.agent: AgentDefinition` フィールドで構造的に表現される。各 Step は自身の Agent 定義を所有し、AgentDefinition を共有しない。

### スコープに含めない（D10 の手順 5、後続 request）

- AgentDefinition / AgentRegistry / AgentSyncer 分離（D4 + D5）
- Config schema migration: `agents: Record<StepName, ...>` map への移行（D6）
- `specrunner init` の per-role agent 作成への変更
- 学習層実装（EventBus subscriber）
- e2e テストハーネス（`tests/e2e-pipeline.test.ts`）の整備
- Argo / Tekton / Temporal からの追加転用（D3 retry strategies / D1 typed I/O / D7 exit handlers の拡張）

これらは本 request 完了後、別 request として切り出す。

### 設計判断の参照先

- `ADR-20260429-step-and-agent-class-architecture` — D1〜D10 のクラス境界決定（**本 request は D1, D2, D3, D7, D8, D9 を実装**）
- `ADR-20260429-module-architecture-style` — Modular Monolith + Functional Core, Imperative Shell + Hexagonal-lite。`core/ adapter/ store/ port/` の境界
- `ADR-20260429-cicd-architecture-inspirations` — Argo / Tekton 等からの転用パターン。本 request では transition table の declarative 表現と EventBus 予約席のみ取り込む（retry strategies / typed I/O 等は後続）

### 振る舞い不変の確認方法

- 全既存テスト（168 tests）の PASS が第一の確認
- 状態ファイルの既存サンプルを load → save → diff で旧 format への透過性を確認
- CLI 動作のスナップショットテスト（stdout の主要行を pin する）

### リスク

- **リファクタ規模が大きい**: 既存 propose.ts / spec-review.ts / spec-fixer.ts の解体 + ディレクトリ再編で ~600–800 LOC 変更見込み。PR が大きくなる
- **既存テストの追従コスト**: state schema 変更と class 化により、テストの import 経路と mock 形式が変わる可能性
- **commit cohesion**: D8 → D1+D2+D9 → D3 → D7 の順で commit を分けると review しやすいが、最終的には全部入りの 1 PR
