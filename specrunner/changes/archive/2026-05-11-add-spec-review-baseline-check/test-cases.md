# Test Cases: add-spec-review-baseline-check

## Legend

| Field | Values |
|-------|--------|
| Priority | must / should / could |
| Category | correctness / architecture / maintainability / testing |
| Source | Task 1–6 (tasks.md) / request.md AC |

---

## TC-001: DynamicContext に baselineSpecs フィールドが存在する

- **Priority**: must
- **Category**: correctness
- **Source**: Task 1 / AC "Step interface に optional `enrichContext` が定義されている"

**GIVEN** `src/git/dynamic-context.ts` の `DynamicContext` interface を参照する  
**WHEN** interface の型定義を確認する  
**THEN** `baselineSpecs?: Record<string, string>` フィールドが optional として存在する

---

## TC-002: collectDynamicContext は baselineSpecs を設定しない

- **Priority**: must
- **Category**: correctness
- **Source**: Task 1 AC "既存コードに影響なし"

**GIVEN** `collectDynamicContext()` を呼び出す  
**WHEN** 返り値の DynamicContext を確認する  
**THEN** `baselineSpecs` は `undefined` であり、既存の `gitLog` / `diffStat` / `changesList` は従来通り設定される

---

## TC-003: AgentStep interface に optional enrichContext が定義されている

- **Priority**: must
- **Category**: architecture
- **Source**: Task 2 / request.md 要件1

**GIVEN** `src/core/step/types.ts` の `AgentStep` interface を参照する  
**WHEN** interface のメソッド一覧を確認する  
**THEN** `enrichContext?(dynamicContext: DynamicContext, cwd: string, slug: string): Promise<DynamicContext>` が optional メソッドとして存在する

---

## TC-004: ClaudeCodeRunner が enrichContext を buildMessage 前に呼ぶ

- **Priority**: must
- **Category**: correctness
- **Source**: Task 3a / request.md 要件2 / AC "両 adapter が buildMessage 前に enrichContext を呼んでいる"

**GIVEN** `enrichContext` を実装した AgentStep（SpecReviewStep 等）がある  
**AND** `ClaudeCodeRunner.run()` がそのステップを処理する  
**WHEN** `run()` の実行順序を確認する  
**THEN** `step.enrichContext?.()` が `step.buildMessage()` より前に呼ばれ、返された DynamicContext で `stepCtx.dynamicContext` が差し替えられる

---

## TC-005: ClaudeCodeRunner は enrichContext がない Step を正常に処理する

- **Priority**: must
- **Category**: correctness
- **Source**: Task 3a AC "enrichContext がない Step では既存動作に影響なし"

**GIVEN** `enrichContext` を持たない AgentStep（ProposeStep 等）がある  
**AND** `ClaudeCodeRunner.run()` がそのステップを処理する  
**WHEN** `run()` を実行する  
**THEN** エラーなく正常動作し、`buildMessage` は従来の `dynamicContext` を受け取る

---

## TC-006: ManagedAgentRunner が enrichContext を buildMessage 前に呼ぶ

- **Priority**: must
- **Category**: correctness
- **Source**: Task 3b / request.md 要件2

**GIVEN** `enrichContext` を実装した AgentStep がある  
**AND** `ManagedAgentRunner.runPollingStyle()` がそのステップを処理する  
**WHEN** `runPollingStyle()` の実行順序を確認する  
**THEN** `step.enrichContext?.()` が `step.buildMessage()` より前に呼ばれ、返された DynamicContext で `stepCtx.dynamicContext` が差し替えられる

---

## TC-007: ManagedAgentRunner は enrichContext がない Step を正常に処理する

- **Priority**: must
- **Category**: correctness
- **Source**: Task 3b AC "enrichContext がない Step では既存動作に影響なし"

**GIVEN** `enrichContext` を持たない AgentStep がある  
**AND** `ManagedAgentRunner.runPollingStyle()` がそのステップを処理する  
**WHEN** `runPollingStyle()` を実行する  
**THEN** エラーなく正常動作し、既存の動作に regression がない

---

## TC-008: enrichContext が specs/ 内の capability に対応する baseline を収集する

- **Priority**: must
- **Category**: correctness
- **Source**: Task 4 / request.md 要件3 / AC "SpecReviewStep の enrichContext が delta spec の capability に対応する baseline を収集する"

**GIVEN** `specrunner/changes/<slug>/specs/my-capability/` ディレクトリが存在する  
**AND** `specrunner/specs/my-capability/spec.md` が存在し内容がある  
**WHEN** `SpecReviewStep.enrichContext(dynamicContext, cwd, slug)` を呼ぶ  
**THEN** 返り値の `baselineSpecs["my-capability"]` に `spec.md` の内容が格納される  
**AND** 元の `dynamicContext` の他フィールド（gitLog 等）はそのまま引き継がれる

