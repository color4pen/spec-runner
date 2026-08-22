# Test Cases: agent session の active context / compaction observability

## Summary

- **Total**: 45 cases
- **Automated** (unit/integration): 41
- **Manual**: 0
- **Priority**: must: 41, should: 4, could: 0

---

<!-- ================================================================
     Spec 由来 TC（Scenario 由来: GWT 省略、Source 参照のみ）
     ================================================================ -->

## 型・定義の分離

### TC-001: ModelUsage の形が変わらない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: context metrics は累計 ModelUsage と別の型で表現される > Scenario: ModelUsage の形が変わらない

### TC-002: context metrics が独立型として存在する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: context metrics は累計 ModelUsage と別の型で表現される > Scenario: context metrics が独立型として存在する

---

## Peak Active Context 観測

### TC-003: 複数 turn の assistant message から最大値を採る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Claude adapter は provider が報告した active context の peak を記録する > Scenario: 複数 turn の assistant message から最大値を採る

### TC-004: sub-agent と replay の message は peak に数えない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Claude adapter は provider が報告した active context の peak を記録する > Scenario: sub-agent と replay の message は peak に数えない

### TC-005: 同一 message を二重に数えない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Claude adapter は provider が報告した active context の peak を記録する > Scenario: 同一 message を二重に数えない

---

## Compaction 観測

### TC-006: compaction 2 回で回数と直近の前後値が残る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Claude adapter は provider native compaction の発火を記録する > Scenario: compaction 2 回で回数と直近の前後値が残る

### TC-007: after 値を返さない compaction

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Claude adapter は provider native compaction の発火を記録する > Scenario: after 値を返さない compaction

---

## Context Exhaustion 記録

### TC-008: 溢れ直前の観測値が exhaustionAtTokens になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: context exhaustion 時に観測できていた context size が残る > Scenario: 溢れ直前の観測値が exhaustionAtTokens になる

### TC-009: 観測が無い場合は値を作らない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: context exhaustion 時に観測できていた context size が残る > Scenario: 観測が無い場合は値を作らない

### TC-010: context 溢れ以外の失敗では exhaustionAtTokens を付けない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: context exhaustion 時に観測できていた context size が残る > Scenario: context 溢れ以外の失敗では exhaustionAtTokens を付けない

---

## 非対応 Provider の unavailable 扱い

### TC-011: Codex / Managed runtime は unavailable

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 報告能力の無い provider では context metrics を捏造しない > Scenario: Codex / Managed runtime は unavailable

### TC-012: 観測ゼロの invocation では record を作らない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 報告能力の無い provider では context metrics を捏造しない > Scenario: 観測ゼロの invocation では record を作らない

---

## 永続化・表示

### TC-013: 成功 step の context metrics が usage.json に残る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: context metrics は usage.json に永続化され step / model / provider 単位で確認できる > Scenario: 成功 step の context metrics が usage.json に残る

### TC-014: exhaustion で halt した step の metrics が usage.json に残る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: context metrics は usage.json に永続化され step / model / provider 単位で確認できる > Scenario: exhaustion で halt した step の metrics が usage.json に残る

### TC-015: usage show が context 行を表示する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: context metrics は usage.json に永続化され step / model / provider 単位で確認できる > Scenario: usage show が context 行を表示する

### TC-016: context metrics を持たない entry では context 行を出さない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: context metrics は usage.json に永続化され step / model / provider 単位で確認できる > Scenario: context metrics を持たない entry では context 行を出さない

---

## 既存集計の不変

### TC-017: halt entry が cost 集計を動かさない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既存の usage / cost 集計の意味を変えない > Scenario: halt entry が cost 集計を動かさない

### TC-018: context metrics の無い halt では entry を追加しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既存の usage / cost 集計の意味を変えない > Scenario: context metrics の無い halt では entry を追加しない

---

## Core 契約の中立性

### TC-019: core 型に provider 固有語彙が無い

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: core 契約は provider 中立に保たれる > Scenario: core 型に provider 固有語彙が無い

