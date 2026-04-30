## 1. Shared parser extraction (verdict 共通化)

- [x] 1.1 `src/core/parser/review-verdict.ts` を新設し、`parseReviewVerdict(content: string): Verdict | null` を実装する（line `- **verdict**: (approved|needs-fix|escalation)` を regex で抽出する pure 関数）
- [x] 1.2 既存 `src/core/step/spec-review.ts` の `parseSpecReviewVerdict`（または相当の inline regex）を `parseReviewVerdict` に delegate するよう書き換え、call site の互換性を保つ
- [x] 1.3 `tests/unit/parser/review-verdict.test.ts` を新設し、approved / needs-fix / escalation / 欠落ケースを検証
- [x] 1.4 `tests/unit/step/spec-review.test.ts` が引き続き PASS することを確認（regression 0）

## 2. StepName / Verdict / 型拡張

- [x] 2.1 `src/state/schema.ts` の `StepName` union に `"code-review" | "code-fixer"` を追加
- [x] 2.2 `Verdict` exhaustive switch を全 call site で確認（必要なら新 step を case として追加）。型エラーが出る箇所をすべて修正
- [x] 2.3 `tests/unit/state/schema.test.ts`（または相当）を更新し、新 StepName 値を許容することを検証

## 3. Code review system prompt

- [x] 3.1 `src/prompts/code-review-system.ts` を新設し、`CODE_REVIEW_SYSTEM_PROMPT` を export する
- [x] 3.2 prompt 内容: (a) `.claude/rules/review-standards.md` の severity / category / verdict 規約を参照、(b) `git diff main...HEAD` で diff を取得、(c) `openspec/changes/<slug>/` および関連 `openspec/specs/` を読む、(d) `review-feedback-NNN.md` に Findings table + Verdict を出力、(e) read-only（commit/push 禁止）
- [x] 3.3 prompt の snapshot test（任意）

## 4. Code fixer system prompt

- [x] 4.1 `src/prompts/code-fixer-system.ts` を新設し、`CODE_FIXER_SYSTEM_PROMPT` を export する
- [x] 4.2 prompt 内容: (a) review-feedback-NNN.md の HIGH を必ず修正、MEDIUM は spec/設計と整合する範囲、LOW は無視、(b) 仕様変更や追加機能禁止、(c) `buildGitPushInstruction()` 経由で commit/push、(d) `gitWrite` capability 前提

## 5. CodeReviewStep 実装

- [x] 5.1 `src/core/step/code-review.ts` を新設し、`CodeReviewStep: AgentStep` を export する
- [x] 5.2 `agent` フィールド: `name = "specrunner-code-review"`, `role = "code-review"`, `model = "claude-sonnet-4-5"`, `system = CODE_REVIEW_SYSTEM_PROMPT`, `tools = "agent_toolset_20260401"`, `capabilities` から `gitWrite` を除外
- [x] 5.3 `resultFilePath(state)` → `openspec/changes/<slug>/review-feedback-${zeroPad(iter, 3)}.md` を返す
- [x] 5.4 `parseResult(content)` → `parseReviewVerdict(content)` で verdict を抽出し `StepOutcome` を組み立てる
- [x] 5.5 `buildMessage(state, deps)` で agent への指示文を生成（slug、iteration N、`review-feedback-NNN.md` への出力指示を含む）
- [x] 5.6 `tests/unit/step/code-review.test.ts` を新設し、Step interface 適合性（kind / agent.role / resultFilePath / parseResult のすべての契約）を検証

## 6. CodeFixerStep 実装

- [x] 6.1 `src/core/step/code-fixer.ts` を新設し、`CodeFixerStep: AgentStep` を export する
- [x] 6.2 `agent` フィールド: `name = "specrunner-code-fixer"`, `role = "code-fixer"`, `model = "claude-sonnet-4-5"`, `system = CODE_FIXER_SYSTEM_PROMPT`, `tools = "agent_toolset_20260401"`, `capabilities.gitWrite = true`
- [x] 6.3 `resultFilePath(state)` → `null`
- [x] 6.4 `parseResult` → `NULL_PARSE_RESULT` を返す（既存定数流用）
- [x] 6.5 `buildMessage(state, deps)` で直近の `review-feedback-NNN.md` の path を埋め込み、`buildGitPushInstruction()` を組み合わせる
- [x] 6.6 `completionVerdict = "approved"` 相当の挙動を確認（StepExecutor が `resultFilePath === null` の場合に `"approved"` を導出することを既存 spec-fixer と対称に保つ。spec-fixer と異なる挙動が必要なら StepExecutor 側に role 別の completionVerdict map を追加検討）
- [x] 6.7 `tests/unit/step/code-fixer.test.ts` を新設し、Step interface 適合性（kind / agent.role / resultFilePath null / NULL_PARSE_RESULT / gitWrite capability）を検証
- [x] 6.8 エラーコード `CODE_FIXER_NO_REVIEW_RESULT` を `src/core/errors.ts`（または相当ファイル）に新設する。既存 `BUILD_FIXER_NO_VERIFICATION_RESULT` と同じパターンで定義すること
- [x] 6.9 `CodeFixerStep.buildMessage` 内で `getLatestStepResult(state, "code-review")` が空の場合に `SpecRunnerError(CODE_FIXER_NO_REVIEW_RESULT)` を throw することを unit test で検証する

