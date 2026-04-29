# Spec Review Result: 2026-04-29-d4-d6-agent-migration — Iteration 1

## Verdict

- **verdict**: needs-fix
- **score**: 6.55 / 10.0 (pass threshold: 7.0)
- **iteration**: 1 / 2
- **trend**: — (初回)
- **agents**: architect, spec-reviewer (refactoring 軽量構成 / security-reviewer・pattern-reviewer は enabled-absent でスキップ)
- **retries**: 0/2
- **blocking_findings**: CRITICAL: 0, HIGH: 2

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 6 | 0.30 | 1.80 |
| consistency | 6 | 0.25 | 1.50 |
| feasibility | 7 | 0.20 | 1.40 |
| security | 7 | 0.15 | 1.05 |
| maintainability | 8 | 0.10 | 0.80 |
| **Total** | | | **6.55** |

### カテゴリの観点

| Category | 評価観点 | 主担当エージェント |
|----------|---------|-----------------|
| completeness | 要件の網羅性、受け入れ基準の充足、仕様の漏れ | spec-reviewer |
| consistency | 既存 spec との整合性、後方互換性、用語統一 | spec-reviewer, architect |
| feasibility | 実現可能性、依存関係、工数見積の妥当性 | architect |
| security | 認証・認可、入力検証、脅威モデル（spec レベル） | security-reviewer (skipped) |
| maintainability | 仕様の明確性、将来の拡張容易性、アンチパターン回避 | architect, pattern-reviewer (skipped) |

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | consistency | openspec/changes/2026-04-29-d4-d6-agent-migration/specs/agent-definition-ownership/spec.md / cli-config-store/spec.md | `AgentDefinition.role: StepName` と config キー `Record<StepName, AgentRecord>` の `StepName` 型定義と canonical 形（kebab-case `"spec-review"` / `"spec-fixer"`）が delta spec に明記されていない。既存 `AgentRole = "propose" \| "specFixer" \| "specReview"`（camelCase / src/config/getAgentId.ts:4）と新形 kebab-case の対応が migration の暗黙仕様になっており、cli-config-store の "中間 schema → 新 schema" Scenario が「キーが正規形（kebab-case）になる」とだけ書いている。実装者が camelCase 残置 / 二重キーを生む可能性が高い。 | (a) `agent-definition-ownership/spec.md` に Requirement を追加: `StepName` は kebab-case 文字列 literal union（`"propose" \| "spec-review" \| "spec-fixer"` 等）であり、Step.name と一致する。(b) `cli-config-store/spec.md` の migration Scenario に「中間 schema の `specFixer` / `specReview` キーは MUST `"spec-fixer"` / `"spec-review"` に正規化される」を明記。(c) 旧 `AgentRole` 型は MUST 削除されることを REMOVED Requirement に列挙。 |
| 2 | HIGH | completeness | openspec/changes/2026-04-29-d4-d6-agent-migration/specs/agent-definition-ownership/spec.md | `ToolSpec[]` 型の定義場所・ownership・SDK 型との関係が delta spec で未指定。tasks.md 1.1 は「既存型を再 export または import」と表現が緩く、core が SDK 具象型を漏らすか否かが曖昧。design.md D6 のモジュール配置表にも `ToolSpec` が無い。 | (a) `agent-definition-ownership/spec.md` に Requirement を追加: `ToolSpec` は `src/core/agent/definition.ts` または `src/core/tools/types.ts` の core 側で定義される interface であり、`@anthropic-ai/sdk` の型を直接 re-export してはならない（adapter で SDK 型へ map する）。(b) Scenario「propose の register_branch は ToolSpec として宣言され、SDK 型に依存しない」を追加。(c) design.md D6 の placement 表に ToolSpec を 1 行追加。 |
| 3 | MEDIUM | consistency | openspec/changes/2026-04-29-d4-d6-agent-migration/design.md / module-analysis.md §4a | `AgentSyncer` の配置が design.md D6（`src/core/agent/syncer.ts`、port 経由）と module-analysis.md §4a（`src/adapter/anthropic/agent-syncer.ts`、port 不要案）で食い違っている。tasks.md 3.1 は core 側を採用しているが、却下経緯が design.md に明文化されていない。 | design.md D6 または D3 の Rationale に「module-analysis が adapter 配置を提案したが、port `AnthropicClient` 経由で SDK 依存を分離するため core/agent/ に置く」を 2-3 行で追記。または module-analysis.md §4a に "decision-deferred → final: core/agent/" の注記を追加。 |
| 4 | MEDIUM | completeness | openspec/changes/2026-04-29-d4-d6-agent-migration/specs/cli-config-store/spec.md | 既存 `SpecRunnerConfig.specReview` / `specFixer`（top-level の `pollIntervalMs` / `timeoutMs`）の扱いが新 schema 仕様で未言及。`agents.{specReview,specFixer}` を kebab-case にする一方、top-level config block の camelCase キーは保持されるか migrate されるか不明。executor.ts:904-912 の `getTimeoutMs` 経路に影響。 | cli-config-store/spec.md に明示: (a) 新 schema は top-level `specReview` / `specFixer` block を `"spec-review"` / `"spec-fixer"` キーに統一する、または (b) timeout config は別軸として維持する。どちらかを Requirement として記述し、Scenario を 1 件追加。 |
| 5 | MEDIUM | completeness | openspec/changes/2026-04-29-d4-d6-agent-migration/specs/agent-definition-ownership/spec.md / agent-environment-bootstrap/spec.md | spec-review 専用 Agent の system prompt の **内容契約** が未指定。design.md D5 / tasks.md 5.4 が「spec-review 用 system prompt を新規に起こす」とだけ言うが、最低限の制約（read-only である、`spec-review-result-{NNN}.md` 出力契約、tools 空、severity / verdict フォーマット参照）が delta spec に書かれていない。実装者が任意に書ける状態。 | `agent-definition-ownership/spec.md` に Requirement を追加: spec-review Agent の system prompt は MUST (a) `.claude/rules/review-standards.md` の verdict / severity 規約を参照する、(b) tools = [] の前提で動作する、(c) 出力ファイルパス契約（`<request-path>/spec-review-result-{NNN}.md`）を含む。または design.md にこれを記述し spec を簡潔に保つ。 |
| 6 | MEDIUM | consistency | openspec/changes/2026-04-29-d4-d6-agent-migration/specs/agent-environment-bootstrap/spec.md / step-execution-architecture/spec.md | 既存 `agent-environment-bootstrap` の post-init 不変条件 (f)「`config.agent.id` も propose Agent の ID と同期した値で書かれている（旧形式互換）」が delta で明示的に REMOVED されておらず、MODIFIED 全文置換による暗黙削除になっている。design.md D9 では「REMOVED」と宣言している。 | agent-environment-bootstrap/spec.md の `## REMOVED Requirements` セクションに `Requirement: config.agent.id を propose Agent ID と同期する（旧形式互換）` を明示追加し、Reason: 互換シム廃止 / Migration: ConfigStore.load → save で自動変換 と書く。 |
| 7 | MEDIUM | completeness | openspec/changes/2026-04-29-d4-d6-agent-migration/specs/agent-definition-ownership/spec.md / step-execution-architecture/spec.md | Tool spec（`agent.tools: ToolSpec[]`）と Tool handler（`Step.toolHandlers?: Map`）の対応関係（不変条件）が未指定。propose は tools=[register_branch] / handlers={register_branch}、spec-review は tools=[] / handlers=?、spec-fixer は tools=[] / handlers=? の対応が暗黙。 | `agent-definition-ownership/spec.md` に Scenario / Requirement を追加: 「`agent.tools` の各 ToolSpec.name は MUST `Step.toolHandlers` に対応するエントリを持つ。`agent.tools = []` の Step は `toolHandlers` を省略してよい」 |
| 8 | MEDIUM | feasibility | openspec/changes/2026-04-29-d4-d6-agent-migration/design.md D7 | `ConfigStore.getAgentId(role): string` が同期メソッドだが、`load`/`save`/`upsertAgent` は async。`StepExecutor.execute` 内で sync 呼び出しが許される前提（load が事前完了済み）が delta spec に書かれていない。CLI lifecycle で「init 経路は load 後 sync 経路、run 経路は load → execute」が暗黙。 | design.md D7 または step-execution-architecture/spec.md に Requirement: 「`ConfigStore.getAgentId` は MUST in-memory cache から同期で値を返す。`StepExecutor` を生成する前に `ConfigStore.load()` が完了していなければならない」 を追加。 |
| 9 | MEDIUM | consistency | openspec/changes/2026-04-29-d4-d6-agent-migration/specs/agent-syncer/spec.md / agent-environment-bootstrap/spec.md | 「idempotent: 連続実行で差分なし」と「lastSyncedAt は no-op でも更新される」の整合性が不明瞭。agent-syncer の Scenario 「連続実行で差分なし」は「config ファイルは（lastSyncedAt の更新を除き）変化しない」と書く一方、agent-environment-bootstrap の「Scenario: 既存 Agent ID が有効（per-role）」は「config の各 agents[role] は変化しない（lastSyncedAt の更新を除く）」と並列に書いている。「API 呼び出しは no-op、ファイル書き込みは lastSyncedAt のみ更新」を統一表現に。 | agent-syncer/spec.md に Requirement または Note: 「idempotent の境界は Anthropic API 呼び出し（create/update が発生しない）に限定される。`lastSyncedAt` フィールドは no-op でも sync 実行時刻に更新されるため、ファイル diff は lastSyncedAt のみ発生する」 を追加。tasks 9.2 の検証文言と整合。 |
| 10 | LOW | maintainability | openspec/changes/2026-04-29-d4-d6-agent-migration/design.md Open Questions | Open Questions が 5 件残置。実装着手前に少なくとも `ConfigStore.load()` で migration 起動するか明示 `migrate()` か（重要度高）と AnthropicClient API 粒度（最小 4 メソッド）は確定が必要。 | design.md Open Questions の各項目に decision を 1 行追加（例: `(decision) load() で起動する。migrate() は public API として公開しない`）。または resolved-questions セクションに移して根拠を残す。 |
| 11 | LOW | consistency | openspec/changes/2026-04-29-d4-d6-agent-migration/specs/cli-config-store/spec.md | 新 schema の `version` が design.md では `version: number` と記述され、既存 `version: 1` の literal type からの緩和となっている。意図的か不明。 | `version: 1` literal を維持する旨を Requirement に明示するか、`version: number` で将来の bump 余地を残す旨を Rationale に書く。 |
| 12 | LOW | completeness | openspec/changes/2026-04-29-d4-d6-agent-migration/tasks.md §10 | Task 10.3 「archive スキルの責務、本 request では準備のみ」とあるが、3 つの新規 spec（`agent-registry`, `agent-syncer`, `agent-definition-ownership`）が `openspec validate` で正しく capability として認識されることの確認手順が無い。 | tasks 10.1 を細分化: `openspec validate` 出力で "ADDED capability: agent-registry / agent-syncer / agent-definition-ownership" の 3 行が出ることを確認、と具体化。 |
| 13 | LOW | feasibility | openspec/changes/2026-04-29-d4-d6-agent-migration/design.md D4 / tasks.md §4 | Migration ロジックの 6 ケース（新 / 中間 / 旧 / 両併存 / 未設定 / 片側欠損）は test-cases.md で must 宣言されるが、design.md の Migration テーブルには「両併存（中間 + 旧）」のみで「片側欠損 + 旧併存」のような複合ケースが未定義。 | design.md D4 の Migration テーブルに 1 行追加: `片側欠損 + 旧 agent 併存` → 旧 agent.id を agents.propose に詰め直し、欠けている spec-review/spec-fixer は次の syncAll で create。または「migration は (a) 旧 → propose 詰め直し、(b) 中間 → kebab-case 詰め直し、(c) 不足 role はそのまま欠損 を独立に適用する。3 操作は順序非依存」と原則を書く。 |

