# Test Cases: 2026-04-29-d4-d6-agent-migration

## Summary

- **Total**: 56 cases
- **Automated** (unit/integration/e2e): 48
- **Manual**: 8
- **Priority**: must: 32, should: 17, could: 7

## Test Cases

---

### TC-001: 旧 schema（agent 単数のみ）→ agents.propose に migration される

**Category**: unit
**Priority**: must
**Source**: design.md D4, cli-config-store spec.md "旧 schema（agent 単数のみ）→ 新 schema migration"

**GIVEN** config ファイルが `{ "agent": { "id": "agent_01x", "definitionHash": "abc", "lastSyncedAt": "2026-04-29T00:00:00Z" } }` のみを持つ
**WHEN** `ConfigStore.load()` を呼ぶ
**THEN** in-memory の `config.agents.propose` が `{ agentId: "agent_01x", definitionHash: "abc", lastSyncedAt: "2026-04-29T00:00:00Z" }` で詰め直される
**AND** `config.agent` は in-memory 表現に含まれない
**AND** `config.agents["spec-review"]` および `config.agents["spec-fixer"]` は未定義のままである

---

### TC-002: 中間 schema（agents.specFixer / agents.specReview camelCase）→ kebab-case に正規化される

**Category**: unit
**Priority**: must
**Source**: design.md D4, cli-config-store spec.md "中間 schema（agents.specReview / agents.specFixer など固定キー）→ 新 schema migration"

**GIVEN** config ファイルが `{ "agents": { "propose": {...}, "specFixer": { "agentId": "agent_03z", "definitionHash": "xyz", "lastSyncedAt": "2026-04-29T00:00:00Z" } } }` の固定キー形である
**WHEN** `ConfigStore.load()` を呼ぶ
**THEN** in-memory の `config.agents["spec-fixer"]` が `{ agentId: "agent_03z", definitionHash: "xyz", lastSyncedAt: "2026-04-29T00:00:00Z" }` で存在する
**AND** `config.agents` に camelCase キー（`specFixer`）は存在しない
**AND** `config.agents["propose"]` は変換なしでそのまま存在する

---

### TC-003: 中間 schema（agents.specReview camelCase）→ "spec-review" に正規化される

**Category**: unit
**Priority**: must
**Source**: cli-config-store spec.md 正規化ルール

**GIVEN** config ファイルが `{ "agents": { "specReview": { "agentId": "agent_02y", "definitionHash": "def", "lastSyncedAt": "2026-04-29T00:00:00Z" } } }` を持つ
**WHEN** `ConfigStore.load()` を呼ぶ
**THEN** in-memory の `config.agents["spec-review"]` が `{ agentId: "agent_02y", ... }` で存在する
**AND** `config.agents["specReview"]` は存在しない

---

### TC-004: 旧 schema と中間 schema の両方が併存 → 中間 schema が採用される

**Category**: unit
**Priority**: must
**Source**: design.md D4 "両方併存（旧 + 中間）", cli-config-store spec.md "旧 schema と中間 schema の両方が併存"

**GIVEN** config ファイルが `{ "agent": { "id": "agent_old", ... }, "agents": { "propose": { "agentId": "agent_new", ... } } }` の両方を持つ
**WHEN** `ConfigStore.load()` を呼ぶ
**THEN** `config.agents.propose.agentId` は `"agent_new"`（`agents.propose` が採用）
**AND** `config.agent` の `"agent_old"` は読み捨てられる

---

### TC-005: 片側欠損（agents.propose のみ存在、spec-review / spec-fixer 未設定）→ 不足分は空のまま

**Category**: unit
**Priority**: must
**Source**: design.md D4 "片側欠損", cli-config-store spec.md "片側欠損"

**GIVEN** config ファイルが `{ "agents": { "propose": { "agentId": "agent_01x", ... } } }` のみを持つ
**WHEN** `ConfigStore.load()` を呼ぶ
**THEN** in-memory の `config.agents` は `propose` のみを持つ
**AND** `config.agents["spec-review"]` および `config.agents["spec-fixer"]` は未定義のままである
**AND** エラーは throw されない

---

### TC-006: 片側欠損 + 旧 agent 併存（agent.id + agents.specFixer のみ、agents.propose なし）→ 3 操作が独立に適用される

**Category**: unit
**Priority**: must
**Source**: design.md D4 "片側欠損 + 旧 agent 併存", 3 操作の独立性原則

**GIVEN** config ファイルが `{ "agent": { "id": "agent_old", "definitionHash": "abc", "lastSyncedAt": "..." }, "agents": { "specFixer": { "agentId": "agent_03z", "definitionHash": "xyz", "lastSyncedAt": "..." } } }` を持つ
**WHEN** `ConfigStore.load()` を呼ぶ
**THEN** `config.agents["propose"].agentId` が `"agent_old"` である（旧 `agent.id` → `agents.propose` に詰め直し）
**AND** `config.agents["spec-fixer"].agentId` が `"agent_03z"` である（`specFixer` → `"spec-fixer"` にキー正規化）
**AND** `config.agents["spec-review"]` は未定義のままである（次の `syncAll` で新規作成される）

---

### TC-007: どちらも未設定（新規 init）→ agents: {} で初期化される

**Category**: unit
**Priority**: must
**Source**: design.md D4 "どちらも未設定", cli-config-store spec.md "どちらも未設定（新規 init）"

