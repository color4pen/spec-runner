# Test Cases: SDK result の turn 数・所要時間・実コストを usage.json に記録する

## Summary

- **Total**: 26 cases
- **Automated** (unit/integration): 26
- **Manual**: 0
- **Priority**: must: 18, should: 7, could: 1

---

## TC-001: success result から 4 metrics を抽出する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: local runtime の agent step は SDK result から 4 metrics を抽出する > Scenario: success result から 4 metrics を抽出する

---

## TC-002: error subtype の result からも 4 metrics を抽出する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: local runtime の agent step は SDK result から 4 metrics を抽出する > Scenario: error subtype の result からも 4 metrics を抽出する

---

## TC-003: 欠落フィールドは undefined になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: local runtime の agent step は SDK result から 4 metrics を抽出する > Scenario: 欠落フィールドは undefined になる

---

## TC-004: one-shot success result から 4 metrics を抽出する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: one-shot 経路も同じ 4 metrics を抽出する > Scenario: one-shot success result から 4 metrics を抽出する

---

## TC-005: metrics を持つ agent step が usage.json に記録される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: agent step の metrics が usage.json のエントリに記録される > Scenario: metrics を持つ agent step が usage.json に記録される

---

## TC-006: metrics 未提供の runtime ではフィールドが省略される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: agent step の metrics が usage.json のエントリに記録される > Scenario: metrics 未提供の runtime ではフィールドが省略される

---

## TC-007: legacy usage.json を読み書きしても既存エントリが保持される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: metrics を持たない既存形式の usage.json を後方互換に読み書きできる > Scenario: legacy usage.json を読み書きしても既存エントリが保持される

---

## TC-008: metrics 付きエントリで metrics を表示する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: usage show が metrics を表示し、metrics 非保持でも壊れない > Scenario: metrics 付きエントリで metrics を表示する

---

## TC-009: metrics 非保持エントリでも例外なく出力する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: usage show が metrics を表示し、metrics 非保持でも壊れない > Scenario: metrics 非保持エントリでも例外なく出力する

---

## TC-010: totalCostUsd を持つ invocation は実測値で計上される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: job stats は実測 cost を invocation 単位で優先し試算にフォールバックする > Scenario: totalCostUsd を持つ invocation は実測値で計上される

---

## TC-011: totalCostUsd を持たない invocation は試算にフォールバックする

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: job stats は実測 cost を invocation 単位で優先し試算にフォールバックする > Scenario: totalCostUsd を持たない invocation は試算にフォールバックする

---

## TC-012: 実測と試算が混在する run で二重計上しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: job stats は実測 cost を invocation 単位で優先し試算にフォールバックする > Scenario: 実測と試算が混在する run で二重計上しない

---

## TC-013: 単価表に無いモデルでも totalCostUsd があれば集計に載る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: job stats は実測 cost を invocation 単位で優先し試算にフォールバックする > Scenario: 単価表に無いモデルでも totalCostUsd があれば集計に載る

---

## TC-014: numTurns を持つ invocation の総和を出力する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: job stats は run 単位の turn 数総和を出力する > Scenario: numTurns を持つ invocation の総和を出力する

---

## TC-015: numTurns を持つ invocation が無い run は null になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: job stats は run 単位の turn 数総和を出力する > Scenario: numTurns を持つ invocation が無い run は null になる

---

## TC-016: CommandInvocation 型定義に 4 optional フィールドと doc comment が存在する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria / request AC #1

**GIVEN** `src/core/usage/types.ts` の `CommandInvocation` 型定義
**WHEN** 型ファイルの内容を確認する
**THEN** `numTurns?: number` / `durationMs?: number` / `durationApiMs?: number` / `totalCostUsd?: number` が optional フィールドとして存在し、それぞれに doc comment（SDK 由来・managed や旧 usage.json では undefined である旨）が付いている。`bun run typecheck` が green。

---

## TC-017: AgentInvocationMetrics 共有型と AgentRunResult.invocationMetrics フィールドの存在

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria / design.md > D1

**GIVEN** `src/core/port/agent-runner.ts` の型定義
**WHEN** 型ファイルの内容を確認する
**THEN** `AgentInvocationMetrics` が `numTurns?` / `durationMs?` / `durationApiMs?` / `totalCostUsd?` の 4 optional number フィールドを持つ独立型として存在し、`AgentRunResult` に `invocationMetrics?: AgentInvocationMetrics` フィールドが追加されている。

---

## TC-018: extractInvocationMetrics が非 number 型値を undefined として扱う

**Category**: unit
**Priority**: should
**Source**: design.md > D2

