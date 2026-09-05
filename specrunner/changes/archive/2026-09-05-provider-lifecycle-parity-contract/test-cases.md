# Test Cases: Claude / Codex provider lifecycle parity contract

## Summary

- **Total**: 55 cases
- **Automated** (unit/integration): 42
- **Manual**: 5
- **Priority**: must: 47, should: 7, could: 1

---

### TC-001: Case table matches the frozen required ID list

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall provide a stable-ID provider lifecycle contract table > Scenario: case table matches the frozen required ID list

---

### TC-002: Deleting a case from the table fails the ratchet

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall provide a stable-ID provider lifecycle contract table > Scenario: deleting a case from the table fails the ratchet

---

### TC-003: Duplicate case ID fails the ratchet

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall provide a stable-ID provider lifecycle contract table > Scenario: duplicate case ID fails the ratchet

---

### TC-004: Every required case ID uses a known lifecycle area prefix

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall provide a stable-ID provider lifecycle contract table > Scenario: every required case ID uses a known lifecycle area prefix

---

### TC-005: Every lifecycle area has at least one case

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall cover all required lifecycle areas in the contract table > Scenario: every lifecycle area has at least one case

---

### TC-006: Report settle and follow-up budget are represented

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall cover all required lifecycle areas in the contract table > Scenario: report settle and follow-up budget are represented

---

### TC-007: One scenario drives both provider harnesses

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The system shall drive both providers from one provider-neutral scenario > Scenario: one scenario drives both provider harnesses

---

### TC-008: No real SDK is loaded

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall drive both providers from one provider-neutral scenario > Scenario: no real SDK is loaded

---

### TC-009: Timeout cases are driven without wall-clock waiting

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The system shall drive both providers from one provider-neutral scenario > Scenario: timeout cases are driven without wall-clock waiting

---

### TC-010: Shared case requires expectations for both providers

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall classify each case and provider pair and require a reason for non-shared entries > Scenario: shared case requires expectations for both providers

---

### TC-011: Provider-specific case without a reason fails the ratchet

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall classify each case and provider pair and require a reason for non-shared entries > Scenario: provider-specific case without a reason fails the ratchet

---

### TC-012: Absent support is asserted rather than skipped

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The system shall classify each case and provider pair and require a reason for non-shared entries > Scenario: absent support is asserted rather than skipped

---

### TC-013: Matrix covers exactly the port's AgentRunResult fields

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall fix AgentRunResult field capability per provider and forbid synthesized metrics > Scenario: matrix covers exactly the port's AgentRunResult fields

---

### TC-014: Adding a port field without updating the matrix fails the ratchet

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall fix AgentRunResult field capability per provider and forbid synthesized metrics > Scenario: adding a port field without updating the matrix fails the ratchet

---

### TC-015: Absent capability fields stay undefined on every case

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The system shall fix AgentRunResult field capability per provider and forbid synthesized metrics > Scenario: absent capability fields stay undefined on every case

---

### TC-016: Supported capability fields are observed at least once

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The system shall fix AgentRunResult field capability per provider and forbid synthesized metrics > Scenario: supported capability fields are observed at least once

---

### TC-017: Transient retry budget is bounded

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The system shall pin existing retry, follow-up and turn accounting semantics > Scenario: transient retry budget is bounded

---

### TC-018: Non-transient failure is not retried

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The system shall pin existing retry, follow-up and turn accounting semantics > Scenario: non-transient failure is not retried

---

### TC-019: Abort does not trigger an additional retry

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The system shall pin existing retry, follow-up and turn accounting semantics > Scenario: abort does not trigger an additional retry

---

### TC-020: Post-work turns are excluded from followUpAttempts

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The system shall pin existing retry, follow-up and turn accounting semantics > Scenario: post-work turns are excluded from followUpAttempts

---

### TC-021: addedTurns invariant holds wherever addedTurns is present

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The system shall pin existing retry, follow-up and turn accounting semantics > Scenario: addedTurns invariant holds wherever addedTurns is present

---

### TC-022: Adding a local adapter without registering it fails the ratchet

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall detect missing provider coverage and implicit skips > Scenario: adding a local adapter without registering it fails the ratchet

---

### TC-023: Skip and focus markers are rejected

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall detect missing provider coverage and implicit skips > Scenario: skip and focus markers are rejected

---

### TC-024: Execution ledger equals the full case-by-provider cross product

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The system shall detect missing provider coverage and implicit skips > Scenario: execution ledger equals the full case-by-provider cross product

---

### TC-025: Unexplained difference blocks the suite

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall stop instead of normalizing unexplained provider differences > Scenario: unexplained difference blocks the suite

---

### TC-026: No unexplained differences in the delivered contract

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall stop instead of normalizing unexplained provider differences > Scenario: no unexplained differences in the delivered contract

---

### TC-027: No production source is modified

**Category**: gate
**Priority**: must
**Source**: spec.md > Requirement: The system shall keep provider production behavior and SDK type containment unchanged > Scenario: no production source is modified

