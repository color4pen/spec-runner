# Module Analysis — 2026-04-29-d4-d6-agent-migration

**Scope**: mechanical axes only — testability, readability, cohesion, coupling, reusability, SRP. Out-of-scope: extensibility, deployment independence, security boundary, domain boundary.

---

## 1. 既存コードパターン一覧

### 1a. Step declaration pattern（PR #26 で確立）

- `src/core/step/propose.ts`, `src/core/step/spec-review.ts`, `src/core/step/spec-fixer.ts` の 3 ファイルが同一パターン: `const XxxStep: Step = { name, agent: { agentId: "" }, toolHandlers, buildMessage, resultFilePath, parseResult }`。
- `agent: { agentId: "" }` プレースホルダが 3 箇所で重複（`propose.ts:15-18`, `spec-review.ts:46-49`, `spec-fixer.ts:43-46`）。コメントも一字一句同じ「Agent ID resolved at runtime from config via deps」。

### 1b. Agent build / hash pattern

- `src/core/agent-definition.ts` に `buildAgentDefinition()` と `buildSpecFixerAgentDefinition()` が並存。形が同じ（name / model / system / tools のオブジェクトリテラルを返す）で、`AGENT_MODEL` を共有。
- `computeDefinitionHash()` は `canonicalJson` で正規化 → SHA-256 → `sha256:` prefix を付与する純粋関数。Step に依存しない。

### 1c. Per-role sync pattern（init.ts 内で 2 重に展開）

- `src/cli/init.ts:49-87`（propose 用 retrieve→hash 比較→update or create→404 fallback）と `src/cli/init.ts:89-124`（spec-fixer 用）が **構造的にコピー**。差分はログ文字列・変数名・`buildXxxAgentDefinition()` 呼び出しのみ。
- `createNewAgent()`（199-211）と `createNewSpecFixerAgent()`（213-225）も同じ構造のコピー。違いはログ文言だけ。

### 1d. Executor agent role lookup

- `src/core/step/executor.ts:23-27` の `STEP_AGENT_ROLE` ハードコード:
  ```
  "propose" → "propose"
  "spec-review" → "propose"  ← 流用
  "spec-fixer" → "specFixer"
  ```
- 同一マップが executor.ts 内で 2 回参照される（line 119 = propose-style path, line 631 = polling-style path）。

### 1e. Config role naming inconsistency

- 旧 schema: `agent` (legacy 単数) / 新 schema: `agents.{propose, specFixer, specReview}` (camelCase の固定キー)。
- Step.name は kebab-case（`spec-review` / `spec-fixer`）、AgentRole は camelCase（`specReview` / `specFixer`）。命名軸が 2 系統存在する（`getAgentId.ts:4`）。

---

## 2. 共通化すべき箇所と理由

| # | 対象 | 軸 | 観測根拠 | 推奨 |
|---|------|-----|---------|------|
| 1 | `init.ts:49-87` (propose) と `init.ts:89-124` (spec-fixer) の sync ロジック | **reusability** | 構造同型のコピー 2 ブロック。Step が増えるたびに同型のコピーが追加される | per-role の `syncOne(role, agentDef, existingRecord) → AgentSyncOutcome` を `core/agent/agent-syncer.ts` に抽出。`syncAll(registry, config)` がそれを Step ごとに呼ぶ |
| 2 | `init.ts:199-211` `createNewAgent` と `213-225` `createNewSpecFixerAgent` | **reusability / SRP** | 中身が同一（差はログのみ）。1 関数が「Agent 作成 + ログ出力」を兼ねる | ログを呼び出し側に出し、`createAgent(client, def)` 1 本に統合。同関数は既に `src/sdk/agents.ts:11` に存在するため、init.ts のラッパは削除可能 |
| 3 | `propose.ts:15-18` / `spec-review.ts:46-49` / `spec-fixer.ts:43-46` の `agent: { agentId: "" }` プレースホルダ | **cohesion / SRP** | Step の責務は「prompt / tools / 入出力契約の宣言」。空 agentId は宣言ではなく runtime resolution の予約席 | `Step.agent` を完全な `AgentDefinition`（name / model / system / tools / capabilities）にする。agentId は config から AgentRegistry が解決するため Step.agent から消える |
| 4 | `agent-definition.ts:13-26` `buildAgentDefinition` と `32-44` `buildSpecFixerAgentDefinition` | **cohesion** | 「Step の Agent 設定」が Step と別ファイルに分離されている。Step 数 × 1 の同型関数が増殖する構造 | プロンプト文字列は引き続き `prompts/` に置き、Agent 設定オブジェクトは Step ファイル内に移管。`agent-definition.ts` は `canonicalJson` / `computeDefinitionHash` のみ残す（→ `core/agent/hash.ts` へ移動推奨） |
| 5 | `executor.ts:23-27` `STEP_AGENT_ROLE` map | **coupling** | StepExecutor が「Step 名 → role 名」変換を抱える＝Step 追加のたびに executor.ts を編集する逆向き依存 | Step.agent.agentId を直接参照。ハードコード map 削除。executor は Step 名も role 名も知らない |
| 6 | `getAgentId.ts:16-34` の fallback chain（`agents[role].id` → legacy `agent.id` → throw） | **SRP** | 「config schema の正規化」と「agentId 取得」が同一関数に同居。spec-review が propose にフォールバックするのは hardcode | Schema migration を `config/migration.ts`（新規）に分離。`getAgentId` は migrated config 前提で `cfg.agents[stepName].agentId` のみ |
| 7 | `init.ts:53-54` の `existingConfig.agents?.propose?.id ?? existingConfig.agent?.id` パターン | **readability / coupling** | 旧 `agent` / 新 `agents` の二重参照が呼び出し側に漏れている。同型の `?? existingConfig.agent?.…` が 2 行 | Migration step を init.ts の冒頭で 1 回実行（旧→新に正規化してから sync）。下流コードは新 schema のみを見る |
| 8 | `executor.ts:904-912` `getTimeoutMs(stepName, config)` の hardcode（`spec-review` / `spec-fixer` のみ） | **coupling** | Step 名と config キーの対応が executor 内に hardcode | Step interface に `timeoutMs?: number` または `getTimeoutMs(config)` を持たせる（本 request の必須ではないが、同じ「executor が Step 名を知る」反パターンの一例として記録） |

