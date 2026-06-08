# Test Cases: AgentStepName ↔ AGENT_STEP_NAMES compile-time sync guard

## Summary

- **Total**: 14 cases
- **Automated** (unit/integration): 11
- **Manual**: 3
- **Priority**: must: 12, should: 1, could: 1

---

### TC-001: array→type drift で typecheck が fail する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The build SHALL fail when AGENT_STEP_NAMES and the AgentStepName literal union diverge > Scenario: a value exists in the array but not in the type

---

### TC-002: type→array drift で typecheck が fail する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The build SHALL fail when AGENT_STEP_NAMES and the AgentStepName literal union diverge > Scenario: a value exists in the type but not in the array

---

### TC-003: in-sync 状態で typecheck が成功する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The build SHALL fail when AGENT_STEP_NAMES and the AgentStepName literal union diverge > Scenario: the array and the type are in sync

---

### TC-004: kernel zero-import 不変条件テストが green

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The guard MUST preserve the kernel zero-import principle > Scenario: kernel files contain no imports after the change

---

### TC-005: 既存 AgentStepName 消費者が無改変でコンパイルできる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The guard MUST preserve the kernel zero-import principle > Scenario: existing AgentStepName consumers compile unchanged

---

### TC-006: meta-test が両方向の drift を @ts-expect-error で証明する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The sync guard mechanism SHALL be regression-protected by an automated test > Scenario: meta-test asserts both drift directions are caught

---

### TC-007: guard が pure type-level であり runtime 値を emit しない

**Category**: manual
**Priority**: should
**Source**: design.md > D4, tasks.md > T-02 AC

**GIVEN** `src/state/schema.ts` に sync guard が実装されている
**WHEN** コンパイル後の JS 出力を検査する
**THEN** guard に対応する runtime 変数（`const _x = ...` 等）が生成 JS に含まれていない

---

### TC-008: `AgentStepName` が export され `AgentDefinition.role` の型として使用される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 AC

**GIVEN** 変更後の `src/kernel/agent-definition.ts`
**WHEN** `bun run typecheck` を実行し型シグネチャを確認する
**THEN** `AgentStepName` が `export type` として定義され、`AgentDefinition.role` の型として引き続き使用されている

---

### TC-009: `AgentStepName` literal union のメンバが変更前の 10 値と同一

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 AC

**GIVEN** 変更後の `src/kernel/agent-definition.ts`
**WHEN** literal union のメンバを列挙する
**THEN** 変更前と同一の 10 値（`design` 〜 `adr-gen`）が揃っており、追加・削除がない

---

### TC-010: `AGENT_STEP_NAMES` の値・順序・`as const` が変更前と同一

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 AC

**GIVEN** 変更後の `src/kernel/step-names.ts`
**WHEN** 配列の内容を確認する
**THEN** 値・順序・`as const` アサーションが変更前と完全に同一である

---

### TC-011: DSM closure test が green で allowlist への追加が不要

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06 AC, design.md > D1

**GIVEN** `src/state/schema.ts` が `src/kernel/agent-definition.ts` を type-only import している
**WHEN** `bun run test` で `tests/unit/architecture/core-invariants.test.ts` を実行する
**THEN** 「§3 whitelist に無い import edge は存在しない」アサーションが green であり、allowlist に新規エントリが追加されていない（shared-kernel→leaf は既存許可 edge）

---

### TC-012: 手動 negative 確認の結果が `implementation-notes.md` に記録されている

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-05 AC

**GIVEN** T-05 の手動確認（両方向の一時 drift と revert）が実施済み
**WHEN** `specrunner/changes/step-name-compile-guard/implementation-notes.md` を確認する
**THEN** 配列→型・型→配列の両方向で `bun run typecheck` が fail したエラーメッセージ要旨が記録されており、実定義の revert 後に bogus 値が残っていない

---

### TC-013: `bun run lint` が警告 0 件で green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06 AC, request.md > 受け入れ基準

**GIVEN** 全変更（T-01〜T-05）が適用済み
**WHEN** `bun run lint` を実行する（`--max-warnings 0`）
**THEN** lint エラー・警告が 0 件で終了する

---

### TC-014: コメントが compile-time enforcement と guard 所在を示している

**Category**: manual
**Priority**: could
**Source**: design.md > D6, tasks.md > T-01, T-03

**GIVEN** 変更後の `src/kernel/agent-definition.ts` および `src/kernel/step-names.ts`
**WHEN** 各ファイルのコメントを確認する
**THEN** `agent-definition.ts` のコメントが guard は `src/state/schema.ts` で compile-time 強制される旨を示し、`step-names.ts` のコメントが同 guard の存在を示している

---

## Result

```yaml
result: completed
total: 14
automated: 11
manual: 3
must: 12
should: 1
could: 1
blocked_reasons: []
```