### TC-020: 片方の provider だけが実装しても core が壊れない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: core 契約は provider 中立に保たれる > Scenario: 片方の provider だけが実装しても core が壊れない

---

<!-- ================================================================
     非 Scenario 由来 TC（design.md / tasks.md 由来: GWT 必須）
     ================================================================ -->

## T-01: 型定義・モジュール構成

### TC-021: AgentContextMetrics module が他 module を import しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: Acceptance Criteria

**GIVEN** `src/kernel/context-metrics.ts` が実装されている
**WHEN** ファイルの import 文を解析する
**THEN** `src/` 配下の他 TypeScript module への import が 1 件も存在しない（純粋型 module として完結している）

---

### TC-022: AgentContextMetrics の field 構成が仕様通りである

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: Acceptance Criteria

**GIVEN** `src/kernel/context-metrics.ts` に定義された `AgentContextMetrics` interface
**WHEN** runtime で `AgentContextMetrics` 準拠のオブジェクトを生成する
**THEN** `provider`（string・必須）、`model`（string・optional）と optional な 6 観測 field（`contextWindowTokens` / `peakActiveContextTokens` / `compactionCount` / `contextTokensBeforeCompaction` / `contextTokensAfterCompaction` / `exhaustionAtTokens`）の合計 8 field が存在し、`ModelUsage` の field（`inputTokens` / `outputTokens` / `cacheReadInputTokens` / `cacheCreationInputTokens`）が混入していない

---

## T-02: usage.json 永続表現

### TC-023: contextMetrics を含む CommandInvocation の round-trip

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: Acceptance Criteria
**File**: `tests/unit/core/usage/context-metrics-types.test.ts`（新規作成）

**GIVEN** `contextMetrics` を持つ `CommandInvocation` オブジェクト（`provider`, `peakActiveContextTokens`, `compactionCount` を含む）
**WHEN** `appendInvocation` で usage.json に書き出し、`readUsageFile` で読み直す
**THEN** `contextMetrics` の全 field が欠落・型変換なく round-trip し、`appendInvocation` 前後で内容が一致する

---

### TC-024: contextMetrics を持たない旧 entry の backward compatibility

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: Acceptance Criteria
**File**: `tests/unit/core/usage/context-metrics-types.test.ts`（新規作成、TC-023 と同一ファイル）

**GIVEN** `contextMetrics` field を持たない旧フォーマットの `CommandInvocation` が usage.json に存在する
**WHEN** `readUsageFile` で読み込む
**THEN** 例外が発生せず、entry の `contextMetrics` が absent（undefined）のまま返る

---

## T-03: Context Observer（純粋モジュール）

### TC-025: context-observer が I/O なし pure module として実装されている

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03: Acceptance Criteria

**GIVEN** `src/adapter/claude-code/context-observer.ts` の実装
**WHEN** ファイルの import 文を解析する
**THEN** `node:fs` / `child_process` / SDK の runtime value（インスタンス生成・API 呼び出し）への import が存在せず、型インポートのみに限定されている

---

### TC-026: isContextExhaustionError の allowlist 照合（true / false の両方向）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03: `isContextExhaustionError(text)` の仕様

**GIVEN** `isContextExhaustionError` 関数
**WHEN** allowlist 文字列（`prompt is too long` / `context length exceeded` / `context window exceeded`）を含む文字列、および含まない文字列（例: `network error`）を渡す
**THEN** allowlist に含む文字列は `true` を返し、含まない未知の error 文字列は `false` を返す（fail-closed）。大文字・小文字を区別しない

---

### TC-027: observeResult が result message から contextWindow を抽出する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03: `observeResult` の仕様; design.md > D4

**GIVEN** resolved model key の `contextWindow` を持つ result message（`modelUsage[model].contextWindow = 200000`）
**WHEN** `contextObserver.observeResult(raw)` を呼ぶ
**THEN** `snapshot().contextWindowTokens` が `200000` になる

---

## T-04: Agent Runner への Observer 配線

