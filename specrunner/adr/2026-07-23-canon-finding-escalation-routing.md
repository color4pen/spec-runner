# ADR-20260723: 保護正典への fixable finding を、書けない fixer に routing せず escalation に倒す

**Date**: 2026-07-23
**Status**: accepted

Extends: [ADR-20260721-step-write-scope-enforcement](2026-07-21-step-write-scope-enforcement.md)

## Context

ADR-20260721 は sequential step の commit 境界で write-scope を機械強制した。保護正典（request.md /
spec.md / design.md / tasks.md / test-cases.md）への書込は `forbiddenWritePaths` で blocked され、
違反時は `WRITE_SCOPE_VIOLATION` halt になる。guard の動作は正しい。

しかし **verdict 導出**（`src/core/step/judge-verdict.ts`）と **routing**（`src/core/pipeline/*`）は
「fixable = fixer が直せる」という write-scope 以前の前提のままで動いており、`finding.file` を
一切参照しない。このため保護正典を修正対象とする fixable finding は:

```
reviewer → fixable finding (file=test-cases.md)
  → needs-fix verdict
    → code-fixer に routing
      → code-fixer が test-cases.md を書込
        → WRITE_SCOPE_VIOLATION halt (guard が阻止)
          → ループ (operator が手で解消するまで抜けられない)
```

という**構造的に解消不能なループ**になる（実例: #890、regression-gate が test-cases.md の
Category 誤分類を fixable として報告 → code-fixer が guard に阻止されて halt）。

### 確立済みの不変: fixer 別の正典書込可能集合

各 fixer が合法に書ける保護正典は、`writes()` 宣言 ∩ `protectedCanonPaths(slug)` で一意に決まる:

| fixer (FixTarget)  | 合法に書ける保護正典    |
|--------------------|------------------------|
| `code-fixer`       | ∅                      |
| `build-fixer`      | ∅                      |
| `implementer`      | {tasks.md}             |
| `spec-fixer`       | {spec.md, design.md}   |

request.md / test-cases.md / request-review-attestation.json はどの fixer の宣言 write にも含まれず、
実効 fixer によらず常に write-scope loop が発生する。

### 実効 fixer は verdict 関数ごとに異なる

- `deriveJudgeVerdict` / `deriveRegressionGateVerdict`: routing は finding.fixTarget を見ず常に
  code-fixer へ倒す（`reviewer-chain.ts` の needs-fix → code-fixer / approved+fixable → code-fixer）。
  実効 fixer = **code-fixer 固定**。
- `deriveConformanceVerdict`: routing は fixTarget 別（`types.ts:266-270`）。
  実効 fixer = **`f.fixTarget ?? "implementer"`**（`aggregateFixTarget` の default と一致）。

## Decision

### D1: 判定ロジックを pure module `canon-escalation.ts` に分離する

新規 pure module `src/core/step/canon-escalation.ts` を追加する。import は型（`Finding` /
`FixTarget`）のみ。slug も write-scope も import しない。エクスポート:

- `CanonWriteScope` — 正典集合と fixer 別書込可能集合を保持する interface。引数で受け取り、
  判定関数内で I/O しない（pure を保つ）。
- `selectUnroutableCanonFindings(findings, scope, resolveEffectiveFixer)` — `resolution === "fixable"`
  かつ `scope.canonPaths.has(f.file)` かつ実効 fixer がその file を書けない finding を返す。
- `buildCanonEscalationReason(findings)` — file / title / 実効 fixer / operator 適用の必要性を含む
  reason 文字列を構築する。
- 実効 fixer resolver: judge/regression-gate 用 `judgeEffectiveFixer = () => "code-fixer"`、
  conformance 用 `conformanceEffectiveFixer = (f) => f.fixTarget ?? "implementer"`。

verdict 導出の finding-ref 検証失敗時の escalation 上書き（`step-completion.ts:200-211`）と同じ層で、
機械的に判定可能な形に揃える。

**採用理由**: reason 構築と verdict 導出を分離し、独立した unit テスト面を得る。file/title 等の
reason 構築を verdict 関数に埋め込まず、`buildCanonEscalationReason` として独立させることで
テストと再利用が容易になる。

### D2: 書込可能性は「実効 fixer の宣言 write ∩ 正典」で判定する（target-aware）

「保護正典なら一律 escalation」は spec-fixer の正当な正典修正ルート（conformance
`needs-fix:spec-fixer`）と implementer の正当な tasks.md 修正ルートを殺す過剰反応であり、
「fixable = 実効 fixer が合法に書ける」を単一の判定基準とする。

fixer 別書込可能集合は各 fixer の `writes()` 宣言 ∩ `protectedCanonPaths(slug)` から導出し
（単一ソース、`canon-write-scope.ts` が構築）、判定関数へ引数で渡す。

