# ADR-20260429: Step / Agent / Pipeline のクラスアーキテクチャ

> 本 ADR は **クラス境界（D1〜D10）**のみを扱う。モジュール構造（ディレクトリ・port-adapter・依存方向）は [ADR-20260429-module-architecture-style](ADR-20260429-module-architecture-style.md) に、外部参考実装と転用パターンは [ADR-20260429-cicd-architecture-inspirations](ADR-20260429-cicd-architecture-inspirations.md) に分離している。

## ステータス

提案

## コンテキスト

CLI core pipeline（PR #19）と spec-review pipeline（PR #22）の実装で、`src/core/steps/propose.ts`（386 LOC）と `src/core/steps/spec-review.ts`（310 LOC）が成立した。両者にはセッション生成・try/catch・`failJobState` + `appendHistory` + `err.state` 装着のパターンが 45–55 行ずつ重複している。

spec-fixer / implementer / code-review を順次追加する trajectory に乗せると、このコピペは 4 倍に増殖する。同時に以下の構造的判断が暗黙のまま育っている。

### 現状の構造的不足

1. **Step 抽象が無い** — 各 step が独立スクリプト。共通 boilerplate を集約する型・基底クラスが無い
2. **Verdict 分岐が pipeline.ts に inline** — `pipeline.ts:78–86` の if 連鎖で表現。spec-fixer の iteration loop（needs-fix → spec-fixer → spec-review に戻る）を素直に表現できない
3. **State schema が iteration 非対応** — `JobState.steps` は step 名 → 結果の単一マップ。同じ step が複数回走る前提を持たない
4. **Agent definition が単数前提** — `agent-definition.ts` は `specrunner-propose` 1 つを想定。step ごとに必要な capability が異なる現実と乖離
5. **Custom Tool の spec と handler が分離管理** — `core/agent-definition.ts` が tool spec を作り、`core/tools/registry.ts` が handler を保持。両者の対応はグローバル registry 経由で暗黙
6. **学習層の plug-in 点が無い** — ADR-20260429-positioning が D5 で宣言した「observation → instinct → rule の継承」を後付けする際、step / pipeline / state の 3 層を横断する必要がある

### 制約

- Anthropic Managed Agents SDK v0.91.0 を前提とする
- Bun + TypeScript 構成は維持する（既存 ADR で確立済み）
- File-based verdict + polling 完了検知の runtime model（ADR-20260427-cli-first-architecture）は維持する
- fresh-per-task dispatcher（ADR-20260429-positioning D4）を構造的に支える

## 決定

spec-runner の core 層を以下のクラス境界で再構成する。spec-fixer 実装と同じ request スコープで **D1〜D3 + D7（予約席のみ）+ D8（class + schema 両方）+ D9** を適用する。**D4〜D6**（AgentDefinition per role / AgentRegistry / AgentSyncer / config schema migration）は `init.ts` と config schema の更新を含むため**別 request として切り出す**。D10 は実装順序のメタ決定。

### D1: Step を interface として定義し、step ごとに class 実装を持つ

```typescript
interface Step {
  readonly name: StepName;
  readonly agent: AgentDefinition;
  readonly toolHandlers?: Map<string, ToolHandler>;
  buildMessage(state: JobState, deps: PipelineDeps): string;
  resultFilePath(state: JobState): string;
  parseResult(content: string): StepOutcome;
}

interface StepOutcome {
  verdict: Verdict;
  findings?: Finding[];
  raw: string;
}

type Verdict = "approved" | "needs-fix" | "escalation";
```

各 step（propose / spec-review / spec-fixer / implementer / code-review）はこの interface を class で実装する。`buildMessage` / `resultFilePath` / `parseResult` のみが step 固有ロジック。他は executor 側に集約。

`toolHandlers` フィールドの根拠（Tool spec と handler を Step に同居させる理由）は **D9** で詳述する。

### D2: StepExecutor class に I/O lifecycle を集約