### TC-028: success / error / timeout の全 return 経路で contextMetrics が設定される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04: Acceptance Criteria

**GIVEN** `ClaudeCodeRunner.run()` を呼び出し、observer が少なくとも 1 件の assistant message を観測した状態
**WHEN** それぞれ success 経路 / 非 success result error 経路 / timeout 経路で invocation が完了する
**THEN** 各 `AgentRunResult` の `contextMetrics` が undefined でなく、観測値（`peakActiveContextTokens` 等）を含む

---

### TC-029: postWork ターンと output-repair ターンでも observe が呼ばれる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04: 観測ループの設計; design.md > D5

**GIVEN** postWork follow-up ループと output-repair ループのそれぞれで compaction boundary message が流れる
**WHEN** invocation が完了する
**THEN** `contextMetrics.compactionCount` がすべての観測ループ（main work / follow-up / repair）の compaction を合算した値になり、main work ターンのみの場合との差分がテストで確認できる

---

## T-05: StepHalt / Executor への通し

### TC-030: StepHalt に contextMetrics を追加しても既存 factory が互換を維持する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05: Acceptance Criteria

**GIVEN** `contextMetrics` を省略した既存の `makeNonSuccessHalt` / `makeTimeoutHalt` 呼び出し
**WHEN** TypeScript typecheck を実行する
**THEN** コンパイルエラーが発生せず、既存呼び出し側のコード変更が不要である

---

### TC-031: executor が success / timeout / 非 success の 3 経路すべてで context metrics を下流へ渡す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05: Acceptance Criteria

**GIVEN** `AgentRunResult.contextMetrics` に値が設定された run result を返す mock runner
**WHEN** executor が success 経路 / timeout 経路 / 非 success halt 経路それぞれで step を完了させる
**THEN** 各経路で生成される `StepExecutionResult` / `StepHalt` に `contextMetrics` が引き継がれており、undefined にならない

---

## T-06: CommitOrchestrator による永続化

### TC-032: halt 由来 entry が modelUsage null かつ invocation metrics を含まない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06: Acceptance Criteria; design.md > D7

**GIVEN** `contextMetrics` を持つ `StepHalt` が `CommitOrchestrator.commitHalt` に渡される
**WHEN** usage.json に append された entry を読み直す
**THEN** entry の `modelUsage` が `null` であり、`numTurns` / `durationMs` / `durationApiMs` / `totalCostUsd` のいずれも存在しない

---

### TC-033: usage append が失敗しても halt の throw 挙動が変わらない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06: Acceptance Criteria; design.md > D7 Risk

**GIVEN** `commitHalt` に `contextMetrics` を持つ halt が渡され、usage.json への append が I/O error で失敗する（`appendInvocation` を throw するよう mock）
**WHEN** `commitHalt` を実行する
**THEN** halt の FSM 遷移・rethrow は変わらず、I/O error が握りつぶされて呼び出し元に伝播しない

---

## T-07: usage show 表示

### TC-034: usage show で全 field 揃った context entry を出力する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07: Acceptance Criteria

**GIVEN** `provider` / `model` / `contextWindowTokens` / `peakActiveContextTokens` / `compactionCount` / `contextTokensBeforeCompaction` / `contextTokensAfterCompaction` のすべてを持つ `contextMetrics` を含む usage.json entry
**WHEN** `specrunner usage show <slug>` を実行する（`showUsage` を呼ぶ）
**THEN** stdout に `context:` で始まる行が現れ、`provider=` / `model=` / `window=` / `peak=` / `compactions=` / `preCompact=` / `postCompact=` の各 token が 2 space 区切りで含まれる

---

### TC-035: usage show で modelUsage null + contextMetrics あり entry でも context 行が出る

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07: Acceptance Criteria

**GIVEN** `modelUsage: null`（halt 由来）かつ `contextMetrics.exhaustionAtTokens = 187000` を持つ usage.json entry
**WHEN** `showUsage` を呼ぶ
**THEN** stdout に `context:` 行が現れ `exhaustedAt=187000` が含まれ、例外が発生しない

