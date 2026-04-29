## Context

PR #26（merged）で `step-and-agent-class-architecture` ADR の D1-D9 を実装した。Step interface / StepExecutor / Pipeline state machine / EventBus / JobStateStore / StepRun[] / Tool 同居までは整っているが、ADR の D10 で「後続 request」として明示分離された D4-D6（AgentDefinition per role / AgentRegistry / AgentSyncer / Config schema migration）が未着手で、以下の構造的な「半端さ」が残っている。

- `src/core/step/types.ts:11`: Step.agent は `{ agentId: string }` のプレースホルダ
- `src/core/step/executor.ts:23-27`: `STEP_AGENT_ROLE` ハードコードで spec-review が propose Agent を流用（PR #22 で表面化した system prompt 矛盾の温床）
- `src/cli/init.ts:51-83`: 旧 schema と中間 schema が併存し、Anthropic API を直接叩く単発ロジック
- `src/config/schema.ts`: `agent: {id, definitionHash, lastSyncedAt}`（旧）、`agents.{propose,specReview,specFixer}`（中間）の二重管理

これを解消しないまま implementer / verification / code-review / PR 作成 Step を追加すると、コピペが 4 倍に増殖する。本 request は ADR の D4-D6 を実装に落とすことに集中する。

参照 ADR:
- `openspec-workflow/adr/ADR-20260429-step-and-agent-class-architecture.md`（D4-D6 の決定文と却下案）
- `openspec-workflow/adr/ADR-20260429-module-architecture-style.md`（`core/agent/`、`core/port/`、`adapter/anthropic/` の境界）

### 制約

- **Anthropic Managed Agents SDK v0.91.0**: `SessionCreateParams` は `system` 上書きを許さない。Agent の system / tools / model は Agent バージョンに固定される。同一 Agent を異なる role で使い回すと system prompt と user message が矛盾する（PR #22 で実証済）
- **specrunner 単体での使用**: 互換シムは不要。`specrunner init` 実行時に旧 schema を新 schema に書き換える
- **既存 214 テスト全 PASS**: 振る舞い不変。CLI コマンドの結果が同じであることを保証
- **module-architect の事前分析**: 既存コードを testability / cohesion / coupling / SRP 軸で分析し、共通化候補を列挙してから設計する（pipeline-context.md の指示）
- **test-case-generator の must シナリオ**: config migration / AgentSyncer / AgentRegistry / STEP_AGENT_ROLE 除去の境界条件を test-cases.md として宣言

## Goals / Non-Goals

**Goals:**
- Step が完全な AgentDefinition を所有することで、1 step ファイルを読めば prompt と tools が完結する状態にする
- AgentRegistry を介して Step 群から Agent 定義を集約する pure な集約点を作る
- AgentSyncer によるトランザクション境界（per-role retrieve/create/update/404 fallback、orphan rollback、definitionHash drift 検出）を明示する
- Config schema を `agents: Record<StepName, AgentRecord>` の単一マップに統一し、Step 追加時の schema 拡張コストをゼロにする
- spec-review 専用 Agent の作成により、propose Agent との system prompt 矛盾を構造的に解消する
- `STEP_AGENT_ROLE` のハードコードを除去し、StepExecutor が `step.agent` を直接参照する形へ移行する
- 旧 schema → 新 schema の自動 migration を idempotent に実装する

**Non-Goals:**
- implementer / verification / code-review / PR 作成 Step の追加（後続 request）
- E2E 実機検証（self-hosting 完成までまとめて保留）
- Web UI / cost ledger / observability subscriber（ADR の他セクション）
- 最小権限の capability isolation の実機反映（`AgentCapabilities` は予約席として置くだけ。Phase 2 で実装）
- 互換シム（消費者は specrunner 単体）

## Decisions

### D1: Step が完全な AgentDefinition を所有する

`Step.agent` を `{ agentId: string }` プレースホルダから完全な `AgentDefinition` 型に拡張する。各 Step class（propose / spec-review / spec-fixer）は自身の system prompt / model / tools / capabilities を class 内で宣言する。