**GIVEN** config ファイルが `agents` も `agent` も持たない（または config ファイル自体が存在しない）
**WHEN** `ConfigStore.load()` を呼ぶ（または初期化する）
**THEN** in-memory の `config.agents` は `{}`（空オブジェクト）で初期化される
**AND** エラーは throw されない

---

### TC-008: 新 schema は migration が発生しない（no-op）

**Category**: unit
**Priority**: must
**Source**: cli-config-store spec.md "新 schema は no-op"

**GIVEN** config ファイルが既に新 schema（`agents: { "propose": {...}, "spec-review": {...}, "spec-fixer": {...} }`）の形である
**WHEN** `ConfigStore.load()` を呼ぶ
**THEN** in-memory 表現はファイル内容と等価であり、変換は発生しない
**AND** `load()` を 2 回呼んでも同じ結果が返る

---

### TC-009: ConfigStore.save() は新 schema のみを書き込む（旧 agent フィールドなし）

**Category**: unit
**Priority**: must
**Source**: cli-config-store spec.md "save 後の永続表現"

**GIVEN** in-memory config が `config.agents = { propose: {...}, "spec-review": {...} }` を持つ
**WHEN** `ConfigStore.save(config)` を呼ぶ
**THEN** ファイルには `agents: Record<StepName, AgentRecord>` 形のみが書き込まれる
**AND** `agent`（旧形）フィールドは出力 JSON に存在しない
**AND** camelCase キー（`specReview`, `specFixer`）はファイルに現れない
**AND** ファイルパーミッションは 0600 である

---

### TC-010: top-level timeout config（specFixer.timeoutMs）は migration 後も読める

**Category**: unit
**Priority**: must
**Source**: cli-config-store spec.md "top-level timeout config が migration 後も読める"

**GIVEN** config ファイルが `{ "agents": { "specFixer": { "agentId": "..." } }, "specFixer": { "timeoutMs": 30000 } }` を持つ
**WHEN** `ConfigStore.load()` を呼ぶ
**THEN** `config.agents["spec-fixer"]` が存在する（kebab-case 正規化）
**AND** top-level `config.specFixer.timeoutMs` は変更されずそのまま読める
**AND** `getTimeoutMs("spec-fixer", config)` が正しい値を返す

---

### TC-011: ConfigStore.getAgentId は load() 完了前の呼び出しを禁止する（同期前提の保証）

**Category**: unit
**Priority**: must
**Source**: design.md D7 "getAgentId の同期呼び出し前提"

**GIVEN** `ConfigStore.load()` が完了していない状態
**WHEN** `configStore.getAgentId("propose")` を呼ぶ
**THEN** `CONFIG_INCOMPLETE` または初期化未完了を示すエラーが throw される
**AND** 未初期化の状態で値を返さない

---

### TC-012: getAgentId は新 schema の直引きで値を返す（legacy fallback なし）

**Category**: unit
**Priority**: must
**Source**: cli-config-store spec.md "propose ロールの直引き", "legacy fallback の廃止"

**GIVEN** `config.agents.propose.agentId = "agent_01x"` が設定されている
**WHEN** `configStore.getAgentId("propose")` を呼ぶ
**THEN** `"agent_01x"` を返す

---

### TC-013: getAgentId は agents.propose が未設定の場合に CONFIG_INCOMPLETE を throw する

**Category**: unit
**Priority**: must
**Source**: cli-config-store spec.md "legacy fallback の廃止"

**GIVEN** `config.agents.propose` が未設定で、旧形式の `config.agent.id = "agent_01x"` のみ存在する（migration が走る前の生 JSON 状態）
**WHEN** `getAgentId(config, "propose")` を呼ぶ
**THEN** `CONFIG_INCOMPLETE` エラーを throw する
**AND** 旧形式の自動 fallback は発生しない

---

### TC-014: getAgentId は spec-fixer が未設定の場合に CONFIG_INCOMPLETE を throw する

**Category**: unit
**Priority**: must
**Source**: cli-config-store spec.md "spec-fixer ロールで legacy fallback は不可"

**GIVEN** `config.agents["spec-fixer"]` が未設定
**WHEN** `getAgentId(config, "spec-fixer")` を呼ぶ
**THEN** `CONFIG_INCOMPLETE` エラーを throw する

---

### TC-015: AgentSyncer は definitionHash 一致の場合に no-op となる

**Category**: unit
**Priority**: must
**Source**: design.md D3, agent-syncer spec.md "既存 Agent が definitionHash 一致 → no-op"

**GIVEN** config に `agents.propose.agentId = "agent_01x"` および `agents.propose.definitionHash = "abc123"` が存在
**AND** `AgentRegistry.hashOf("propose")` が `"abc123"` を返す
**AND** `client.retrieveAgent("agent_01x")` が成功する
**WHEN** `AgentSyncer.syncAll()` を呼ぶ
**THEN** `client.createAgent` も `client.updateAgent` も呼ばれない
**AND** SyncResult の propose role は `{ agentId: "agent_01x", definitionHash: "abc123" }` を保持し、action 種別は `no-op` である

---

### TC-016: AgentSyncer は definitionHash 不一致の場合に update を呼ぶ

**Category**: unit
**Priority**: must
**Source**: design.md D3, agent-syncer spec.md "既存 Agent が definitionHash 不一致 → update"

