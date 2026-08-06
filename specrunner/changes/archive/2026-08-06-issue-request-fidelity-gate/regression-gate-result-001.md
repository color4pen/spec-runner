# Regression Gate Evidence Report — issue-request-fidelity-gate — iter 1

## 検証対象

Findings Ledger の 7 件について、現コードで修正が維持されているかを確認した。

## 検証方法

1. `git diff main...HEAD` でブランチ全差分を確認
2. 各 finding について該当ファイル・行を直接 Read して修正の有無を確認

---

## Finding 別検証結果

### F-01: scopeConfigWarning が gate halt path でも emit される

**ファイル**: `src/core/command/runner.ts:276`
**判定**: **修正未適用（regression）**

`runner.ts` L276-279 の `scopeConfigWarningForJob` 呼び出しが、gate halt チェック（L282: `if (gateDecision.kind === "halt")`）より前にある状態のまま。

```typescript
// L274-279 (before gate check)
const scopeWarning = scopeConfigWarningForJob(jobState, config);
if (scopeWarning !== null) {
  logWarn(scopeWarning);
}

// L282 (gate check comes after)
if (gateDecision.kind === "halt") {
```

レビューが推奨した修正（warning emit を `else` / proceed ブロック内へ移動）は適用されていない。gate halt 時にも scope config 警告が stdout に出力される状態が続く。

---

### F-02: wiring error と comparator throw が ISSUE_FETCH_FAILED を使う

**ファイル**: `src/core/gate/issue-fidelity-gate.ts:117`
**判定**: 修正未適用（意図的 accept）

`issue-fidelity-gate.ts` の step 4（comparator undefined）・step 5（readRequestMd throw）・step 7（comparator throw）はいずれも `code: ERROR_CODES.ISSUE_FETCH_FAILED, haltKind: "internal-error"` を返す。専用 code（ISSUE_GATE_WIRING_ERROR 等）の追加はない。

レビュー自身が「tasks.md では ISSUE_FETCH_FAILED 相当と明示されており deliberate な選択」「現状でも受け入れ可能」と評価済みのため、機能上の欠陥なし。reason message が正確であり、`haltKind` discriminant で hint 分岐も機能している。

---

### F-03: TC-005 が AC4 非伝播を実際には検証していない

**ファイル**: `tests/unit/core/command/runner-fidelity-gate.test.ts:417`
**判定**: 修正未適用（意図的 accept）

TC-005 は `mockEvaluateGate.mockResolvedValue({ kind: "proceed" })` で gate をモックしており、実 issue body は gate 内で fetch されない。SENTINEL は const として定義されているが、gate function の呼び出し引数に渡っていないため check は vacuous。

レビュー自身が「機能上の欠陥はなく test quality 問題」「AC4 の実効的な歯は unit 層（issue-fidelity-gate.test.ts L289-312）と GateDecision 型構造で担保」と評価済み。コメントでの明示も追加されていないが、機能的影響なし。

---

### F-04: fetch 失敗・wiring エラー・comparator throw すべてに "request.md を修正" hint を付与

**ファイル**: `src/core/gate/issue-fidelity-gate.ts:117`
**判定**: **修正済み（fix 確認）** ✓

`runner.ts` L297-302 で `haltKind` による hint 分岐が正しく実装されている：

```typescript
hint:
  gateDecision.haltKind === "undeclared-drop"
  ? "request.md を修正（要件復元 or スコープ外宣言追記）して resume してください。"
  : gateDecision.haltKind === "fetch-error"
  ? "network / GITHUB_TOKEN / issue 番号を確認して resume してください（gate は fail-closed のため fetch 失敗を pass 扱いにしない）。"
  : "gate 内部エラー。state.json の reason と log を確認してください。",
```

TC-029/TC-030/TC-031 でこれらの hint 分岐が各 haltKind について検証されている。

---

### F-05: ISSUE_FETCH_FAILED code が wiring error を network failure と区別できない（CBI-004）

**ファイル**: `src/core/command/runner.ts:295`
**判定**: 修正未適用（意図的 accept）

`state.json` に書き込まれる `error.code` は wiring error / readRequestMd failure / comparator throw に対しても `ISSUE_FETCH_FAILED` のまま（`haltKind` は state.json の `error` オブジェクトに含まれない）。

レビュー自身が「機能的影響は低い（全ケースが awaiting-resume で resume 可能）」「現在 handleResult は SPEC_REVIEW_RESULT_NOT_FOUND しか特別扱いしない」と評価済み。`haltKind` を通じた hint 分岐（F-04 fix）で実用上の診断性は確保されている。

---

### F-06: TC-028 番号衝突 — runner-fidelity-gate と comparator-layering に同一番号

**ファイル**: `tests/unit/core/command/runner-fidelity-gate.test.ts:686`
**判定**: 修正適用済みだが **新たな TC-029 衝突を導入（contradiction）**

元の修正（TC-028 counter test → TC-029 に改番、test-cases.md に TC-029 追記）は適用済み。
- L686: `describe("TC-029: gate halt が checkConsecutiveEscalations カウンタを消費しない"` ✓
- test-cases.md L348: `### TC-029: gate halt が checkConsecutiveEscalations カウンタを消費しない` ✓

しかし、fixing TC-028 と同時期に追加された hint 分岐テストが同じ TC-029 番号を使用：
- L729: `describe("TC-029: undeclared drop halt の hint は request.md 修正を促す"` ← **TC-029 内部衝突**
- L761: `describe("TC-030: fetch error halt の hint は network/token 確認を促す"` ← test-cases.md に未登録
- L793: `describe("TC-031: internal error halt の hint は state.json/log 確認を促す"` ← test-cases.md に未登録

元の TC-028 衝突（跨ファイル）を解消したが、同一ファイル内 TC-029 衝突（runner-fidelity-gate.test.ts L686 vs L729）と TC-030/TC-031 の test-cases.md 未登録が残っている。vitest は文字列識別のため実行上問題はないが、番号体系の混乱が継続している。

---

### F-07: CBI-004（F-05 持ち越し）— ISSUE_FETCH_FAILED code の wiring/internal error 区別不能

**ファイル**: `src/core/gate/issue-fidelity-gate.ts:117`
**判定**: F-02 / F-05 と同一内容（意図的 accept）

F-02 および F-05 の重複。`haltKind` discriminant は実装済みで hint 分岐は機能しているが、`error.code` は ISSUE_FETCH_FAILED のまま。同上理由で受け入れ可能。

---

## サマリー

| Finding | 修正状態 | 分類 |
|---------|---------|------|
| F-01 | 未適用 | **regression (HIGH)** |
| F-02 | 意図的 accept | observation |
| F-03 | 意図的 accept | observation |
| F-04 | 修正済み ✓ | clean |
| F-05 | 意図的 accept | observation |
| F-06 | 部分修正 + 新衝突導入 | **contradiction (LOW)** |
| F-07 | 意図的 accept (F-02/05 重複) | observation |

---

## 検証 evidence

- checked: 7
- skipped: 0
- unverified: 0
