# D4-D6: Agent migration（Step 所有の AgentDefinition + per-role AgentSyncer + config schema 統一）

## Meta

- **type**: refactoring
- **date**: 2026-04-29
- **author**: color4pen
- **depends-on**: openspec-workflow/requests/merged/2026-04-29-step-abstraction-refactor（PR #26 で merge 済み D1-D9）

## ワークフローオプション

- **enabled**:
  - module-architect
  - test-case-generator

## 背景

PR #26 で `ADR-20260429-step-and-agent-class-architecture` の D1-D9（Step interface / StepExecutor / Pipeline state machine / EventBus / JobStateStore / StepRun[] / Tool 同居）まで実装済み。残る D4-D6 は Agent 関連と config schema migration であり、ADR の D10 で「後続 request」として明示的に分離された決定事項。

現状の課題:

1. **Step が AgentDefinition を所有していない**。`Step.agent` は `{ agentId: "" }` のプレースホルダのみで、Agent の prompt / tools / model は init.ts で別管理されている。Step interface の本来の意図（Step が prompt と tools を所有する）が未実装。

2. **AgentRegistry が存在しない**。Step 群から AgentDefinition を集約する純粋な集約点が無く、init.ts:51-83 が直接 Anthropic API を叩いている。

3. **AgentSyncer のトランザクション境界が無い**。per-role の retrieve/create/update/404 fallback、部分失敗時の orphan rollback が未実装。definitionHash による drift 検出も Agent 単位で per-role に動かない。

4. **Config schema の二重管理**。旧スキーマ `agent: {id, definitionHash, lastSyncedAt}` と新スキーマ `agents.{propose,specReview,specFixer}` が併存しており、Step を増やすたびに schema 拡張が必要。`agents: Record<StepName, ...>` の統一マップへ移行する必要がある。

5. **`STEP_AGENT_ROLE` のハードコード（src/core/step/executor.ts:23-27）が PR #22 で表面化した system prompt 矛盾の温床**。spec-review が propose Agent を再利用している状態が構造的に解消されていない（同一 Agent を異なる role で使うと system prompt と user message が矛盾する）。

これらは累積的に「Step を増やすコスト」を上げており、後続 request（implementer / verification / code-review / PR 作成 step）の実装前に解消する必要がある。

## 目的

D4-D6 の決定文を実装に落とし、以下を達成する:

1. **Step が AgentDefinition を完全に所有する**: Step.agent を `{ name, model, system, tools, capabilities }` の完全な AgentDefinition に拡張する。
2. **AgentRegistry を介した集約**: Step 群から AgentDefinition を収集する純粋な集約点を新設し、init.ts の責務を「Registry を組み立てる」に縮小する。
3. **AgentSyncer によるトランザクション境界**: per-role の sync ロジック（retrieve/create/update/404 fallback、orphan rollback、definitionHash 比較）を明示的なドメインオブジェクトとして実装する。
4. **Config schema の統一**: `agents: Record<StepName, AgentRecord>` の単一マップに移行し、Step 追加時の schema 拡張コストをゼロにする。
5. **STEP_AGENT_ROLE ハードコード除去**: StepExecutor が Step.agent を直接参照する形へ。spec-review の propose Agent 流用を構造的に解消する。

これにより、後続 request での Step 追加（implementer / verification / code-review）が「Step class を 1 つ追加するだけ」で完結する。

## 対象範囲