```typescript
// src/core/agent/definition.ts
export interface AgentDefinition {
  readonly name: string;                       // "specrunner-propose"
  readonly role: StepName;                     // "propose" | "spec-review" | "spec-fixer"
  readonly model: string;
  readonly system: string;                     // 完全な system prompt 文字列
  readonly tools: ToolSpec[];
  readonly capabilities?: AgentCapabilities;   // 予約席（Phase 2）
}

export interface AgentCapabilities {
  readonly network?: boolean;
  readonly gitWrite?: boolean;
}
```

**Rationale**: 1 step ファイルを読めば「どの prompt と tool 集合か」が完結する（prompts/ と tools/ を行き来しなくて済む）。 ADR-20260429-step-and-agent-class-architecture D4 の決定。

**却下案**: AgentRegistry が AgentDefinition を所有し、Step は role 名のみを持つ案（ADR の案 D）。self-contained の利点を失う上、registry が AgentDefinition の構築責任も持つと SRP が崩れるため却下。

### D2: AgentRegistry は pure な集約点

```typescript
// src/core/agent/registry.ts
export class AgentRegistry {
  private constructor(private readonly defs: Map<StepName, AgentDefinition>) {}

  static fromSteps(steps: Step[]): AgentRegistry {
    const map = new Map<StepName, AgentDefinition>();
    for (const step of steps) {
      if (map.has(step.agent.role)) {
        throw new Error(`Duplicate agent role: ${step.agent.role}`);
      }
      map.set(step.agent.role, step.agent);
    }
    return new AgentRegistry(map);
  }

  get(role: StepName): AgentDefinition | undefined { return this.defs.get(role); }
  list(): AgentDefinition[] { return [...this.defs.values()]; }
  hashOf(role: StepName): string { /* canonical JSON SHA-256 */ }
}
```

**Rationale**: Anthropic API を呼ばない pure な集約点。Step を追加するときの編集箇所が `new XxxStep()` を steps 配列に push するだけになる。registry / config / syncer は無編集。

**重複ロール検出**: `fromSteps` で重複 role の同居を検出して例外。同一 Agent を別 role で使い回す誤用を構造的に防ぐ。

### D3: AgentSyncer がトランザクション境界

per-role の retrieve/create/update/404 fallback、部分失敗時の orphan rollback、definitionHash drift 検出を class 化する。

```typescript
// src/core/agent/syncer.ts
export interface SyncResult {
  readonly results: Map<StepName, { agentId: string; definitionHash: string; lastSyncedAt: string }>;
}

export class AgentSyncer {
  constructor(
    private readonly client: AnthropicClient,  // core/port
    private readonly registry: AgentRegistry,
    private readonly config: ConfigStore,
  ) {}

  async syncAll(): Promise<SyncResult>;
}
```

**syncAll の振る舞い**（per-role に独立適用）:
1. config の `agents[role].agentId` が存在 → `client.retrieveAgent(agentId)` を試す
2. retrieve 成功 → `definitionHash` を比較。一致なら no-op、不一致なら `client.updateAgent(agentId, def)` を呼ぶ
3. retrieve 404 → `client.createAgent(def)` を呼んで新 ID を取得（fallback 経路）
4. config に agentId が無い → `client.createAgent(def)` を呼ぶ
5. 途中で例外発生 → これまでの run で**新規作成**した Agent を `client.archiveAgent(id)` でロールバック（**update した既存 Agent は触らない**）。例外は再 throw

**冪等性**: 2 回連続実行で「全 role が definitionHash 一致 → no-op」となること。実装はテストで保証する。

**rollback の境界**: per-role の create のみが rollback 対象。update（既存 Agent の編集）はロールバックしない（Agent バージョンの戻し操作は SDK が提供しないため、ロールバック不能を構造的に避ける）。

**Rationale**: ADR-20260429-step-and-agent-class-architecture D5 の決定。`AnthropicClient` は core/port の interface として定義し、実装を `adapter/anthropic/` に置くことで core が SDK 直接依存を持たない（ADR-20260429-module-architecture-style D5 の依存方向）。

