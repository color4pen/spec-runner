# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. Codex adapter の prompt 構築フローを確認

`src/adapter/codex/agent-runner.ts` を通読した（line 407–431 の `baseFullPrompt` / `fullPrompt` 構築フロー）。

現在の構築順:
1. `baseMessage` = `step.buildMessage(state, stepCtx)`
2. `artifactSection` = `buildArtifactBundle()`
3. `touchedFilesSection` = `buildTouchedFilesSection()`
4. `resumeSection` = `buildResumeSection(ctx)`
5. `additionalInstructions` = `buildAdditionalInstructions(ctx)` （shared: Claude Code と共用）
6. `baseFullPrompt` = 1–5 を連結
7. `promptRulesSection` = `ctx.policy.promptRules` （`specrunner/rules/<step>/*.md` から注入）
8. `fullPrompt` = `baseFullPrompt + promptRulesSection + completionInstruction（reportTool 時のみ）`

この構造に Codex 固有の guidance 定数を追加するための差し込み口は明確に存在する。

### 2. Claude Code adapter が guidance の影響を受けないことを確認

- `src/adapter/shared/prompt-builder.ts` は `buildAdditionalInstructions` / `buildResumeSection` のみ定義。provider-specific 要素なし。
- `src/adapter/claude-code/agent-runner.ts` は shared の同関数を import しており、Codex adapter とは独立して prompt を組み立てる。
- 要件「Claude provider の prompt 組み立てに変更がない」は、Codex adapter 内に定数を追加するだけで自然に満たせる。

### 3. pipeline transition / convergence budget / maxIterations に diff が出ないことを確認

- `src/core/pipeline/convergence-budget.ts` — ConvergenceBudget クラス（イミュータブル）。adapter とは無関係。
- `src/core/pipeline/pipeline.ts` — `maxIterations` は `PipelineParams` から注入。adapter は触らない。
- 要件「pipeline transition / convergence budget / maxIterations に diff がない」はアーキテクチャ上自然に満たせる。

### 4. custom reviewer 定義を確認

- `specrunner/reviewers/cross-boundary-invariants.md` — frontmatter `maxIterations: 2`, 目的・観点を記述。変更対象外。
- `specrunner/reviewers/scale-tolerance.md` — 同様に変更対象外。
- 要件「`specrunner/reviewers/*.md` に diff がない」は変更対象ファイルに含まれないため満たせる。

### 5. 既存テストへの影響（byte-identical テスト）

以下の 2 件の既存テストが **「prompt が byte-identical」** であることを検証している:

- `src/adapter/codex/__tests__/resume-prompt-injection.test.ts` line 163:
  `expect(calls[0]!.prompt).toBe(\`${baseMessage}\n\n${additionalInstructions}\`);`
- `src/adapter/codex/__tests__/artifact-bundle-injection.test.ts` line 171:
  `expect(calls[0]!.prompt).toBe(\`${BASE_MESSAGE}\n\n${additionalInstructions}\`);`

guidance が常に注入される実装では、これらのアサーションが失敗する。
実装者はこれらのテストを guidance テキストを含む expected 文字列へ更新する必要がある（または guidance 定数を export して参照させる）。
これは受け入れ基準「typecheck / test が green」の達成に必要な実装上の注意事項であり、request の承認を妨げるものではない。

### 6. 新しい provider config protocol / pipeline abstraction の不在を確認

request は「adapter 内の小さい定数/ヘルパ程度」と明示しており、
現在の codebase にも `promptRulesSection` の注入など類似パターンが存在する。
新たな設定 schema や pipeline descriptor フィールドを追加せず実現できる。

### 7. 要件文面の適用範囲（全 Codex step 対象か reviewer step のみか）

request は「reviewer 以外の Codex step にも不自然な制約をかけないよう、文面は SpecRunner 共通の scope discipline に留めること」と述べており、全 step に共通の guidance を注入する設計を選択している。
サンプル guidance 文面（"Do not invent requirements…", "Do not promote speculative edge cases…" 等）は主にレビュー・評価ステップ向けのニュアンスを含むが、implementer や design など他ステップへ注入されても動作を破壊する性質ではなく、advisory として機能する。

## 検証できなかった項目

None。typecheck / test の実際の green 確認は実装後に検証ステップで行われるため、実行はしていない。

## Findings 詳細

指摘がない場合は None と明記する。

None