```typescript
class StepExecutor {
  constructor(
    private sessions: SessionClient,
    private github: GitHubClient,
    private store: JobStateStore,
    private events: EventBus,
  ) {}

  async execute(step: Step, state: JobState, deps: PipelineDeps): Promise<JobState>;
}
```

責務:
- セッション生成（`sessions.create(step.agent)`）
- 完了 polling（既存 `core/completion.ts` を内包）
- ブランチからの結果ファイル取得（`step.resultFilePath` を読む）
- `step.parseResult` 呼び出し
- `try/catch` で `err.state` 装着
- `events.emit("step:start" | "step:complete" | "step:error")`
- state 永続化（`store.persist`）

既存 propose.ts / spec-review.ts の 45–55 行ずつのコピペ箇所はここに集約される。

> `SessionClient` / `GitHubClient` は **`core/port/` で定義する interface**。実装は `adapter/anthropic/` / `adapter/github/` に置き、`cli/` の composition root で実装を注入する。詳細は [ADR-20260429-module-architecture-style](ADR-20260429-module-architecture-style.md) を参照。

### D3: Pipeline class + declarative transition table

```typescript
interface Transition {
  step: StepName;
  on: Verdict;
  to: StepName | "end" | "escalate";
}

class Pipeline {
  constructor(
    private steps: Map<StepName, Step>,
    private transitions: Transition[],
    private executor: StepExecutor,
    private maxIterations: number = 3,
  ) {}

  async run(start: StepName, state: JobState, deps: PipelineDeps): Promise<JobState>;
}
```

`pipeline.ts:78–86` の inline if は transition table に置換される。spec-fixer の iteration は次のように宣言する:

```typescript
const transitions: Transition[] = [
  { step: "propose", on: "approved", to: "spec-review" },
  { step: "spec-review", on: "approved", to: "implementer" },
  { step: "spec-review", on: "needs-fix", to: "spec-fixer" },
  { step: "spec-review", on: "escalation", to: "escalate" },
  { step: "spec-fixer", on: "approved", to: "spec-review" },  // ← cycle
  { step: "spec-fixer", on: "needs-fix", to: "escalate" },
  { step: "implementer", on: "approved", to: "code-review" },
  { step: "code-review", on: "approved", to: "end" },
  // ...
];
```

`maxIterations` は同じ step の再入回数に対する loop guard。超過時は自動 escalation。

### D4: AgentDefinition は Step が所有し、AgentRegistry が集約する

```typescript
// src/core/agent/definition.ts
interface AgentDefinition {
  readonly name: string;                       // "specrunner-propose"
  readonly role: StepName;                     // Step.name と一致。definitionHash 計算と config 索引のため二重保持
  readonly model: string;
  readonly system: string;
  readonly tools: ToolSpec[];                  // SDK に渡す spec
  readonly capabilities?: AgentCapabilities;   // 予約席。Phase 2 で最小権限宣言に使う
}

interface AgentCapabilities {
  network?: boolean;
  gitWrite?: boolean;
  // ant Environment の capability 体系に追従して拡張
}
```

各 Step class は `readonly agent: AgentDefinition` フィールドで自身の agent 定義を所有する。これにより 1 step ファイルを読めば「どの prompt と tool 集合か」が完結する（prompts/ と tools/ を行き来する必要がない）。

```typescript
class AgentRegistry {
  static fromSteps(steps: Step[]): AgentRegistry;
  get(role: StepName): AgentDefinition;
  list(): AgentDefinition[];
  hashOf(role: StepName): string;
}
```

registry は構築時に Step 群から AgentDefinition を集める純粋な集約点。Step を追加 = `new XxxStep()` を steps 配列に push するだけで registry / config / syncer は無編集。

### D5: AgentSyncer がトランザクション境界を持つ

```typescript
class AgentSyncer {
  constructor(
    private client: AnthropicClient,
    private registry: AgentRegistry,
    private config: ConfigStore,
  ) {}
  async syncAll(): Promise<Map<StepName, string>>;
}
```

