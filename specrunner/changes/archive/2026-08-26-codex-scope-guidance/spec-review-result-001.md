# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル

- `specrunner/changes/codex-scope-guidance/request.md` — 要件・受け入れ基準・非目標を確認
- `specrunner/changes/codex-scope-guidance/design.md` — 実装方針・設計判断 D1〜D7・リスクを確認
- `specrunner/changes/codex-scope-guidance/tasks.md` — T-01〜T-06 の実装タスク・受け入れ基準を確認
- `specrunner/changes/codex-scope-guidance/spec.md` — 要件・シナリオ（SHALL/MUST）を確認
- `specrunner/changes/codex-scope-guidance/test-cases.md` — TC-001〜TC-019 の分類・優先度・出典を確認
- `src/adapter/codex/agent-runner.ts` — 現行の prompt 組み立てロジック（407〜431 行）を確認
- `src/adapter/codex/completion-report-prompt.ts` — "小さな定数モジュール" パターンのリファレンスを確認
- `src/adapter/shared/prompt-builder.ts` — 共有 builder（`buildAdditionalInstructions` / `buildResumeSection`）を確認
- `src/adapter/claude-code/agent-runner.ts`（先頭 100 行） — Claude 側への影響がないことを確認
- `src/adapter/codex/__tests__/resume-prompt-injection.test.ts` — TC-015 の既存 byte-identity テストを確認
- `src/adapter/codex/__tests__/artifact-bundle-injection.test.ts` — TC-015 の既存 byte-identity テストを確認
- `src/adapter/codex/__tests__/prompt-rules-injection.test.ts` — TC-018 の順序不等式テストを確認
- `src/adapter/codex/__tests__/touched-files-injection.test.ts` — TC-024/025 を確認（注入比較が guidance 影響を受けないことを確認）
- `src/adapter/codex/__tests__/completion-contract-injection.test.ts` — 既存 completion contract テストを確認
- `src/core/port/agent-runner.ts`（先頭 150 行） — AgentRunPolicy の現行フィールド構成を確認
- `tests/dead-guidance.test.ts` — grep 型 guard test のパターン（T-05 の様式参照）を確認

### 検証した観点

#### R1: 要件の正規化（normative keyword）
spec.md 全 Requirement が SHALL / MUST を少なくとも 1 つ含んでいる。4 つの Requirement すべてで確認済み。

#### R2: Scenario の Given/When/Then 構造
各 Requirement に少なくとも 1 つの Scenario があり、Given/When/Then が明示されている（10 Scenario すべて）。

#### R3: 注入点の整合性
design D2 は「`promptRulesSection` の直後・`buildMainTurnCompletionInstruction()` の直前」と定める。spec.md 第 2 Requirement の文面「after... project rules, and before the completion report instruction」と完全に一致している。agent-runner.ts 現行の `fullPrompt` 組み立て（428〜431 行）を読んだ上で、挿入点の機械的な変更で実現できることを確認した。

#### R4: 非 Codex provider の不変性
T-02 の禁止領域（`src/adapter/shared/`, `src/adapter/claude-code/`, `src/adapter/managed-agent/`, `src/prompts/`, `src/core/`）が spec / tasks の両方で明示されており、guard test（T-05 / TC-008）で構造的に固定される設計になっている。

#### R5: TC-015 byte-identity テストの更新方針
`resume-prompt-injection.test.ts:163` と `artifact-bundle-injection.test.ts:171` が現在それぞれ `toBe` 厳密一致で `${baseMessage}\n\n${additionalInstructions}` を期待していることを直接確認した。T-04 の更新方針（`toBe` を維持しつつ定数 import で期待式を連結する）は spec TC-015 の要求と整合している。

#### R6: TC-018 順序不等式への影響
既存 `prompt-rules-injection.test.ts` は `resumeIdx < rulesIdx < completionIdx` を検証する。guidance を `promptRulesSection` と `completionInstruction` の間に挿入すると `rulesIdx < guidance_idx < completionIdx` となるが、`rulesIdx < completionIdx` の成立は変わらないため TC-018 は修正不要。design D5 の記述と一致している。

#### R7: touched-files テスト（TC-024/025）への影響
TC-025 の Codex 同士比較テスト（`c1[0]!.prompt === c2[0]!.prompt`）は両プロンプトとも guidance を含む形になるため等価関係は維持される。T-04 で明示的に「変更不要」とされており、spec と一致。