**採用理由**: routing の欠陥（書けない fixer への routing）だけを最小で修正する。既存の合法な
正典修正ルート（spec-fixer→spec/design、implementer→tasks）を保存する。

### D3: 3 つの verdict 関数に optional `canonScope` 引数を追加する（後方互換）

`deriveJudgeVerdict` / `deriveRegressionGateVerdict` / `deriveConformanceVerdict` に
**optional 4th 引数 `canonScope?: CanonWriteScope`** を追加する（省略時は現行挙動と完全同一）。

- `deriveJudgeVerdict`: decision-needed / vacuous / ok=false の既存 escalation の後、`canonScope` が
  あり unroutable findings が非空なら escalation。以降は現行（critical/high → needs-fix、else approved）。
- `deriveRegressionGateVerdict`: fixable → needs-fix の前に canon 判定を挿入し、非空なら escalation。
- `deriveConformanceVerdict`: まず base = `deriveJudgeVerdict(findings, ok, evidence)`（canonScope
  は渡さない — conformance は独自 resolver を使う）。base が escalation ならそのまま返す。次に
  `selectUnroutableCanonFindings(findings, canonScope, conformanceEffectiveFixer)` が非空なら
  escalation。それ以外は現行（`needs-fix:${aggregateFixTarget}`）。

配線は `src/core/step/step-completion.ts` の既存 verdict 導出点（finding-ref 検証失敗時の
escalation 上書きと同一層）で行う。

**採用理由**: optional 引数で後方互換を保つ。既存テストは canonScope を渡さないため無変更。
新規テストのみ `canonScope` 付きで正典 escalation 挙動を固定する。

### D4: `canonScope` の構築を `canon-write-scope.ts` に集約する（単一ソース）

新規 wiring 関数 `buildCanonWriteScope(state, deps): CanonWriteScope`:

- `canonPaths = new Set(protectedCanonPaths(deps.slug))`（write-scope から import）。
- `writableByFixer`: 各 fixer step（CodeFixerStep / BuildFixerStep / ImplementerStep /
  SpecFixerStep）の `writes(state, deps)` を呼び、`artifact !== "gitState"` の path を
  `canonPaths` と交差した集合を FixTarget キーで格納する。

これにより `writableByFixer` は各 fixer の `writes()` を単一ソースとして自動追随する（spec-fixer
の write-set が将来変われば escalation 判定も自動で反映）。

import cycle が生じる場合は、明示 map + 各 fixer `writes()` との一致を assert する drift-guard
テストへ fallback する。

### D5: findings-ledger 経路を二重防壁とする（R3）

`collectFindingsLedger` / `collectParallelFixerFindings` に optional `canonScope?: CanonWriteScope`
を追加し、実効 fixer=code-fixer が合法に書けない正典 fixable finding を出力集合から除外する。

- 除外時の escalation 保証は verdict 層が担う（D3）。正典 finding を観測した reviewer round /
  regression-gate は `deriveJudgeVerdict` / `deriveRegressionGateVerdict`（canonScope 付き）で
  escalation を返すため、その round / gate は fixer に到達せず escalation に倒れる。
- ledger 除外は「historical / resolved 含む正典 finding が fixer prompt に決して届かない」ための
  防御層であり、verdict 層と二重で不変を守る。

ledger 層に「除外時に gate を強制 escalation」する別 seam は追加しない。理由: 未解決の正典 finding
は発生 round で既に escalation 済みで converged な gate に到達しない一方、operator が解決済みの
historical 正典 finding（immutable な過去 StepRun に残る）を gate で再 escalation すると解消不能な
再ループを生むため。

### D6: escalation reason の plumbing と `CANON_FINDING_ESCALATION`

`StepCompletion` に optional `escalationReason?: string` を追加する。`deriveStepCompletion` は
verdict が canon 由来で escalation になった場合（unroutable findings 非空）に
`buildCanonEscalationReason(...)` の結果を設定する。

`commit-orchestrator.ts` の `commitSuccess` で、`verdict === "escalation"` かつ
`completion.escalationReason` があるとき
`state.error = { code: "CANON_FINDING_ESCALATION", message: escalationReason }` を設定してから
persist する。`CANON_FINDING_ESCALATION` は `FATAL_ERROR_CODES` に含めない → `awaiting-resume`
に落ちる（failed でない）。`pipeline.ts:428-443` の escalate 分岐が
`resumePoint.reason = state.error.message` を用いる既存経路を再利用する。

## Alternatives Considered

### A1: 「保護正典なら一律 escalation」（blanket escalation）

正典ファイルへの fixable finding を fixTarget によらず常に escalation にする案。

- **Pros**: 判定が単純（正典集合のみ参照）。
- **Cons**: spec-fixer の `needs-fix:spec-fixer` 経路（conformance で spec.md / design.md を修正
  する合法ルート）と implementer の tasks.md 修正ルートを殺す過剰反応。request.md の spec-fixer
  保存要件と矛盾する。
