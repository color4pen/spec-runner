# Cross-Boundary Invariants Review: canon-finding-escalation-routing

Reviewer: cross-boundary-invariants
Iteration: 1
Scope: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する

---

## Review Summary

実装の核心ロジック（`selectUnroutableCanonFindings`・3 verdict 関数・ledger 除外）は設計通りで正確。  
境界を越えた不変条件違反は **1 件**（medium）見つかった。残りは全て PASS または観察記録。

---

## Finding 1 — MEDIUM: `escalationReason` の誤帰属（`decision-needed`/`ok=false` + fixable canon finding が混在する場合）

**ファイル**: `src/core/step/step-completion.ts:278-286`

### 不変条件

設計 D6 および T-04 受け入れ基準:
> "非 canon 由来の escalation（vacuous / finding-ref / decision-needed）では `escalationReason` は未設定"

### 現在の実装

```ts
// step-completion.ts:278-286
let escalationReason: string | undefined;
if (verdict === "escalation" && lastUndecidedFindings !== null) {
  const resolver = lastIsConformancePath ? conformanceEffectiveFixer : judgeEffectiveFixer;
  const unroutable = selectUnroutableCanonFindings(lastUndecidedFindings, canonScope, resolver);
  if (unroutable.length > 0) {
    escalationReason = buildCanonEscalationReason(unroutable);
  }
}
```

この条件は「**verdict が escalation であること**」と「**unroutable な canon fixable finding が存在すること**」の AND で判定する。
verdict が escalation になった**原因**が canon check か否かを区別していない。

### 違反が生じるシナリオ

`deriveJudgeVerdict` の優先順位:
```
#1: ok=false → escalation
#2: vacuous (checked=0) → escalation
#3: decision-needed → escalation
#4: canon check (NEW) → escalation     ← NEW
#5: critical|high → needs-fix
```

**具体例**: reviewer が以下の mixed findings を報告したとき:
```
Finding A: { resolution: "decision-needed", file: "src/arch.ts", severity: "high", title: "アーキテクチャ判断が必要" }
Finding B: { resolution: "fixable",         file: "specrunner/changes/<slug>/test-cases.md", severity: "low", title: "Category 誤分類" }
```

1. `deriveJudgeVerdict(undecidedFindings, ok=true, evidence, canonScope)` →
   - #3 decision-needed (Finding A) で即 `"escalation"` を返す（canon check #4 は未評価）
2. `lastUndecidedFindings = undecidedFindings`（両 finding を含む配列が設定される）
3. `escalationReason` 判定: `verdict === "escalation"` ∧ `lastUndecidedFindings !== null`
4. `selectUnroutableCanonFindings([A, B], ...)`:
   - A: `resolution !== "fixable"` → スキップ
   - B: `resolution === "fixable"` ∧ `test-cases.md ∈ canonPaths` ∧ code-fixer は書けない → **UNROUTABLE**
5. `escalationReason = buildCanonEscalationReason([B])` が設定される
6. `commit-orchestrator.ts:363`: `state.error.code = "CANON_FINDING_ESCALATION"` — **誤帰属**

実際の escalation 原因は Finding A（decision-needed）だが、operator は `CANON_FINDING_ESCALATION` を見て Finding B（test-cases.md の修正）に対処しようとする。  
修正・resume 後、再び Finding A（decision-needed）で escalation が発生 → **余分な resume サイクル**が必要になる。

### `ok=false` ケースも同様

`tr.ok === false` → `!ok → "escalation"` で即返す（#1、canon check 到達前）。  
`lastUndecidedFindings` にはその後設定されるため、fixable canon finding があれば同じ誤帰属が生じる。

### `finding-ref` override ケースは問題なし