**AgentSyncer の配置決定（module-analysis §4a との相違）**: module-analysis.md §4a は AgentSyncer を `src/adapter/anthropic/agent-syncer.ts` に置く案を提案した（Anthropic SDK を直叩きするため adapter 層が自然、という coupling 軸の判断）。しかし本設計では `AnthropicClient` port（`src/core/port/anthropic-client.ts`）経由で SDK 依存を分離するため、AgentSyncer 自体は SDK に依存しない pure な orchestration ロジックとなる。AgentSyncer が core 側に置かれることで fake AnthropicClient を注入したユニットテストが容易になり、testability が向上する。SDK 具象型への依存は `adapter/anthropic/anthropic-client.ts` の実装に完全に閉じる。この判断から module-analysis の adapter 配置案は却下し、`src/core/agent/syncer.ts` を正式な配置とする。

### D4: Config schema を `agents: Record<StepName, AgentRecord>` に統一

```typescript
// src/config/schema.ts （新形）
export interface AgentRecord {
  agentId: string;
  definitionHash: string;
  lastSyncedAt: string;  // ISO8601
}

export interface SpecRunnerConfig {
  version: number;
  anthropic: { apiKey: string };
  agents: Record<StepName, AgentRecord>;  // 新形：単一マップ
  environment: { id: string; lastSyncedAt: string };
  github?: { accessToken: string; tokenObtainedAt: string; scopes: string[] };
  pipeline: { maxRetries: number };
  // 旧 `agent: {...}` は削除
}
```

**Migration ロジック**（`specrunner init` 実行時に適用）:

| 入力形 | 動作 |
|--------|------|
| 新 schema（既に `agents: Record<StepName, AgentRecord>`） | そのまま使う（idempotent） |
| 中間 schema（`agents.{propose,specReview,specFixer}` の固定キー型） | `Record<StepName, AgentRecord>` 形に詰め直す（同 ID 同 hash を維持） |
| 旧 schema（`agent: {id, definitionHash, lastSyncedAt}` 単数のみ） | `agents.propose` に詰め直す（spec-review / spec-fixer は次の `syncAll` で新規作成） |
| 両方併存（旧 + 中間） | 中間 schema を採用（旧 schema は破棄） |
| どちらも未設定 | `agents: {}` で初期化 |
| 片側欠損（例: `agents.specReview` のみ） | 既存分は維持、不足分は次の `syncAll` で新規作成 |
| 片側欠損 + 旧 agent 併存（例: `agent.id` + `agents.specFixer`、`agents.propose` なし） | (a) `agent.id` → `agents.propose.agentId` に詰め直す、(b) `agents.specFixer` → `agents["spec-fixer"]` にキー正規化、(c) 不足 role（spec-review）は次の `syncAll` で新規作成。3 操作は独立に適用する |

**3 操作の独立性原則**: migration は (a) 旧 `agent` 単数 → `agents.propose` 詰め直し、(b) 中間 camelCase キー → kebab-case 正規化、(c) 不足 role はそのまま欠損（`syncAll` で補完）の 3 操作を順序非依存に適用する。複合ケースも各操作を独立に適用することで処理できる。

**Migration の境界条件**:
- migration 後の書き込みは atomic（既存 `atomic-write` を流用）
- migration は `syncAll` の前に実行する。`syncAll` は新 schema 前提で動く
- migration 失敗時（schema 不正な JSON など）は `CONFIG_INVALID` を throw し、init を exit code 1 で停止する

**Rationale**: Step 追加時の schema 拡張コストをゼロにするための統一マップ化。ADR-20260429-step-and-agent-class-architecture D6 の決定。互換シム（中間 schema 維持）は採用しない（消費者は specrunner 単体）。

**legacy fallback の廃止**: 既存の `getAgentId(config, role)` の "propose role に限り `config.agent.id` を fallback として返す" ロジックは廃止する。新 schema では `agents.propose.agentId` が唯一の正。