責務:
- per-role の retrieve / create / update / 404 fallback（既存 `init.ts:51–83` の per-agent 化）
- 部分失敗時の orphan rollback（既存 `init.ts:107–119` の per-agent 化）
- per-role definitionHash による drift 検出（prompt 変更が部分的なら部分更新で済む）

> `AnthropicClient` は core/port の interface として定義し、実装を adapter/anthropic に置く。AgentSyncer 自体は **core/agent/ に常駐**するが、`AnthropicClient` を port 経由で受け取るため SDK 直接依存を core に持ち込まない。詳細は [ADR-20260429-module-architecture-style](ADR-20260429-module-architecture-style.md) を参照。

### D6: Config schema を per-role agents map に拡張

```typescript
interface SpecRunnerConfig {
  agents: Record<StepName, {
    id: string;
    definitionHash: string;
    lastSyncedAt: string;
  }>;
  environments: { default: { id: string; lastSyncedAt: string } };
  // ... github, anthropic はそのまま
}
```

既存 `agent: { id, definitionHash, lastSyncedAt }` の単数フィールドから `agents: Record<StepName, ...>` の map に移行。migration は D4〜D6 を切り出す後続 request で実施する（現状の使用者が単独であるため、互換シムは不要）。

### D7: EventBus を観測 hook として予約

```typescript
class EventBus {
  on(event: DomainEvent, handler: Handler): void;
  emit(event: DomainEvent, payload: unknown): void;
}

type DomainEvent =
  // step lifecycle — StepExecutor が emit
  | "step:start"
  | "step:complete"
  | "step:error"
  | "verdict:parsed"
  // pipeline lifecycle — Pipeline が emit（Argo Exit handlers 由来、ADR-20260429-cicd-architecture-inspirations 参照）
  | "pipeline:start"
  | "pipeline:complete"
  | "pipeline:fail";
```

StepExecutor が step:* を、Pipeline が pipeline:* を emit する。subscriber は v1 まで空で良いが、bus 自体を入れておくことで学習層 / cleanup hook を後付けする際に StepExecutor / Step / Pipeline を触らずに subscribe できる。

### D8: JobStateStore class 化 + StepRun[] schema で iteration 対応

D8 は **D8a（class 化）+ D8b（schema migration）** の 2 側面を持つ決定。両側面とも spec-fixer 実装と同 request で適用する（D8b は spec-fixer の cycle を表現するために必須）。

```typescript
interface JobState {
  // ...
  steps: Record<StepName, StepRun[]>;  // 配列に変更
}

interface StepRun {
  attempt: number;
  sessionId: string;
  outcome: StepOutcome;
  startedAt: string;
  endedAt: string;
}

class JobStateStore {
  async load(jobId: string): Promise<JobState | null>;
  async persist(state: JobState): Promise<void>;          // atomic-write を内包
  async appendHistory(state: JobState, ev: HistoryEvent): Promise<JobState>;
  async appendStepRun(state: JobState, step: StepName, run: StepRun): Promise<JobState>;
}
```

spec-fixer によって spec-review が複数回走るケースを `steps["spec-review"]: [run1, run2, ...]` で表現する。

### D9: Tool spec と Tool handler の分離

- `AgentDefinition.tools`: Anthropic に登録される SDK レベルの Tool spec
- `Step.toolHandlers`: CLI 側で実行される handler の Map<string, ToolHandler>

両者は名前（"register_branch" 等の string）で対応させる。Step が両方を所有することでペアでズレない。既存の global registry（`core/tools/registry.ts`）は廃止し、Step ごとに handler を持つ形に再構成する。

### D10: 切り出し順序

1. **JobStateStore class 抽出 + StepRun[] schema migration**（D8a + D8b、`state/store.ts` のロジックを class に包む + schema を `Record<StepName, StepRun[]>` に変更）
2. **Step interface + StepExecutor + Tool spec/handler 同居**（D1 + D2 + D9）→ propose / spec-review を移植
3. **Pipeline class + transition table**（D3）→ `pipeline.ts:78–86` の inline if を置換
4. **EventBus 予約席**（D7、subscriber は空、10 行程度）
5. **AgentDefinition / AgentRegistry / AgentSyncer 分離 + config schema migration**（D4 + D5 + D6、`init.ts` と config を同時更新）

