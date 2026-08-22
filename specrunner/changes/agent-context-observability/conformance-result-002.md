# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Request Acceptance Criteria (9 items)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| AC-1 | 累計 `ModelUsage` と active context metric が意味上・型上区別される | ✓ | `ModelUsage` stays 4-field (model-usage.ts). `AgentContextMetrics` is a separate type in `src/kernel/context-metrics.ts`. `AgentRunResult.contextMetrics` is a separate field from `modelUsage` and `invocationMetrics`. |
| AC-2 | provider が active context size を報告できる場合、invocation 中の peak を記録できる | ✓ | `createContextObserver` tracks `peakActiveContextTokens` as max(input + cacheRead + cacheCreate) across non-sub-agent, non-replay assistant messages. |
| AC-3 | provider が compaction を報告できる場合、回数と before / after context size を記録できる | ✓ | `compact_boundary` system messages increment `compactionCount` and update `contextTokensBeforeCompaction` / `contextTokensAfterCompaction` (last-wins). |
| AC-4 | context exhaustion 時、取得可能なら exhaustion 時点の context size が残る | ✓ | `markExhaustion` sets `exhaustionAtTokens` to `lastActiveContextTokens` only when `isContextExhaustionError` matches and a prior observation exists. |
| AC-5 | context size を取得できない provider では値を捏造せず unavailable として扱う | ✓ | Codex/Managed adapters never set `contextMetrics`. Claude adapter returns `undefined` from `snapshot()` when no observations were made. |
| AC-6 | job 完了後に step / model / provider 単位で context metrics を確認できる | ✓ | `usage.json` entries carry `contextMetrics` with `provider`/`model`. `usage show` outputs `context:` line with all observed fields. |
| AC-7 | 既存 `ModelUsage` / cost 集計の意味を変更しない | ✓ | Halt entries use `modelUsage: null` and carry no invocation metrics; `Totals by model:` section only accumulates from truthy `modelUsage`. |
| AC-8 | Claude / Codex adapter のどちらか一方の仕様を core 契約として固定しない | ✓ | `AgentContextMetrics` carries no Claude-specific trigger/threshold/policy fields. Core types remain provider-neutral. |
| AC-9 | typecheck / test green | ✓ | `bun run typecheck` exits 0 (no errors). `bun run test` reports 826 test files passed, 12284 tests passed. |

### Spec Requirements (8 Requirements, 18 Scenarios)

#### Requirement 1: context metrics は累計 ModelUsage と別の型で表現される

- **SHALL NOT add context fields to `ModelUsage`** → `model-usage.ts` has exactly 4 fields (`inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`). No context fields added. ✓
- **`ModelUsage` MUST NOT be reinterpreted as active context** → No such reuse found anywhere in the implementation. ✓
- **`AgentContextMetrics` has `provider` (required) + `model` (optional) + 6 optional observation fields** → Confirmed in `src/kernel/context-metrics.ts`. ✓

Scenario: ModelUsage の形が変わらない → ✓  
Scenario: context metrics が独立型として存在する → `contextMetrics` field is `AgentContextMetrics` type, separate from `modelUsage`/`invocationMetrics` in `AgentRunResult`. ✓

#### Requirement 2: Claude adapter は provider が報告した active context の peak を記録する

- **SHALL record the maximum observed value as `peakActiveContextTokens`** → `context-observer.ts` tracks `max(input_tokens + cache_read + cache_create)` across all qualifying messages. ✓
- **MUST count each SDK message at most once** → `observe()` is called once per message in each loop (main, follow-up, repair); `observeMessage` is separate and not mixed. ✓

Scenario: 複数 turn の assistant message から最大値を採る → max logic confirmed in `context-observer.ts`. ✓  
Scenario: sub-agent と replay の message は peak に数えない → `parent_tool_use_id !== null/undefined` → return; `isReplay === true` → return. ✓  
Scenario: 同一 message を二重に数えない → Each loop calls `contextObserver.observe()` exactly once per message, never duplicating. ✓

#### Requirement 3: Claude adapter は provider native compaction の発火を記録する

- **SHALL increment `compactionCount` for every observed compaction boundary** → `compactionCount = (compactionCount ?? 0) + 1` on each `type: "system", subtype: "compact_boundary"`. ✓
- **SHALL record `contextTokensBeforeCompaction` / `contextTokensAfterCompaction` from the most recently observed boundary** → Last compaction wins (overwrite semantics). ✓
- **`contextTokensAfterCompaction` is undefined when `post_tokens` is absent** → `else { contextTokensAfterCompaction = undefined }` clears stale value. ✓

Scenario: compaction 2 回で回数と直近の前後値が残る → Last compaction's before/after wins. ✓  
Scenario: after 値を返さない compaction → `post_tokens` absent → `contextTokensAfterCompaction = undefined`. ✓

#### Requirement 4: context exhaustion 時に観測できていた context size が残る