### D5: STEP_AGENT_ROLE ハードコードの除去

`src/core/step/executor.ts:23-27` の `STEP_AGENT_ROLE` Map を完全に削除する。StepExecutor は以下のように Step.agent を直接参照する。

```typescript
// 旧
const role = STEP_AGENT_ROLE[step.name];
const agentId = getAgentId(config, role);

// 新
const agentId = config.agents[step.agent.role].agentId;
// または ConfigStore メソッド経由：
const agentId = configStore.getAgentId(step.agent.role);
```

**spec-review 専用 Agent の分離**: 現状 spec-review は propose Agent を流用しているが、本 request で `SpecReviewStep.agent.role = "spec-review"` の専用 AgentDefinition を持つ。`SpecReviewStep.agent.system` は spec-review 用の system prompt を持ち、`SpecReviewStep.agent.tools` は read-only 用途のため空配列または最小集合とする（現状の `register_branch` は不要、propose 専用）。

**Rationale**: ADR-20260429-step-and-agent-class-architecture D4 + D6 の決定。同一 Agent を異なる role で使い回すと system prompt と user message が矛盾する（Managed Agents SDK の制約）。

### D6: モジュール配置（ADR-20260429-module-architecture-style に沿う）

| 物 | 配置 | 種別 |
|----|------|------|
| `AgentDefinition` 型 | `src/core/agent/definition.ts` | interface（pure data） |
| `AgentCapabilities` 型 | `src/core/agent/definition.ts` | interface |
| `ToolSpec` 型 | `src/core/agent/definition.ts` または `src/core/tools/types.ts` | interface（SDK 型を re-export しない。adapter で SDK 型へ map） |
| `AgentRegistry` class | `src/core/agent/registry.ts` | class（pure / state-less） |
| `AgentSyncer` class | `src/core/agent/syncer.ts` | class（I/O ありだが port 経由） |
| `AnthropicClient` port interface | `src/core/port/anthropic-client.ts` | interface |
| `AnthropicClient` 実装 | `src/adapter/anthropic/anthropic-client.ts` | class（SDK 直接依存。ToolSpec → SDK 型変換もここで行う） |
| `StepName` 型 | `src/core/step/types.ts`（既存） | string literal union（kebab-case: `"propose" \| "spec-review" \| "spec-fixer"`） |
| Config schema | `src/config/schema.ts`（既存） | interface + Zod schema |
| ConfigStore | `src/store/config.ts` または既存パスを維持 | class（I/O） |

**Rationale**: ADR-20260429-module-architecture-style の D4（ディレクトリ構造）と D5（依存方向ルール）に従う。core は adapter を直接 import せず、`core/port/` の interface 経由で I/O を抽象化する。`AnthropicClient` port は Agent 操作（create / retrieve / update / archive）のみを持つ最小 API とし、Session 操作は既存の `SessionClient` port に残す。

### D7: ConfigStore の interface

config の読み書きを抽象化する `ConfigStore` を `core/port/` で定義する（既存の `src/config/` を class 化して store/ に移動するか、既存パスを維持して interface だけ port に置く）。

```typescript
// src/core/port/config-store.ts
export interface ConfigStore {
  load(): Promise<SpecRunnerConfig>;
  save(config: SpecRunnerConfig): Promise<void>;
  getAgentId(role: StepName): string;  // CONFIG_INCOMPLETE on missing
  upsertAgent(role: StepName, record: AgentRecord): Promise<void>;
}
```

**Migration の起動点**: `ConfigStore.load()` が呼ばれた時点で旧 schema → 新 schema に in-memory で詰め直す。`save()` で新 schema として永続化する。`init` は明示的に `migrate()` を呼ばず、`load()` → 必要に応じて `save()` の通常フローで自動 migration する。