`1〜4` を spec-fixer 実装と同 request、`5` を後続 request に分けるのが推奨。

## 関数のまま残すもの

クラス化しない:

- `parser/request-md.ts` — pure
- `prompts/*.ts` — テンプレートを返す関数
- `git/remote.ts` — pure
- `util/atomic-write.ts` — JobStateStore の内部実装に
- `core/completion.ts` — polling ロジックは pure に近いので関数で残す（StepExecutor が呼び出す）
- Verdict / StepName 型 — string literal union
- AgentDefinition — interface（pure data）

クラス化する判断軸:

- 状態を持つ
- DI で差し替えたい
- mock したい
- lifecycle がある
- トランザクション境界を持つ

## 理由

1. **Step 抽象でコピペ scaling 問題を構造的に解く** — spec-fixer / implementer / code-review を追加する時、StepExecutor と Pipeline は無編集で `new XxxStep()` を steps 配列に push + transition table に行追加するだけ
2. **Pipeline state machine が iteration を素直に表現** — spec-fixer の cycle は table の 1 行で済む。retry counter / loop guard が `Pipeline.maxIterations` に集約され、step 側に漏れない
3. **AgentDefinition の per-role 化で最小権限原則を実装可能化** — spec-review = read-only、implementer = git write のような capability isolation の余地を Phase 2 に残す
4. **Tool spec と handler の同居で drift を防ぐ** — 現在の global registry は Tool 名のタイポで silent failure する。Step が両方所有することで型レベルで対応が保証される
5. **EventBus で学習層の plug-in を予約** — ADR-20260429-positioning D5 の「observation → instinct → rule 継承」を後付けする際、StepExecutor / Step / Pipeline を触らずに subscribe できる
6. **JobStateStore + StepRun[] で iteration を一級表現に** — spec-fixer によって同じ step が複数回走るケースを schema レベルで許容
7. **fresh-per-task dispatcher の体現** — Step が独立した AgentDefinition を持ち、StepExecutor が step ごとに新セッションを作る構造は、ADR-20260429-positioning D4 の core である「親セッション累積を構造的に避ける」の体現になる

## 却下した代替案

### 案 A: 単一 omnibus agent + role 切替プロンプト

- 1 つの agent に全 role の system prompt を含め、メッセージで role を切り替える
- **却下理由**: capability isolation が不可能。Custom Tool が全 step に露出する。definitionHash の根拠が崩れる（部分更新の意味が消える）

### 案 B: Step 抽象なしで関数を共通化（StepRunner 関数）

```typescript
async function runStep(stepDef, state, deps): Promise<JobState> { ... }
```

- step 固有ロジックを引数（メッセージビルダ、verdict パーサ等）で渡す関数
- **却下理由**: 引数が多くなる（5–8 個）。step ごとに必要な振る舞いが増えるたびに関数シグネチャが膨張する。class なら field 追加で済む

### 案 C: Pipeline を関数のまま inline if で育てる

- 既存 `pipeline.ts:78–86` のスタイルを step 4 つまで維持する
- **却下理由**: spec-fixer の iteration loop（cycle）を inline if で表現すると retry counter / loop guard が散在する。declarative table のほうが状態機械として読みやすく、追加 step = 1 行で済む

### 案 D: Step の AgentDefinition を AgentRegistry が所有（Step は role 名だけ持つ）

- Step は `readonly agentRole: StepName` のみを持ち、AgentRegistry が role → AgentDefinition のマップを保持
- **却下理由**: 1 step の理解に複数ファイルを読む必要が出る。self-contained の利点を失う。registry が AgentDefinition の構築責任も持つと SRP が崩れる

## 結果

### Positive

