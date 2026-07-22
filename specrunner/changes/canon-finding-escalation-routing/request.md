# 保護正典への fixable finding を、書けない fixer に routing せず escalation に倒す

## Meta

- **type**: spec-change
- **slug**: canon-finding-escalation-routing
- **base-branch**: main
- **adr**: true

## 背景

write-scope 強制(#883/#891)により fixer の保護正典(request.md / spec.md / design.md / tasks.md / test-cases.md)への書込は禁止された。しかし verdict 導出と routing は「fixable = fixer が直せる」という write-scope 以前の前提のままで、finding の file を一切見ていない。このため保護正典を修正対象とする fixable finding は、code-fixer / build-fixer に routing → fixer が書込を試みる → WRITE_SCOPE_VIOLATION halt という**構造的に解消不能なループ**になる(#890。実例: regression-gate が test-cases.md の Category 誤分類を fixable として報告 → code-fixer が guard に阻止され halt。内容自体は正当で operator 適用により解消した)。

guard の動作は正しい。欠陥は routing 側にあり、「routing 先の fixer が合法に書けない file への fixable finding」は最初から escalation(operator 判断)に倒すべきである。なお spec-fixer は spec.md / design.md / tasks.md を合法に書ける(宣言 write)ため、正典 finding の spec-fixer への routing は現行どおり有効なままとする。

## 現状コードの前提

- `src/core/step/judge-verdict.ts` — 全 verdict 導出関数は severity / resolution / fixTarget のみで分岐し、**`finding.file` を参照しない**: `deriveJudgeVerdict`(:36-46、critical|high → needs-fix)、`deriveRegressionGateVerdict`(:133-143、任意 severity の fixable → needs-fix)、`deriveConformanceVerdict`(:88-98、`needs-fix:${aggregateFixTarget}`)、`aggregateFixTarget`(:58-70、fixTarget 欠落は implementer に default)
- `src/kernel/report-result.ts:43` — Finding.file は worktree-relative path。`:22` — `FixTarget = "implementer" | "code-fixer" | "spec-fixer"`
- `src/core/step/write-scope.ts:64-74` — `protectedCanonPaths(slug)`(request.md / spec.md / design.md / tasks.md / test-cases.md / attestation)。`:104-112` — `forbiddenWritePaths(stepName, slug, declaredWritePaths)` = 保護正典 − 宣言。**verdict 導出層からは一切 import されていない**(消費者は commit 層のみ)
- `src/core/step/step-completion.ts:149-169` — verdict 導出の配線点(deriveRequestReviewVerdict / deriveConformanceVerdict / step の judgeVerdictFn)。`:200-211` — finding-ref 検証失敗時に verdict を "escalation" に上書きする前例がある
- `src/core/pipeline/types.ts:266-270` — conformance の `needs-fix:spec-fixer`→spec-fixer / `needs-fix:implementer`→implementer / `needs-fix:code-fixer`→code-fixer / 素の needs-fix→implementer
- `src/core/pipeline/reviewer-chain.ts` — reviewer needs-fix→code-fixer(:188-192)、approved+fixable→code-fixer(:166-178)、parallel 版: coordinator needs-fix→code-fixer(:433-438)、regression-gate needs-fix→code-fixer(:491-495)、regression-gate approved+fixable→code-fixer(:470-483)
- `src/core/pipeline/findings-ledger.ts:28-48` — `collectFindingsLedger`(regression-gate 入力)/ `:63-87` — `collectParallelFixerFindings`(code-fixer 入力)。fixable を無差別に収集する
- `src/core/pipeline/pipeline.ts:366` — "escalation" verdict は transition 行を持たず `?? "escalate"` で terminal に落ち、`:427-443` で awaiting-resume + resumePoint になる(再利用可能な既存経路)
- judge-verdict は pure module(slug を持たない)。正典集合は引数で渡す形で純粋性を保てる

## 要件

### R1: 判定層に file-aware escalation 規則を追加する

fixable finding が次の両方を満たす場合、当該 finding を needs-fix 要因でなく **escalation 要因**として扱う:

1. `finding.file` が保護正典パス集合に含まれる
2. その finding の実効 routing 先 fixer(finding.fixTarget、欠落時は当該 verdict 関数の default)がその file を合法に書けない(= fixer の宣言 write に含まれない)

規則は pure に保つ(正典集合・fixer 別の書込可能集合は引数で受け、判定関数内で I/O しない)。spec-fixer が書ける正典(spec.md / design.md / tasks.md)への `fixTarget: "spec-fixer"` finding は現行どおり needs-fix routing を維持する。request.md / test-cases.md はどの fixer も書けないため、これらへの fixable finding は常に escalation になる。

### R2: 全 verdict 導出関数への適用

`deriveJudgeVerdict` / `deriveRegressionGateVerdict` / `deriveConformanceVerdict` に R1 を適用し、`step-completion.ts` の配線点で正典集合を渡す。escalation の reason には該当 finding の file / title と「fixer は write-scope により当該 file を修正できない。operator の適用が必要」の旨を含める。

### R3: findings-ledger 経路の整合

`collectFindingsLedger` / `collectParallelFixerFindings` が fixer prompt に渡す集合から R1 該当 finding を除外し、除外があった場合は当該 round / gate の verdict が escalation に倒れることを保証する(fixer に「直せない findings」が届かない。escalation reason に除外分を列挙する)。

### R4: 挙動保存

- 非正典 file への fixable finding の routing(needs-fix → 各 fixer)は不変。
- decision-needed / critical / high の既存 escalation・needs-fix 規則は不変。
- write-scope guard(commit 層)は変更しない。

## スコープ外

- spec-fixer の write-set 拡張(test-cases.md 等の条件付き許可 — TC ID 凍結規律との整合検討が必要な別議論。#890 の対応候補 2)
- operator 修正の半自動化(escalation 後の適用支援)
- custom reviewer の finding schema 変更

## 受け入れ基準

- [ ] test-cases.md への fixable finding(fixTarget: code-fixer / 欠落)で deriveRegressionGateVerdict が escalation を返すことをテストで固定する(#890 の実例の再現)
- [ ] request.md への fixable finding が fixTarget によらず escalation になることをテストで固定する
- [ ] spec.md への `fixTarget: "spec-fixer"` fixable finding は conformance で `needs-fix:spec-fixer` のまま routing されることをテストで固定する(挙動保存)
- [ ] 非正典 file(src/**)への fixable finding の needs-fix routing が全 verdict 関数で不変であることをテストで固定する
- [ ] ledger 経路: 正典 finding を含む reviewer round の後、code-fixer の受領 findings に正典 finding が含まれず、verdict が escalation になることをテストで固定する
- [ ] escalation reason に file / title と operator 適用の必要性が含まれることをテストで固定する
- [ ] 修正前の挙動(file 非参照の routing)に戻すと該当テストが fail することを破壊確認として記録する
- [ ] 既存テストの期待更新は意図された挙動変更(正典 finding の escalation 化)に対応する分のみとし、対象を design で列挙する
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: routing 先 fixer の書込可能性で判定する target-aware 規則**。「保護正典なら一律 escalation」は spec-fixer の正当な正典修正ルート(conformance `needs-fix:spec-fixer`)を殺す過剰反応であり、「fixable = 実効 fixer が合法に書ける」へ前提を更新するのが最小で正確。
- **採用: 判定は verdict 導出層(pure)+ 配線は step-completion**。finding-ref 検証失敗時の escalation 上書き(:200-211)と同じ層・同じ形で、機械的に判定可能。
- **却下: fixer 側で正典 finding を skip して続行** — 「指摘が握り潰されたが green」という無言の弱体化。指摘の解消責任を operator に明示的に移す escalation が正しい。
- **却下: spec-fixer の write-set 拡張で吸収** — TC ID 凍結・正典 freeze の既存規律に波及する別設計であり、routing の欠陥修正と混ぜない。