**GIVEN** config に `agents.propose.agentId = "agent_01x"` および `agents.propose.definitionHash = "old_hash"` が存在
**AND** `AgentRegistry.hashOf("propose")` が `"new_hash"` を返す
**AND** `client.retrieveAgent("agent_01x")` が成功する
**WHEN** `AgentSyncer.syncAll()` を呼ぶ
**THEN** `client.updateAgent("agent_01x", def)` が 1 回だけ呼ばれる
**AND** config の `agents.propose.definitionHash` が `"new_hash"` に更新される
**AND** `agents.propose.agentId` は変わらず `"agent_01x"` のままである
**AND** SyncResult の propose role の action 種別は `update` である

---

### TC-017: AgentSyncer は 404 の場合に create（fallback）を呼ぶ

**Category**: unit
**Priority**: must
**Source**: design.md D3, agent-syncer spec.md "agentId が config にあるが Anthropic 側で削除済（404 fallback）→ create"

**GIVEN** config に `agents.propose.agentId = "agent_01x"` が存在
**AND** `client.retrieveAgent("agent_01x")` が 404 を throw する
**WHEN** `AgentSyncer.syncAll()` を呼ぶ
**THEN** `client.createAgent(def)` が 1 回呼ばれ、新 ID `"agent_02y"` を返す
**AND** config の `agents.propose.agentId` が `"agent_02y"` に更新される
**AND** SyncResult の propose role の action 種別は `create` である

---

### TC-018: AgentSyncer は config に entry がない新規 role を create する

**Category**: unit
**Priority**: must
**Source**: agent-syncer spec.md "新規 role（config に entry なし）→ create"

**GIVEN** config の `agents` に `"spec-review"` キーが存在しない
**AND** AgentRegistry に `"spec-review"` の AgentDefinition が登録されている
**WHEN** `AgentSyncer.syncAll()` を呼ぶ
**THEN** `client.createAgent(def)` が呼ばれ、新 ID `"agent_03z"` を返す
**AND** config の `agents["spec-review"]` が `{ agentId: "agent_03z", definitionHash: <hash>, lastSyncedAt: <ISO8601> }` で書き込まれる

---

### TC-019: AgentSyncer は 2 回連続実行で Anthropic API の create / update を発生させない（idempotent）

**Category**: unit
**Priority**: must
**Source**: design.md D3, agent-syncer spec.md "連続実行で差分なし"

**GIVEN** 1 回目の `syncAll()` が全 role を create で完了している
**WHEN** 2 回目の `syncAll()` を呼ぶ
**THEN** 全 role に対して `client.retrieveAgent` のみが呼ばれる
**AND** `createAgent` / `updateAgent` は呼ばれない
**AND** config ファイルは（lastSyncedAt の更新を除き）変化しない

---

### TC-020: AgentSyncer は spec-fixer create 失敗時に propose と spec-review をロールバックする

**Category**: unit
**Priority**: must
**Source**: design.md D3, agent-syncer spec.md "spec-fixer の create 中に例外 → propose の create をロールバック"

**GIVEN** 1 回目の `syncAll()`、config の `agents` は空
**AND** `client.createAgent` の呼び出し順は propose（成功、ID `"agent_01x"`）→ spec-review（成功、ID `"agent_02y"`）→ spec-fixer（失敗、例外 throw）
**WHEN** `AgentSyncer.syncAll()` を呼ぶ
**THEN** 例外が再 throw される前に `client.archiveAgent("agent_01x")` および `client.archiveAgent("agent_02y")` が呼ばれる
**AND** config の `agents` は空のままである（部分書き込みされない）
**AND** 元の例外が再 throw される

---

### TC-021: AgentSyncer は update 済み Agent をロールバック対象にしない

**Category**: unit
**Priority**: must
**Source**: design.md D3, agent-syncer spec.md "update 中に例外 → update した Agent はロールバックされない"

**GIVEN** config に既存の `agents.propose.agentId = "agent_01x"` があり、definitionHash 不一致で update を実行する
**AND** `client.updateAgent("agent_01x", def)` が成功する
**AND** その後 `client.createAgent` で spec-review を作成中に例外が発生する
**WHEN** `AgentSyncer.syncAll()` を呼ぶ
**THEN** propose（update 済み）に対して `archiveAgent` は呼ばれない
**AND** spec-review が create 完了していれば `archiveAgent` でロールバックされる
**AND** 例外が再 throw される

---

### TC-022: AgentSyncer の rollback 中に archiveAgent が失敗しても残りのロールバックが継続する

**Category**: unit
**Priority**: must
**Source**: agent-syncer spec.md "rollback 中の archiveAgent も失敗"

**GIVEN** 部分失敗 → rollback 経路に入る
**AND** `client.archiveAgent("agent_01x")` が例外を throw する
**WHEN** rollback が走る
**THEN** stderr に `Failed to cleanup orphaned agent agent_01x; please archive manually.` を出力する
**AND** 残りの archive 対象に対する rollback は継続する
**AND** 元の例外（spec-fixer の create 失敗）が最終的に再 throw される

---

### TC-023: AgentSyncer は SyncResult で per-role の action 種別（no-op / create / update）を返す

**Category**: unit
**Priority**: must
**Source**: agent-syncer spec.md "SyncResult の action 種別"

**GIVEN** propose は no-op、spec-review は新規作成、spec-fixer は update のシナリオ
**WHEN** `syncAll()` を呼ぶ
**THEN** `SyncResult.results.get("propose").action === "no-op"`
**AND** `SyncResult.results.get("spec-review").action === "create"`
**AND** `SyncResult.results.get("spec-fixer").action === "update"`

---

### TC-024: AgentRegistry.fromSteps は 3 Step の AgentDefinition を集約する

**Category**: unit
**Priority**: must
**Source**: agent-registry spec.md "fromSteps が全 Step の AgentDefinition を集約する"