---

## TC-009: enrichContext が複数 capability の baseline を収集する

- **Priority**: must
- **Category**: correctness
- **Source**: Task 4

**GIVEN** `specs/` 配下に `cap-a/` と `cap-b/` の両ディレクトリが存在する  
**AND** 両方の baseline spec ファイルが存在する  
**WHEN** `enrichContext` を呼ぶ  
**THEN** `baselineSpecs["cap-a"]` と `baselineSpecs["cap-b"]` の両方に対応する内容が格納される

---

## TC-010: specs/ ディレクトリが存在しない場合 enrichContext は dynamicContext をそのまま返す

- **Priority**: must
- **Category**: correctness
- **Source**: Task 4 / request.md 要件5 / AC "delta spec がない場合は baseline 注入をスキップする"

**GIVEN** change folder に `specs/` ディレクトリが存在しない（refactoring 等）  
**WHEN** `SpecReviewStep.enrichContext(dynamicContext, cwd, slug)` を呼ぶ  
**THEN** 引数で渡した `dynamicContext` が変更なく返される  
**AND** `baselineSpecs` は設定されない

---

## TC-011: 新規 capability（baseline なし）はスキップされる

- **Priority**: must
- **Category**: correctness
- **Source**: Task 4 AC "baseline が存在しない capability（新規追加）はスキップする"

**GIVEN** `specs/new-capability/` ディレクトリが存在する  
**AND** `specrunner/specs/new-capability/spec.md` が存在しない  
**WHEN** `enrichContext` を呼ぶ  
**THEN** エラーは発生しない  
**AND** `baselineSpecs` に `"new-capability"` キーが存在しない（または `baselineSpecs` 自体が空）

---

## TC-012: specs/ は存在するが子ディレクトリがない場合 dynamicContext をそのまま返す

- **Priority**: should
- **Category**: correctness
- **Source**: Task 4 実装例（capabilities.length === 0 の分岐）

**GIVEN** `specs/` ディレクトリは存在するが、その中に capability サブディレクトリがない  
**WHEN** `enrichContext` を呼ぶ  
**THEN** 引数で渡した `dynamicContext` が変更なく返される

---

## TC-013: enrichContext のエラーは catch されずに伝播する

- **Priority**: must
- **Category**: correctness
- **Source**: Task 3 AC "enrichContext のエラーは catch せずそのまま伝播"

**GIVEN** `enrichContext` が予期しないエラーを throw する  
**WHEN** adapter が `enrichContext` を呼ぶ  
**THEN** エラーは adapter 内でサイレントに握り潰されない  
**AND** StepExecutor の既存エラーハンドリングに到達する

---

## TC-014: buildMessage は pure function 制約を維持する

- **Priority**: must
- **Category**: architecture
- **Source**: request.md 要件1 / AC "buildMessage の pure function 制約が維持されている" / design.md D1

**GIVEN** `SpecReviewStep.buildMessage(state, deps)` を参照する  
**WHEN** メソッド内部の実装を確認する  
**THEN** ファイル読み取り・ネットワークアクセス等の I/O 操作が一切含まれない  
**AND** baseline spec の読み取りは `enrichContext` 内のみで行われる

---

## TC-015: spec-review システムプロンプトに MODIFIED 整合性チェック指示がある

- **Priority**: must
- **Category**: correctness
- **Source**: Task 5a / request.md 要件4

**GIVEN** `SPEC_REVIEW_SYSTEM_PROMPT` の内容を参照する  
**WHEN** プロンプトのテキストを確認する  
**THEN** MODIFIED delta の Requirement header が baseline に存在するか検証するよう指示するテキストが含まれる  
**AND** 不整合時の severity が HIGH、category が consistency として明示されている

---

## TC-016: spec-review システムプロンプトに REMOVED 整合性チェック指示がある

- **Priority**: must
- **Category**: correctness
- **Source**: Task 5a / request.md 要件4

**GIVEN** `SPEC_REVIEW_SYSTEM_PROMPT` の内容を参照する  
**WHEN** プロンプトのテキストを確認する  
**THEN** REMOVED delta の Requirement header が baseline に存在するか検証するよう指示するテキストが含まれる

---

## TC-017: spec-review システムプロンプトに ADDED 整合性チェック指示がある

- **Priority**: must
- **Category**: correctness
- **Source**: Task 5a / request.md 要件4

**GIVEN** `SPEC_REVIEW_SYSTEM_PROMPT` の内容を参照する  
**WHEN** プロンプトのテキストを確認する  
**THEN** ADDED delta の Requirement header が baseline に既存しないか検証するよう指示するテキストが含まれる

---

## TC-018: システムプロンプトに baseline がない場合のスキップ指示がある

- **Priority**: must
- **Category**: correctness
- **Source**: Task 5a