**GIVEN** SDK result message の `num_turns` / `duration_ms` / `duration_api_ms` / `total_cost_usd` に `null` / `"string"` / `{}` 等の非 number 値が設定されている
**WHEN** `extractInvocationMetrics` がそのメッセージを処理する
**THEN** 非 number 値の各フィールドは `undefined` になり、`0` にも `null` にもならない（`typeof raw[key] === "number"` ガードが機能している）

---

## TC-019: error subtype の metrics は usage.json に記録されない

**Category**: integration
**Priority**: should
**Source**: design.md > D3 / Risks section

**GIVEN** SDK が error subtype を返し、agent runner が error 結果に `invocationMetrics` を載せて返す
**WHEN** step が error 終了し、commit-orchestrator の `applySuccessPostPersistEffects` を通らない経路で処理が終わる
**THEN** usage.json にエントリは追記されず、error の metrics は永続化されない（success 経路のみが記録対象という設計トレードオフを固定する）

---

## TC-020: one-shot の turnCount placeholder が numTurns に置き換えられている

**Category**: unit
**Priority**: should
**Source**: design.md > D4 / tasks.md > T-03 Acceptance Criteria

**GIVEN** `src/adapter/claude-code/query-one-shot.ts` の `QueryOneShotResult` 型と one-shot 実装
**WHEN** 型定義と抽出ロジックを確認する
**THEN** 旧 `turnCount?`（"Reserved for future use"）フィールドが削除されており、代わりに `numTurns?` が存在する。metrics を含む success result を注入したとき `numTurns` に値が載り、旧 `turnCount` フィールドは存在しない。

---

## TC-021: costBasis が "measured" になる（全 invocation が totalCostUsd を持つ場合）

**Category**: unit
**Priority**: should
**Source**: design.md > D6

**GIVEN** run 内の全 invocation が `totalCostUsd` を持ち、`modelUsage` の priced 試算は存在しない（または存在しても totalCostUsd を持つ）
**WHEN** `deriveRunStat` が run 統計を算出する
**THEN** `costBasis === "measured"` になる

---

## TC-022: costBasis が "estimated" になる（全 invocation が totalCostUsd を持たず priced modelUsage を持つ場合）

**Category**: unit
**Priority**: should
**Source**: design.md > D6

**GIVEN** run 内のどの invocation も `totalCostUsd` を持たず、priced な `modelUsage` だけを持つ
**WHEN** `deriveRunStat` が run 統計を算出する
**THEN** `costBasis === "estimated"` になる

---

## TC-023: costBasis が null になる（cost 寄与が無い場合）

**Category**: unit
**Priority**: should
**Source**: design.md > D6

**GIVEN** run 内のどの invocation も `totalCostUsd` を持たず、`modelUsage` も無いか単価表に無いモデルのみ
**WHEN** `deriveRunStat` が run 統計を算出する
**THEN** `costBasis === null` かつ `costUsd === null` になる

---

## TC-024: 既存 job-stats テスト（TC-JSTATS-001..030）が無変更で green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria / T-07 Acceptance Criteria / request AC #10

**GIVEN** `tests/unit/core/command/job-stats.test.ts` の既存テスト（TC-JSTATS-001..030）が変更されていない
**WHEN** `bun run test tests/unit/core/command/job-stats.test.ts` を実行する
**THEN** 全テストが green。特に TC-JSTATS-024（JSON row exact-key）・TC-JSTATS-025（summary exact-key）・TC-JSTATS-020/021/022（table レンダリング）・TC-JSTATS-008/009/010（cost 算出）が通過する。

---

## TC-025: 既存 usage store テスト（TC-USG-01..06）が無変更で green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07 Acceptance Criteria / request AC #10

**GIVEN** `tests/core/usage/store.test.ts` の既存テスト（TC-USG-01..06）が変更されていない
**WHEN** `bun run test tests/core/usage/store.test.ts` を実行する
**THEN** 全テストが green。`CommandInvocation` への optional フィールド追加が `toMatchObject` ベースの既存アサーションを壊さない。

---

## TC-026: package.json に新規 runtime 依存が追加されていない

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-07 Acceptance Criteria

**GIVEN** 本変更の実装コードが `node:*` と既存 util のみを使用している
**WHEN** `package.json` の `dependencies` と `devDependencies` を確認する
**THEN** 本変更前から存在するパッケージ以外の新規エントリが追加されていない

---

## Result

```yaml
result: completed
total: 26
automated: 26
manual: 0
must: 18
should: 7
could: 1
blocked_reasons: []
```