**GIVEN** propose / spec-review / spec-fixer の 3 Step がそれぞれ `role: "propose" | "spec-review" | "spec-fixer"` の AgentDefinition を持つ
**WHEN** `AgentRegistry.fromSteps([propose, specReview, specFixer])` を呼ぶ
**THEN** `registry.list().length === 3`
**AND** `registry.get("propose")` が ProposeStep の AgentDefinition を返す
**AND** `registry.get("spec-review")` が SpecReviewStep の AgentDefinition を返す
**AND** `registry.get("spec-fixer")` が SpecFixerStep の AgentDefinition を返す

---

### TC-025: AgentRegistry.fromSteps は重複 role の検出で例外を throw する

**Category**: unit
**Priority**: must
**Source**: agent-registry spec.md "重複 role は構築時例外になる"

**GIVEN** 2 つの Step が同じ `agent.role = "propose"` を持つ
**WHEN** `AgentRegistry.fromSteps([stepA, stepB])` を呼ぶ
**THEN** `Duplicate agent role: propose` を含むメッセージで例外が throw される
**AND** registry インスタンスは構築されない

---

### TC-026: AgentRegistry.get は未登録 role に対して undefined を返す

**Category**: unit
**Priority**: must
**Source**: agent-registry spec.md "未登録 role の get は undefined を返す"

**GIVEN** registry に `"propose"` のみ登録されている
**WHEN** `registry.get("implementer" as StepName)` を呼ぶ
**THEN** `undefined` を返す（例外を throw しない）

---

### TC-027: AgentRegistry.hashOf は同一 AgentDefinition に対して同じ 16 進文字列を返す

**Category**: unit
**Priority**: must
**Source**: agent-registry spec.md "hashOf の決定性"

**GIVEN** 同一の AgentDefinition を持つ 2 つの registry インスタンス
**WHEN** それぞれで `hashOf("propose")` を呼ぶ
**THEN** 同じ 16 進文字列を返す
**AND** 同じ registry で 2 回呼んでも同じ値を返す

---

### TC-028: AgentRegistry.hashOf は AgentDefinition の 1 文字差分に反応して異なるハッシュを返す

**Category**: unit
**Priority**: must
**Source**: agent-registry spec.md "hashOf は AgentDefinition の差分に反応する"

**GIVEN** 2 つの registry が同一 role の AgentDefinition を持つが、`system` 文字列の 1 文字だけ異なる
**WHEN** それぞれで `hashOf("propose")` を呼ぶ
**THEN** 異なる 16 進文字列を返す

---

### TC-029: AgentRegistry.hashOf は未登録 role に対して例外を throw する

**Category**: unit
**Priority**: must
**Source**: agent-registry spec.md "未登録 role の hashOf は例外"

**WHEN** registry に未登録の role に対して `hashOf("implementer" as StepName)` を呼ぶ
**THEN** `Unknown agent role: implementer` のメッセージで例外を throw する

---

### TC-030: StepExecutor は STEP_AGENT_ROLE を使わず step.agent.role で agent ID を解決する

**Category**: unit
**Priority**: must
**Source**: design.md D5, step-execution-architecture spec.md "STEP_AGENT_ROLE lookup is removed"

**GIVEN** `SpecReviewStep` インスタンスと `ConfigStore` が `config.agents["spec-review"].agentId = "agent_02y"` を保持している
**WHEN** `StepExecutor.execute(specReviewStep, state)` が agent ID を解決する
**THEN** `configStore.getAgentId(step.agent.role)` が呼ばれる（`step.agent.role === "spec-review"`）
**AND** `STEP_AGENT_ROLE` Map への参照は存在しない
**AND** 解決された agent ID は `"agent_02y"` である

---

### TC-031: spec-review Step が propose Agent の ID を使わない

**Category**: unit
**Priority**: must
**Source**: design.md D5, step-execution-architecture spec.md "spec-review session uses spec-review agent ID"

**GIVEN** `SpecReviewStep` インスタンスと `SpecRunnerConfig` が `config.agents["spec-review"].agentId = "agent_02y"` および `config.agents.propose.agentId = "agent_01x"` を保持している
**WHEN** `StepExecutor.execute(specReviewStep, state)` が agent ID を解決する
**THEN** 解決された agent ID は `config.agents["spec-review"].agentId`（`"agent_02y"`）である
**AND** 解決された ID は `config.agents.propose.agentId`（`"agent_01x"`）とは異なる

---

### TC-032: ProposeStep が完全な AgentDefinition を持つ

**Category**: unit
**Priority**: must
**Source**: agent-definition-ownership spec.md "ProposeStep が完全な AgentDefinition を持つ"

**GIVEN** `ProposeStep` のインスタンス
**WHEN** `step.agent` を参照する
**THEN** `name === "specrunner-propose"` および `role === "propose"` を満たす AgentDefinition が返る
**AND** `system` は空でない文字列である
**AND** `tools` は `register_branch` の ToolSpec を含む配列である
**AND** `step.agent.agentId` のようなプレースホルダフィールドは存在しない

---

### TC-033: SpecReviewStep が spec-review 専用の AgentDefinition を持つ

**Category**: unit
**Priority**: must
**Source**: agent-definition-ownership spec.md "SpecReviewStep が独自の AgentDefinition を持つ"

