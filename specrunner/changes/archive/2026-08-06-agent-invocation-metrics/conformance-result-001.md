# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Tasks (tasks.md)
全タスク（T-01〜T-07）のチェックボックスが `[x]` であることを確認。

### Design Decisions (design.md)

| 決定 | 実装箇所 | 確認結果 |
|------|---------|---------|
| D1: 共有型 `AgentInvocationMetrics`; `CommandInvocation` には flat 4 フィールド | `src/core/port/agent-runner.ts:214` / `src/core/usage/types.ts:30–58` | ✅ |
| D2: `typeof number` ガード、欠落は `undefined`（`0`/`null` でない） | `extractInvocationMetrics` ヘルパ + query-one-shot 抽出 | ✅ |
| D3: 既存 gate 変更なし; `...(invocationMetrics ?? {})` で spread | commit-orchestrator.ts:236/246 | ✅ |
| D4: `turnCount` を `numTurns` に置換; `@deprecated` 型として保持・未設定 | `QueryOneShotResult.turnCount` に JSDoc `@deprecated`、返却オブジェクトには含めない | ✅ |
| D5: `usage show` は存在時のみ追記、非保持でも例外なし | `usage-show.ts:67–74` の `metricsParts.length > 0` ガード | ✅ |
| D6: 2 列独立（`costUsd` 試算のまま + `measuredCostUsd` 実測）、置換なし | `deriveRunStat` の独立アキュムレータ | ✅ |
| D7: `turns` は `typeof === "number"` 総和; ゼロ件なら `null` | `turnsSum`/`hasTurns` パターン（`durationSec` 同形式） | ✅ |
| D8: `JobStatRow` の新 2 フィールドを optional; `deriveRunStat` は常に設定 | optional 型定義 + 戻り値に常に `measuredCostUsd`/`turns` を含む | ✅ |

### Spec Requirements (spec.md)

**R1（local runtime 4 metrics 抽出、success + error）**
- `extractInvocationMetrics` ヘルパが `agent-runner.ts` に存在し、success 経路（line 861）と error 経路（line 836）の両方で呼び出される。
- TC-001（success）、TC-002（error subtype）で固定済み。

**R2（one-shot 経路も 4 metrics）**
- `query-one-shot.ts:220–234` で同等の `typeof number` ガードで抽出。
- `query-one-shot-metrics.test.ts` で固定済み。

**R3（metrics が usage.json エントリに記録）**
- `executor.ts:520` → `StepExecutionResult.invocationMetrics`。
- `commit-orchestrator.ts:246` → `appendInvocation` に spread。
- TC-005（4 値記録）、TC-006（未提供時フィールド省略）で固定済み。

**R4（legacy usage.json 後方互換）**
- `readUsageFile` は `commandInvocations` が配列であることのみを検査する寛容なパーサ。
- `store-backward-compat.test.ts` TC-007 で read + append round-trip を固定済み。

**R5（`usage show` が metrics 表示・非保持でも例外なし）**
- `metricsParts` 配列に存在するフィールドのみ push; 空なら出力なし。
- TC-008（metrics 表示）、TC-009（非保持で例外なし）で固定済み。

**R6（`job stats` が 2 列 cost + turns 総和）**
- `deriveRunStat` に独立した `costUsd`（`computeCostUsd` 試算）/ `measuredCostUsd`（`totalCostUsd` 実測）/ `turns`（`numTurns` 総和）の 3 系列。
- テーブルレンダラに "SDK $" 列と "Turns" 列を追加。
- TC-010〜TC-023 で各シナリオを固定済み。

### Acceptance Criteria (request.md)

| AC | 確認内容 | 結果 |
|----|---------|------|
| #1 | 4 optional フィールド + doc comment が `CommandInvocation` に存在 | ✅ |
| #2 | adapter テスト: success / error 双方の subtype で 4 値記録 | ✅ TC-001/TC-002 |
| #3 | query-one-shot 経路のテスト | ✅ `query-one-shot-metrics.test.ts` |
| #4 | legacy usage.json の read/write 後方互換テスト | ✅ TC-007 |
| #5 | 欠落フィールドが `undefined`（`0`/`null` でない）テスト | ✅ TC-003/TC-018 |
| #6 | `usage show` のメトリクス表示・非保持で例外なしテスト | ✅ TC-008/TC-009 |
| #7 | `job stats` 2 列独立・二重計上なしテスト | ✅ TC-012 |
| #8 | `measuredCostUsd === null` when no `totalCostUsd`; `costUsd` 従来どおりテスト | ✅ TC-022 |
| #9 | turn 総和テスト・ゼロ件なら null テスト | ✅ TC-014/TC-015 |
| #10 | 既存テスト無変更 green | ✅ 10211 passed (bun run test) |

### Build Gate

- `bun run typecheck`: エラーなし
- `bun run test`: 10211 passed, 1 skipped（既存の pre-existing skip）

## 検証できなかった項目

None。全 AC の対応テストを実行確認済み。

## Findings 詳細

None（ブロッキング指摘なし）。

参考情報（informational、非ブロッキング）:

**[INFO-1] `totalCostUsd` はメインワークターン分のみを反映**
design.md の「Known Limitation」に明記。フォローアップターンを持つステップでは `measuredCostUsd` が `costUsd`（全ターン累計 `modelUsage`）より低くなる。設計上の既知トレードオフであり、spec 逸脱ではない。

**[INFO-2] TC-JSTATS-024 が 6 キーに固定されている（D8 設計意図）**
手書き `JobStatRow` リテラルを使う既存テストは `measuredCostUsd`/`turns` を省略したまま継続。TC-JSTATS-024b（新規）が `deriveRunStat` の実出力 8 キースキーマを固定する。D8 の意図どおり。

**[INFO-3] error subtype の metrics は usage.json に永続化されない**
`applySuccessPostPersistEffects` は success のみ。error subtype の metrics は `AgentRunResult` レベルで固定（AC #2）だが usage.json には記録されない。design.md D3 に明示的に記載された scope 決定。
