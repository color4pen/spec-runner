# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

`src/core/step/judge-verdict.ts` — 全 verdict 関数を通読し、finding.file 参照の有無を確認した。

- `deriveJudgeVerdict` (`:36-46`): severity / resolution のみ参照、`finding.file` 未参照 ✓
- `deriveRegressionGateVerdict` (`:133-143`): `resolution === "fixable"` で needs-fix、`finding.file` 未参照 ✓
- `deriveConformanceVerdict` (`:88-98`): `needs-fix:${target}` 返却、`finding.file` 未参照 ✓
- `aggregateFixTarget` (`:58-70`): fixTarget 欠落 → `"implementer"` default ✓

`src/kernel/report-result.ts` — Finding / FixTarget の型定義を確認した。

- `:22`: `FixTarget = "implementer" | "code-fixer" | "spec-fixer"` ✓
- `:43-44`: Finding.file の JSDoc「Worktree-relative file path」(:43) + 宣言 `file: string` (:44) ✓（request 記載は :43 だが実宣言は :44。内容は正確）

`src/core/step/write-scope.ts` — 保護正典の定義と import 関係を確認した。

- `:64-74`: `protectedCanonPaths` が request.md / spec.md / design.md / tasks.md / test-cases.md / attestation を列挙 ✓
- `:104-112`: `forbiddenWritePaths` = protectedCanonPaths − declaredWritePaths ✓
- `judge-verdict.ts` が write-scope.ts を import していないことをファイル内 import 文全件確認 ✓

`src/core/step/step-completion.ts` — verdict 導出の配線点を確認した。

- `:149-169`: deriveRequestReviewVerdict / deriveConformanceVerdict / step.judgeVerdictFn の配線 ✓
- `:200-211`: finding-ref 検証失敗時に `verdict = "escalation"` へ上書きする前例 ✓

`src/core/pipeline/types.ts` — conformance 遷移行を確認した。

- `:266-270`: `needs-fix:spec-fixer`→spec-fixer / `needs-fix:implementer`→implementer / `needs-fix:code-fixer`→code-fixer / 素の `needs-fix`→implementer ✓

`src/core/pipeline/reviewer-chain.ts` — reviewer / regression-gate の routing 行を確認した。

- `:166-178`: approved+fixable → code-fixer ✓
- `:188-192`: reviewer needs-fix → code-fixer ✓
- `:433-438`: coordinator needs-fix → code-fixer ✓
- `:491-495`: regression-gate needs-fix → code-fixer ✓
- `:470-483`: regression-gate approved+fixable → code-fixer ✓

`src/core/pipeline/findings-ledger.ts` — ledger 収集関数を確認した。

- `:28-48`: `collectFindingsLedger` が fixable finding を file 不問で無差別収集 ✓
- `:63-87`: `collectParallelFixerFindings` が fixable finding を file 不問で無差別収集 ✓

`src/core/pipeline/pipeline.ts` — escalation terminal 経路を確認した。

- `:366`: `transition?.to ?? "escalate"` — escalation verdict は transition 行を持たず terminal に落ちる ✓
- `:427-443`: escalate → awaiting-resume + resumePoint ✓

`src/core/step/spec-fixer.ts` — spec-fixer の宣言 write を確認した（request の前提検証）。

- `:99-105`: `writes()` が宣言するのは `design.md` と `spec.md` のみ。**tasks.md は含まれない**（下記 Finding 参照）

## 検証できなかった項目

None

## Findings 詳細

### Finding 1: spec-fixer.writes() に tasks.md が含まれない — 前提の事実誤り

`request.md` の「現状コードの前提」セクションに

> 「なお spec-fixer は spec.md / design.md / tasks.md を合法に書ける(宣言 write)」

と記載されているが、`src/core/step/spec-fixer.ts` の `writes()` (`:99-105`) が宣言するのは **`design.md` と `spec.md` のみ**。

```typescript
// spec-fixer.ts:99-105
writes(_state: JobState, deps: StepDeps): IoRef[] {
  const folder = changeFolderPath(deps.slug);
  return [
    { path: `${folder}/design.md` },
    { path: `${folder}/spec.md` },
  ];
},
```

`tasks.md` は `protectedCanonPaths` に含まれるが spec-fixer の宣言 write には含まれない。したがって R1 の条件「その finding の実効 routing 先 fixer がその file を合法に書けない」は `tasks.md` → `fixTarget: "spec-fixer"` にも該当し、このパターンも escalation になる。

**影響**: R1 と要件 背景の「spec-fixer が書ける正典(spec.md / design.md / tasks.md)への fixTarget: "spec-fixer" finding は現行どおり needs-fix routing を維持する」という記述が誤りのまま design に渡ると、tasks.md→spec-fixer routing を「有効」と見なした実装が生成されうる。この場合 `tasks.md` への fixable finding が escalation されず、write-scope 違反 halt が残存する。

**修正**: 「spec-fixer は **spec.md / design.md** を合法に書ける(宣言 write)」に訂正する。R1 の挙動保存記述も spec.md / design.md のみに絞る。tasks.md → spec-fixer も escalation 対象であることを明示する。