## 7. Pipeline transitions / loop error codes 拡張

- [x] 7.1 `STANDARD_TRANSITIONS`（`src/core/pipeline/transitions.ts` 等）から `verification --passed→ end` 行を削除
- [x] 7.2 以下を追加:
  - `verification --passed→ code-review`
  - `code-review --approved→ end`
  - `code-review --needs-fix→ code-fixer`
  - `code-review --escalation→ escalate`
  - `code-fixer --approved→ code-review`
  - `code-fixer --error→ escalate`
- [x] 7.3 `LOOP_ERROR_CODES` lookup table に `code-review` エントリを追加（`code: "CODE_REVIEW_RETRIES_EXHAUSTED"`, `message: (n) => \`code-review did not approve after ${n} iterations\``, `hint: (nnn) => \`Review review-feedback-${nnn}.md and address findings manually.\`` — 既存 `LoopErrorShape` の関数型と一致させること）
- [x] 7.4 `Pipeline` constructor の `loopNames` 既定値を `["spec-review", "verification", "code-review"]` に拡張
- [x] 7.5 `tests/unit/core/pipeline/pipeline.transitions.test.ts` に新 transition の row 検証を追加
- [x] 7.6 `tests/unit/core/pipeline/pipeline.loop-guard.test.ts`（または相当）に `code-review` ↔ `code-fixer` の maxIterations 到達 → `CODE_REVIEW_RETRIES_EXHAUSTED` を検証する scenario を追加
- [x] 7.7 `tests/grep-no-step-name-hardcode.test.ts` が引き続き PASS することを確認（executor / pipeline で step name hardcode が発生していない）

## 8. AgentRegistry / AgentSyncer / Pipeline 配線

- [x] 8.1 `src/cli/init.ts`: `AgentRegistry.fromSteps([...])` の引数に `CodeReviewStep`, `CodeFixerStep` を追加
- [x] 8.2 `src/cli/run.ts`: `Pipeline` constructor に渡す `steps` Map に `code-review`, `code-fixer` を追加
- [x] 8.3 `tests/unit/cli/init.test.ts`（または相当）で `specrunner init` が code-review / code-fixer Agent を作成することを検証（mock）
- [x] 8.4 AgentRegistry / AgentSyncer のソース無編集を grep / diff で確認（`src/core/registry/`, `src/core/syncer/` の変更行 = 0）

## 9. Integration / 受け入れ確認

- [x] 9.1 全 unit test PASS（regression 0 件）
- [x] 9.2 `bun run typecheck` PASS
- [x] 9.3 `bun run lint` PASS（lint スクリプト未設定のため skip）
- [x] 9.4 Pipeline state machine の dry-run テスト: verification passed → code-review → end（approved の場合）の遷移確認
- [x] 9.5 Pipeline state machine: code-review needs-fix → code-fixer → code-review が max 3 で escalation に遷移することを確認
- [x] 9.6 `review-feedback-NNN.md` が iteration zero-padded で生成されることをユニットテストで検証

## 10. 学習層 / ADR / module-architect 出力

- [x] 10.1 `openspec/changes/code-review-fixer/module-analysis.md` の共通化候補（parser 抽出、prompt 配置）が tasks.md（本ファイル §1, §3, §4）に下りていることを確認
- [x] 10.2 ADR を `openspec-workflow/adr/ADR-<date>-code-review-input-source.md` として作成し、D1（diff fetch を agent 内 bash で実行する選択）と D3（review-feedback format を spec-review-result と同形式にした判断）を記録
- [x] 10.3 ADR を `openspec-workflow/adr/ADR-<date>-review-verdict-parser-shared.md` として作成し、D5（`parseReviewVerdict` 共通化の境界 — verdict 抽出のみ）を記録