**GIVEN** `SpecReviewStep` のインスタンス
**WHEN** `step.agent` を参照する
**THEN** `role === "spec-review"`（kebab-case）を満たす AgentDefinition が返る
**AND** `system` は spec-review 専用の system prompt（ProposeStep の system とは別の文字列）である
**AND** `tools` は空配列または最小集合であり、`register_branch` を含まない
**AND** `step.name === step.agent.role === "spec-review"` が成立する

---

### TC-034: SpecFixerStep が独自の AgentDefinition を持ち tools = [] である

**Category**: unit
**Priority**: must
**Source**: agent-definition-ownership spec.md "SpecFixerStep が独自の AgentDefinition を持つ"

**GIVEN** `SpecFixerStep` のインスタンス
**WHEN** `step.agent` を参照する
**THEN** `role === "spec-fixer"` を満たす AgentDefinition が返る
**AND** `system` は spec-fixer 専用の system prompt である
**AND** `tools` は空配列である

---

### TC-035: spec-review system prompt は verdict / severity 規約を含む

**Category**: unit
**Priority**: must
**Source**: agent-definition-ownership spec.md "spec-review system prompt が verdict / severity 規約を含む"

**GIVEN** `SpecReviewStep.agent.system` の文字列
**WHEN** 内容を確認する
**THEN** `approved` / `needs-fix` / `escalation` の 3 値 verdict が明示されている
**AND** CRITICAL / HIGH / MEDIUM / LOW の severity 定義または参照が含まれている
**AND** 出力ファイルを `spec-review-result-{NNN}.md` へ書き込む契約が記述されている

---

### TC-036: ProposeStep の tools と toolHandlers が 1:1 対応している

**Category**: unit
**Priority**: must
**Source**: agent-definition-ownership spec.md "ProposeStep の tools と toolHandlers が対応している"

**GIVEN** `ProposeStep` のインスタンス
**WHEN** `step.agent.tools` と `step.toolHandlers` を確認する
**THEN** `step.agent.tools` に `{ name: "register_branch" }` を含む ToolSpec が存在する
**AND** `step.toolHandlers.get("register_branch")` が存在する（undefined でない）

---

### TC-037: SpecReviewStep は tools = [] のため toolHandlers を省略できる

**Category**: unit
**Priority**: must
**Source**: agent-definition-ownership spec.md "SpecReviewStep は tools = [] なので toolHandlers を省略できる"

**GIVEN** `SpecReviewStep` のインスタンス
**WHEN** `step.agent.tools` を確認する
**THEN** `step.agent.tools` は空配列である
**AND** `step.toolHandlers` は undefined または空 Map であってよい
**AND** 実行時に未処理の tool call が発生しない

---

### TC-038: specrunner init 実行で 3 つの独立した Agent が作成される（新規 init）

**Category**: integration
**Priority**: must
**Source**: agent-environment-bootstrap spec.md "新規 init で 3 つの独立 Agent が作成される"

**GIVEN** 新規環境（config ファイルが存在しない）
**WHEN** `specrunner init` を実行する（fake AnthropicClient で）
**THEN** Anthropic API 上に 3 つの独立した Agent が作成される
**AND** `config.agents.propose.agentId`、`config.agents["spec-review"].agentId`、`config.agents["spec-fixer"].agentId` の 3 つはすべて異なる文字列である

---

### TC-039: specrunner init は旧 schema config を migration して spec-review Agent を新規作成する

**Category**: integration
**Priority**: must
**Source**: agent-environment-bootstrap spec.md "旧 schema migration 後の spec-review Agent 作成"

**GIVEN** config に旧 `agent` 単数のみが存在し、spec-review 専用 Agent が未作成
**WHEN** `specrunner init` を実行する
**THEN** ConfigStore.load() が旧 schema を新 schema に詰め直す（`agents.propose` のみ）
**AND** AgentSyncer.syncAll() が `agents["spec-review"]` を新規作成する
**AND** init 完了後の config に `agents["spec-review"].agentId` が新 ID で書き込まれている

---

### TC-040: specrunner init は 2 回連続実行で差分が出ない（true idempotent）

**Category**: integration
**Priority**: must
**Source**: request.md 受け入れ基準, design.md D3

**GIVEN** 1 回目の `specrunner init` が全 role を create で完了し config が永続化されている
**WHEN** 2 回目の `specrunner init` を実行する
**THEN** Anthropic API に `createAgent` / `updateAgent` が呼ばれない
**AND** config ファイルの差分は `lastSyncedAt` フィールドのみである

---

### TC-041: specrunner init は propose の 404 fallback で propose のみ再作成する

**Category**: integration
**Priority**: must
**Source**: agent-environment-bootstrap spec.md "既存 ID が 404（per-role fallback）"

**GIVEN** config に `agents.propose.agentId = "agent_01x"` があり、`retrieveAgent` が 404 を返す
**AND** `agents["spec-review"]` および `agents["spec-fixer"]` の retrieveAgent は成功する
**WHEN** `specrunner init` を実行する
**THEN** propose に対してのみ `createAgent` が呼ばれ、新 ID が `config.agents.propose.agentId` に書き込まれる
**AND** spec-review / spec-fixer の agentId は変化しない

---

### TC-042: specrunner init の spec-fixer create 失敗で propose / spec-review もロールバックされる

**Category**: integration
**Priority**: must
**Source**: agent-environment-bootstrap spec.md "spec-fixer Agent 作成失敗で propose / spec-review もロールバック"

**WHEN** propose Agent と spec-review Agent の `createAgent` は成功したが、spec-fixer Agent の `createAgent` が失敗する
**THEN** propose と spec-review に対して `archiveAgent` を呼ぶ
**AND** いずれの新規 ID も config に書き込まれない（init 失敗時は config を更新しない）
**AND** init は exit code 1 で終了する

