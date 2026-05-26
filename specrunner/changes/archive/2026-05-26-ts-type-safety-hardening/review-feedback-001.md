# Code Review — ts-type-safety-hardening — iter 1

- **verdict**: approved

## Summary

全 must テストケース (A-1〜A-9, B-1〜B-6, C-1〜C-2, D-1) がパス。`as unknown as` 6 箇所の削除と `DomainEvent` 型制約の両方が正しく実装されており、typecheck + 2964 tests が green。軽微なスコープ外変更が 2 件あるが blocking レベルではない。

---

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | LOW | maintainability | `src/adapter/managed-agent/anthropic-client.ts:9` | SDK 型を deep subpath `@anthropic-ai/sdk/resources/beta/agents/agents.js` から直接 import している。SDK がパッケージ構造を変更した場合にパスが壊れるリスクがある | SDK がルートから re-export するようになれば `@anthropic-ai/sdk` からの import に変更する（現時点では .d.ts で確認済みのパスなので許容範囲） | no |
| 2 | LOW | scope | `src/prompts/fragments.ts:80` | `\| 7 \|` → `\| 7.0 \|` の cosmetic 変更はこの request のスコープ外（test-cases.md D-3 should 違反） | 別 commit / 別 PR に分離することが望ましいが behavioral impact なし | no |
| 3 | LOW | scope | `tests/pipeline-integration.test.ts:2119-2121` | `!t.when` ガード追加と comment はスコープ外（test-cases.md D-3 should 違反）。ただしこれは pre-existing な test の ambiguity 修正であり、改善として妥当 | 別 commit / 別 PR に分離することが望ましいが regression リスクなし | no |

---

## Test Case Coverage

### A. anthropic-client.ts `as unknown as` 廃止

| TC | Priority | Result | Note |
|----|----------|--------|------|
| A-1 `as unknown as` 残存なし | must | ✅ pass | grep 0 件確認 |
| A-2 `toSdkTool` 戻り値型 | must | ✅ pass | `BetaManagedAgentsAgentToolset20260401Params \| BetaManagedAgentsCustomToolParams` |
| A-3 SDK 型 import | must | ✅ pass | L9 で両型を import |
| A-4 `createAgent` tools キャスト削除 | must | ✅ pass | `def.tools.map(toSdkTool)` のみ |
| A-5 `updateAgent` tools キャスト削除 | must | ✅ pass | `def.tools.map(toSdkTool)` のみ |
| A-6 `createAgent` return `agent.version` | must | ✅ pass | L44 |
| A-7 `retrieveAgent` return `agent.version` | must | ✅ pass | L49、`?? 1` fallback なし |
| A-8 `updateAgent` return `agent.version` | must | ✅ pass | L60 |
| A-9 `updateAgent` `current.version` | must | ✅ pass | L55 |

### B. executor emit forwarder 型安全化

| TC | Priority | Result | Note |
|----|----------|--------|------|
| B-1 `AgentRunContext.emit` が `DomainEvent` | must | ✅ pass | `port/agent-runner.ts` L51 |
| B-2 `DomainEvent` import in port | must | ✅ pass | L16 `../event/types.js` |
| B-3 typo event 名で compile error | must | ✅ pass | typecheck green が証明（`"step:progrss"` は `DomainEvent` union 外） |
| B-4 executor forwarder キャスト削除 | must | ✅ pass | `event as Parameters<EventBus["emit"]>[0]` 消去、`event` 直接渡し |
| B-5 `emitFn` 引数型 `DomainEvent` | must | ✅ pass | `claude-code/agent-runner.ts` L80 |
| B-6 `DomainEvent` import in claude-code adapter | must | ✅ pass | L30 |

### C. 型チェック・テスト

| TC | Priority | Result | Note |
|----|----------|--------|------|
| C-1 `bun run typecheck` green | must | ✅ pass | 0 errors |
| C-2 `bun run test` green | must | ✅ pass | 2964 passed |

### D. Regression

| TC | Priority | Result | Note |
|----|----------|--------|------|
| D-1 `"step:progress"` emit 正常動作 | must | ✅ pass | `DomainEvent` union に含まれる確認済み |
| D-2 `emit` string 型定義が残っていない | should | ✅ pass | port / executor / adapter すべて `DomainEvent` |
| D-3 スコープ外ファイルに変更なし | should | ⚠️ partial | `fragments.ts` と `pipeline-integration.test.ts` に cosmetic / test 修正あり（低リスク） |

---

## Scoring

| Category | Score | Weight | Weighted |
|----------|-------|--------|---------|
| correctness | 10 | 0.30 | 3.00 |
| security | 10 | 0.25 | 2.50 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 10 | 0.10 | 1.00 |
| maintainability | 9 | 0.10 | 0.90 |
| testing | 9 | 0.10 | 0.90 |
| **Total** | | | **9.65** |

承認閾値 7.0 を大きく上回る。実装は request.md の受け入れ基準をすべて満たしている。
