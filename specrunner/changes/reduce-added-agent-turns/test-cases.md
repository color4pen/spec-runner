# Test Cases: 追加 AI ターンの構造的削減

## Summary

- **Total**: 19 cases
- **Automated** (unit/integration): 17
- **Manual**: 2
- **Priority**: must: 16, should: 3, could: 0

---

### TC-001: reportTool 設定時に completion directive が first-turn prompt に含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: local path の first-turn prompt に completion directive を注入する > Scenario: reportTool 設定時に directive が first-turn prompt に含まれる

---

### TC-002: reportTool 未設定時は completion directive を注入しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: local path の first-turn prompt に completion directive を注入する > Scenario: reportTool 未設定時は directive を注入しない

---

### TC-003: first turn で report_result 未呼び出しなら再試行が走る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: report_result 再試行 fallback を維持する > Scenario: first turn で tool 未呼び出しなら再試行が走る

---

### TC-004: adr:false で adr-gen が agent 実行前に skip される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request.adr が false のとき adr-gen を agent 実行前に skip する > Scenario: adr:false で adr-gen が skip される

---

### TC-005: skip された adr-gen は pr-create へ進む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request.adr が false のとき adr-gen を agent 実行前に skip する > Scenario: skip された adr-gen は pr-create へ進む

---

### TC-006: 空 ledger で regression-gate が agent 実行前に skip される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: findings ledger が空のとき regression-gate を agent 実行前に skip する > Scenario: 空 ledger で regression-gate が skip される

---

### TC-007: 非空 ledger で regression-gate は従来どおり実行される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: findings ledger が空のとき regression-gate を agent 実行前に skip する > Scenario: 非空 ledger で regression-gate は従来どおり実行される

---

### TC-008: post-work turn が addedTurns の種別計測に計上される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 追加ターンを種別分離して計測し post-work を計上する > Scenario: post-work turn が種別計測に計上される

---

### TC-009: report_result 再試行と output-repair が分離計測される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 追加ターンを種別分離して計測し post-work を計上する > Scenario: report_result 再試行と output-repair が分離計測される

---

### TC-010: skip 対象以外の step の verdict と pipeline 遷移が不変

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: skip 対象以外の観測挙動は不変 > Scenario: 通常 step の verdict と遷移が不変

---

### TC-011: prompt-builder.ts に MCP tool 名が現れない（provider-neutral 維持）

**Category**: unit
**Priority**: must
**Source**: design.md > D1 / tasks.md > T-01

**GIVEN** completion directive の注入先として claude-code adapter のみが対象となる設計
**WHEN** `src/adapter/shared/prompt-builder.ts` のソースを静的解析する
**THEN** `mcp__specrunner_report__report_result` など provider 固有の MCP tool 名、および MCP tool 名を合成する `REPORT_MCP_SERVER_NAME` 参照がファイル内に現れない

---

### TC-012: skipWhen が null を返す / 未定義の step は agent runner が呼ばれる

**Category**: unit
**Priority**: must
**Source**: design.md > D2 / tasks.md > T-02

**GIVEN** `skipWhen` を持たない AgentStep、または `skipWhen` が null を返す AgentStep
**WHEN** executor の `runAgentStep` を実行する
**THEN** agent runner が呼ばれ、verdict は "skipped" にならない

---

### TC-013: adr:true では adr-gen が従来どおり agent を実行する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `request.adr === true` の job で pipeline が adr-gen step に到達する
**WHEN** executor が adr-gen の `skipWhen` を評価する
**THEN** `skipWhen` が null を返し、agent runner が呼ばれる（skip されない）

---

### TC-014: STANDARD_TRANSITIONS に adr-gen skipped → pr-create の遷移が存在する

**Category**: unit
**Priority**: must
**Source**: design.md > D3 / tasks.md > T-03

**GIVEN** `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS` 定義
**WHEN** `step === "adr-gen"` かつ `on === "skipped"` のエントリを検索する
**THEN** `to === "pr-create"` のエントリが存在する

---

### TC-015: managed / codex adapter が addedTurns を undefined のまま返しても型・実行が壊れない

**Category**: unit
**Priority**: should
**Source**: design.md > D4 / tasks.md > T-05

**GIVEN** `AgentRunResult.addedTurns` が undefined の managed / codex adapter からの実行結果
**WHEN** `pushStepResult` / `StepOutcome` 組み立てが処理する
**THEN** 型エラーなしで実行が完了し、`StepOutcome.addedTurns` が undefined のまま格納される（既存フィールド `followUpAttempts` は影響を受けない）

---

### TC-016: sequential / parallel 両経路で addedTurns が StepOutcome に伝播する

**Category**: integration
**Priority**: should
**Source**: design.md > D4 / tasks.md > T-05

**GIVEN** `addedTurns: { reportRetry: 1, postWork: 2, outputRepair: 1 }` を設定した `AgentRunResult` を返す adapter、sequential 実行経路と parallel round 実行経路の両方
**WHEN** それぞれの経路で `commitSuccess` → `projectSuccess` → `pushStepResult` を実行する
**THEN** 両経路で `StepOutcome.addedTurns` に同一の値が伝播する

---

### TC-017: addedTurns.reportRetry + addedTurns.outputRepair === followUpAttempts の不変条件が成立する

**Category**: unit
**Priority**: must
**Source**: design.md > D4 / tasks.md > T-06

**GIVEN** report_result 再試行 turn と output-repair turn がそれぞれ発生した agent run（postWork turn は含めない）
**WHEN** `AgentRunResult` および記録された `StepOutcome` を検査する
**THEN** `addedTurns.reportRetry + addedTurns.outputRepair === followUpAttempts` が成立し、`addedTurns.postWork` は `followUpAttempts` に含まれない

---

### TC-018: typecheck が 0 エラーで通る

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** 本 change の全実装が完了している
**WHEN** `bun run typecheck` を実行する
**THEN** exit code 0 で完了し、型エラーが 0 件である

---

### TC-019: 全テストが pass する

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** 本 change の全実装が完了しており、影響を受ける既存テストが更新済みである
**WHEN** `bun run test` を実行する
**THEN** exit code 0 で完了し、全テストが pass する。期待値が変わるテストは adr:false の adr-gen（success→skipped）と空 ledger の regression-gate（approved→skipped）に起因するものだけであり、それ以外の既存テストは無改変で green である

---

## Result

```yaml
result: completed
total: 19
automated: 17
manual: 2
must: 16
should: 3
could: 0
blocked_reasons: []
```
