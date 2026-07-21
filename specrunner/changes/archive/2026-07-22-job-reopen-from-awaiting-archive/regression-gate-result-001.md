# Regression Gate Result — iteration 001

**Change**: job-reopen-from-awaiting-archive  
**Gate**: regression-gate  
**Date**: 2026-07-22

---

## Verification Summary

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | REOPEN_USAGE リテラル配列 | LOW | ❌ NOT FIXED |
| 2 | FoldResult.operatorEvents オプショナル | LOW | ❌ NOT FIXED |
| 3 | null store → 無言スキップ | LOW | ✅ FIXED |
| 4 | null store → fail-closed 未実装 | HIGH | ✅ FIXED |
| 5 | allowReopen static invariant test 未追加 | MEDIUM | ✅ FIXED |
| 6 | B-13 が appendOperatorEvent を除外 | LOW | ❌ NOT FIXED |

---

## Evidence

### Finding 1 — REOPEN_USAGE リテラル配列 [LOW] **NOT FIXED**

**File**: `src/cli/command-registry.ts:293–295`

`REOPEN_USAGE` 内の --from valid steps 列挙が依然としてリテラル配列のまま:

```typescript
Valid steps: ${[...["request-review", "design", "spec-review", "spec-fixer",
  "test-case-gen", "implementer", "verification", "build-fixer", "code-review",
  "code-fixer", "conformance", "adr-gen", "pr-create"]].join(", ")}
```

`--from` フラグのバリデーション（同ファイル line 642）は `[...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]` を正しく使用しているが、help text は動的参照に切り替わっていない。code-fixer コミット（7344380d9、b4cbf81a5）ともに `command-registry.ts` を変更していない。

**期待される修正**: `${[...AGENT_STEP_NAMES, ...CLI_STEP_NAMES].join(", ")}`

---

### Finding 2 — FoldResult.operatorEvents オプショナル [LOW] **NOT FIXED**

**File**: `src/store/event-journal.ts:185`

```typescript
operatorEvents?: OperatorEventRecord[];
```

`fold()` は常にこのフィールドに配列を返すが、インターフェースは `?` 付きのままで型精度の低下が残る。コメント（"Optional for backward compat with code that constructs FoldResult literals; fold() always populates this field."）は追加済み。また `job-journal.ts:148` および `job-state-projection.ts:74` の手書き FoldResult リテラルに `operatorEvents: []` が追加されたことで実用上の問題は回避されているが、型システム上は `?` が残存している。

**影響**: 型安全性の軽微な低下。ランタイム挙動に影響なし。

---

### Finding 3 — null store → 無言スキップ [LOW] **FIXED**

**File**: `src/core/command/reopen.ts:234–241`

code-fixer コミット 7344380d9 で修正済み。`resolveStateStoreByJobId` が null を返すケースで `PrepareError(1)` を throw する fail-closed 実装に変更:

```typescript
const resolved = await resolveStateStoreByJobId(cwd, state.jobId);
if (resolved === null) {
  logError(
    `Cannot locate a writable state store for job '${this.slug}' (sidecar missing). ` +
    `The job state is inaccessible — reopen cannot proceed without a durable store.`,
  );
  throw new PrepareError(1, "State store unavailable — sidecar missing");
}
store = resolved;
```

---

### Finding 4 — null store fail-closed 未実装 [HIGH] **FIXED**

**File**: `src/core/command/reopen.ts:229`

Finding 3 と同一コミット（7344380d9）で修正。`if (store)` パターンが除去され、null 時は PrepareError throw + 非ゼロ exit となる。D6 durability 保証が成立。

---

### Finding 5 — allowReopen static invariant test 未追加 [MEDIUM] **FIXED**

**File**: `tests/unit/architecture/core-invariants.test.ts`

code-fixer コミット 7344380d9 で B-17 テストが追加済み（line 1187–1270+）:

```
describe("B-17 (arch pin): allowReopen: true は src/core/command/reopen.ts からのみ呼ばれる", ...)
```

- `allowReopen: true` が `reopen.ts` 以外の src/ ファイルに存在しないことを grep で機械的に検証
- liveness テスト（少なくとも1件の match が存在すること）も含む
- regression guard（`resume.ts` への注入を検出できることの確認）も含む

---

### Finding 6 — B-13 が appendOperatorEvent を除外 [LOW] **NOT FIXED**

**File**: `tests/unit/architecture/core-invariants.test.ts:1016`

B-13 の grep pattern が変更されておらず、`appendOperatorEvent` を含まない:

```typescript
const raw = grepE(
  `"store\\.(persist|fail|update|appendHistory|appendInterruption|appendLineage|appendStepRun)\\("`,
  "src/core/step/executor.ts",
);
```

`appendInterruption` と `appendLineage` は含まれているが `appendOperatorEvent` のみ漏れている。cross-boundary-invariants-result-003.md の I-08 でも同様のギャップが確認されている。現在の実装では `executor.ts` / `parallel-review-round.ts` からの呼び出しは0件であり機能的な欠陥は存在しないが、将来の誤追加が機械的に検出されない。

code-fixer コミット 7344380d9 は `core-invariants.test.ts` を変更しているが B-17 の追加のみで B-13 の pattern は未変更。

---

## Checked Evidence

- `git diff main...HEAD` で全差分確認
- 各対象ファイルを直接読み込み、修正の有無を確認
- code-fixer コミット一覧（7344380d9, b4cbf81a5）の変更ファイルを確認
- cross-boundary-invariants-result-003.md で迂回路の確認