## Iteration Comparison

（初回のため記載なし）

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.55 | needs-fix | 初回レビュー |

## Convergence

- **trend**: —（初回）
- **recommendation**: continue（spec-fixer で HIGH 2 件 + MEDIUM 6 件を中心に修正 → iteration 2）

### 停滞検出ルール

- `plateaued` (前回との差が ±0.3 以内) が **2 iteration 連続** した場合、`verdict` を `escalation` にする
- `regressing` (前回より 0.3 以上低下) が 1 回でも発生した場合、即 `escalation` を検討する

## Summary

ADR D4-D6 を delta spec / design に展開する作業として、骨格は良くまとまっている（特に AgentSyncer の rollback 境界 = create-only, update 不可逆扱いは正確）。一方で、(1) `StepName` 型定義と camelCase→kebab-case migration の正規化、(2) `ToolSpec` の所有権と SDK 型の漏れ防止、の 2 点は HIGH。これらを spec で fix しないと実装段階で「camelCase キーが残る」「SDK 型が core に漏れる」regression が起こる可能性が高い。MEDIUM 群はいずれも記述明確化（spec-review prompt 契約、ConfigStore lifecycle、idempotency の境界、REMOVED の明示化、Step.toolHandlers と agent.tools の対応関係）で、構造的な設計やり直しは不要。

**重点項目との整合**（pipeline-context emphasis: 振る舞い不変・既存テスト全 PASS・Step が AgentDefinition を所有する設計の明確性）:
- 振る舞い不変: 受け入れ基準と Phase 計画で明示されており、tasks 8.4 / 9.1 で検証される。問題なし。
- 既存 214 テスト全 PASS: tasks §5-8 で更新範囲が列挙されている。問題なし。
- Step が AgentDefinition を所有する設計の明確性: D1 / D8 / agent-definition-ownership delta で明確だが、`StepName` / `ToolSpec` の型ownership が未確定（Findings #1, #2）。これを潰せば設計の明確性は閾値を超える。

iteration 2 で HIGH 2 件 + MEDIUM 6 件を解消すれば approved 水準（>= 7.0）に到達する見込み。