---

### TC-043: spec-fixer Agent create 成功後に Environment 作成が失敗した場合は全 Agent をロールバックする

**Category**: integration
**Priority**: must
**Source**: agent-environment-bootstrap spec.md "Environment 作成失敗で全 Agent ロールバック"

**WHEN** 全 Agent の `createAgent` は成功したが Environment 作成が失敗する
**THEN** すべての新規作成 Agent に対して `archiveAgent` を呼ぶ
**AND** いずれの新規 ID も config に書き込まれない
**AND** init は exit code 1 で終了する

---

### TC-044: 既存 214 テストが全件 PASS する（振る舞い不変）

**Category**: integration
**Priority**: must
**Source**: request.md 受け入れ基準 "既存 214 テストが全て PASS"

**GIVEN** D4-D6 実装完了後の codebase
**WHEN** `bun test` を実行する
**THEN** 全テストが PASS する（regression 0 件）
**AND** 新規追加テストも含めて 0 件の FAIL が発生しない

---

### TC-045: AgentRegistry.list の冪等性（複数回呼び出しで同一結果）

**Category**: unit
**Priority**: should
**Source**: agent-registry spec.md "list の冪等性"

**GIVEN** registry が構築済み
**WHEN** `registry.list()` を 2 回呼ぶ
**THEN** 戻り値は等価な配列（要素が同じ AgentDefinition）であり、registry の内部状態は変化しない

---

### TC-046: 4 つ目の Step 追加で registry / config / syncer が無編集で動く

**Category**: unit
**Priority**: should
**Source**: agent-registry spec.md "4 つ目の Step 追加で他モジュールが無編集"

**GIVEN** 既存の 3 Step（propose / spec-review / spec-fixer）が動く registry
**WHEN** 4 つ目の Step `ImplementerStep`（`role: "implementer"`）を steps 配列に push し、`AgentRegistry.fromSteps(steps)` で再構築する
**THEN** registry は 4 つの AgentDefinition を保持する
**AND** `AgentRegistry` クラス自体のソースコードは変更不要である
**AND** Config schema 型定義（`agents: Record<StepName, AgentRecord>`）は変更不要である
**AND** `AgentSyncer.syncAll()` の実装は変更不要で 4 role を sync する

---

### TC-047: AgentDefinition.role は StepName と同一値（kebab-case）を持つ

**Category**: unit
**Priority**: should
**Source**: agent-definition-ownership spec.md "AgentDefinition.role は StepName と一致する"

**GIVEN** `SpecReviewStep` のインスタンス
**WHEN** `step.agent.role` を参照する
**THEN** 値は `"spec-review"`（kebab-case）であり、`step.name` と等しい
**AND** `"specReview"`（camelCase）ではない

---

### TC-048: 旧 AgentRole 型（camelCase）は削除されている

**Category**: unit
**Priority**: should
**Source**: agent-definition-ownership spec.md "旧 AgentRole 型は削除されている"

**GIVEN** `src/config/getAgentId.ts`（または旧 AgentRole 定義ファイル）
**WHEN** コードを grep する
**THEN** `AgentRole` 型宣言（`"propose" | "specFixer" | "specReview"` の camelCase 列挙）の参照が src/ に存在しない

---

### TC-049: ProposeStep の register_branch ToolSpec は SDK 型に依存しない core 型である

**Category**: unit
**Priority**: should
**Source**: agent-definition-ownership spec.md "propose の register_branch は ToolSpec として宣言され、SDK 型に依存しない"

**GIVEN** `ProposeStep` の `agent.tools` 配列
**WHEN** `agent.tools[0]`（`register_branch`）の型を確認する
**THEN** 型は `ToolSpec`（core で定義された interface）であり、`@anthropic-ai/sdk` の import から派生した型ではない
**AND** `adapter/anthropic/` のコードが `ToolSpec` → SDK の `Tool` 型へ変換する責務を持つ

---

### TC-050: core 側コードが @anthropic-ai/sdk を直接 import しない

**Category**: unit
**Priority**: should
**Source**: agent-definition-ownership spec.md "core 側コードが SDK 型を import しない"

**GIVEN** `src/core/` 配下の全ファイル
**WHEN** `@anthropic-ai/sdk` の import 文を grep する
**THEN** `@anthropic-ai/sdk` の直接 import が存在しない
**AND** `ToolSpec` の定義は core 側のみに存在する

---

### TC-051: Step ファイル単独で agent 定義が完結する（self-contained）

**Category**: unit
**Priority**: should
**Source**: agent-definition-ownership spec.md "Step ファイル単独で agent 定義が完結する"

**GIVEN** `src/core/step/propose.ts` のソースコード
**WHEN** ファイルを開く
**THEN** `AgentDefinition` の `name` / `role` / `model` / `system` / `tools` のいずれもが、このファイル内（あるいはファイルから直接 import している箇所）で参照可能である
**AND** prompts/ や tools/ の登録を grep して辿る必要がない

---

### TC-052: AgentCapabilities 型が network / gitWrite のオプショナルフィールドを持つ

**Category**: unit
**Priority**: should
**Source**: agent-definition-ownership spec.md "AgentCapabilities の型定義"

**GIVEN** `src/core/agent/definition.ts`
**WHEN** `AgentCapabilities` 型を確認する
**THEN** `network?: boolean` および `gitWrite?: boolean` を含む interface である
**AND** いずれのフィールドも `readonly` である
**AND** Step の AgentDefinition でこのフィールドを設定しても、本 request の挙動（Agent 作成・session 作成）には影響を与えない

