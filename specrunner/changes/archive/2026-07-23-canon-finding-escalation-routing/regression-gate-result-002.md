# Regression Gate Result — Iteration 2

Date: 2026-07-23

## Evidence Summary

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | LOW | escalationReason の後因果判定 — ok=false + 正典 finding 共存で誤付与 | ✅ Fixed |
| 2 | LOW | judgeVerdictFn コメントの陳腐化 — deriveRegressionGateVerdict の引数数が変わった | ✅ Fixed |
| 3 | LOW | TC-023 未実装 — 非 canon 由来 escalation で escalationReason が未設定であることを固定するテストがない | ✅ Fixed |
| 4 | MEDIUM | escalationReason の誤帰属 — decision-needed + fixable canon finding が混在するとき canon 由来でない escalation に CANON_FINDING_ESCALATION が設定される | ✅ Fixed |

---

## Finding 1: escalationReason の後因果判定 — ok=false + 正典 finding 共存

**File**: `src/core/step/step-completion.ts`

**Verification**: Lines 301-304 の `isCanonEscalation` フラグが因果帰属を正確に判定する。

```typescript
const isCanonEscalation =
  lastVerdictOk &&
  !(lastVerdictEvidence !== undefined && lastVerdictEvidence.checked === 0) &&
  !lastUndecidedFindings.some((f) => f.resolution === "decision-needed");
```

- `lastVerdictOk` が `false`（ok=false）の場合、`isCanonEscalation` は false → `escalationReason` 未設定
- vacuous check（`checked === 0`）の場合も除外
- `decision-needed` finding が存在する場合も除外

**Result**: ✅ ok=false + 正典 finding 共存のケースで `escalationReason` が誤って設定されない。

---

## Finding 2: judgeVerdictFn コメントの陳腐化

**File**: `src/core/port/step-types.ts:281`

**Verification**: コメントは以下に更新済み。

```
The evidence and canonScope parameters are optional — functions with fewer than 4 arguments
are still assignable to this type because JavaScript silently ignores extra arguments.
```

旧コメント「functions with only 2 arguments (e.g. deriveRegressionGateVerdict) are still assignable」は削除され、実態（4引数、最後2つはオプション）を正確に記述するコメントに差し替えられている。

**Result**: ✅ コメントが現在の4引数シグネチャと整合している。

---

## Finding 3: TC-023 未実装

**File**: `tests/unit/core/step/step-completion-canon.test.ts`

**Verification**: TC-023 が以下の3ケースで実装されている。

1. `ok=false + 正典 fixable finding 共存 → verdict=escalation だが escalationReason は未設定`
2. `decision-needed finding + 正典 fixable finding 共存 → verdict=escalation だが escalationReason は未設定`
3. `[対照] 正典 fixable finding のみ（ok=true, decision-needed なし）→ escalationReason が設定される`

テスト実行結果:
```
Test Files  1 passed (1)
    Tests  4 passed (4)
```

**Result**: ✅ TC-023 のエッジケースが機械的に固定された。

---

## Finding 4: escalationReason の誤帰属 — decision-needed + fixable canon finding が混在

**File**: `src/core/step/step-completion.ts:280`

**Verification**: T-04 受け入れ基準（非 canon 由来の escalation では escalationReason は未設定）を保証する条件が実装済み。

```typescript
!lastUndecidedFindings.some((f) => f.resolution === "decision-needed")
```

decision-needed finding が1件でも存在する場合、`isCanonEscalation = false` になり `escalationReason` は設定されない。decision-needed finding が優先順位 #3 で escalation を返し、canon check #4 が未評価のまま終わるケース（T-04 違反の核心）が正確に除外されている。

TC-023 のテストケース `decision-needed finding + 正典 fixable finding 共存` で機械的に検証済み（4 passed）。

**Result**: ✅ decision-needed 由来の escalation に `CANON_FINDING_ESCALATION` が誤設定されなくなった。

---

## Verification Commands

- `bun run typecheck` → 0 errors
- `bun vitest run tests/unit/core/step/step-completion-canon.test.ts` → 4 passed
- `bun vitest run tests/unit/core/step/judge-verdict-canon.test.ts tests/unit/core/step/canon-escalation.test.ts tests/unit/core/step/canon-write-scope.test.ts` → 61 passed

## Regressions

なし。4件の finding すべてが現行コードで修正済みであることを確認した。
