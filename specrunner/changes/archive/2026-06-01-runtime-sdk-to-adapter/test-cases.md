# Test Cases: runtime-sdk-to-adapter

## Summary

- **Total**: 22 cases
- **Automated** (unit/integration): 21
- **Manual**: 1
- **Priority**: must: 16, should: 5, could: 1

---

### TC-001: defaultQueryFn が agent-runner.ts から named export されている

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01 / design.md D1

**GIVEN** `src/adapter/claude-code/agent-runner.ts` に `defaultQueryFn` の export が追加されている  
**WHEN** `import { defaultQueryFn } from "../../adapter/claude-code/agent-runner.js"` でインポートする  
**THEN** `defaultQueryFn` が `undefined` でなく関数として解決される

---

### TC-002: defaultQueryFn の型が QueryFn に適合する

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01 / design.md D1

**GIVEN** `defaultQueryFn` が `export const defaultQueryFn: QueryFn = sdkQuery as unknown as QueryFn` で定義されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが発生せず exit code が 0 である

---

### TC-003: ClaudeCodeRunner constructor 内の sdkQuery 直接参照が維持されている

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01 Acceptance Criteria（"既存の ClaudeCodeRunner constructor 内の sdkQuery 使用は変更しない"）

**GIVEN** `adapter/claude-code/agent-runner.ts` に `defaultQueryFn` が追加されている  
**WHEN** `ClaudeCodeRunner` を `_queryFn` 注入なしでインスタンス化する  
**THEN** `this.queryFn = deps._queryFn ?? (sdkQuery as unknown as QueryFn)` の行が変更されておらず、adapter 内部での sdkQuery 利用が維持されている

---

### TC-004: local.ts に @anthropic-ai/claude-agent-sdk の import が存在しない

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-02 Acceptance Criteria / request.md 受け入れ基準

**GIVEN** `src/core/runtime/local.ts` の SDK import が削除されている  
**WHEN** `grep "@anthropic-ai/claude-agent-sdk" src/core/runtime/local.ts` を実行する  
**THEN** マッチ件数が 0 件である

---

### TC-005: core/ 全体に @anthropic-ai/* の直 import が存在しない（B-2 invariant 充足）

**Category**: integration  
**Priority**: must  
**Source**: tasks.md T-02 Acceptance Criteria / request.md 受け入れ基準

**GIVEN** `local.ts` の SDK import が削除されている  
**WHEN** `grep -r "@anthropic-ai/" src/core/` を実行する  
**THEN** 結果が 0 件である

---

### TC-006: local.ts が defaultQueryFn を adapter の import 行に含んでいる

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-02 / design.md D2

**GIVEN** `src/core/runtime/local.ts` が編集されている  
**WHEN** import セクションの `agent-runner.js` import 行を参照する  
**THEN** `import { createClaudeCodeRunner, defaultQueryFn, type QueryFn } from "../../adapter/claude-code/agent-runner.js"` のように `defaultQueryFn` が含まれている

---

### TC-007: LocalRuntime constructor の queryFn デフォルト値が defaultQueryFn に変わっている

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-02 / design.md D2

**GIVEN** `local.ts` の SDK import が削除され `defaultQueryFn` が import されている  
**WHEN** constructor 内の `this.queryFn = ...` 行を参照する  
**THEN** `this.queryFn = opts.queryFn ?? defaultQueryFn;` であり、`sdkQuery as unknown as QueryFn` キャストが存在しない

---

### TC-008: LocalRuntimeOptions の queryFn シグネチャが不変

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-02 Acceptance Criteria（"constructor シグネチャは不変"）

**GIVEN** `local.ts` が編集されている  
**WHEN** `LocalRuntimeOptions` インターフェース定義を参照する  
**THEN** `queryFn?: QueryFn` フィールドが存在し、型が変わっていない

---

### TC-009: queryFn 注入がテスト用 seam として機能する

**Category**: unit  
**Priority**: must  
**Source**: request.md 要件 1（"`queryFn` 注入口はテスト用 seam として残す"）

**GIVEN** `LocalRuntime` を `queryFn: mockQueryFn` で生成した  
**WHEN** `runtime.query(prompt, opts)` を呼び出す  
**THEN** `mockQueryFn` が呼ばれ、`defaultQueryFn` は呼ばれない

---

### TC-010: arch-allowlist.ts の R2 (B-2) エントリが削除されている

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-03 Acceptance Criteria / request.md 受け入れ基準

**GIVEN** `tests/unit/architecture/arch-allowlist.ts` が編集されている  
**WHEN** `tracking: "R2"` かつ `invariant: "B-2"` のエントリを検索する  
**THEN** 該当エントリが存在しない

---

### TC-011: 他の allowlist エントリ（B-1 / B-3 / B-4 / B-6 / B-8）が変更されていない

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-03 Acceptance Criteria（"他の allowlist エントリは変更されていない"）

**GIVEN** `arch-allowlist.ts` の R2 (B-2) エントリを削除した後  
**WHEN** B-1 / B-3 / B-4 / B-6 / B-8 の各エントリ数を変更前と比較する  
**THEN** 各エントリが 1 件も増減せずに残っている

