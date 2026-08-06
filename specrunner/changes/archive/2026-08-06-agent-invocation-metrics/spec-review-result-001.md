# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読み込んだ spec ファイル

- `specrunner/changes/agent-invocation-metrics/request.md`（要件・受け入れ基準）
- `specrunner/changes/agent-invocation-metrics/design.md`（7 つの設計決定 D1〜D8）
- `specrunner/changes/agent-invocation-metrics/spec.md`（Requirement + Scenario 形式の振る舞い仕様）
- `specrunner/changes/agent-invocation-metrics/tasks.md`（T-01〜T-07、依存順明示）

### 参照した実コード

| ファイル | 確認内容 |
|---|---|
| `src/core/usage/types.ts` | `CommandInvocation` 現行フィールド（metrics なし）の確認 |
| `src/core/port/agent-runner.ts` | `AgentRunResult` 現行フィールド・`AgentInvocationMetrics` 未存在の確認 |
| `src/adapter/claude-code/agent-runner.ts` | SDKResultSuccess ローカル型、success/error 抽出箇所（:810-844）、baseResult 構築（:1029-1041）、follow-up ループ（:854-989）の実コード |
| `src/adapter/claude-code/query-one-shot.ts` | `QueryOneShotResult`・`turnCount` placeholder・modelUsage 抽出箇所（:174-197）の確認 |
| `src/adapter/shared/follow-up.ts` | `mergeFollowUpResult` の実装（`...baseResult` spread で全フィールド保持）の確認 |
| `src/core/step/commit-orchestrator.ts` | `StepExecutionResult` 定義（:56-93）・`applySuccessPostPersistEffects` の gate（:230）の確認 |
| `src/core/step/executor.ts` | agent step success 構築（:508-521）— `invocationMetrics` 未連携を確認 |
| `src/core/command/job-stats.ts` | `JobStatRow`・`deriveRunStat`・`renderJobStatsTable`・`renderJobStatsJson` の現行実装 |
| `src/core/command/usage-show.ts` | 現行 invocation 行出力（:41-63）の確認 |
| `src/core/usage/store.ts` | `readUsageFile`（寛容パーサ）・`appendInvocation` の実装 |

### 要件 ↔ 設計対応の確認

| 要件（request.md） | 設計決定 | 確認結果 |
|---|---|---|
| R1: CommandInvocation に 4 optional フィールド追加 | D1 | ✅ flat 4 フィールド + doc comment で満たす |
| R2: local runtime success/error 双方で抽出 | D2 | ✅ extractInvocationMetrics ヘルパで両 subtype に対応 |
| R3: one-shot 経路でも同 4 値を取り出す | D4 | ✅ turnCount placeholder を numTurns に置換する旨を明記 |
| R4: appendInvocation 呼び出し側で metrics を渡す | D3 | ✅ spread でフィールド省略/有を制御（gate 変更なし） |
| R5: usage show が metrics を表示 | D5 | ✅ 存在時のみ追記、欠落エントリでも例外なし |
| R6: job stats が実測 cost 優先、costBasis で判別 | D6 | ✅ invocation 単位で実測優先・試算フォールバック、二重計上防止ロジック明示 |
| R7: job stats が turn 数総和を報告 | D7 | ✅ numTurns を持つ invocation のみ加算、ゼロ件は null |
| R8: legacy usage.json が後方互換 | D3 + readUsageFile | ✅ 現行 readUsageFile が `commandInvocations` 配列チェックのみの寛容パーサで保証済み |

### spec.md シナリオの確認

全 14 シナリオが要件・設計と整合していることを確認した。error subtype のシナリオ（"返り値の invocation metrics に 4 値が載る"）は persistence ではなく adapter 戻り値の検証であり、D3 との矛盾なし。

### AC #10（既存テスト無変更 green）の保全分析

- TC-JSTATS-024（JSON row exact-key）：手書きリテラルを使用するため JSON.stringify で `turns`/`costBasis` が出力されず、既存 exact-key チェック `["convergence","costUsd","date","durationSec","outcome","slug"]` が維持される（D8）。
- TC-JSTATS-025（summary exact-key）：summary schema を変えないため影響なし（D8）。
- TC-JSTATS-020/021/022（table）：列追加は `toContain`・ダッシュ数 `>= 3` の条件を壊さない（D8）。
- TC-USG-01〜06（store tests）：`toMatchObject` ベースで exact-key 検査なし、影響なし。
- query-one-shot "turnCount is undefined" テスト：placeholder 撤去に伴う **更新対象**（T-03 で明示）。AC #10 の保全対象外（usage/job-stats テスト外）のため許容される。