---

## T-08: Gate テスト（全体回帰）

### TC-036: bun run typecheck green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-08: Acceptance Criteria

`bun run typecheck` で検証する。

### TC-037: bun run test green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-08: Acceptance Criteria

`bun run test` で検証する。

### TC-038: architecture invariants テスト green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-08: Acceptance Criteria

`tests/unit/architecture/core-invariants.test.ts`（B-1〜B-18）を含む全 architecture test が green であることを `bun run test` で確認する。

### TC-039: dead-code テスト green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-08: Acceptance Criteria

`tests/unit/dead-code-core.test.ts` が green であることを確認する。新規 export がすべて実使用され、port barrel を再導入していないことを保証する。

<!-- ================================================================
     PR #1070 再レビュー由来の追加 TC（reopen 2026-08-22）
     ================================================================ -->

## 再レビュー由来の回帰固定

### TC-040: agent 成功後の output contract halt でも contextMetrics が usage.json に残る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: context metrics は usage.json に永続化され step / model / provider 単位で確認できる（halted step の append 条項）+ PR #1070 再レビュー [High]

**Given** runner.run() が success と観測済み contextMetrics を返し、その後の output contract 検査の violation で halt が生成される
**When** commitHalt が実行される
**Then** usage.json に `modelUsage: null` かつ contextMetrics 付きの entry が 1 件 append される

### TC-041: agent 成功後の commit / push 失敗 halt でも contextMetrics が usage.json に残る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: context metrics は usage.json に永続化され step / model / provider 単位で確認できる（halted step の append 条項）+ PR #1070 再レビュー [High]

**Given** runner.run() が success と観測済み contextMetrics を返し、その後の step artifact の commit / push 失敗で halt が生成される
**When** commitHalt が実行される
**Then** usage.json に `modelUsage: null` かつ contextMetrics 付きの entry が 1 件 append される

### TC-042: 観測済み invocation では compactionCount 0 が明示される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Claude adapter は provider native compaction の発火を記録する > Scenario: 観測済み invocation では compaction 0 回が明示される

**Given** active context（または context window）は観測されるが compact_boundary は 1 件も観測されない
**When** snapshot() を呼ぶ
**Then** `compactionCount` は 0 であり undefined ではない。観測ゼロの invocation では従来どおり snapshot() が undefined を返すことも同時に固定する

### TC-043: modelUsage 欠落 + contextMetrics ありの成功 step でも entry が書かれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: context metrics は usage.json に永続化され step / model / provider 単位で確認できる + escalation 裁定 F-1 の回帰固定

**Given** success の StepExecutionResult が modelUsage undefined かつ contextMetrics を持つ
**When** commitSuccess が実行される
**Then** usage.json に `modelUsage: null` + contextMetrics 付きの entry が append される

### TC-044: output-repair ターンの context 溢れで exhaustionAtTokens が設定される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: context exhaustion 時に観測できていた context size が残る + escalation 裁定 F-3 の回帰固定

**Given** main work で active context が観測された後、output-repair ターンで provider が context 溢れを示す非成功 result（または throw）を返す
**When** invocation が完了する
**Then** `contextMetrics.exhaustionAtTokens` に最後に観測された active context 値が入る

### TC-045: marker の無い modelUsage:null entry は usage 不明のまま扱われる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既存の usage / cost 集計の意味を変えない > Scenario: 既存の usage 不明 entry の意味が変わらない + PR #1070 再レビュー（build-attestation の null 一律 skip は既存契約違反）

**Given** 同一 step に、`contextOnly` marker の無い `modelUsage: null` entry と priced entry が 1 件ずつある
**When** buildAttestation を実行する
**Then** その step の `costUsd` は null になる。逆に `contextOnly: true` 付きの null entry（halt 由来）は skip され、同一 step の priced retry entry の cost がそのまま step cost になる

---

## Result

```yaml
result: completed
total: 39
automated: 35
manual: 0
must: 35
should: 4
could: 0
blocked_reasons: []
```