- **Why not**: routing の欠陥は「実効 fixer が合法に書けない file への routing」であり、合法ルートを
  殺すことなく最小で修正できる target-aware 規則が正確。

### A2: fixer 側で正典 finding を skip して続行する

code-fixer / build-fixer が受け取った findings のうち正典 file を対象とするものを内部で skip し、
残りの finding だけを処理して green に見せる案。

- **Pros**: fixer 側の変更のみで完結。verdict 層は変更不要。
- **Cons**: 「指摘が握り潰されたが green」という無言の弱体化。operator が正典 finding の存在に
  気づかないまま pipeline が通過する。指摘の解消責任が誰にも明示的に移らない。
- **Why not**: escalation が operator に明示的に責任を移す正しい設計であり、skip による握り潰しは
  観測可能性を損なう。

### A3: spec-fixer の write-set 拡張で吸収する

spec-fixer が書ける正典集合に test-cases.md 等を条件付きで追加し、regression-gate → spec-fixer
経路を通して loop を解消する案。

- **Pros**: TC ID 凍結規律が緩和されれば正典の誤分類を pipeline が自動修正できる。
- **Cons**: TC ID 凍結・正典 freeze の既存規律に波及する別設計。routing の欠陥修正と混ぜると
  設計が肥大する。test-cases.md の条件付き許可は独立した議論を要する。
- **Why not**: write-scope の拡張は別 request で扱うべき設計変更。本 ADR は routing 側の欠陥のみを
  正確に修正する。

## Consequences

### Positive

- 保護正典を対象とする fixable finding が「書けない fixer → WRITE_SCOPE_VIOLATION halt」の
  構造的ループに入らなくなる。operator は escalation として resume 通知を受け、finding の内容と
  対象ファイルを確認して適用を判断できる。
- spec-fixer の `needs-fix:spec-fixer`（spec.md / design.md）および implementer の
  `needs-fix:implementer`（tasks.md）という合法な正典修正ルートは不変に保たれる。
- `CanonWriteScope.writableByFixer` を各 fixer の `writes()` から導出することで、write-scope guard
  と escalation 判定が同一の真実（宣言 write）を参照し、drift を構造的に排除する。
- optional 引数により後方互換を保つ。既存テストは無変更で通る。

### Negative

- `canon-escalation.ts` / `canon-write-scope.ts` が新規追加され、verdict 層の依存グラフに
  参加する（ただし両者とも pure / leaf に近い）。
- `step-completion.ts` の escalationReason 計算（`verdict === "escalation"` かつ unroutable findings
  非空の後因果判定）は、ok=false + 正典 finding の共存エッジケースで `CANON_FINDING_ESCALATION` が
  誤設定されるリスクがある（実運用上は稀、review-feedback-001 F-001 で記録）。
- parallel member の canon-escalation reason は coordinator が verdict 文字列に集約するため
  generic になりうる（member の StepRun には reason を記録、主要経路の sequential は詳細 reason を持つ）。

### Known Debt

- `step-completion.ts` の escalationReason 後因果判定（F-001）: verdict の実際の因果を確認せず
  両条件を独立にチェックするため、ok=false 起因 escalation + 正典 finding 共存で誤った
  CANON_FINDING_ESCALATION が設定されうる。影響は escalation reason の誤読に限定される。
  修正するなら verdict 関数からの「canon 由来フラグ」を返す設計変更が必要。
- TC-023（非 canon 由来 escalation で `escalationReason` が未設定）は should-priority で実装未済
  （review-feedback-001 F-003）。escalationReason 計算パスの直接単体テストが不足している。
- `buildCanonWriteScope` が fixer step を import して import cycle が生じる場合、明示 map への
  fallback と drift-guard テストによる一致固定が必要になる（実装時に cycle 有無を検証済みだが、
  fixer step の構造変更時に再検証が必要）。

## References

- Request: `specrunner/changes/canon-finding-escalation-routing/request.md`
- Design: `specrunner/changes/canon-finding-escalation-routing/design.md`
- Spec: `specrunner/changes/canon-finding-escalation-routing/spec.md`
- Implementation: `src/core/step/canon-escalation.ts` / `src/core/step/canon-write-scope.ts` /
  `src/core/step/judge-verdict.ts` / `src/core/step/step-completion.ts` /
  `src/core/pipeline/findings-ledger.ts` / `src/core/step/commit-orchestrator.ts`
- Related: [ADR-20260721-step-write-scope-enforcement](2026-07-21-step-write-scope-enforcement.md)
  — write-scope 機械強制の基盤（本 ADR が補完する routing 側の欠陥修正）
- Issue: #890（実例: regression-gate → test-cases.md fixable → code-fixer halt のループ）