### mergeFollowUpResult の保全確認

`src/adapter/shared/follow-up.ts` の `mergeFollowUpResult` は `{ ...baseResult, resultContent }` spread を使う。`baseResult` に `invocationMetrics` が追加された場合、spread で自動的に保持される。T-02 の「follow-up マージ後も metrics が保持される」という主張はコードで確認済み。

### セキュリティ確認

- metrics の流入元は SDK の result message（trusted local process output）であり、ユーザー直接入力を含まない。
- `typeof raw[key] === "number"` ガードが number 以外の型を `undefined` に変換するため、型注入リスクなし。
- path traversal・injection の経路なし（記録先パスは内部 `usageJsonPath(slug)` 計算）。
- 認証・認可に関わる変更なし。

## 検証できなかった項目

- **SDK `total_cost_usd` のセマンティクスの実機確認**：本 review は SDK の `total_cost_usd` が「当該クエリ invocation 単体のコスト」である（セッション累積ではない）という、コード内コメント（agent-runner.ts:915-917）の主張が正しいかを実機で確認していない。

## Findings 詳細

### F-001 advisory: `totalCostUsd` は main work turn 分のみで follow-up ターン分を欠落する

**観察**:

`agent-runner.ts` では modelUsage を follow-up ターン（reportRetry / postWorkPrompts / outputVerification）ごとに積算している（:918-929, :965-977）。これはコメント「真の総コスト = 作業 query + 全 follow query の加算」に対応する。

一方、設計 D2 は `extractedMetrics` を success/error の result 抽出箇所（:827-844 相当）にのみ設定し、follow-up ループでは更新しない。各 query invocation の `total_cost_usd` は「その invocation 単体のコスト」（コメント :915-917 の主張に基づく）であるため、follow-up ターン分のコストは `totalCostUsd` に加算されない。

**影響**:

D6 の論理は「`typeof inv.totalCostUsd === "number"` なら実測値を使い、同 invocation の `modelUsage` からは computeCostUsd を加算しない（二重計上防止）」としている。このため、postWorkPrompts / reportRetry / outputVerification が発生したステップでは：

- `totalCostUsd` = main work turn のコストのみ（不足）
- `modelUsage` = main + 全 follow-up ターンの累積（より正確）
- D6 ロジック：`totalCostUsd` 存在 → `modelUsage` 試算をスキップ

結果として、follow-up ターンが発生したステップでは `job stats` の cost が試算基準より低くなる。request.md が「実額が得られる」と述べる目標と乖離する可能性がある。

**緩和策の選択肢**:

a) 既知の制限として design.md に明記し、implementer がコメントを追加する（最小変更）
b) 各 follow-up ターンの result message から `total_cost_usd` を取り出して `extractedMetrics.totalCostUsd` を累積する（`modelUsage` 積算と対称にする）

設計が意図的に main result 抽出のみとしているため blocking ではないが、`job stats` ユーザーへの誤解リスクがある。

---

### F-002 advisory: TC-JSTATS-024 は新フィールドを永続的に検証しない（D8 acknowledged）

D8 の説明通り、TC-JSTATS-024（row exact-key）は手書きリテラルを使うため新フィールド `turns`/`costBasis` を検証しない。新 AC #8/#9 テストが実経路 `deriveRunStat` で常時設定を保証する補完構造になっている。

design.md の Risk 節（"double standard"）で明示されており、意図的な設計判断。ただし TC-JSTATS-024 が実質的に「row スキーマのロック」として機能しなくなる点を注記する。新機能の型安全性は AC#8/#9 に依存することを tasks 実装者が把握していることを確認した。

---

### F-003 info: request.md と design.md の queryOneShot 呼び出し元記述の齟齬

request.md（:29）は「この経路は `request-review` / `request-generate` コマンドが使う」と記述するが、design.md（:14）は「production caller は現状ゼロ（request 背景の「request-review / request-generate が使う」は現行コードでは不正確）」と正しく訂正している。コード grep でも `queryOneShot` の呼び出し元は `query-one-shot.ts` 自身のみであることを確認済み（`src/` に caller なし）。

spec / tasks / 実装への影響なし。情報として記録する。

---

### F-004 info: extractInvocationMetrics ロジックの重複（intentional）

T-02 は `extractInvocationMetrics` を `agent-runner.ts` に定義し、T-03 は「同型（number ガード）にする」と述べる。設計が明示的に重複を選択している（共有 util 化を却下）。実装上の整合は tasks.md で明示されており、非ブロッキング。
