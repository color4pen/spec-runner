## Context

spec-runner CLI の core layer は PR #19 / #22 / #24 を経て propose / spec-review / spec-fixer の 3 step を持つ pipeline に成長した。この成長過程で次のような構造的負債が累積した:

- **コピペ重複**: 各 step（`src/core/steps/*.ts` 計 881 行）が「セッション生成 → polling → 結果 fetch → parse → `failJobState` + `appendHistory` + `err.state` 装着」を 45–55 行ずつ重複実装している
- **Verdict 分岐の inline 表現**: `pipeline.ts:78-86` で if 連鎖 + `runLoopUntil` の組み合わせ。step を 1 つ追加するごとに pipeline.ts の改修が必要
- **Custom Tool の分離管理**: `agent-definition.ts` が tool spec、`tools/registry.ts` が handler を持つ。両者の対応はグローバル名前空間に依存
- **学習層の plug-in 点不在**: ADR-20260429-positioning D5 の「observation → instinct → rule」を後付けする hook が存在しない

設計上の解は `ADR-20260429-step-and-agent-class-architecture` で D1〜D10 として確定しており、本 change はその **D10 手順 1〜4**（D8a/b → D1+D2+D9 → D3 → D7）を実装する。

**現状の制約**:
- Managed Agents SDK: `SessionCreateParams` に system 上書きフィールドがない。Agent の `system` / `tools` / `model` は Agent バージョンに固定される（PR #22 / #24 で表面化済み）
- 現在 passing の 161 テスト（unit + integration）を bit-for-bit 維持する義務（refactoring の定義による）。`tests/cli.test.ts` は vitest API 非互換による既存 1 fail + 1 error があり本 change の scope 外
- Worktree session: 必ず該当 worktree (`~/Documents/GitHub/spec-runner-wt-2026-04-29-step-abstraction-refactor`) で作業する

## Goals / Non-Goals

**Goals:**
- propose / spec-review / spec-fixer の重複を `Step` interface + `StepExecutor` class で集約し、各 step ファイルを 1/3 LOC に縮小
- `Pipeline` class + 宣言的 `Transition[]` で `pipeline.ts` の inline if 連鎖を置換
- `EventBus` の最小実装で v2 学習層の予約席を確保（subscriber 0 で interface だけ確立）
- `JobStateStore` class + `StepRun[]` schema に統一、旧 schema の後方互換 load
- ADR-20260429-module-architecture-style D4 のディレクトリ境界に整列
- `core` 層から `@anthropic-ai/sdk` 直 import を排除（`adapter/anthropic/` 経由のみ）

**Non-Goals:**
- AgentDefinition / AgentRegistry / AgentSyncer の分離（D4 + D5 = 後続 request）
- Config schema の `agents: Record<StepName, AgentDefinition>` map への移行（D6）
- `specrunner init` の per-role agent 作成への変更
- 学習層実装（EventBus subscriber 実装）
- e2e ハーネス整備（`tests/e2e-pipeline.test.ts`）
- Argo / Tekton 由来の retry strategies / typed I/O / exit handlers
- Pipeline の振る舞い変更（ステップの追加・削除・順序変更）

## Decisions

### D1. JobStateStore class with StepRun[] migration

**Decision**: `src/state/store.ts` の関数群を `JobStateStore` class（`src/store/job-state-store.ts` に配置）に再構成する。`JobState.steps` schema を `Record<StepName, StepRun[]>` に変更し、旧 schema（`Record<StepName, StepResult[]>` および更に古い単数 `StepResult`）の load 時 normalization で後方互換を維持。

**Rationale**:
- class 化により `atomic-write` を内部実装詳細として隠蔽でき、call site の知識負担が下がる
- `StepRun` interface（`attempt / sessionId / outcome / startedAt / endedAt`）は将来の retry / event-sourcing と整合
- ADR-20260429-module-architecture-style D4 で `store/` 境界が定義されているため移動は必然

**Alternatives considered**:
- 関数群のまま継続: コピペ重複が解消しない、StepRun への移行と同時にやらないと 2 度手間
- DB 化（SQLite 等）: scope outside、Phase 1 では JSON ファイルで十分
- StepRun への変更を後回し: schema migration を 2 回踏むことになる

**Backward compat strategy**:
```ts
// load() で旧 schema を検知 → normalize
if (Array.isArray(state.steps?.[name])) {
  // PR #24 後の StepResult[] → StepRun[]
} else if (state.steps?.[name] && !Array.isArray(state.steps[name])) {
  // PR #24 前の単数 StepResult → [StepRun]
}
```

### D2. Step interface as plain TypeScript interface (not abstract class)

