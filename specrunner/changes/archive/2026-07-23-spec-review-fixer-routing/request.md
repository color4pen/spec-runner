# spec-review の fixable canon finding を spec-fixer round で収束させる — 一律 operator escalation の解消

## Meta

- **type**: spec-change
- **slug**: spec-review-fixer-routing
- **base-branch**: main
- **adr**: true

## 背景

spec-review が spec.md / design.md への fixable finding（design 既決事項の転記漏れ等）を出すと、現状は severity を問わず全件が CANON_FINDING_ESCALATION で operator escalation になる。遷移表には spec-review needs-fix → spec-fixer → spec-review の収束ループが存在し、spec-fixer は spec.md / design.md を合法的に書ける宣言を持つにもかかわらず、verdict 導出がこのループに到達させない。

結果として、pipeline 内で機械的に収束できるはずの転記型修正のたびに job が awaiting-resume で停止し、operator の手動修正と `resume --apply-canon` を要求する。実運用の run では medium / low の転記型 finding 4 件がこの経路で escalation し、operator 修正 3 回・spec-review 5 iteration を要した。

## 現状コードの前提

- src/core/step/canon-escalation.ts:41 — `judgeEffectiveFixer` は finding の内容によらず常に `"code-fixer"` を返す
- src/core/step/judge-verdict.ts:53 — `deriveJudgeVerdict` の canon 判定は `judgeEffectiveFixer` 固定で `selectUnroutableCanonFindings` を呼ぶ。code-fixer の canon 書込集合は ∅（src/core/step/canon-write-scope.ts:47）のため、canon file への fixable finding は常に unroutable 判定になる
- src/core/step/spec-review.ts:69 — spec-review は `reportTool: JUDGE_REPORT_TOOL` で `judgeVerdictFn` 未定義。したがって既定の `deriveJudgeVerdict` を使う
- src/core/step/judge-verdict.ts:53-56 — canon 判定は critical|high → needs-fix 判定より前段にある。したがって spec.md への fixable finding は severity を問わず needs-fix に到達する前に escalation へ変換される
- src/core/step/canon-write-scope.ts:51 — spec-fixer は `{spec.md, design.md}` を合法的に書ける宣言（D5 map）
- src/core/pipeline/types.ts:234,241 — `spec-review needs-fix → spec-fixer` / `spec-fixer approved → spec-review` の遷移は既存
- src/core/step/step-completion.ts:306 — escalationReason 計算も `lastIsConformancePath ? conformanceEffectiveFixer : judgeEffectiveFixer` であり、spec-review は code-fixer 扱いになる
- src/core/step/judge-verdict.ts:100-119 — conformance は `conformanceEffectiveFixer`（f.fixTarget 尊重）を使っており、fixTarget: spec-fixer の finding は routable。spec-review だけが不達

## 要件

1. spec-review の verdict 導出に spec-review 専用の effective fixer 解決を導入する。spec-review round の fixer は構造的に spec-fixer であり、canon 判定は spec-fixer の書込可能集合（{spec.md, design.md}）に対して行う
2. spec-fixer が書込可能な canon file への fixable finding は severity を問わず needs-fix とし、spec-fixer に routing する。medium / low の既知 fixable な spec 欠落が「記録されるが修正されない」まま approve されて test-case-gen 以降に流れることを防ぐ
3. spec-fixer が書込不可能な canon file（request.md / test-cases.md / tasks.md）への fixable finding は従来どおり escalation とし、escalationReason に CANON_FINDING_ESCALATION の理由を設定する
4. step-completion の escalationReason 計算（src/core/step/step-completion.ts:306）は verdict 導出と同一の resolver を使う。乖離すると「escalation なのに理由なし」「routable なのに escalation 理由付き」の drift が生じる
5. judge（code-review）・conformance・regression-gate・request-review の verdict 導出挙動は変更しない

## スコープ外

- spec-review の finding 網羅性（round ごとの全量列挙規律）
- halt→resume 時の残骸（stale な step result ファイル）の掃除
- conformance の fixTarget routing（既に f.fixTarget を尊重しており変更不要）
- spec-fixer の書込可能集合の変更

## 受け入れ基準

- [ ] spec.md への severity medium・resolution fixable の finding で spec-review verdict が needs-fix になり、遷移表で spec-fixer に到達することをテストで固定する
- [ ] request.md への fixable finding で spec-review verdict が escalation になり、escalationReason が設定されることをテストで固定する
- [ ] verdict 導出と escalationReason 計算が同一の resolver を参照することを drift-guard テストで固定する
- [ ] spec-review → spec-fixer の反復が既存の loop exhaustion 上限で有界であることをテストで固定する（新規の無限ループ経路を作らない）
- [ ] judge / conformance / regression-gate / request-review の既存テストが無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: spec-review 専用の effective fixer resolver（常に spec-fixer）を導入し、verdict 導出と escalationReason 計算の両方が同一定義を参照する。
- **却下**: findings の fixTarget 申告に依存する方式（conformanceEffectiveFixer 型）— spec-review round の fixer は構造的に spec-fixer 一択であり、agent の申告に routing を委ねる必要がない。申告漏れ・誤申告で routing が壊れる面を新設しない
- **却下**: resolver 差し替えのみで severity 規則は現状維持（critical|high のみ needs-fix）— medium / low の fixable spec finding が無修正のまま approve され、既知の仕様欠落が下流に流れる。spec-review round の目的（spec の収束）に反する