---

## 3. 既存ヘルパー / ユーティリティの活用候補

| ヘルパー | 場所 | D4-D6 での活用先 |
|---------|------|----------------|
| `computeDefinitionHash` / `canonicalJson` | `src/core/agent-definition.ts:50-73` | AgentRegistry.hashOf() の実装本体。そのまま再利用できる。ファイルを `core/agent/hash.ts` に移すだけで残りは流用 |
| `createAgent` / `retrieveAgent` / `updateAgent` | `src/sdk/agents.ts:11-37` | AgentSyncer の per-role 操作の primitive。AgentSyncer はこの 3 関数を組み合わせるだけで成立する（404 catch + 新規 create も既存の throw を捕まえるパターンで済む） |
| `client.beta.agents.archive` | `init.ts:152` で既に使用 | orphan rollback の primitive。`src/sdk/agents.ts` に `archiveAgent(client, agentId)` を追加すれば、AgentSyncer は SDK 直叩きを避けられる（現在 init.ts:152 だけが SDK を直叩きしている例外箇所） |
| `atomicWriteJson` + `saveConfig` | `src/config/store.ts:60-63` | Config 永続化はそのまま使える。Migration 結果を新 schema で書き戻すだけ |
| `SpecRunnerError` + `ERROR_CODES` | `src/errors.ts` (`getAgentId.ts:29-33` で利用) | AgentSyncer の orphan rollback 失敗・404 fallback 確定時のエラーを既存の error code 体系に乗せる |
| `SessionClient` port (port/session-client.ts) | `src/core/port/session-client.ts` | StepExecutor が agent を解決するときの参照経路は変わらない。port は touch しなくて良い |

---

## 4. 分割単位の推奨（モジュール / ファイル / 関数）

### 4a. モジュール配置（natural home）

| 新設物 | 配置 | 軸 | 根拠 |
|--------|------|-----|------|
| `AgentDefinition` 型（拡張版: name/model/system/tools/capabilities） | `src/core/step/types.ts`（既存ファイル拡張） | **cohesion** | Step interface と同居が自然。Step が own する型なので step/ 内部に閉じる |
| `AgentRegistry` | `src/core/agent/agent-registry.ts`（新設） | **SRP / cohesion** | 「Step 群から AgentDefinition を集約する pure な集約点」。Anthropic SDK に依存しない＝core/ 配下が正しい。`fromSteps` / `get` / `list` / `hashOf` の 4 メソッドのみ |
| `computeDefinitionHash` / `canonicalJson` | `src/core/agent/hash.ts`（移動） | **cohesion** | AgentRegistry.hashOf の実装。core/agent/ 内部にまとめる |
| `AgentSyncer` | `src/adapter/anthropic/agent-syncer.ts`（新設） | **coupling 方向** | Anthropic SDK を呼ぶトランザクション境界。port `SessionClient` と同じレイヤ。core/ から adapter/ への依存方向（core が定義した AgentRegistry を adapter が消費）を維持 |
| `AgentSyncer` の port interface（任意） | `src/core/port/agent-syncer.ts`（任意新設） | **testability** | AgentSyncer をモック可能にしたい場合のみ port 化。ただし init.ts からしか呼ばれない単一消費者であり、過剰設計の可能性。**実装側の判断に委ねる** |
| Config schema migration | `src/config/migration.ts`（新設） | **SRP** | `migrateLegacyAgents(raw): SpecRunnerConfig` を pure 関数として分離。`loadConfig` 直後 / `runInit` 冒頭で呼ばれる単一責任モジュール |