T-10 verification: `git diff --stat <base> -- src/` の出力が空であること。

---

### TC-028: Provider SDK imports stay inside the two provider adapter directories

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall keep provider production behavior and SDK type containment unchanged > Scenario: provider SDK imports stay inside the two provider adapter directories

---

### TC-029: Provider-neutral contract modules stay provider-free

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall keep provider production behavior and SDK type containment unchanged > Scenario: provider-neutral contract modules stay provider-free

---

### TC-030: Existing provider tests remain intact

**Category**: gate
**Priority**: must
**Source**: spec.md > Requirement: The system shall keep provider production behavior and SDK type containment unchanged > Scenario: existing provider tests remain intact

T-10 verification: `git diff --name-status <base>` で `src/adapter/*/__tests__/`、`tests/unit/adapter/`、`tests/adapter/`、`tests/unit/contract/agent-runner-contracts.test.ts` に変更・削除がないこと。

---

### TC-031: case-ids.ts contains no import statements

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `tests/unit/contract/provider-lifecycle/case-ids.ts` が作成された
**WHEN** ファイル内の import 文（型 import を含む）を走査する
**THEN** import 文が 0 件である

---

### TC-032: REQUIRED_CASE_IDS has exactly 31 non-duplicate elements

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `REQUIRED_CASE_IDS` が `case-ids.ts` に手書きの `as const` 配列として定義されている
**WHEN** 配列の要素数と `new Set(REQUIRED_CASE_IDS).size` を比較する
**THEN** 両方が 31 であり等しい

---

### TC-033: ProviderHarness.build returns AgentRunner-typed runner

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `harness/types.ts` の `ProviderHarness` インターフェースが定義されている
**WHEN** TypeScript の型検査（`bun run typecheck`）を実行する
**THEN** `ProviderHarness.build` の戻り値型に `runner: AgentRunner`（`src/core/port/agent-runner.ts` 由来）が含まれておりエラーがない

---

### TC-034: Claude harness translates complete-with-report to success with non-null toolResult

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** Claude harness が `complete-with-report` を 1 turn 持つ scenario で構築されている
**WHEN** `runner.run(context)` を実行する
**THEN** `completionReason === "success"` かつ `toolResult` が非 null である

---

### TC-035: Claude harness translates stall-until-abort to timeout with STEP_TIMEOUT code

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** Claude harness が `stall-until-abort` を 1 turn 持つ scenario で構築され、`vi.useFakeTimers()` が有効になっている
**WHEN** `runner.run(context)` を開始し `vi.advanceTimersByTimeAsync` で inactivity timeout 時間を経過させる
**THEN** `completionReason === "timeout"` かつ `error.code === "STEP_TIMEOUT"` である

---

### TC-036: Codex harness translates complete-with-report to success with non-null toolResult

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** Codex harness が `complete-with-report` を 1 turn 持つ scenario で構築されている
**WHEN** `runner.run(context)` を実行する
**THEN** `completionReason === "success"` かつ `toolResult` が非 null である

---

### TC-037: PROVIDER_HARNESSES keys match CONTRACT_PROVIDERS exactly

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `harness/registry.ts` の `PROVIDER_HARNESSES`（frozen registry）と `case-ids.ts` の `CONTRACT_PROVIDERS` が定義されている
**WHEN** 両者のキー集合を比較する
**THEN** キー集合が完全一致する（`claude-code` と `codex` の 2 件）

---

### TC-038: Case table has exactly 31 cases with both-provider expectations on every case

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `LIFECYCLE_CONTRACT_CASES` が `case-table.ts` に定義されている
**WHEN** 要素数と各 case の `expectations` キー集合を検査する
**THEN** 要素数が 31 であり、全 case が `claude-code` と `codex` の両方の期待値エントリを持つ

---

### TC-039: provider-specific and absent reason strings are at least 40 characters

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05, T-06, T-08

**GIVEN** case table の全 `classification === "provider-specific"` 期待値、全 `support === "absent"` 期待値、および capability matrix の全 `absent` エントリが定義されている
**WHEN** 各エントリの `reason` 文字列長を確認する
**THEN** すべての `reason` が 40 文字以上である

---

### TC-040: case-table.ts does not import case-ids.ts

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `case-table.ts` が作成されている
**WHEN** ファイルの import 文を走査する
**THEN** `case-ids.ts` への import が存在しない（ID 正典との突合は ratchet が担当するため）

---

### TC-041: result-field-matrix.ts has exactly 15 field entries with absent reasons documented

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** `result-field-matrix.ts` の `AgentRunResult` capability matrix が定義されている
**WHEN** エントリ数と全 `absent` エントリの `reason` 長を確認する
**THEN** エントリ数が 15 であり、全 `absent` エントリの `reason` が 40 文字以上である

---