- **コピペ scaling 問題が構造的に解消** — 4 step 体制で StepExecutor の boilerplate が 1 箇所に集約
- **Pipeline 状態機械が宣言的** — transition table を読めば pipeline の挙動が把握できる
- **学習層の後付けが容易** — EventBus に subscribe するだけで Step / Pipeline は無変更
- **agent capability の最小権限化が可能** — Phase 2 で role 別 Environment / network policy を導入できる
- **Step 追加の手順が固定化** — `new XxxStep()` を steps 配列に push + transition table に N 行追加 + agents config に migration、で完了
- **fresh-per-task dispatcher の構造が露わになる** — Step ↔ AgentDefinition ↔ Session の 1:1:1 関係が型レベルで明示される

### Negative / Risks

- **リファクタ規模**: 既存 propose.ts / spec-review.ts の移植 + agent-definition.ts の解体 + config schema migration で ~400–600 LOC の変更。spec-fixer 実装と同 request で行うと PR が大きくなる
- **Step 1:1 Agent の原則違反リスク**: 1 つの agent を複数 step で使い回したくなる場面があるかもしれないが、definitionHash の根拠が崩れるため禁止する。共有したい場合は role を分けて重複定義を許す
- **Test 整備コスト**: StepExecutor / Pipeline の単体テスト + e2e テスト（tmp git repo + 実 file I/O + API mock のみ）が必要。本 ADR 起草と同セッションのアーキテクチャ評価で integration harness の不足が認識されており（参照: `tests/` には API mock を伴う unit レベルしかない）、それとセットで対処する
- **ant SDK の進化追随**: AgentDefinition / ToolSpec の型が SDK バージョンに依存する。SDK upgrade 時に AgentDefinition interface の改訂が必要になる可能性

### Tracking

- **spec-fixer 実装と同 request**（D10 手順 1〜4）: D1 + D2 + D3 + D7 + D8（class + schema 両方）+ D9
- **後続 request**（D10 手順 5）: D4 + D5 + D6（Agent 関連 + config migration）
- **e2e テストハーネス** (`tests/e2e-pipeline.test.ts`) の整備を D1〜D3 と同 request で推奨
- **学習層実装**（EventBus subscriber）は v1 milestone まで deferred
- **外部参考実装の採用ロードマップ**（Tekton typed I/O / Argo retry / Argo exit handlers 等）は本 Tracking と同期。詳細は [ADR-20260429-cicd-architecture-inspirations](ADR-20260429-cicd-architecture-inspirations.md) →「採用ロードマップ」を参照

## 関連 ADR

本 ADR は Step / Agent / Pipeline のクラス境界（D1〜D10）に集中する。アーキテクチャの上位枠と外部参考実装は別 ADR に切り出した。

- **Module Architecture Style**: D1〜D10 のクラスを載せるモジュール構造（Modular Monolith + Functional Core + Hexagonal-lite + tactical DDD）と `core/ adapter/ store/ cli/` の境界・依存方向は **ADR-20260429-module-architecture-style.md** を参照
- **CI/CD Architecture Inspirations**: Argo Workflows / Tekton / Temporal / GitHub Actions / Dagster からの転用パターンと採用ロードマップ（D1 typed I/O / D3 retry / D7 exit handlers 等の拡張）は **ADR-20260429-cicd-architecture-inspirations.md** を参照

## 参照

- ADR-20260429-module-architecture-style.md — Modular Monolith / Hexagonal-lite / tactical DDD / ディレクトリ構造（本 ADR の上位枠）
- ADR-20260429-cicd-architecture-inspirations.md — Argo / Tekton / Temporal 等からの転用パターンと採用ロードマップ
- ADR-20260427-cli-first-architecture.md — CLI プロセスがオーケストレーター、file-based verdict
- ADR-20260427-cli-core-pipeline.md — `specrunner run` の構造
- ADR-20260429-spec-review-pipeline.md — spec-review の最初の実装、現状の duplication 元
- ADR-20260429-positioning-vs-gsd-and-openspec.md — fresh-per-task dispatcher の宣言（D4）、学習層継承の宣言（D5）
- ADR-20260424-session-pipeline-design.md — 4 セッション直列モデル
- アーキテクチャ評価セッション: 2026-04-29