**Decision**: `Step` を class ではなく interface として定義する。各 step（propose / spec-review / spec-fixer）は plain object literal もしくは小さい module で実装する。

```ts
interface Step {
  name: StepName;
  agent: AgentDefinition;
  toolHandlers?: Map<string, ToolHandler>;
  buildMessage(state: JobState, deps: StepDeps): string;
  resultFilePath(state: JobState): string;
  parseResult(content: string): StepOutcome;
}
```

**Rationale**:
- 各 step は state を持たない関数の集合なので class の inheritance は overkill
- interface は test 時に partial mock を作りやすい
- `StepExecutor` が executor 側の状態（lifecycle）を持つので、Step は pure 構造体に徹する
- ADR-20260429-step-and-agent-class-architecture D2 で「StepExecutor が executor、Step は declaration」という分離が定義されている

**Alternatives considered**:
- abstract class Step: 各 step が constructor を持つ必要が出る、testability が落ちる
- 関数のみ（`type Step = (state) => Outcome`）: tool handler や agent definition の同居が表現できない

### D3. StepExecutor class with EventBus injection

**Decision**: `StepExecutor` を class として実装し、`SessionClient` / `JobStateStore` / `EventBus` を constructor 注入で受け取る。`execute(step, state)` method が I/O lifecycle 全体を回す。

**Rationale**:
- 既存 propose.ts / spec-review.ts / spec-fixer.ts の 45–55 行コピペを 1 箇所に集約できる
- Constructor 注入により unit test で SessionClient を mock 可能
- EventBus 注入により step:start / step:complete / step:error / verdict:parsed の emit が単一実装で済む

**Lifecycle**:
1. `events.emit("step:start", { step: step.name, state })`
2. SessionClient で session 生成
3. `step.buildMessage(state, deps)` で prompt 構築 → 送信
4. completion polling（既存 `runLoopUntil` ロジックを流用）
5. `step.resultFilePath(state)` で結果取得
6. `step.parseResult(content)` で `StepOutcome` 化
7. `events.emit("verdict:parsed", { step, outcome })`
8. `store.appendStepRun(state, step.name, outcome)`
9. `events.emit("step:complete", { step, outcome })` または `step:error`
10. error 時は `failJobState` + `err.state` 装着の既存契約を維持

### D4. Custom Tool co-location with Step

**Decision**: Custom Tool（現状は `register_branch` のみ）の spec と handler を Step 実装に同居させる。`Step.toolHandlers?: Map<string, ToolHandler>` で表現し、グローバル registry（`src/core/tools/registry.ts`）を完全廃止する。

**Rationale**:
- ADR D9: 「tool は step の従属物」。global registry は暗黙の結合点で、step を超えて handler が共有される錯覚を生む
- propose の `register_branch` は ProposeStep でのみ意味を持つ。spec-review / spec-fixer では使えない（Custom Tool は Agent 単位で定義され、現状 Agent も per-step）
- StepExecutor は `step.toolHandlers` を SessionClient に渡すだけで足りる

**Alternatives considered**:
- グローバル registry を残す: 暗黙の結合点が残る、step 追加時の見落としリスク
- Tool を別 layer に分離（`src/core/tool/`）: 過剰分割、step との 1:1 関係を表現しにくい

### D5. Pipeline class with declarative Transition table

**Decision**: `Pipeline` class が `Map<StepName, Step>` と `Transition[]` を constructor で受け取る。`run(start, state, deps)` が state machine として step を駆動する。

```ts
type Transition = {
  step: StepName;
  on: Verdict;          // "approved" | "needs-fix" | "escalation"
  to: StepName | "end" | "escalate";
};

const transitions: Transition[] = [
  { step: "propose",     on: "approved",   to: "spec-review" },
  { step: "spec-review", on: "approved",   to: "end" },
  { step: "spec-review", on: "needs-fix",  to: "spec-fixer" },
  { step: "spec-fixer",  on: "approved",   to: "spec-review" },
  { step: "spec-review", on: "escalation", to: "escalate" },
];
```

**Rationale**:
- 宣言的 transition は ADR-20260429-cicd-architecture-inspirations の Argo Workflows DAG の縮約系
- 新 step 追加時に transition 行を増やすだけで pipeline.ts の改修が不要
- `maxIterations` で spec-review ↔ spec-fixer の cycle を loop guard で防御
- 既存 `runLoopUntil` の責務は `maxIterations` チェックと `Pipeline.step()` の繰り返し呼び出しに分解される