**getAgentId の同期呼び出し前提**: `ConfigStore.getAgentId(role): string` は MUST in-memory キャッシュから同期で値を返す。`StepExecutor` は async context で `ConfigStore.getAgentId` を await なしで呼び出すため、`StepExecutor` をインスタンス化する前に `ConfigStore.load()` が完了していなければならない。CLI lifecycle では「`init` 経路: `load()` 完了 → `AgentSyncer.syncAll()` → `save()`」および「`run` 経路: `load()` 完了 → `StepExecutor` 生成 → `execute()`」の順序保証が必須である。

**Rationale**: AgentSyncer が ConfigStore を port として受け取るための抽象。test では fake ConfigStore を渡せる。

### D8: Tool spec の所有権

ADR-20260429-step-and-agent-class-architecture D9 で「Tool spec は AgentDefinition、Tool handler は Step が同居」が既に決まっている。本 request では `AgentDefinition.tools: ToolSpec[]` を Step が宣言することで両者が同じ Step ファイル内に同居する形を完成させる。spec-review Agent は tools が空配列、propose Agent は `register_branch` のみ、spec-fixer Agent は空配列、という現状を新 AgentDefinition の所有権で表現する。

### D9: 削除する古い仕様文言

- **`cli-config-store`**: 「`agent.id`（deprecated だが backward compat のため必須維持）」「`agents.specReview` は予約キー」「propose の legacy fallback」を REMOVED 扱いにする。Migration 文言は「`specrunner init` 実行時に旧 schema を自動移行」と置き換える
- **`agent-environment-bootstrap`**: 「`config.agent.id` も propose Agent の ID と同期した値で書かれている（旧形式互換）」（post-init 不変条件 (f)）を REMOVED し、「`config.agents[role].agentId` が全 role で retrieve 可能」に MODIFIED する
- **`step-execution-architecture`**: 「Step exposes its agent definition」シナリオを補強（StepExecutor が `step.agent` を直接参照、`STEP_AGENT_ROLE` のような中間マップを参照しない）

## Risks / Trade-offs

- **[Risk] migration の片側欠損ケース取り違え** → 旧 schema 入力 6 パターン（新／中間／旧／両方併存／未設定／片側欠損）を test-case-generator の must シナリオで網羅し、ConfigStore.load() のユニットテストでカバーする。実装前に test-cases.md を確定する
- **[Risk] AgentSyncer の orphan rollback で update 済み Agent を巻き込む** → rollback は per-role の **create** のみを対象にする（update は不可逆扱い）。SyncResult に「create / update / no-op」の per-role アクション種別を含めることで rollback 対象を明示し、テストで「update した role は rollback されない」を保証する
- **[Risk] spec-review 専用 Agent の system prompt が未整備** → 専用 system prompt は本 request の実装スコープに含める。Step に同居させる文字列として `src/core/step/spec-review.ts` 内に置く（D8 の Tool 同居と一貫）
- **[Risk] 旧コードに `getAgentId(config, "propose")` の legacy fallback 経路が残る** → grep で `config.agent.` の参照箇所を全削除する。delta spec の REMOVED で spec 側も合わせて落とす
- **[Risk] AnthropicClient port が SDK 型を漏らす** → port interface は SDK 型を再 export せず、core 側で必要な最小型（AgentRecord、SyncResult 等）のみを公開する。SDK 型は adapter/anthropic/ 内に閉じる
- **[Risk] migration の atomic write が部分書き込みで破損** → 既存 `util/atomic-write.ts` を流用。`migrate → save` の経路でも `<path>.tmp.<random>` → rename パターンを維持
- **[Trade-off] AgentDefinition.system に大きな文字列を抱える** → Step ファイルが長くなるが、D8 の Tool 同居と方針一致（self-contained 優先）。code-review で 1 ファイル 500 LOC を超えたら切り出しを検討する
- **[Trade-off] AgentRegistry の `fromSteps` が全 Step を渡す前提** → 部分的な registry を作りたくなる場面（特定 step のみ sync など）が将来出るかもしれないが、現時点では yagni。必要になったら `withRoles(roles: StepName[])` 等を追加する

## Migration Plan

