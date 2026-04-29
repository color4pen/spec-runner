## 1. Foundation: AgentDefinition / port / adapter

- [x] 1.1 `src/core/agent/definition.ts` を新規作成し、`AgentDefinition` / `AgentCapabilities` / `ToolSpec`（既存型を再 export または import）の型を定義する
- [x] 1.2 `src/core/agent/index.ts` に AgentDefinition / AgentCapabilities を export 追加（既存 index を確認の上）
- [x] 1.3 `src/core/port/anthropic-client.ts` を新規作成し、`AnthropicClient` interface（`createAgent` / `retrieveAgent` / `updateAgent` / `archiveAgent`）を定義する。SDK の具象型は import せず、core 用の型のみで API を表現する
- [x] 1.4 `src/core/port/config-store.ts` を新規作成し、`ConfigStore` interface（`load` / `save` / `getAgentId` / `upsertAgent`）を定義する
- [x] 1.5 `src/adapter/anthropic/anthropic-client.ts` を新規作成し、`AnthropicClient` port を Anthropic SDK の Agents API でラップする実装を書く
- [x] 1.6 `src/adapter/anthropic/index.ts` から AnthropicClient 実装を export する

## 2. AgentRegistry の実装

- [x] 2.1 `src/core/agent/registry.ts` を新規作成し、`AgentRegistry.fromSteps(steps)` / `get(role)` / `list()` / `hashOf(role)` を実装する
- [x] 2.2 `hashOf` の canonical JSON SHA-256 計算ヘルパを `src/core/agent/hash.ts` または `src/util/canonical-json.ts` に切り出す（既存ユーティリティがあれば再利用）
- [x] 2.3 `fromSteps` で重複 role を検出した場合に `Duplicate agent role: <role>` 例外を throw するロジックを実装する
- [x] 2.4 `tests/unit/agent/registry.test.ts` を新規作成し、`fromSteps` の集約・重複検出、`get` / `list` / `hashOf` の決定性、未登録 role の扱い、idempotency を検証する

## 3. AgentSyncer の実装

- [x] 3.1 `src/core/agent/syncer.ts` を新規作成し、`AgentSyncer` class を実装する。constructor で `AnthropicClient` / `AgentRegistry` / `ConfigStore` を受け取る
- [x] 3.2 `syncAll()` の per-role ロジックを実装する: retrieve → 比較 → create / update / no-op の分岐
- [x] 3.3 404 fallback（retrieve 404 → create）の経路を実装する
- [x] 3.4 部分失敗時の orphan rollback ロジックを実装する。**create のみ**を rollback 対象とし、update した既存 Agent は触らない
- [x] 3.5 `SyncResult` に per-role の action 種別（`no-op` / `create` / `update`）を含めるよう実装する
- [x] 3.6 rollback 中の archiveAgent 失敗時に stderr に warning を出して残りの rollback を継続する経路を実装する
- [x] 3.7 `tests/unit/agent/syncer.test.ts` を新規作成し、no-op / update / create / 404 fallback / 重複呼び出し（idempotent）を fake AnthropicClient + fake ConfigStore で検証する
- [x] 3.8 `tests/unit/agent/syncer-rollback.test.ts` を新規作成し、部分失敗 → create のみが rollback されるシナリオ、update した role が rollback されないシナリオ、rollback 中の archive 失敗継続シナリオを検証する

## 4. Config schema 統一と migration

- [x] 4.1 `src/config/schema.ts` を更新し、`SpecRunnerConfig` の `agents` を `Record<StepName, AgentRecord>` 型に変更する
- [x] 4.2 `SpecRunnerConfig` から旧 `agent` 単数フィールドを削除する
- [x] 4.3 Zod schema（または既存のバリデーション）を新形式に合わせて更新する
- [x] 4.4 `src/config/migrate.ts` を新規作成し、旧 schema → 新 schema、中間 schema → 新 schema、両併存、片側欠損、未設定の各ケースを扱う migration 関数を実装する
- [x] 4.5 `src/config/getAgentId.ts` を更新し、新 schema 直引きのみのロジックに変更する。propose の legacy fallback を削除する
- [x] 4.6 `src/store/config.ts`（または既存 ConfigStore 実装）を更新し、`load()` 内で migration を起動するよう変更する
- [x] 4.7 `save()` が新 schema のみを書き込むよう更新する（旧 `agent` フィールドや中間固定キーを書かない）
- [x] 4.8 `tests/unit/config/migrate.test.ts` を新規作成し、6 ケース（新形 / 中間形 / 旧形 / 両併存 / 未設定 / 片側欠損）の migration 結果を検証する
- [x] 4.9 既存の `tests/unit/config/*` を新 schema 形に更新する（旧 `agent` 単数を読み取るテストを修正）

## 5. Step が AgentDefinition を所有する形に書き換え

- [x] 5.1 `src/core/step/types.ts` の `Step.agent` 型を `{ agentId: string }` から `AgentDefinition` に変更する
- [x] 5.2 `src/core/step/propose.ts` を更新し、`agent: AgentDefinition` を class 内で宣言する（name / role / model / system / tools を埋める）。system prompt は既存 `buildProposeSystemPrompt` 由来、tools は既存 `register_branch` の ToolSpec を Step ファイル内から参照する
- [x] 5.3 `src/core/step/spec-review.ts` を更新し、spec-review 専用の `AgentDefinition` を埋める。`role: "spec-review"`、`system` は spec-review 専用の system prompt（新規に起こす）、`tools: []` または最小集合とする
- [x] 5.4 spec-review 用の system prompt 文字列を新規作成し、`src/prompts/spec-review.ts`（既存パスがあれば再利用）に置く。`SpecReviewStep` から直接 import して `agent.system` に渡す
- [x] 5.5 `src/core/step/spec-fixer.ts` を更新し、`agent: AgentDefinition` を埋める。`role: "spec-fixer"`、`system` は既存 `buildSpecFixerSystemPrompt` の戻り値、`tools: []`
- [x] 5.6 各 Step の `tests/unit/step/*.test.ts` を更新し、`step.agent` が完全な AgentDefinition であることを検証する
- [x] 5.7 `tests/unit/step/agent-definition.test.ts` を新規作成し、3 つの Step すべてが完全な AgentDefinition を持つこと、role が一意であること、各 system prompt が異なることを検証する