**判断の根拠**:

- AgentRegistry を `core/agent/` に置くか `core/step/` に置くかは迷いどころ。Step に依存するが Step に内包されないため、`core/agent/` の方が SRP が明確。tests も `tests/core/agent/` に置けて並列性が出る。
- AgentSyncer を `core/agent/` に置く案も検討したが、`@anthropic-ai/sdk` を直接呼ぶ責務（retrieve / create / update / archive）を持つ以上、`adapter/anthropic/` が ADR-module-architecture-style と一致する。`core/agent/agent-syncer-port.ts` で interface を切り、`adapter/anthropic/agent-syncer.ts` で実装する 2 ファイル構成が最も clean だが、消費者が init.ts 単独なら過剰。

### 4b. ファイル単位の関数分割

| 関数 | 現状 | 推奨 | 軸 |
|------|------|-----|-----|
| `runInit` (init.ts:21-197, ~177行) | 「API key 取得 / config load / agent build / propose sync / spec-fixer sync / env sync / config save」を 1 関数に直列展開 | (1) `loadOrInitConfig`, (2) `buildRegistry(steps)`, (3) `syncer.syncAll(registry, config)`, (4) `syncEnvironment`, (5) `saveConfig` の 5 段に分解。各段は <30 行 | **readability / SRP** |
| `runProposeStyleStep` (executor.ts:110-404, ~294行) と `runPollingStyleStep` (executor.ts:622-899, ~277行) | session lifecycle 2 種類が executor 内に並列展開 | 本 request のスコープでは agentId 解決部分のみ Step.agent から直接読むよう変更。残りの分割は別 request 推奨 | **maintainability**（本 request では小さく済ます） |

### 4c. テスト境界（影響範囲）

既存テストへの影響を grep ベースで推定:

| 対象 | 影響範囲 |
|------|---------|
| `tests/cli/init.test.ts`（推定存在） | **HIGH** — sync ロジック全面刷新で再書き換え必須。新規に AgentSyncer 単体テスト（404 fallback / orphan rollback / definitionHash mismatch / idempotent）が must |
| `tests/config/getAgentId.test.ts`（推定存在） | **MEDIUM** — fallback chain 撤去で test ケース簡素化。migration 後は単純 lookup |
| `tests/core/step/executor.test.ts`（推定存在） | **HIGH** — `STEP_AGENT_ROLE` 撤去により Step.agent からの読み取りに変更。テストの Step mock に agent.agentId を埋める変更が広範に発生 |
| `tests/core/step/{propose,spec-review,spec-fixer}.test.ts` | **LOW-MEDIUM** — Step.agent の shape が変わるが、Step インターフェース仕様テストの追加で済む可能性 |
| `tests/config/schema.test.ts` | **MEDIUM** — Migration 関数のテスト追加。旧 schema 入力 → 新 schema 出力の boundary cases が test-case-generator must list と整合 |
| Integration tests（`tests/integration/*` あれば） | **LOW** — 振る舞い不変が満たされる限り regression なし。既存 fixture で PASS すべき |

合計影響テストファイル数の推定: **6-10 ファイル**。Step.agent shape 変更は mock 経由で広く波及する可能性があるため、変更前に grep `agent: { agentId` を全 tests に対して走らせ、影響箇所を確定させてから実装に入ること。

---

## Top 共通化候補（Summary）

最も波及効果が大きい 3 件:

1. **AgentSyncer の per-role 抽出** — init.ts 内で 2 倍に展開された retrieve/hash/update/404 fallback ロジックを `syncOne(role, def, record)` の 1 本に集約。Step 増に対する init.ts の編集コストを **線形 → ゼロ** にする。
2. **Step.agent を完全な AgentDefinition に拡張 + STEP_AGENT_ROLE 削除** — `agent: { agentId: "" }` の 3 箇所のプレースホルダと executor のハードコード map を同時に解消。Step 自体が prompt / model / tools を所有することで、`buildAgentDefinition` 系の別ファイル管理が不要になる（cohesion / coupling 両軸で改善）。
3. **Config migration を `config/migration.ts` に切り出し** — 旧 `agent` / 中間 `agents.{propose,specFixer,specReview}` を新 `agents: Record<StepName, AgentRecord>` に正規化する純粋関数を init.ts 冒頭で 1 回実行。下流（getAgentId, AgentSyncer, runInit body）は新 schema 前提で書け、二重参照（`?? existingConfig.agent?.id`）が消える。

---

## Notes

- Out-of-scope 軸（extensibility / deployment independence / security boundary / domain boundary）に踏み込む推奨は出していない。
- `AgentSyncer` を port 化するか直接 `adapter/anthropic/` に置くかは消費者数（現状 init.ts のみ）と将来予測の判断。本分析では「過剰設計の可能性あり」と記録に留め、実装者の裁量に委ねる。