1. **Phase 1: 新インフラの追加**（既存挙動を変えない）
   - `src/core/agent/definition.ts`、`registry.ts`、`syncer.ts` を新規追加
   - `src/core/port/anthropic-client.ts`、`config-store.ts` を新規追加
   - `src/adapter/anthropic/anthropic-client.ts` を新規追加（SDK の Agents API ラッパ）
   - 既存の `init.ts` / `Step.agent` プレースホルダ / `STEP_AGENT_ROLE` は触らない
2. **Phase 2: Step が AgentDefinition を所有する形に書き換え**
   - `src/core/step/types.ts`: `Step.agent` を完全な `AgentDefinition` 型に変更
   - `src/core/step/{propose,spec-review,spec-fixer}.ts`: 各 Step に AgentDefinition を埋め込む（system prompt / model / tools 同居）
   - `src/core/step/executor.ts`: `STEP_AGENT_ROLE` を削除し、`step.agent.role` 直接参照に
3. **Phase 3: Config schema 統一と migration 実装**
   - `src/config/schema.ts`: 新 schema 定義、旧 schema → 新 schema migration
   - `src/config/getAgentId.ts`: legacy fallback を削除（新 schema 直引きのみ）
   - ConfigStore / port interface 整備
4. **Phase 4: init.ts の AgentRegistry + AgentSyncer ベース刷新**
   - `src/cli/init.ts`: 既存の per-Agent 単発ロジックを削除し、AgentRegistry + AgentSyncer.syncAll() を呼ぶ形に
   - 旧 schema を持つテストフィクスチャを新 schema 出力に直す
5. **Phase 5: 既存テストの更新と新規テスト追加**
   - 214 テストの中で旧 schema / `config.agent.*` を直接読むものを新 schema に書き換える
   - test-case-generator の must シナリオに対応する新規ユニットテストを追加（migration / AgentSyncer / AgentRegistry）
6. **Phase 6: 受け入れ基準の検証**
   - `bun test` 全 PASS（regression 0）
   - `specrunner init` を 2 回連続実行して config 差分なし（true idempotent）
   - 旧 schema config を入力に migration → init 完了を確認
   - spec-review が専用 Agent ID で動くことを確認

**Rollback strategy**: 本 request は単一 PR として merge することを想定。問題が発生した場合は merge を revert すれば PR #26 状態に戻る。schema migration は idempotent だが、新 schema を旧 schema に逆変換するコードは持たない（消費者が specrunner 単体のため、`specrunner init` 再実行で新形に戻せばよい）。

## Resolved Questions

- [x] `AgentCapabilities` の `network` / `gitWrite` フィールドは予約席のままで良いか？
  **(decision)** 予約席のままとする。本 request では型定義のみ置き、Phase 2 で実機反映する。挙動には影響しない。

- [x] `SyncResult` の中身（per-role の create/update/no-op アクション種別）はどこまで露出させるか？
  **(decision)** rollback ロジックに必要な per-role の action 種別（`no-op` / `create` / `update`）は SyncResult に必須。CLI の log 出力（`specrunner init` の完了メッセージ）では per-role の action 種別を表示する（tasks.md 7.6）。秘密情報（apiKey 等）は含めない。

- [x] `ConfigStore.load()` で migration を起動するか、明示的な `migrate()` メソッドを置くか？
  **(decision)** `load()` で起動する。`migrate()` は public API として公開しない。`load()` → `save()` の通常フローで自動 migration する設計（D7 に明記）。

- [x] spec-review 専用 Agent の system prompt は誰が書くか？
  **(decision)** 本 request の実装スコープに含める。`SpecReviewStep` が `agent.system` として所有する。tasks.md 5.3-5.4 で実装者が新規に起こす。

- [x] `AnthropicClient` port の API 粒度（4 メソッドのみで足りるか）？
  **(decision)** `createAgent` / `retrieveAgent` / `updateAgent` / `archiveAgent` の 4 メソッドのみとする。`listAgents` は本 request のスコープでは不要。`SessionClient` port は別途既存のものを維持する。