## 6. STEP_AGENT_ROLE 除去と StepExecutor 更新

- [x] 6.1 `src/core/step/executor.ts` から `STEP_AGENT_ROLE` Map と関連 import を削除する
- [x] 6.2 `StepExecutor` のコンストラクタに `ConfigStore` を追加し、`step.agent.role` から runtime agent ID を解決するロジックに置き換える
- [x] 6.3 `getAgentId(config, AgentRole)` の旧シグネチャを使う箇所を `configStore.getAgentId(step.agent.role)` に置換する
- [x] 6.4 `tests/unit/step/executor.test.ts` を更新し、`STEP_AGENT_ROLE` を介さず `step.agent.role` 経由で agent ID が解決されることを検証する。spec-review が propose Agent を流用しないシナリオを追加する
- [x] 6.5 grep で `STEP_AGENT_ROLE` の参照が src/ に残っていないことを CI または手動で確認する

## 7. specrunner init の刷新

- [x] 7.1 `src/cli/init.ts` の既存 per-Agent 単発ロジック（`init.ts:51-83` / `:107-119`）を削除する
- [x] 7.2 init.ts で Step 配列を組み立て、`AgentRegistry.fromSteps(steps)` を呼ぶ
- [x] 7.3 `AgentSyncer.syncAll()` を呼んで全 role を sync する
- [x] 7.4 SyncResult を ConfigStore に書き込む（`upsertAgent` または `save`）。Environment 作成・ロールバックロジックは既存を流用するが、新 schema 形で書き込むよう調整する
- [x] 7.5 init 全体での部分失敗時の orphan rollback 経路（Agent + Environment）を再構成する。AgentSyncer 内 rollback と Environment ロールバックの責務分担を明確化する
- [x] 7.6 `init` 完了時の log 出力を更新し、per-role の action 種別（create / update / no-op）を表示する。秘密情報（apiKey, accessToken）が出力されないことを確認する
- [x] 7.7 `tests/integration/cli/init.test.ts`（または既存パス）を更新し、6 ケースの migration を含む冪等性テストを追加する: 新規 init → 2 回目 init で差分なし、旧 schema 入力 → 新 schema 出力、404 fallback、orphan rollback、definitionHash drift 時の update

## 8. 既存テストの更新と除去

- [x] 8.1 `tests/` 配下で `config.agent.id`（旧 単数）を直接参照しているテストを grep で抽出し、新 schema 形に書き換える
- [x] 8.2 `tests/` 配下で `STEP_AGENT_ROLE` を参照しているテストを削除または書き換える
- [x] 8.3 `tests/` 配下で `getAgentId(config, "propose")` の legacy fallback を期待しているテストを更新し、未設定時に `CONFIG_INCOMPLETE` を throw することを期待するように変更する
- [x] 8.4 `bun test` を実行して 214 テスト全 PASS を確認する（regression 0）

## 9. 受け入れ基準の検証

- [x] 9.1 `bun test` で全テスト PASS を確認する
- [ ] 9.2 `specrunner init` を 2 回連続実行し、config の差分が `lastSyncedAt` のみであることを確認する（true idempotent）
- [ ] 9.3 旧 schema を持つ config フィクスチャを用意し、`specrunner init` 実行後に新 schema へ移行されることを手動確認する
- [ ] 9.4 `specrunner init` の出力で 3 つの独立した Anthropic Agent ID（propose / spec-review / spec-fixer）が config に書き込まれていることを確認する
- [ ] 9.5 `specrunner run` を起動し、propose / spec-review / spec-fixer の各 Step が独立した Agent ID で session を作成することを log で確認する（実機検証は self-hosting までは局所範囲のみ）
- [x] 9.6 grep で `STEP_AGENT_ROLE` / `config.agent.` / `config.agents.specReview`（中間固定キー）が src/ から消えていることを確認する
- [ ] 9.7 module-architect の事前分析結果（`module-analysis.md`）を design 段階で参照し、共通化候補が反映されていることを確認する
- [ ] 9.8 test-case-generator の must シナリオ（config migration 6 ケース、AgentSyncer 5 ケース、AgentRegistry 4 ケース、STEP_AGENT_ROLE 除去）が `test-cases.md` で宣言され、対応するユニットテストが存在することを確認する

## 10. ドキュメント・archive 準備

- [ ] 10.1 `openspec validate 2026-04-29-d4-d6-agent-migration` が PASS することを確認する。出力に以下の 3 行が含まれることを検証する:
  - `ADDED capability: agent-registry`
  - `ADDED capability: agent-syncer`
  - `ADDED capability: agent-definition-ownership`
- [ ] 10.2 PR 作成前に `openspec/changes/<slug>/` の全アーティファクト（proposal / design / specs / tasks）を最終確認する
- [ ] 10.3 archive 時に `openspec/specs/agent-registry/spec.md`、`openspec/specs/agent-syncer/spec.md`、`openspec/specs/agent-definition-ownership/spec.md` の 3 つが新規作成され、`step-execution-architecture` / `cli-config-store` / `agent-environment-bootstrap` が delta 適用されることを確認する（archive スキルの責務、本 request では準備のみ）
