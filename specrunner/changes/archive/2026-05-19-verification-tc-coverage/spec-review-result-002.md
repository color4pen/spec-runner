# Spec Review Result: verification-tc-coverage

- **verdict**: needs-fix
- **reviewed-at**: 2026-05-19
- **reviewer**: spec-reviewer (round 2)

---

## Summary

spec-review-001 の C-2（TypeScript 型）は design.md と tasks.md 両方で修正済み。M-1（skipped 文言）は design.md で方針が明記されたが tasks.md への反映が不完全。C-1（regex）は design.md では修正されたが **tasks.md T-02 に修正が反映されておらず、実装すると機能が無効化される**。

---

## Critical Issues (needs-fix)

### C-1 (再発): tasks.md T-02 の regex が design.md の修正と不一致

**場所**: `tasks.md` T-02 ステップ 2

tasks.md は現在:

```
抽出パターン: `### (TC-\d+(?:-\d+)*)` ヘッダ行に続く行群から `**Priority**: must` を持つものを抽出
```

一方 design.md (L76–78) は spec-review-001 の C-1 修正後に:

```
^##[#]?\s+(TC-\d+(?:-\d+)*)  で TC section header を全列挙（h2 / h3 両対応）
各 section の後続行群を次の ## が出現するまで走査し、**Priority**: must の存在で判定
bullet prefix あり（- **Priority**: must）と なし（**Priority**: must）の両方を許容
```

と記述されている。

**影響**: 実際の test-cases.md は `## TC-001:` (h2) フォーマットを使用する（spec-review-001 でも確認済み）。tasks.md の `###` パターンは h2 にマッチしない。実装すると `mustTcIds` が常に 0 件 → test-coverage は常に `status: "passed"` を返す → 本機能が完全に無効化される。

これは spec-review-001 の C-1 で指摘した同一バグが tasks.md に残存している状態。design.md の修正が tasks.md に伝播していない。

**修正方針**: tasks.md T-02 ステップ 2 を design.md の section-scan アプローチに揃える:

```
Priority: must の TC ID を section-scan アプローチで抽出する:
  1. `^##[#]?\s+(TC-\d+(?:-\d+)*)` で TC section header を全列挙（h2 / h3 両対応）
  2. 各 section の後続行群を次の `##` が出現するまで走査し、`\*\*Priority\*\*:\s*must` の行の存在で判定
  3. bullet prefix（`- **Priority**: must`）と非 bullet（`**Priority**: must`）の両方を許容
```

---

## Minor Issues (fix or acknowledge)

### M-1 (残存): tasks.md T-03 が writeVerificationResult の修正を明記していない

**場所**: `tasks.md` T-03

既存の `writeVerificationResult`（`runner.ts` L123–124）は skipped phase に `"_(skipped — script not found in package.json)_"` をハードコードしている。design.md section 7 は「test-coverage の skipped 結果は `result.stdout` をそのまま出力する」と明記しているが、tasks.md T-03 にはこの変更の指示がない。

T-03 では PhaseResult に `stdout: result.stdout` を含めると指定しているが、`writeVerificationResult` は `status === "skipped"` の場合に `p.stdout` を使わずに hardcoded 文言を返す（L123–130）。実装者が T-03 だけを読むと、この関数の修正が必要なことが伝わらない。

**修正方針**: T-03 に以下を追記する:

> `writeVerificationResult` の skipped 出力ロジックを変更: test-coverage phase が skipped かつ `p.stdout` が非空の場合は hardcoded 文言の代わりに `p.stdout` を出力する（skip 理由を human-readable に表示するため）。

---

## Confirmed Fixed (from round 1)

| 指摘 | 状態 |
|---|---|
| C-1 (regex h3-only) | design.md ✅ / tasks.md ❌ (本 round の C-1) |
| C-2 (PHASE_SCRIPTS 型エラー) | design.md ✅ / tasks.md T-01 ✅ |
| M-1 (skipped 文言) | design.md ✅ / tasks.md T-03 は不完全 |

---

## Security

file I/O + 文字列 grep のみ。ネットワーク・認証・外部入力処理なし。OWASP Top 10 該当なし。セキュリティ懸念なし。

---

## Required Changes Before Approval

1. **tasks.md T-02**: ステップ 2 の `### (TC-\d+...)` を section-scan アプローチに差し替える（C-1 再発の修正）
2. **tasks.md T-03**: `writeVerificationResult` の skipped 出力ロジック変更を明記する（M-1 tasks.md 反映）