---

### TC-053: StepExecutor のライフサイクルイベントが順序通りに発火する

**Category**: unit
**Priority**: should
**Source**: step-execution-architecture spec.md "Lifecycle events fire in order"

**GIVEN** 正常に完了する step
**WHEN** `StepExecutor.execute(step, state)` を実行する
**THEN** `step:start` → `verdict:parsed` → `step:complete` の順でイベントが発火する
**AND** `step:error` イベントは発火しない

---

### TC-054: StepExecutor のエラーパスが step:error を発火し例外を装飾して再 throw する

**Category**: unit
**Priority**: should
**Source**: step-execution-architecture spec.md "Error path emits step:error and decorates exception"

**WHEN** step lifecycle 中に例外が発生する
**THEN** `step:error` が error payload とともに発火する
**AND** 例外は `err.state` フィールドを付けて上流に伝播する

---

### TC-055: AnthropicClient fake を AgentSyncer に注入してユニットテストができる

**Category**: unit
**Priority**: should
**Source**: agent-syncer spec.md "テストでは fake AnthropicClient を注入できる"

**GIVEN** in-memory な fake AnthropicClient（create / retrieve / update / archive を Map で実装）
**WHEN** AgentSyncer に fake を注入して `syncAll()` を呼ぶ
**THEN** 実 SDK や HTTP リクエストを発生させず、シナリオを完全にユニットテストできる

---

### TC-056: ConfigStore migration は不正 JSON で CONFIG_INVALID を throw する

**Category**: unit
**Priority**: should
**Source**: design.md D4 "Migration の境界条件"

**GIVEN** config ファイルが不正な JSON（例: `{ broken json` ）を持つ
**WHEN** `ConfigStore.load()` を呼ぶ
**THEN** `CONFIG_INVALID` エラーが throw される
**AND** init は exit code 1 で停止する

---

### TC-057: version フィールドが未知の値の場合に CONFIG_INVALID を throw する

**Category**: unit
**Priority**: should
**Source**: cli-config-store spec.md "`version` は現在値 1 のみ有効"

**GIVEN** config ファイルが `{ "version": 99, ... }` を持つ
**WHEN** `ConfigStore.load()` を呼ぶ
**THEN** `CONFIG_INCOMPLETE` または `CONFIG_INVALID` エラーを throw する
**AND** 未知の version 値を黙って処理しない

---

### TC-058: anthropic.apiKey が欠落している場合に CONFIG_INCOMPLETE を throw する

**Category**: unit
**Priority**: should
**Source**: cli-config-store spec.md "不完全な config（apiKey 欠落）"

**WHEN** config に `anthropic.apiKey` が無い
**THEN** 読み込み時に `CONFIG_INCOMPLETE` エラーを発生させ、`Run 'specrunner init' first.` を返す

---

### TC-059: config.agents["spec-review"] が未設定の場合に specrunner run が CONFIG_INCOMPLETE を返す

**Category**: integration
**Priority**: should
**Source**: cli-config-store spec.md "spec-review Agent ID 欠落"

**WHEN** `specrunner run` 実行時に `config.agents["spec-review"]` が未設定
**THEN** `CONFIG_INCOMPLETE` エラーで `Run 'specrunner init' to create the spec-review agent.` を返す

---

### TC-060: init 完了後の post-init 不変条件（a-e）がすべて満たされる

**Category**: integration
**Priority**: should
**Source**: agent-environment-bootstrap spec.md "post-init 検証"

**WHEN** init が exit code 0 で終了する
**THEN** AgentRegistry の全 role について `config.agents[role].agentId` が retrieve 可能
**AND** `config.environment.id` が retrieve 可能
**AND** propose Agent の `custom_tools` に `register_branch` が含まれ、`toolset.type` が `agent_toolset_20260401` である
**AND** spec-review Agent の `custom_tools` が空配列または最小集合（`register_branch` を含まない）
**AND** spec-fixer Agent の `custom_tools` が空配列である

---

### TC-061: propose の custom_tools に register_branch の文字列が ProposeStep ファイル以外に重複定義されていない

**Category**: unit
**Priority**: should
**Source**: agent-environment-bootstrap spec.md "定義の単一導出"

**WHEN** Agent 作成リクエストを構築する
**THEN** `custom_tools` の値は該当 Step の `step.agent.tools` 由来である
**AND** コードを grep して `name: "register_branch"` の文字列が ProposeStep ファイル以外に存在しない

---

### TC-062: specrunner init cleanup も失敗した場合に stderr に警告を出して exit code 1 で終了する

**Category**: integration
**Priority**: should
**Source**: agent-environment-bootstrap spec.md "cleanup も失敗"

**WHEN** 部分失敗 → cleanup 経路に入り、`archiveAgent` の一部が失敗する
**THEN** stderr に `Failed to cleanup orphaned agent <id>; please archive manually.` を出力する
**AND** 残りの archive 対象に対する rollback は継続する
**AND** init 全体は exit code 1 で終了する

---

### TC-063: specrunner init の完了ログに per-role action 種別が表示され、秘密情報が含まれない

**Category**: manual
**Priority**: should
**Source**: tasks.md 7.6

**GIVEN** `specrunner init` を実行する
**WHEN** 完了後の stdout を確認する
**THEN** propose / spec-review / spec-fixer それぞれの action 種別（create / update / no-op）が表示されている
**AND** apiKey、accessToken などの秘密情報がログに含まれない