---

### TC-012: B-2 エントリが 0 件になった場合のセクションコメント削除

**Category**: unit  
**Priority**: should  
**Source**: tasks.md T-03（"B-2 エントリが 0 件になる場合はセクションコメントごと削除する"）

**GIVEN** ARCH_ALLOWLIST の B-2 エントリが R2 の 1 件のみだった  
**WHEN** R2 エントリを削除する  
**THEN** `// ── B-2: external SDK types must not leak outside adapter/` セクションコメントが存在しない

---

### TC-013: architecture enforcement suite が green

**Category**: integration  
**Priority**: must  
**Source**: tasks.md T-03 Acceptance Criteria / T-04 Acceptance Criteria

**GIVEN** R2 エントリ削除 + local.ts SDK import 除去が完了している  
**WHEN** `bun run test -- tests/unit/architecture/core-invariants.test.ts` を実行する  
**THEN** すべてのテストが pass し、B-2 チェックが新たな violation を報告しない

---

### TC-014: ratchet が機能する（R2 allowlist 削除後の再違反検出）

**Category**: unit  
**Priority**: should  
**Source**: design.md D3 / request.md（"ratchet が fix の完全性を機械強制"）

**GIVEN** R2 エントリが arch-allowlist.ts から削除されている  
**WHEN** `core/` 配下のファイルに `@anthropic-ai/claude-agent-sdk` import を意図的に追加してテストを実行する  
**THEN** `core-invariants.test.ts` の B-2 テストが red になる（ratchet が機能している）

---

### TC-015: bun run build が green

**Category**: manual  
**Priority**: must  
**Source**: tasks.md T-04 Acceptance Criteria

**GIVEN** T-01 / T-02 / T-03 の変更がすべて適用されている  
**WHEN** `bun run build` を実行する  
**THEN** exit code が 0 である

---

### TC-016: bun run typecheck が green

**Category**: integration  
**Priority**: must  
**Source**: tasks.md T-04 Acceptance Criteria

**GIVEN** T-01 / T-02 / T-03 の変更がすべて適用されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** exit code が 0 であり、型エラーが 0 件である

---

### TC-017: bun run lint が green

**Category**: integration  
**Priority**: must  
**Source**: tasks.md T-04 Acceptance Criteria

**GIVEN** T-01 / T-02 / T-03 の変更がすべて適用されている  
**WHEN** `bun run lint` を実行する  
**THEN** exit code が 0 であり、lint エラーが 0 件である

---

### TC-018: bun run test が green（全 suite）

**Category**: integration  
**Priority**: must  
**Source**: tasks.md T-04 Acceptance Criteria

**GIVEN** T-01 / T-02 / T-03 の変更がすべて適用されている  
**WHEN** `bun run test` を実行する  
**THEN** すべてのテスト（architecture enforcement 含む）が pass し、exit code が 0 である

---

### TC-019: LocalRuntime.query() の実行挙動が変わらない

**Category**: unit  
**Priority**: must  
**Source**: request.md スコープ外（"振る舞い変更はスコープ外"）

**GIVEN** `LocalRuntime` を `queryFn` 注入なしでインスタンス化し、queryFn を spy している  
**WHEN** `runtime.query(prompt, opts)` を呼び出す  
**THEN** `defaultQueryFn`（実質 `sdkQuery`）が呼ばれ、メッセージが yield される。変更前後で呼び出しパラメータが同一である

---

### TC-020: LocalRuntime.createAgentRunner() が queryFn を ClaudeCodeRunner に引き渡す

**Category**: unit  
**Priority**: must  
**Source**: local.ts（`createClaudeCodeRunner({ cwd: worktreeCwd, _queryFn: this.queryFn })`）

**GIVEN** `LocalRuntime` を `queryFn: mockFn` で生成した上で `setupWorkspace` を呼んだ  
**WHEN** `runtime.createAgentRunner()` を呼び出す  
**THEN** 返された `AgentRunner` 内部の `ClaudeCodeRunner` が `mockFn` を `queryFn` として保持している

---

### TC-021: defaultQueryFn の追加が B-1 テストに影響しない

**Category**: integration  
**Priority**: should  
**Source**: design.md Risks（"`defaultQueryFn` を export することで adapter の public surface が 1 つ増える"）

**GIVEN** `defaultQueryFn` が `agent-runner.ts` から export されている  
**WHEN** `core-invariants.test.ts` の B-1 テストを実行する  
**THEN** B-1 テストが green のままであり、新たな B-1 violation が報告されない

---

### TC-022: as unknown as QueryFn キャストが adapter 内にのみ存在する

**Category**: unit  
**Priority**: should  
**Source**: design.md Risks / D1（"キャスト除去が容易になる"）

**GIVEN** `local.ts` の変更が適用されている  
**WHEN** `src/core/` 配下のファイルで `as unknown as QueryFn` を検索する  
**THEN** `src/core/runtime/local.ts` に該当コードが存在せず、キャストは `adapter/claude-code/agent-runner.ts` のみに存在する

---

## Result

```yaml
result: completed
total: 22
automated: 21
manual: 1
must: 16
should: 5
could: 1
blocked_reasons: []
```
