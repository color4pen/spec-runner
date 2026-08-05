# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション検証（現状コードの前提）

| アサーション | ソース | 検証結果 |
|---|---|---|
| adr-gen の判断材料（request.md/design.md/spec.md/review-feedback/git diff）| `src/core/step/adr-gen.ts:89-97`（buildAdrGenInitialMessage 内 Judge materials セクション） | ✓ 一致 |
| system prompt が design.md を「設計判断の主出典」と指定 | `src/prompts/adr-gen-system.ts:52` | ✓ 一致（判定手順の step 2） |
| `reads()` が review-feedback を最新 iteration のみ宣言 | `src/core/step/adr-gen.ts:144-147`（`latestIteration` + 単一パス） | ✓ 一致 |
| message 本文が `review-feedback-*.md (any numbered files)` を指示し reads() と不整合 | `src/core/step/adr-gen.ts:96`（Judge materials 4 番） vs. reads() 単一 iteration 宣言 | ✓ 不整合を確認 |
| `buildMessage` が `dynamicContext` を参照しない | `src/core/step/adr-gen.ts:169-177`（`buildAdrGenInitialMessage` 呼び出しのみ、deps.dynamicContext 非参照） | ✓ 一致 |
| `AdrGenStep` に `prepareRoundContext` hook が存在しない | `src/core/step/adr-gen.ts` 全文 | ✓ 一致（hook 未定義） |
| code-fixer が `resultFilePath → null` / `NULL_PARSE_RESULT` | `src/core/step/code-fixer.ts:303-310` | ✓ 一致 |
| design.md が `protectedCanonPaths` に含まれ code-fixer は書けない | `src/core/step/write-scope.ts:64-74`（protectedCanonPaths が design.md を列挙） | ✓ 一致 |
| `prepareRoundContext` hook が core で全 step best-effort 呼び出し | `src/core/step/step-context-builder.ts:152-160`（try/catch で黙って degrade） | ✓ 一致 |
| prior-round-context の実装例が spec-review に存在 | `src/core/step/prior-round-context.ts`（derivePriorRoundContext、null 縮退全経路） | ✓ 一致 |
| adr-gen から fixer への戻り edge が存在しない | `src/core/pipeline/types.ts:277-280`（success→pr-create / skipped→pr-create / error→escalate のみ） | ✓ 一致 |
| `listCommitChangedFiles(oid, cwd)` port が存在する | `src/core/port/runtime-strategy.ts:651`（optional method、managed では unavailable） | ✓ 一致 |

### 設計判断の妥当性

- **`prepareRoundContext` 再利用**: `src/core/port/step-types.ts:262-266` の型定義（`Partial<DynamicContext> | null` 返却）、`step-context-builder.ts:151-160` の呼び出し規律ともに、adr-gen への適用で追加実装なしに機能する。`src/git/dynamic-context.ts` に新フィールド（post-fix context）を追加するだけで動く。
- **buildMessage への連携経路**: `src/adapter/claude-code/agent-runner.ts:439-449` で `ctx.input.dynamicContext` → `stepCtx.dynamicContext` → `step.buildMessage(state, stepCtx)` と伝播する。`spec-review.buildMessage` が `deps.dynamicContext?.priorRoundContext` を参照するパターンと同一経路。
- **読み込み不整合の扱い**: reads() / message 本文の不整合は既存バグとして背景に記載されており、本 request のスコープ外。受け入れ基準に修正は含まれていない（許容範囲）。
- **TC-ADR-STEP-02 の期待更新**: 現行テスト（`adr: true` 時の message 内容チェック）は post-fix block 注入後に新 assertions が加わる形での更新が必要。request がこれを「本契約変更に伴う期待更新のみ許容」と明示しており適切。

## 検証できなかった項目

None

## Findings 詳細

指摘なし
