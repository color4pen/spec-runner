# Regression Gate Evidence Report — issue-request-fidelity-gate — iter 2

## 検証対象

Findings Ledger の 8 件について、現コードで修正が維持されているかを確認した。

## 検証方法

1. `git diff main...HEAD --name-only` でブランチ差分ファイル一覧を確認
2. 各 finding について該当ファイルを直接 Read して修正の有無を確認
3. iter 1 の regression-gate-result-001.md を参照し、前回判定との整合を確認

---

## Finding 別検証結果

### F-01: scopeConfigWarning が gate halt path でも emit される

**ファイル**: `src/core/command/runner.ts`
**判定**: **修正済み ✓**

iter 1 では regression（未修正）と判定された。現コードでは `runner.ts` L325-330 の `scopeConfigWarningForJob` 呼び出しが `gateDecision.kind === "halt"` の `else` ブロック内に移動されている。

```typescript
} else {
  // Emit scope-config warning once per run, before buildPipelineForJob is called.
  // Placed in the proceed branch so gate halt does not emit spurious warnings.
  const scopeWarning = scopeConfigWarningForJob(jobState, config);
  if (scopeWarning !== null) {
    logWarn(scopeWarning);
  }
  // ...
}
```

gate halt 時には scope config 警告が出力されなくなった。

---

### F-02: wiring error と comparator throw が ISSUE_FETCH_FAILED code を使う

**ファイル**: `src/core/gate/issue-fidelity-gate.ts`
**判定**: 意図的 accept — code 変更なし（観察のみ）

`issue-fidelity-gate.ts` の step 4（comparator undefined）・step 5（readRequestMd throw）・step 7（comparator throw）は、いずれも `code: ERROR_CODES.ISSUE_FETCH_FAILED, haltKind: "internal-error"` を返す。専用 code は追加されていない。

tasks.md D8 で「ISSUE_FETCH_FAILED 相当」と明示されている deliberate な設計選択。reason が正確であり、F-04 の hint 分岐が機能上の診断性を確保している。regression なし。

---

### F-03: TC-005 が AC4 非伝播を実際には検証していない

**ファイル**: `tests/unit/core/command/runner-fidelity-gate.test.ts`
**判定**: 意図的 accept — code 変更なし（観察のみ）

TC-005 は `mockEvaluateGate.mockResolvedValue({ kind: "proceed" })` で gate をモックしており、SENTINEL は gate に渡る issue body に注入されていない。前 iter 版では `prepared.jobState._testIssueBodySentinel` というフィールドに置かれていたが、現コードの TC-005（L432-468）ではこの非標準フィールドは使われておらず、SENTINEL は local 変数として定義されるのみ。

AC4 の実効的な保護は:
- `issue-fidelity-gate.test.ts` L299-328（sentinel を含む issue body を実 gate に渡し、halt.reason に含まれないことを確認）
- `GateDecision` 型構造（issue body フィールドなし）
- `runner.ts` halt path が `gateDecision.reason`（drop 列挙のみ）のみを state に書き込む構造

機能上の欠陥はなく test quality 問題のまま。regression なし。

---

### F-04: fetch 失敗・wiring エラー・comparator throw すべてに "request.md を修正" hint を付与

**ファイル**: `src/core/command/runner.ts`
**判定**: **修正済み ✓**（iter 1 から維持）

`runner.ts` の halt patch の `hint` フィールドが `haltKind` により正しく分岐されている：

```typescript
hint:
  gateDecision.haltKind === "undeclared-drop"
    ? "request.md を修正（要件復元 or スコープ外宣言追記）して resume してください。"
    : gateDecision.haltKind === "fetch-error"
    ? "network / GITHUB_TOKEN / issue 番号を確認して resume してください（gate は fail-closed のため fetch 失敗を pass 扱いにしない）。"
    : "gate 内部エラー。state.json の reason と log を確認してください。",
```

TC-032 / TC-030 / TC-031 でそれぞれの haltKind について検証済み（test-cases.md L384, L360, L372 に登録済み）。regression なし。

---

### F-05: ISSUE_FETCH_FAILED error.code が wiring error を network failure と区別できない（CBI-004）

**ファイル**: `src/core/command/runner.ts`
**判定**: 意図的 accept — code 変更なし（観察のみ）

`error.code` は wiring error / readRequestMd failure / comparator throw に対しても `ISSUE_FETCH_FAILED` のまま（`haltKind` は state.json の `error` オブジェクトに含まれない）。現 `handleResult` は `SPEC_REVIEW_RESULT_NOT_FOUND` のみ特別扱いするため動作上の問題はない。F-04 の hint 分岐が実用上の診断性を確保している。regression なし。

---

### F-06: TC-028 番号衝突

**ファイル**: `tests/unit/core/command/runner-fidelity-gate.test.ts`
**判定**: **修正済み ✓**

iter 1 では「TC-028 → TC-029 改番は OK だが hint テストも TC-029 を使い同一ファイル内衝突が発生」として contradiction 判定だった。現コードで完全に解消されている。

- L698: `describe("TC-029: gate halt が checkConsecutiveEscalations カウンタを消費しない"` ← counter test（改番済み）
- L741: `describe("TC-032: undeclared drop halt の hint は request.md 修正を促す"` ← 旧 TC-029 を TC-032 に改番
- L773: `describe("TC-030: fetch error halt の hint は network/token 確認を促す"` ← TC-030
- L805: `describe("TC-031: internal error halt の hint は state.json/log 確認を促す"` ← TC-031

test-cases.md に TC-029 / TC-030 / TC-031 / TC-032 すべてのエントリが登録済み（L336, L348, L360, L372, L384）。内部衝突なし、番号体系整合。regression なし。

---

### F-07: CBI-004 持ち越し — ISSUE_FETCH_FAILED code の wiring/internal error 区別不能

**ファイル**: `src/core/gate/issue-fidelity-gate.ts`
**判定**: F-02 / F-05 と同一内容 — 意図的 accept

`haltKind` discriminant は実装済みで hint 分岐が機能している。`error.code` は ISSUE_FETCH_FAILED のまま（deliberate）。F-02 / F-05 と同一理由で受け入れ可能。regression なし。

---

### F-08: ISSUE_FETCH_FAILED code overloading — wiring / readRequestMd / comparator throw に同一 code

**ファイル**: `src/core/gate/issue-fidelity-gate.ts`
**判定**: F-02 / F-05 / F-07 と同一内容 — 意図的 accept

同上。tasks.md D8 の deliberate 選択。functional invariant 違反なし、診断性 gap のみ。regression なし。

---

## サマリー

| Finding | 修正状態 | 分類 |
|---------|---------|------|
| F-01 | 修正済み ✓ | clean |
| F-02 | 意図的 accept | observation |
| F-03 | 意図的 accept | observation |
| F-04 | 修正済み ✓（iter 1 維持） | clean |
| F-05 | 意図的 accept | observation |
| F-06 | 修正済み ✓（TC-029 内部衝突解消） | clean |
| F-07 | 意図的 accept（F-02/05 重複） | observation |
| F-08 | 意図的 accept（F-02/05/07 重複） | observation |

## 検証 evidence

- checked: 8
- skipped: 0
- unverified: 0