finding-ref override は `verdict = "needs-fix"` の後で発動する（critical finding が非 canon ファイルを指している場合）。  
しかし unroutable canon fixable finding（low/medium）が存在していれば、canon check (#4) がより早く escalation を返す。  
→ finding-ref override 時には unroutable canon findings が存在しないため、`escalationReason` は設定されない。✓

### テストカバレッジの gap

既存テスト TC-013「decision-needed → escalation（canonScope 有無に依らず）」は decision-needed **単独**の finding を使用。  
`decision-needed + 別の fixable canon finding` の**混在ケース**はテストされていない。

### 根本原因

`step-completion.ts:280` の条件が「escalation の発生原因が canon check であること」を検証せず、  
「escalation が起きており、かつ unroutable canon findings が存在すること」で判定している。

### 修正の方向性（参考）

verdict 関数 or `step-completion.ts` 内で「canon check が escalation を引き起こしたか」を明示的に追跡する。  
例: `deriveJudgeVerdict` が `"escalation"` を返すとき、その原因を構造化した返り値で返す、  
または `step-completion.ts` 内で canon check を verdict 関数の呼び出しと分離して判定する。

---

## Finding 2 (観察、pass) — `approved + fixable → code-fixer` 遷移の生 findings 参照

**ファイル**: `src/core/pipeline/reviewer-chain.ts:165-178`

`when` 条件が `collectFixableFindings(lastFindingsOf(s, reviewer))` を使用し、decision-ledger でフィルタした findings を参照しない。  
**ただしこれは本変更で導入された問題ではない**:

- UNDECIDED の unroutable canon fixable finding が存在する場合 → `deriveJudgeVerdict` が "escalation" を返す → `on: "approved"` 遷移は発火しない ✓
- DECIDED（decision-ledger で決定済み）の canon finding は `filterUndecidedFindings` によりフィルタされ "approved" になりうる → transition が生 findings を見て発火する可能性はあるが、これは **本変更以前から存在する挙動**

本変更は undecided fixable canon findings の routing を正確に修正した。  
decided findings の leak は pre-existing issue であり、本変更の責任範囲外。

---

## PASS 検証項目

| 項目 | 確認内容 | 結論 |
|------|----------|------|
| `selectUnroutableCanonFindings` のコアロジック | `resolution===fixable ∧ file∈canonPaths ∧ fixer が書けない` の 3 条件が正確に実装されている | PASS |
| `deriveConformanceVerdict` の resolver | `conformanceEffectiveFixer` (`f.fixTarget ?? "implementer"`) を使用し、`spec.md + spec-fixer` / `tasks.md + implementer` は非 escalation になる | PASS |
| `deriveJudgeVerdict` / `deriveRegressionGateVerdict` の resolver | `judgeEffectiveFixer` (常に `"code-fixer"`) を使用し、regression-gate は全 fixable canon finding を escalation にする | PASS |
| `buildCanonWriteScope` のパス整合 | `changeFolderPath(slug)` を使用し `protectedCanonPaths(slug)` の出力と一致（`requestMdPath(slug) === ${folder}/request.md`） | PASS |
| `CANON_FINDING_ESCALATION` と `FATAL_ERROR_CODES` | `FATAL_ERROR_CODES` に追加されていない → job は `awaiting-resume` に落ちる（TC-024 で検証済み） | PASS |
| `collectFindingsLedger` / `collectParallelFixerFindings` の除外ロジック | `judgeEffectiveFixer` で code-fixer に routing される経路と整合した除外を実装している | PASS |
| `buildCanonWriteScope` の explicit map と `writes()` の drift | TC-029（drift-guard）が各 fixer の `writes()` ∩ `protectedCanonPaths` と明示 map の一致を assert している | PASS |
| `null toolResult` パスの `escalationReason` | `lastUndecidedFindings` が null のまま → `escalationReason` 不設定 ✓ | PASS |
| regression-gate `skipWhen` の ledger 整合 | `buildMessage` と同じ `collectFindingsLedger(..., canonScope)` を使用 → 一貫した空判定 | PASS |
| R4 挙動保存: 非 canon file への routing | `src/**` ファイルは `canonPaths` に含まれないため既存 routing が不変 | PASS |
| `tasks.md + implementer` → `needs-fix:implementer` | `writableByFixer.get("implementer").has("tasks.md") === true` → escalation しない（request.md との仕様矛盾は design.md で明示的に解消済み）| PASS |
| conformance が `spec.md + spec-fixer` → `needs-fix:spec-fixer` | `writableByFixer.get("spec-fixer").has("spec.md") === true` → escalation しない | PASS |

---

## 証拠まとめ

- **Finding 1**: `step-completion.ts:280` の条件が escalation 原因を区別しない構造的欠陥。T-04「非 canon 由来の escalation では `escalationReason` は未設定」に違反。影響: operator が誤った escalation 原因に誘導され、余分な resume サイクルが発生する。
- **Finding 2（観察）**: pre-existing issue、本変更の責任外。
- コアの routing 修正（R1/R2/R3/R4）は全て正確に実装されている。