**Alternatives considered**:
- if 連鎖を残す: step 追加時のコスト線形、3 step なら許容範囲だが 5 step で破綻
- Full DAG executor (Tekton 模倣): scope outside、現時点では transition table で十分
- イベント駆動（observer pattern のみで遷移）: 順序が暗黙になる、debug 困難

### D6. EventBus minimal class (reservation seat)

**Decision**: `EventBus` を最小 class として実装する（`on(event, handler)` / `emit(event, payload)` のみ）。v1 では subscriber を持たないが、StepExecutor / Pipeline は emit する責務を負う。

```ts
class EventBus {
  private handlers = new Map<DomainEvent, Set<Handler>>();
  on<E extends DomainEvent>(event: E, handler: (payload: Payload<E>) => void): void
  emit<E extends DomainEvent>(event: E, payload: Payload<E>): void
}

type DomainEvent =
  | "pipeline:start" | "pipeline:complete" | "pipeline:fail"
  | "step:start" | "step:complete" | "step:error"
  | "verdict:parsed";
```

**Rationale**:
- ADR D7: 学習層 / observability の plug-in 点を**最初から**確保することで、後付け改修の混乱を防ぐ
- v1 で subscriber を 0 にすることで本 change の scope を最小化（学習層は別 request）
- Synchronous emit で十分（async/await は scope outside、subscriber 実装時に検討）

**Alternatives considered**:
- EventBus を作らず後付け: ADR-20260429-positioning が学習層を schedule に乗せている。後付けすると StepExecutor / Pipeline 全部に手が入る
- Node EventEmitter を使う: 型推論が弱い、abstraction layer として薄すぎる
- RxJS Subject 等: 過剰、依存追加もコスト

### D7. Module structure aligned with ADR-20260429-module-architecture-style D4

**Decision**: 以下のディレクトリ構造に再編する:

```
src/
├── core/
│   ├── pipeline/      # Pipeline class + Transition table + types
│   ├── step/          # Step interface + StepExecutor + step impls (propose/spec-review/spec-fixer) + tool 同居
│   ├── agent/         # AgentDefinition interface のみ（registry は後続 request）
│   ├── event/         # EventBus + DomainEvent 型
│   └── port/          # SessionClient / GitHubClient interface
├── adapter/
│   ├── anthropic/     # SessionClient 実装（@anthropic-ai/sdk import 唯一の場所）
│   └── github/        # GitHubClient 実装
├── store/             # JobStateStore + ConfigStore
└── cli/               # composition root + argv parser
```

**Rationale**:
- Modular Monolith + Functional Core, Imperative Shell + Hexagonal-lite に整合
- `core` が `port` interface に依存し、`adapter` がその実装を提供する Hexagonal の標準形
- SDK 直 import を adapter に閉じることで、core 層の test が SDK mock 不要になる

**Dependency rules**:
- `core` → `store` / `util` / `core/port` のみ依存可
- `core` → `adapter` 直接依存禁止（composition root = `cli/` で配線）
- `adapter` → `core/port` の interface を実装する関係のみ
- `cli` → 全層を import して配線（composition root）

**Migration strategy**: 単一 PR 内で git mv（履歴保持）を使い、import path を一括更新する。中間状態を残さない。

### D8. Behavior invariance verification

**Decision**: 振る舞い不変は次の 4 階層で確認する:

1. **既存テスト全 PASS**: 現在 passing の 161 tests を 1 つも壊さない（test の import path 修正は許容、assertion 変更は不可）。`tests/cli.test.ts` の vitest API 非互換による既存 1 fail + 1 error は本 change の scope 外であり、この状態を悪化させないことが条件
2. **State file backward compat**: 旧 format の固定サンプル JSON を `tests/fixtures/legacy-job-state-*.json` として 3 種（PR #24 前 / PR #24 後 / 当 change 後）固定化し、load → normalize → save round-trip で diff 0 を assert
3. **CLI stdout snapshot**: `[iter N/M]` 進捗行と最終サマリ文字列を pin する snapshot test を新規追加（test must-area より）
4. **エラーコード preservation**: 既存 error code 文字列 5 種（`SESSION_TIMEOUT` / `SESSION_TERMINATED` / `BRANCH_NOT_REGISTERED` / `SPEC_REVIEW_RETRIES_EXHAUSTED` / `CONFIG_INCOMPLETE`）が同じ trigger 条件で発火することを test で固定

**Rationale**: refactoring の定義は「振る舞い不変の構造変更」であり、振る舞い証明が成立しなければ refactoring と呼べない。161 テスト PASS だけでは新規 behavior（schema migration、event emission）を網羅できないため、上記 4 階層を組み合わせる。

## Risks / Trade-offs

