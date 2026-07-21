# Regression Gate Result — iteration 002

**Change**: job-reopen-from-awaiting-archive  
**Gate**: regression-gate  
**Date**: 2026-07-22

---

## Verification Summary

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | REOPEN_USAGE リテラル配列 | LOW | ✅ FIXED |
| 2 | FoldResult.operatorEvents オプショナル | LOW | ✅ FIXED |
| 3 | null store → 無言スキップ | LOW | ✅ FIXED (iter 1 から継続) |
| 4 | null store → fail-closed 未実装 | HIGH | ✅ FIXED (iter 1 から継続) |
| 5 | allowReopen static invariant test 未追加 | MEDIUM | ✅ FIXED (iter 1 から継続) |
| 6 | B-13 が appendOperatorEvent を除外 | LOW | ✅ FIXED |
| 7 | codeChangedSinceLastVerification が human push を検知できない | MEDIUM | ❌ NOT FIXED |

---

## Evidence

### Finding 1 — REOPEN_USAGE リテラル配列 [LOW] ✅ FIXED

**File**: `src/cli/command-registry.ts:293`

commit `e1438f7b5` で修正済み。`REOPEN_USAGE` の `--from` valid steps 列挙が動的参照に切り替わっている:

```typescript
Valid steps: ${[...AGENT_STEP_NAMES, ...CLI_STEP_NAMES].join(", ")}
```

iteration 001 で NOT FIXED だった箇所が今回修正されている。

---

### Finding 2 — FoldResult.operatorEvents オプショナル [LOW] ✅ FIXED

**File**: `src/store/event-journal.ts:185`

commit `e1438f7b5` で修正済み。`?` が除去され `required` フィールドになっている:

```typescript
operatorEvents: OperatorEventRecord[];
```

コメントも「fold() always populates this field; literal constructors must provide it (empty array when no operator events exist)」に更新され意図が明確化されている。

---

### Finding 3 — null store → 無言スキップ [LOW] ✅ FIXED

**File**: `src/core/command/reopen.ts:233–241`

iteration 001 で修正済み（commit `7344380d9`）、regression なし。`resolveStateStoreByJobId` が null を返す場合は `PrepareError(1)` を throw する fail-closed 実装が継続している。

---

### Finding 4 — null store → fail-closed 未実装 [HIGH] ✅ FIXED

**File**: `src/core/command/reopen.ts:229`

Finding 3 と同一修正で継続維持。`if (store)` パターンは除去済み。D6 durability 保証が成立している。

---

### Finding 5 — allowReopen static invariant test 未追加 [MEDIUM] ✅ FIXED

**File**: `tests/unit/architecture/core-invariants.test.ts:1187`

iteration 001 で修正済み（commit `7344380d9`）、regression なし。B-17 テストスイートが存在し:
- `allowReopen: true` が `reopen.ts` 以外の src/ ファイルに存在しないことを grep で機械的に検証
- liveness テスト（少なくとも1件の match が存在すること）も含む
- regression guard（他ファイルへの注入を検出できることの確認）も含む

---

### Finding 6 — B-13 が appendOperatorEvent を除外 [LOW] ✅ FIXED

**File**: `tests/unit/architecture/core-invariants.test.ts:1016, 1026, 1052`

commit `e1438f7b5` で修正済み。B-13 の grep pattern に `appendOperatorEvent` が追加されている:

```typescript
`"store\\.(persist|fail|update|appendHistory|appendInterruption|appendLineage|appendStepRun|appendOperatorEvent)\\("`
```

executor.ts / parallel-review-round.ts / liveness 確認の 4 テスト全てで同一 pattern を使用。iteration 001 で NOT FIXED だった箇所が今回修正されている。

---

### Finding 7 — codeChangedSinceLastVerification が human push を検知できない [MEDIUM] ❌ NOT FIXED

**File**: `src/core/pipeline/reverification.ts`

cross-boundary-invariants-result-004.md（I-17 / F-02）で指摘済みの欠陥が修正されていない。`reverification.ts` は `git diff main...HEAD` で差分ゼロ。現在も endedAt タイムスタンプのみで比較している:

```typescript
export function codeChangedSinceLastVerification(state: JobState): boolean {
  const verificationRuns = state.steps?.[STEP_NAMES.VERIFICATION] ?? [];
  const vTime = verificationRuns.reduce(...);

  let mTime = "";
  for (const stepName of IMPL_CODE_MUTATOR_STEPS) { ... }

  return mTime > vTime;
}
```

STANDARD_TRANSITIONS の conformance → verification routing（`codeChangedSinceLastVerification` が guard）は git HEAD を参照せず、human push を検知できない。

**再現経路** (I-17 で確認済み):
1. `awaiting-archive` から `job reopen --from code-review`
2. human が fix を push（code-fixer 不発動で code-review が clean）
3. conformance が approved
4. `codeChangedSinceLastVerification` → false（impl step の endedAt が verification より新しくないため）
5. conformance → verification をスキップして adr-gen に直行

`conformanceApprovedForVerifiedRevision` は `verification → adr-gen` 遷移のみに存在し、`conformance → adr-gen` bypass を防がない。design.md D5 の記述は不正確。

修正案（cross-boundary-invariants-004 F-02 より）:
- **オプション A**: `codeChangedSinceLastVerification` を git HEAD commitOid ベースに変更
- **オプション B**: reopen job では `codeChangedSinceLastVerification` を true 固定にする routing フラグを追加
- **オプション C**: `conformance → adr-gen` 遷移にも commitOid 照合チェックを追加

---

## Checked Evidence

- `git diff main...HEAD` で全差分確認（43 ファイル、5,895 挿入、13 削除）
- `git diff main...HEAD -- src/core/pipeline/reverification.ts` → 差分ゼロを確認
- 各対象ファイルを直接読み込み修正の有無を検証
- cross-boundary-invariants-result-004.md で I-17 / F-02 の発生経路を確認
- regression-gate-result-001.md で iteration 1 との比較を確認