**GIVEN** `SPEC_REVIEW_SYSTEM_PROMPT` を参照する  
**WHEN** baseline 整合性チェックセクションを確認する  
**THEN** baseline spec が提供されない場合はチェックをスキップするよう明記されている

---

## TC-019: buildSpecReviewInitialMessage が baselineSpecs を初期メッセージに含める

- **Priority**: must
- **Category**: correctness
- **Source**: Task 5b / request.md 要件5 / AC "spec-review の初期メッセージに関連 baseline spec の内容が含まれる"

**GIVEN** `SpecReviewPromptInput` に `baselineSpecs: { "my-cap": "<spec content>" }` が設定されている  
**WHEN** `buildSpecReviewInitialMessage(input)` を呼ぶ  
**THEN** 返り値のテキストに `<baseline-specs>` タグと capability 名、spec 内容が含まれる  
**AND** テンプレートプレースホルダー `{{BASELINE_SPECS}}` が文字列として残らない

---

## TC-020: baselineSpecs が空の場合 baseline セクションは空文字列に展開される

- **Priority**: must
- **Category**: correctness
- **Source**: Task 5b AC "baselineSpecs がない場合は空文字列に展開される"

**GIVEN** `SpecReviewPromptInput` に `baselineSpecs` が含まれない、または `{}` が渡される  
**WHEN** `buildSpecReviewInitialMessage(input)` を呼ぶ  
**THEN** `<baseline-specs>` タグや capability 内容は出力に含まれない  
**AND** `{{BASELINE_SPECS}}` プレースホルダーが文字列として残らない

---

## TC-021: SpecReviewStep.buildMessage が dynamicContext.baselineSpecs を渡す

- **Priority**: must
- **Category**: correctness
- **Source**: Task 5c / design.md データフロー

**GIVEN** `deps.dynamicContext.baselineSpecs` に baseline 内容が設定されている  
**WHEN** `SpecReviewStep.buildMessage(state, deps)` を呼ぶ  
**THEN** `buildSpecReviewInitialMessage` に `baselineSpecs` が渡される  
**AND** 最終的な初期メッセージに baseline spec 内容が含まれる

---

## TC-022: SpecReviewPromptInput に baselineSpecs フィールドが追加されている

- **Priority**: must
- **Category**: architecture
- **Source**: Task 5b

**GIVEN** `src/prompts/spec-review-system.ts` の `SpecReviewPromptInput` interface を参照する  
**WHEN** フィールド定義を確認する  
**THEN** `baselineSpecs?: Record<string, string>` が optional フィールドとして存在する

---

## TC-023: bun run typecheck が全 pass する

- **Priority**: must
- **Category**: testing
- **Source**: Task 6 / AC "bun run typecheck / bun run test が全 pass"

**GIVEN** 全 Task（1〜5）の実装が完了している  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で終了する

---

## TC-024: bun run test が全 pass する

- **Priority**: must
- **Category**: testing
- **Source**: Task 6 / AC "bun run typecheck / bun run test が全 pass"

**GIVEN** 全 Task（1〜5）の実装が完了している  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが PASS し、失敗が 0 件である

---

## TC-025: enrichContext を持たない既存 Step の既存テストが regression しない

- **Priority**: must
- **Category**: testing
- **Source**: design.md "enrichContext なしの Step を対象に動作確認"

**GIVEN** ProposeStep・ImplementerStep 等の `enrichContext` を持たない Step がある  
**AND** `bun run test` を実行する  
**WHEN** adapter 変更後のテストスイートを確認する  
**THEN** 既存テストが全 PASS し、新実装による regression が発生しない

---

## TC-026: enrichContext の返り値で stepCtx.dynamicContext が完全に差し替えられる

- **Priority**: should
- **Category**: correctness
- **Source**: Task 3 / design.md "stepCtx.dynamicContext を差し替え"

**GIVEN** `enrichContext` が `{ ...dynamicContext, baselineSpecs: {...} }` を返す  
**WHEN** adapter が返り値を受け取る  
**THEN** `stepCtx` が `{ ...stepCtx, dynamicContext: enriched }` で再構築される  
**AND** `stepCtx` の他フィールド（slug, cwd 等）は変更されない

---

## TC-027: enrichContext は対象 capability のみ baseline を収集する（全 baseline 収集はしない）

- **Priority**: should
- **Category**: correctness
- **Source**: request.md 補足 "baseline spec の全文注入は対象 capability のみに限定"

**GIVEN** specrunner/specs/ 配下に多数の capability spec が存在する  
**AND** delta spec（specs/）は 2 capability のみを持つ  
**WHEN** `enrichContext` を呼ぶ  
**THEN** `baselineSpecs` には delta spec が参照する 2 capability 分のみ格納される  
**AND** 全 baseline spec がまとめて収集されることはない