#### R8: follow-up / retry turn への非注入（design D4 / TC-007）
`buildCompletionRetryPrompt` の戻り値は `completion-report-prompt.ts` から来ており、guidance 定数を参照していない。T-03 の「completion retry が `CODEX_SCOPE_GUIDANCE` を含まないこと」テストは正しく機械的に検証できる設計になっている。

#### R9: TC 総数の一致
test-cases.md の TC-001〜TC-019（計 19 件）が result セクションの `total: 19` と一致している。

#### R10: セキュリティ観点
- guidance テキストはハードコードされた静的定数であり、ユーザー入力を含まない。プロンプトインジェクションのリスクはない。
- 認証・auth フロー（OPENAI_API_KEY / CODEX_AUTH_JSON）に変更なし。
- 新たな入力バリデーション対象なし。
- OWASP Top 10 のいずれも適用対象外（ネットワーク通信・認証・入力検証の変更を伴わない）。

---

## 検証できなかった項目

### 未検証 1: TC-012「scope-guidance.ts が純粋な定数モジュールであること」の自動テスト
`scope-guidance.ts` は未作成（実装前レビュー）のため内容を確認できない。また tasks の T-01 受け入れ基準には「当該ファイルが他モジュールを import していない」と明記されているが、これを機械的に検証する runnable test は T-03〜T-05 のどのタスクにも明示的に含まれていない。コードレビューによる確認に留まる。

### 未検証 2: guard test ファイルの存在
`tests/adapter/codex/scope-guidance-provider-isolation.test.ts` は実装前のため存在しない（これは実装タスク T-05 で作成される）。テスト様式の参照元（`tests/dead-guidance.test.ts`）のパターンを確認し、設計の妥当性のみを判断した。

### 未検証 3: `bun run typecheck / test / lint` の通過
実装前のため実行不可。T-06 の gate チェックで実施される。

---

## Findings 詳細

### Finding F-001: TC-012 の自動テストカバレッジが計画に欠落している（低重要度）

**種別**: fixable / low

TC-012「scope-guidance.ts Is a Pure Constant Module with No Imports」は test-cases.md で category: unit / priority: should に分類されている。しかし tasks の T-01〜T-05 のどこにも「scope-guidance.ts 自身の import 文不在を自動テストで検証する」タスクが存在しない。T-05 の guard test は「`src/adapter/codex/` 外のファイルが guidance 文字列を含まないこと」を走査するが、`scope-guidance.ts` 自体の構造（imports の有無・export 数）は走査対象外である。

T-01 の受け入れ基準に「当該ファイルが他モジュールを import していない」が記載されているが、これはコードレビュー検証であって自動テストではない。

**推奨対応**: T-05 の guard test、または別の小さいテストに「`src/adapter/codex/scope-guidance.ts` の内容に import 宣言が存在しないこと」を assert するケースを 1 件追加する。`dead-guidance.test.ts` のファイル走査パターンで実装可能。ただし TC-012 は "should" 優先度であり、実装なし（コードレビューのみ）でも受け入れ基準を充足する。

---

### 非指摘事項（観察）

以下は指摘レベルに達しないが、読後の観察として記録する。

- **TC 番号の再利用**: 新規 test-cases.md の TC-012 / TC-015 は、既存テストファイル（`artifact-bundle-injection.test.ts`, `resume-prompt-injection.test.ts`）がそれぞれ同じ番号で参照している既存テストケースと同番号である。設計書はこの衝突を意図的なもの（"TC-015 を guidance 込みに更新する" という meta-requirement として TC-015 を命名）として扱っていると解釈できるが、グローバル番号として見ると同一番号に複数の意味が生じる。リーダビリティ上の留意点。

- **TC-006（should）と更新 TC-015（must）の重複**: TC-006 のシナリオ（no reportTool, no promptRules, no artifacts の byte-exact assertion）は、T-04 で更新される既存 TC-015 テストが実質的に同じ条件を `toBe` で検証する。TC-006 の追加カバレッジとして T-03 に byte-exact ケースを明示するかは任意（現計画ではオーバーラップして sufficient）。

- **セキュリティ**: guidance 文面は全行 ASCII テキストの静的定数であり、ユーザー制御可能な入力を含まない。認証・権限・入力バリデーション・OWASP Top 10 いずれの観点でも変更差分はゼロ。