- **SHALL set `exhaustionAtTokens` to the most recently observed active context size** → `markExhaustion` sets `exhaustionAtTokens = lastActiveContextTokens` only when `isContextExhaustionError` is true AND `lastActiveContextTokens !== undefined`. ✓
- **`exhaustionAtTokens` is undefined when no prior observation exists** → `if (lastActiveContextTokens !== undefined)` guard. ✓
- **Exhaustion halt metrics are persisted as permanent data** → `commitHalt` appends to `usage.json` when `halt.contextMetrics !== undefined`. ✓

Scenario: 溢れ直前の観測値が exhaustionAtTokens になる → `lastActiveContextTokens` (last observed) stored as `exhaustionAtTokens`. ✓  
Scenario: 観測が無い場合は値を作らない → `exhaustionAtTokens` stays undefined when no prior observation. ✓  
Scenario: context 溢れ以外の失敗では exhaustionAtTokens を付けない → `isContextExhaustionError` is fail-closed; non-exhaustion errors return false. ✓

#### Requirement 5: 報告能力の無い provider では context metrics を捏造しない

- **SHALL leave `contextMetrics` undefined** → Codex and Managed runners have no `contextMetrics` set in any return path (confirmed by grep: only doc comment references). ✓
- **MUST NOT derive any context value from cumulative token usage** → No such derivation in any adapter. ✓
- **Claude adapter with zero observations returns undefined** → `snapshot()` returns `undefined` when all 6 observable fields are undefined. ✓

Scenario: Codex / Managed runtime は unavailable → `contextMetrics` absent in both adapters' return values. ✓  
Scenario: 観測ゼロの invocation では record を作らない → `snapshot()` returns `undefined` when `hasAnyValue` is false. ✓

#### Requirement 6: context metrics は usage.json に永続化され step / model / provider 単位で確認できる

- **Success step SHALL record context metrics through the existing usage append path** → `applySuccessPostPersistEffects` includes `contextMetrics` in `appendInvocation` call when present. ✓
- **Halted step SHALL append one usage entry when — and only when — context metrics were observed** → `commitHalt` appends only when `halt.contextMetrics !== undefined`. ✓

Scenario: 成功 step の context metrics が usage.json に残る → Confirmed in `commit-orchestrator.ts` `applySuccessPostPersistEffects`. ✓  
Scenario: exhaustion で halt した step の metrics が usage.json に残る → `commitHalt` writes entry with `modelUsage: null` + `contextMetrics`. ✓  
Scenario: usage show が context 行を表示する → `usage-show.ts` outputs `context:` line with all observed fields using `key=value` format. ✓  
Scenario: context metrics を持たない entry では context 行を出さない → `if (inv.contextMetrics)` guard prevents line from printing. ✓

#### Requirement 7: 既存の usage / cost 集計の意味を変えない

- **Halt entry MUST carry `modelUsage: null`** → `commitHalt` passes `modelUsage: null` to `appendInvocation`. ✓
- **MUST NOT carry invocation metrics** → Halt entry only includes `command`, `timestamp`, `modelUsage: null`, `jobId`, `stepName`, `contextMetrics`. No `numTurns`/`durationMs`/etc. ✓
- **Context metrics not observed in halt → no entry** → `halt.contextMetrics !== undefined` guard prevents append. ✓

Scenario: halt entry が cost 集計を動かさない → `Totals by model:` only accumulates truthy `modelUsage`; null entries are skipped. ✓  
Scenario: context metrics の無い halt では entry を追加しない → Guard `halt.contextMetrics !== undefined` prevents append. ✓

#### Requirement 8: core 契約は provider 中立に保たれる

- **Core type SHALL expose only provider-neutral optional fields** → `AgentContextMetrics` has no trigger type, threshold, or compaction policy field. ✓
- **MUST NOT encode provider-specific compaction triggers, thresholds, or policies** → No such fields exist in `AgentContextMetrics`. ✓
- **Provider-specific event interpretation is in adapter layer** → `isContextExhaustionError` is in `src/adapter/claude-code/context-observer.ts`. ✓

Scenario: core 型に provider 固有語彙が無い → `AgentContextMetrics` has only generic fields. ✓  
Scenario: 片方の provider だけが実装しても core が壊れない → Codex/Managed return undefined; core handles optionality throughout. ✓

---

## 検証できなかった項目

None — all 47 normative items were verified through code inspection and test execution.

---

## Findings 詳細

None. No normative findings.

---

## Plan Divergences (non-normative notes, not findings)

1. **`applySuccessPostPersistEffects` guard**: Uses `(modelUsage || contextMetrics !== undefined)` to allow writing a usage entry even when `modelUsage` is absent but `contextMetrics` is present. This is correct per design D7 intent and matches the spec requirement.

2. **`commitHalt` `deps` parameter**: Implemented as optional 4th argument, passed from `apply()`. Guarded by `halt.contextMetrics !== undefined && deps?.cwd && deps?.slug`. Matches D7 "best-effort" intent.

3. **`context-metrics.ts` zero imports**: Confirmed — the module has no `import` statements from `src/`. Pure type module satisfying T-01 acceptance criteria and B-3 invariant.

4. **`snapshot()` empty-record prevention**: When all 6 observable fields are undefined, `snapshot()` returns `undefined` (not `{ provider }`). This satisfies the spec's "provider だけを持つ空 record は作られない" requirement.
