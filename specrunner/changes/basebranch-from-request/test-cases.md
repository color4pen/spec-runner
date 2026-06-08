# Test Cases: adapter baseBranch fallback sourced from request.md

## Summary

- **Total**: 12 cases
- **Automated** (unit/integration): 11
- **Manual**: 1
- **Priority**: must: 8, should: 3, could: 1

---

### TC-001: non-default base branch propagates to StepContext — claude-code adapter

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Adapters SHALL source StepContext baseBranch from the request base branch > Scenario: non-default base branch propagates to StepContext

---

### TC-002: missing requestBaseBranch falls back to main — claude-code adapter

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Adapters SHALL source StepContext baseBranch from the request base branch > Scenario: missing requestBaseBranch falls back to main

---

### TC-003: non-default base branch propagates to StepContext — codex adapter

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Adapters SHALL source StepContext baseBranch from the request base branch > Scenario: non-default base branch propagates to StepContext

---

### TC-004: missing requestBaseBranch falls back to main — codex adapter

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Adapters SHALL source StepContext baseBranch from the request base branch > Scenario: missing requestBaseBranch falls back to main

---

### TC-005: non-default base branch propagates to StepContext — managed-agent adapter

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Adapters SHALL source StepContext baseBranch from the request base branch > Scenario: non-default base branch propagates to StepContext

---

### TC-006: missing requestBaseBranch falls back to main — managed-agent adapter

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Adapters SHALL source StepContext baseBranch from the request base branch > Scenario: missing requestBaseBranch falls back to main

---

### TC-007: executor fills requestBaseBranch from parsed request

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Adapters SHALL source StepContext baseBranch from the request base branch > Scenario: executor fills requestBaseBranch from parsed request

---

### TC-008: `AgentRunInput` が `requestBaseBranch?: string` を持つ

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `src/core/port/agent-runner.ts` の `AgentRunInput` インターフェース
**WHEN** TypeScript compiler が型チェック (`bun run typecheck`) を実行する
**THEN** `requestBaseBranch?: string` フィールドが存在し、`requestAdr?` の直後に配置されており、typecheck が green になる

---

### TC-009: ハードコードされた `baseBranch: "main"` が 3 adapter に残存しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** `src/adapter/claude-code/agent-runner.ts`、`src/adapter/codex/agent-runner.ts`、`src/adapter/managed-agent/agent-runner.ts`
**WHEN** ソースコードを静的に確認する
**THEN** `baseBranch: "main"` というリテラル代入が存在せず、すべて `ctx.input.requestBaseBranch ?? "main"` 形式になっている

---

### TC-010: `master` を requestBaseBranch に渡した場合に正しく伝搬する

**Category**: unit
**Priority**: should
**Source**: design.md > D1

**GIVEN** `requestBaseBranch: "master"` を含む `AgentRunContext` で adapter を実行する
**WHEN** adapter の `run()` が StepContext を構築し `buildMessage` を呼ぶ
**THEN** StepContext の `request.baseBranch` は `"master"` である

---

### TC-011: 既存テストが `requestBaseBranch` 未指定でも壊れない

**Category**: unit
**Priority**: should
**Source**: design.md > D2, tasks.md > T-04

**GIVEN** `requestBaseBranch` フィールドを含まない既存の adapter テストケース群
**WHEN** `bun run test` を実行する
**THEN** すべての既存テストが引き続き green になる（fallback により振る舞いが不変）

---

### TC-012: `architecture/components.md` の AgentRunInput 記述が実装と一致する

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-05

**GIVEN** `architecture/components.md` の主要 DTO 記述
**WHEN** `AgentRunInput` の input フィールド一覧を確認する
**THEN** `requestBaseBranch?` が `requestAdr?` と同列に追記されており、実装の `AgentRunInput` インターフェースと一致している

---

## Result

```yaml
result: completed
total: 12
automated: 11
manual: 1
must: 8
should: 3
could: 1
blocked_reasons: []
```