---

### TC-064: STEP_AGENT_ROLE のシンボルが src/ に残存しない

**Category**: manual
**Priority**: must
**Source**: tasks.md 6.5, step-execution-architecture spec.md "STEP_AGENT_ROLE lookup is removed"

**GIVEN** D4-D6 実装完了後の codebase
**WHEN** `grep -r "STEP_AGENT_ROLE" src/` を実行する
**THEN** 該当なし（0 件）

---

### TC-065: config.agent. / config.agents.specReview の中間固定キー参照が src/ に残存しない

**Category**: manual
**Priority**: must
**Source**: tasks.md 9.6

**GIVEN** D4-D6 実装完了後の codebase
**WHEN** `grep -r "config\.agent\." src/` および `grep -r "agents\.specReview" src/` を実行する
**THEN** 該当なし（0 件）

---

### TC-066: specrunner run が propose / spec-review / spec-fixer ごとに独立した session を作成する

**Category**: manual
**Priority**: should
**Source**: request.md 受け入れ基準 "specrunner run で各 Step が独立した Agent"

**GIVEN** D4-D6 実装後に `specrunner run` を起動する
**WHEN** ログを確認する
**THEN** propose / spec-review / spec-fixer の各 Step で異なる Agent ID で session が作成されていることがログに記録されている

---

### TC-067: 旧 schema config → specrunner init → 新 schema に書き換わる（手動検証）

**Category**: manual
**Priority**: must
**Source**: tasks.md 9.3

**GIVEN** 旧 schema を持つ config フィクスチャを用意する（`agent.id` のみ存在）
**WHEN** `specrunner init` を実行する
**THEN** config ファイルが新 schema（`agents: Record<StepName, AgentRecord>`）に書き換わっている
**AND** `config.agent` フィールドが消えている

---

### TC-068: specrunner init 後に 3 つの独立した Anthropic Agent ID が config に書き込まれる（手動検証）

**Category**: manual
**Priority**: must
**Source**: tasks.md 9.4

**GIVEN** 新規環境
**WHEN** `specrunner init` を実行する
**THEN** config に `agents.propose.agentId`、`config.agents["spec-review"].agentId`、`config.agents["spec-fixer"].agentId` の 3 つが書き込まれており、すべて異なる文字列である

---

### TC-069: ConfigStore.save は atomic write（tmp → rename）を使う

**Category**: unit
**Priority**: could
**Source**: cli-config-store spec.md "ConfigStore.save() は atomic に新 schema を書き込む", design.md D4 "migration の atomic write"

**GIVEN** `ConfigStore.save(config)` を呼ぶ
**WHEN** ファイルシステムの操作を観察する
**THEN** `<path>.tmp.<random>` への書き込み後に rename が行われる
**AND** rename 前にクラッシュした場合でも元のファイルが破損しない

---

### TC-070: AgentSyncer の fake AnthropicClient は Map ベースで状態管理できる

**Category**: unit
**Priority**: could
**Source**: agent-syncer spec.md "テストでは fake AnthropicClient を注入できる"

**GIVEN** in-memory fake AnthropicClient で create した Agent が Map に格納されている
**WHEN** 同じ ID で `retrieveAgent` を呼ぶ
**THEN** 作成時の definition が返る
**AND** archive した ID は retrieve 時に 404 を返す

---

### TC-071: hashOf の canonical JSON はキーがソートされ空白を含まない

**Category**: unit
**Priority**: could
**Source**: agent-registry spec.md "AgentRegistry.hashOf は canonical JSON SHA-256 を返す"

**GIVEN** AgentDefinition を持つ registry
**WHEN** `hashOf(role)` を呼ぶ
**THEN** 内部で計算される JSON 文字列はキーがアルファベット昇順にソートされている
**AND** スペースや改行を含まない compact 形式である
**AND** 返値は小文字の 16 進文字列（SHA-256 は 64 文字）である

---

### TC-072: spec-review system prompt の tools=[] 前提が守られる（Custom Tool 呼び出しが不要）

**Category**: unit
**Priority**: could
**Source**: agent-definition-ownership spec.md spec-review Agent の system prompt 契約 "(b) tools = [] の前提で動作"

**GIVEN** `SpecReviewStep.agent.system` の文字列
**WHEN** 内容を確認する
**THEN** system prompt の中に Custom Tool（`register_branch` 等）の呼び出し手順が記述されていない
**AND** tools=[] の read-only 想定で文章が構成されている

---

### TC-073: AgentSyncer の syncAll がロールを処理する順序を確認する（propose → spec-review → spec-fixer）

**Category**: unit
**Priority**: could
**Source**: design.md D3 rollback ロジックの前提

**GIVEN** fake AnthropicClient を用いた AgentSyncer
**WHEN** `syncAll()` が全 role を create する
**THEN** SyncResult に全 3 role（propose / spec-review / spec-fixer）の結果が含まれる
**AND** rollback ロジックが「この syncAll で create したもの」のみを対象にしている

---

### TC-074: openspec validate が 3 つの ADDED capability を出力する（ドキュメント検証）

**Category**: manual
**Priority**: could
**Source**: tasks.md 10.1

**WHEN** `openspec validate 2026-04-29-d4-d6-agent-migration` を実行する
**THEN** 出力に `ADDED capability: agent-registry` が含まれる
**AND** 出力に `ADDED capability: agent-syncer` が含まれる
**AND** 出力に `ADDED capability: agent-definition-ownership` が含まれる