### Risk: 単一 PR の規模が大きい (~600–800 LOC 変更見込み)

**Impact**: review が大変、conflict 確率が上がる

**Mitigation**:
- D8 → D1+D2+D9 → D3 → D7 の順で commit を分け、commit ごとにテスト PASS する状態を保つ
- 最終的に 1 PR にまとまるが、commit ごとに review 可能
- 並行する request がない（worktree 専用）ので main との conflict は merge 直前のみ

### Risk: import path の一括更新で誤りが入る

**Impact**: `core` → `adapter` 違反など、依存方向ミスが見落とされる

**Mitigation**:
- ADR-module-architecture-style D4 で禁止された依存を検知する lint（custom rule）を tasks に含める
- TypeScript の strict + tsc -p で全 import を resolve、ビルドが通る = path は正しい
- `grep -rE "from ['\"]@anthropic-ai/sdk" src/core/` で SDK 直 import の不在を CI で gate

### Risk: 旧 state file の normalization で edge case を取りこぼす

**Impact**: production 環境の旧 state がロードできなくなり、ユーザーの作業が消失

**Mitigation**:
- 旧 schema 3 世代（PR #24 前単数 / PR #24 後 array / 本 change 後 StepRun[]）の固定サンプルを fixture 化
- `JobStateStore.load()` の単体テストで全 fixture を verify
- normalization は読み込み専用で、save は常に最新 schema（旧 format への書き戻しなし）

### Trade-off: EventBus subscriber 0 のまま merge

**Impact**: 「動かないコード」を merge する印象。学習層実装まで dead code に見える

**Acceptance**: ADR D7 で reservation seat の意義は確定済み。subscriber 追加は次 request の話で、本 change で subscriber まで含めるのは scope creep

### Trade-off: AgentDefinition は interface のみで registry を作らない

**Impact**: Step が `agent: AgentDefinition` を直接持つので、step 間で agent を共有する仕組みがない（現状は per-step Agent なので共有不要）

**Acceptance**: D4 + D5 + D6（registry / syncer / config migration）は scope outside と request で明示済み。本 change の `agent: AgentDefinition` は後続 request で `agentName: string` + `AgentRegistry` 経由解決に置き換え可能な形にしておく

## Migration Plan

### Commit ordering (4 logical commits)

1. **chore: introduce module skeleton (`src/{core/{pipeline,step,agent,event,port},adapter,store}`)**
   - 空ディレクトリと placeholder index.ts を作成
   - 既存コードはまだ動く

2. **feat(store): JobStateStore class + StepRun[] schema**
   - `src/store/job-state-store.ts` 新設、`src/state/store.ts` を委譲化
   - `JobState.steps` を `Record<StepName, StepRun[]>` に変更、旧 schema normalization
   - 既存テストが PASS することを commit gate に

3. **refactor(step): Step interface + StepExecutor + tool co-location**
   - `Step` interface 定義、`StepExecutor` 実装
   - propose / spec-review / spec-fixer を Step 実装に移植
   - `register_branch` を ProposeStep に同居化、`src/core/tools/registry.ts` 削除

4. **refactor(pipeline): Pipeline class + Transition table + EventBus**
   - `Pipeline` class + transition table、`pipeline.ts` の inline if を置換
   - `EventBus` 最小実装、StepExecutor / Pipeline で emit 配線
   - `cli/` を composition root として配線、`@anthropic-ai/sdk` の core 直 import を adapter 経由に変換

5. **refactor(layout): align imports to ADR-D4 module boundaries**
   - 残った import path 違反を整理、依存方向 lint を CI に追加（任意、scope 内）

### Rollback

- 各 commit ごとに既存テスト PASS を維持しているので、任意 commit へ revert 可能
- production への影響なし（CLI バージョンの違いのみ。state file は backward compat で旧 CLI も読める ↔ ただし新 CLI が書いた `StepRun[]` は旧 CLI が読めない可能性 → ユーザーへ「downgrade 不可」を release notes で明示）

## Open Questions

- **Q1**: `AgentDefinition` interface の最小フィールドは何にすべきか？ → 現状の `agent-definition.ts` の構造を踏襲し、後続 request で registry 化時に必要に応じて拡張
- **Q2**: EventBus の event payload 型を strict union にするか generic にするか？ → `type Payload<E extends DomainEvent>` を mapped type で表現し、emit / on で型推論。実装時に決定
- **Q3**: 状態ファイルの backward compat normalization は何世代までサポートするか？ → 直近 2 世代（PR #24 前後）+ 本 change の StepRun[]。それ以前の format は archived state ディレクトリに retire（Open Question 残しで OK、production 状況確認後に判断）