### TC-042: Parity driver executes exactly 62 test cases with zero skips

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** `provider-lifecycle-parity.test.ts` が 31 case × 2 provider の全組み合わせを実行するよう実装されている
**WHEN** `bunx vitest run tests/unit/contract/provider-lifecycle/provider-lifecycle-parity.test.ts` を実行する
**THEN** 実行される test 件数が 64 件以上（62 case test + 台帳検査 `it` 最低 2 件）であり、skip が 0 件である
（台帳検査は "実行ペア完全一致" と "supported field 観測記録" の少なくとも 2 `it` で構成される）

---

### TC-043: Parity driver results are stable across three consecutive runs

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** parity driver が timeout case に `vi.useFakeTimers()` を使い、transient backoff に即時解決の `_sleepFn` を注入している
**WHEN** `bunx vitest run` を 3 回連続で実行する
**THEN** 毎回同じ pass / fail 結果が得られ、timeout / timing 起因の flaky 失敗が発生しない

---

### TC-044: Removing one ID from REQUIRED_CASE_IDS causes ID ratchet failure

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-08

**GIVEN** `REQUIRED_CASE_IDS` から 1 件の ID を手動で削除する
**WHEN** `bunx vitest run tests/unit/contract/provider-lifecycle/contract-ratchet.test.ts` を実行する
**THEN** ID ratchet が fail し、余剰 ID（case table にあるが required list にない ID）が報告される。検証後、変更を元に戻す

---

### TC-045: Removing one case from case-table.ts causes ID ratchet failure

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-08

**GIVEN** `case-table.ts` から 1 件の case を手動で削除するが `REQUIRED_CASE_IDS` は変更しない
**WHEN** `bunx vitest run tests/unit/contract/provider-lifecycle/contract-ratchet.test.ts` を実行する
**THEN** ID ratchet が fail し、不足 ID（required list にあるが case table にない ID）が報告される。検証後、変更を元に戻す

---

### TC-046: Adding a field to AgentRunResult causes field matrix ratchet failure

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-08

**GIVEN** `src/core/port/agent-runner.ts` の `AgentRunResult` interface に新しいフィールドを 1 件手動で追加するが `result-field-matrix.ts` は変更しない
**WHEN** `bunx vitest run tests/unit/contract/provider-lifecycle/contract-ratchet.test.ts` を実行する
**THEN** field matrix ratchet が fail し、カバーされていないフィールド名が報告される。検証後、必ず変更を元に戻す（`src/` に変更を残さない）

---

### TC-047: Adding it.skip in suite source causes skip ratchet failure

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-08

**GIVEN** `tests/unit/contract/provider-lifecycle/` 内の任意の `.ts` ファイルに `it.skip` を 1 箇所手動で追加する
**WHEN** `bunx vitest run tests/unit/contract/provider-lifecycle/contract-ratchet.test.ts` を実行する
**THEN** skip ratchet が fail する。検証後、変更を元に戻す

---

### TC-048: All reason strings have documented grounds with source references

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-09

**GIVEN** case table の全 `provider-specific` / `absent` 期待値の `reason` と capability matrix の全 `absent` エントリの `reason` が定義されている
**WHEN** 各 `reason` の内容を確認する
**THEN** 全 `reason` に SDK 能力または既存仕様（該当ソース行または port doc comment）への根拠が記述されており、`UNEXPLAINED:` プレフィックスが 0 件である

---

### TC-049: tasks.md actuals section records all required measurement values

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-11

**GIVEN** 実装が完了し contract suite が green になっている
**WHEN** T-11 に列挙された各測定値を採取する
**THEN** `tasks.md` に「実測値」節が追記され、contract case 総数・shared / provider-specific / absent 内訳・provider 別実行 case 数・area 別 case 数・production `agent-runner.ts` 変更行数・UNEXPLAINED 件数・value-import SCC 数がすべて記録されている（取得不能な項目は不能理由が明記されている）

---

### TC-050: bun run typecheck passes

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-10

T-10 verification: `bun run typecheck` が成功すること。

---

### TC-051: bun run lint passes with zero warnings

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-10

T-10 verification: `bun run lint` が `--max-warnings 0` で成功すること（`./tests` も対象）。

---

### TC-052: bun run test passes (full suite)

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-10

T-10 verification: `bun run test` が全 suite で成功すること。

---

### TC-053: bun run build passes

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-10

T-10 verification: `bun run build` が成功すること。

---

### TC-054: Existing provider test files are unchanged

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-10

T-10 verification: `git diff --name-status <base>` で `src/adapter/*/__tests__/`、`tests/unit/adapter/`、`tests/adapter/`、`tests/unit/contract/agent-runner-contracts.test.ts` に変更・削除がないこと。

---

### TC-055: Production src/ diff against base branch is empty

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-10

T-10 verification: `git diff --stat <base> -- src/` の出力が空であること。

---

## Result

```yaml
result: completed
total: 55
automated: 42
manual: 5
must: 47
should: 7
could: 1
blocked_reasons: []
```