- **src/core/step/**: Step interface 拡張（Step.agent を AgentDefinition 化）、AgentRegistry 新設、StepExecutor の STEP_AGENT_ROLE 削除
- **src/core/agent/**（新設または拡張）: AgentDefinition 型、AgentSyncer、definitionHash ロジック
- **src/adapter/anthropic/**（新設または拡張）: AgentSyncer から呼ばれる Anthropic API クライアントの per-role wrapper
- **src/cli/init.ts**: AgentRegistry + AgentSyncer を使う実装に全面刷新（既存の単発 Agent sync ロジックを per-role 化）
- **src/core/config/**: Config schema 定義（旧 `agent` / `agents.{propose,specReview,specFixer}` から `agents: Record<StepName, ...>` への型定義変更と migration ロジック）
- **既存 Step 実装**: propose / spec-review / spec-fixer の各 Step に AgentDefinition を埋め込む（system prompt / model / tools を Step 内で宣言）
- **テスト**: 上記モジュールのユニットテスト + config migration の境界条件テスト

## 振る舞い不変の確認方法

外部から見た振る舞いが変わらないこと（CLI コマンドの結果が同じ）を以下で確認する:

- **既存 214 テスト全 PASS**: ユニット + integration の現行テストが 1 件も regression を起こさないこと
- **specrunner CLI コマンドの挙動維持**:
  - `specrunner init`: 旧 schema → 新 schema migration を含む idempotent な per-role agent 作成・更新
  - `specrunner login`: 認証フローの変更なし
  - `specrunner run`: Pipeline 実行が D1-D9 と同じ DAG で動くこと
  - `specrunner ps`: state file の読み取りが新 schema 互換であること
- **module-architect の事前分析**: 既存コードを testability / cohesion / coupling / SRP 軸で分析し、共通化候補を列挙してから設計する
- **test-case-generator による境界条件網羅**: config migration の must シナリオ（旧 schema 読み込み、片側欠損、orphan rollback、definitionHash mismatch、404 fallback）をテストケースとして宣言し、実装でカバーする

## 要件

1. **Step interface 拡張**: `Step.agent` を完全な `AgentDefinition`（`name` / `model` / `system` / `tools` / `capabilities`）に拡張する。現状の `{ agentId: "" }` プレースホルダを削除する。

2. **AgentDefinition の所有権**: 各 Step（propose / spec-review / spec-fixer）が自身の system prompt / model / tools を Step class 内で宣言する。プロンプト文字列は Step に同居させる（D7 と一貫した「Step に prompt と tools を同居させる」原則）。

3. **AgentRegistry の新設**: Step 群から AgentDefinition を集約する純粋な集約点。最小 API:
   - `fromSteps(steps: Step[]): AgentRegistry`
   - `get(role: string): AgentDefinition | undefined`
   - `list(): AgentDefinition[]`
   - `hashOf(role: string): string`（definitionHash 計算）
   - state を持たない pure な集約。Anthropic API は呼ばない。

4. **AgentSyncer の実装**: per-role の sync ロジックを担うトランザクション境界。最小 API:
   - `syncAll(registry: AgentRegistry, config: Config): SyncResult`
   - per-role に retrieve（既存 agentId） → 比較（definitionHash）→ create or update → 404 fallback（agentId 残存だが Agent 削除済の場合は再作成）
   - 部分失敗時の orphan rollback（途中で作成された Agent を削除して config を一貫状態に戻す）
   - drift 検出（definitionHash 不一致時に update を発火）

5. **Config schema migration**:
   - 旧 schema（`agent: {id, definitionHash, lastSyncedAt}` および `agents.{propose,specReview,specFixer}`）から新 schema（`agents: Record<StepName, {agentId, definitionHash, lastSyncedAt}>`）への移行。
   - 互換シムは不要（消費者は specrunner 単体）。`specrunner init` 実行時に旧 schema を検出して新 schema に書き換える。
   - 旧 schema が存在しない（新規 init）場合は新 schema で初期化する。

6. **specrunner init の刷新**:
   - AgentRegistry を Step 群から組み立てる
   - AgentSyncer.syncAll() を呼んで全 Agent を idempotent に sync する
   - 結果を新 schema の `agents` マップに永続化する
   - 既存の 214 テストが PASS すること

7. **STEP_AGENT_ROLE 除去**:
   - `src/core/step/executor.ts:23-27` のハードコードを削除する
   - StepExecutor は Step.agent から agentId を直接参照する
   - spec-review が propose Agent を流用している状態を解消し、専用 Agent に分離する

## 受け入れ基準

- [ ] 既存 214 テストが全て PASS する（regression 0 件）
- [ ] `specrunner init` が旧 schema → 新 schema migration を idempotent に実行する
- [ ] `specrunner init` を 2 回実行して差分が出ない（true idempotent）
- [ ] `specrunner run` で propose / spec-review / spec-fixer の各 Step が独立した Agent を使って実行される
- [ ] spec-review 専用 Agent が作成され、propose Agent との system prompt 矛盾が構造的に解消されている
- [ ] AgentSyncer の部分失敗時に orphan rollback が動作する（途中で作成された Agent が削除され、config が一貫状態に戻る）
- [ ] AgentSyncer の definitionHash 比較で drift が検出された場合に update が発火する
- [ ] 404 fallback（agentId が config に残るが Agent 削除済）で再作成が走る
- [ ] STEP_AGENT_ROLE のハードコードが src/core/step/executor.ts から完全に削除されている
- [ ] config schema migration の境界条件（旧 schema 読み込み、片側欠損、orphan rollback、definitionHash mismatch、404 fallback）が test-case-generator の must シナリオとして宣言され、対応するユニットテストが PASS する
- [ ] module-architect の事前分析結果（共通化候補・抽象化機会）が design 段階で参照されている

## スコープ外

以下は本 request の対象外。後続 request で扱う:

- **implementer / verification / code-review / PR 作成 step の追加**: 後続 request。本 request は「これらが追加可能な土台」を整える
- **E2E 実機検証**: self-hosting 完成までまとめて保留（ユーザー方針による）
- **Web UI / cost ledger / observability subscriber**: ADR の他セクションに分離されており、本 request では扱わない

## 補足

### Managed Agents SDK の制約（必読）

本 request の設計判断は、Managed Agents SDK（Anthropic API の Agent / Session 機能）の以下の制約に基づく:

- **`SessionCreateParams` は `system` 上書きをサポートしない**: Session 作成時に system prompt を差し替えることはできない。system prompt は Agent 作成時に固定される。
- **Agent の system prompt / tools / model は Agent バージョンに固定**: 一度作成した Agent の system / tools / model を変更すると新バージョンが作られ、definitionHash が変わる。
- **同一 Agent を異なる role で使い回すと system prompt と user message が矛盾する**: PR #22 で実際に発生した問題。spec-review に propose Agent を流用すると、Agent の system prompt は「propose 用」のまま、user message は「spec-review 用」となり、Agent の振る舞いが破綻する。
- **Custom Tool は Agent レベルで定義され、role-specific に出し分け不可**: 同一 Agent を異なる role で使うと、不要な Tool が露出する（例: spec-review に propose 用の Tool が見える）。

→ **設計上の帰結**: Step ごとに独立した Agent を持つ前提で設計する。spec-review は現在 propose Agent を流用しているが、本 request で専用 Agent に分離する（D6 の `agents: Record<StepName, ...>` 統一マップ化と一貫）。

### 参照 ADR

- `openspec-workflow/adr/ADR-20260429-step-and-agent-class-architecture.md` — D4-D6 の決定文と却下案。本 request の根拠
- `openspec-workflow/adr/ADR-20260429-module-architecture-style.md` — `core/agent/`, `core/port/`, `adapter/anthropic/` の境界。AgentRegistry / AgentSyncer の配置方針
- `openspec-workflow/adr/ADR-20260429-positioning-vs-gsd-and-openspec.md` — fresh-per-task の構造的価値。本 request の最終目標（Step を増やすコストをゼロに近づける）

### 参照コード（PR #26 で merge 済み）

- `src/core/step/types.ts` — Step interface の定義（Step.agent プレースホルダ）
- `src/core/step/executor.ts:23-27` — STEP_AGENT_ROLE ハードコード（除去対象）
- `src/cli/init.ts:51-83` — 既存の Agent sync ロジック（per-role 化対象）
- `src/core/config/` — Config schema 定義（migration 対象）

### test-case-generator が網羅すべき must シナリオ（参考）

config migration の境界条件:
- 旧 schema（`agent` 単数 + `agents.{propose,specReview,specFixer}` 併存）から新 schema への migration
- `agent` のみ存在する古い config の migration
- `agents` のみ存在する中間 config の migration
- 新規 config（どちらも存在しない）の初期化
- 片側欠損（`agents.specReview` のみ存在）の補完

AgentSyncer の境界条件:
- definitionHash 一致 → no-op
- definitionHash 不一致 → update
- agentId が config にあるが Anthropic 側で削除済（404）→ create
- 複数 Agent の sync 中に途中で失敗 → orphan rollback で全削除
- idempotent: 2 回連続実行で差分なし
