# module-analysis — code-review-fixer

## Scope

Mechanical division only (testability / readability / cohesion / coupling / reusability / SRP). Out of scope: extensibility, deployment independence, security boundary, domain boundary. **This is reference information for the implementer; the implementer retains final authority on adoption.**

## 1. 既存コードパターン一覧

観察された AgentStep 規約（`src/core/step/{spec-review,spec-fixer,implementer,build-fixer}.ts`）:

- 各 Step ファイルは以下の構造で統一されている:
  1. `MODEL` 定数（モジュールスコープ）
  2. `xxxAgentDefinition: AgentDefinition`（モジュールスコープ const、Step が own）
  3. `buildXxxInitialMessage(opts)` private function（または `buildMessage` 内 inline）
  4. `export const XxxStep: AgentStep = { kind: "agent", name, agent, toolHandlers: undefined, buildMessage, resultFilePath, parseResult, completionVerdict? }`
- system prompt は `src/prompts/<role>-system.ts` に `XXX_SYSTEM_PROMPT` 定数として export（命名: `SCREAMING_SNAKE_CASE` + `_SYSTEM_PROMPT` suffix）
- result-file-bearing Step（spec-review）: `resultFilePath` が iteration zero-padded 3 桁、`parseResult` は file content から verdict を regex 抽出
- result-file-less Step（spec-fixer / implementer / build-fixer）: `resultFilePath = null`、`parseResult = NULL_PARSE_RESULT`、`completionVerdict` を明示
- gitWrite を行う Step（implementer / spec-fixer / build-fixer）は `buildGitPushInstruction(branch)` を `buildMessage` で組み込み、`capabilities.gitWrite = true`
- transition / loop-error は `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS` 配列と `LOOP_ERROR_CODES` Record の 2 ヶ所のみ（Pipeline 本体は無編集で拡張）

命名規則:
- Step 名 = `agent.role` = ファイル名 stem（`code-review` / `code-fixer`）— hardcode 検査 (`grep-no-step-name-hardcode.test.ts`) が PASS する規律
- Agent name は `specrunner-<role>` 接頭辞

## 2. 共通化すべき箇所と理由

| # | 箇所 | 軸 | 推奨 | 観測根拠 |
|---|------|-----|------|---------|
| 1 | `parseSpecReviewVerdict` の verdict 抽出 regex | reusability | `src/core/parser/review-verdict.ts` に `parseReviewVerdict(content): Verdict \| null` を抽出。`spec-review.ts` の `parseSpecReviewVerdict` は 1 行 wrapper として残し内部で delegate | `src/core/step/spec-review.ts:29-36` の regex は `code-review.ts` でもそのまま再利用される（rule of three: 既存 1 + 新規 1 = 2 で抽出妥当）。design.md D5 / tasks.md §1 と整合 |
| 2 | findings table parser（`parseSpecReviewFindingsSummary`）の所在 | cohesion | 現状は `src/cli/run.ts:32-60` に inline。code-review でも同形式 findings table を扱うため、本 request では touch しないが `src/core/parser/findings-summary.ts` への将来抽出候補としてマーク（YAGNI 適用、本 request の scope 外） | `src/cli/run.ts:32-60` と design.md D3（review-feedback format = spec-review-result format） |
| 3 | git push instruction | reusability | 既に `src/prompts/git-push-instruction.ts:buildGitPushInstruction` として抽出済み。code-fixer は流用するのみ（新規共通化不要） | `src/prompts/git-push-instruction.ts`、spec-fixer / implementer / build-fixer すべて使用 |
| 4 | iteration 計算（`computeSpecReviewIteration` 相当） | SRP | spec-review.ts:50-52 の `(state.steps?.[step]?.length ?? 0) + 1` パターンは code-review でも同一に必要。共通化候補だが各 Step に 3 行で済むため抽出は YAGNI。**implementer 判断**: 重複を許容するか `src/state/helpers.ts` に `computeStepIteration(state, stepName)` を追加するかは implementer の判断で良い | spec-review.ts:50-52、design.md / tasks.md 5.3 で同形式が要求される |

**circular dependency リスク**: `src/core/parser/review-verdict.ts` は `state/schema.js` から `Verdict` 型のみ import する pure 関数。`spec-review.ts` / `code-review.ts` → `parser/review-verdict.ts` の単方向参照のため循環は発生しない。

## 3. 既存ヘルパー / ユーティリティの活用候補

| ヘルパー | 用途 | code-review / code-fixer での活用 |
|---------|------|-----------------------------------|
| `NULL_PARSE_RESULT` (`src/core/step/types.ts:29`) | result-file-less step の `parseResult` 戻り値 | code-fixer.parseResult で **そのまま流用**（tasks.md 6.4） |
| `buildGitPushInstruction(branch)` (`src/prompts/git-push-instruction.ts`) | git commit/push 指示 | code-fixer.buildMessage で **そのまま流用**（tasks.md 4.1, 6.5） |
| `getLatestStepResult(state, stepName)` (`src/state/helpers.ts`) | 直近の StepRun 取得 | code-fixer.buildMessage で `getLatestStepResult(state, "code-review")` として **流用**（spec-fixer / build-fixer と同 pattern） |
| `AGENT_TOOLSET_TYPE` (`src/core/agent/definition.ts`) | tools 配列の type | 両 Step の AgentDefinition で **流用** |
| `LOOP_ERROR_CODES` (`src/core/pipeline/types.ts:28`) | exhaustion error shape | `code-review` エントリ追加のみ。Pipeline 本体無編集（design.md と整合） |
| `SpecRunnerError` + `BUILD_FIXER_NO_VERIFICATION_RESULT` pattern (`src/core/step/build-fixer.ts:64-69`) | 前段 step の result 欠落時の halt | code-fixer.buildMessage でも **同 pattern を踏襲**: `getLatestStepResult(state, "code-review")` が空なら `CODE_FIXER_NO_REVIEW_RESULT` 等で throw（implementer 判断、明示推奨） |

## 4. 分割単位の推奨

### File 分割

- **`src/prompts/code-review-system.ts`**: `CODE_REVIEW_SYSTEM_PROMPT` のみ export。spec-review-system.ts と異なり `buildXxxInitialMessage` は agent が `git diff` を自走するため最小限で良い（design.md D1）。**推奨**: spec-review-system.ts と同型の `buildCodeReviewInitialMessage` を export することで、call site (code-review.ts) で template literal の散乱を防ぐ。**軸: cohesion**
- **`src/prompts/code-fixer-system.ts`**: `CODE_FIXER_SYSTEM_PROMPT` のみ export。build-fixer-system.ts が日本語、spec-fixer-system.ts が英語 / 日本語混在の現状を踏まえ、**code-fixer は build-fixer と同じトーン（日本語）で書くことを推奨**（fixer 系の regularity）。**軸: readability**
- **`src/core/step/code-review.ts` / `code-fixer.ts`**: 既存 4 step ファイルと完全対称な構造を保つ。各ファイル 70–100 行に収まる想定。**軸: SRP**
- **`src/core/parser/review-verdict.ts`**: pure 関数 1 つ + 型 import のみ。`spec-review.ts` との循環なし。**軸: testability** — pure function 単独テスト (`tests/unit/parser/review-verdict.test.ts`) が容易、現状 `spec-review.test.ts` 経由でしか間接テストできていない問題を解消。

### Function 分割

- **code-review.ts の `buildMessage`**: spec-review.ts:70-82 と対称に、`buildCodeReviewInitialMessage(opts)` を private function として切り出すことを推奨。inline の template literal を避け、test 時の固定値注入（slug / iteration / findingsPath）を局所化できる。**軸: testability**
- **code-fixer.ts の `buildMessage`**: build-fixer.ts:57-90 と完全対称に、(1) `getLatestStepResult(state, "code-review")` で前段 result 取得 → (2) 欠落なら `SpecRunnerError(CODE_FIXER_NO_REVIEW_RESULT)` throw → (3) `buildGitPushInstruction(branch)` 流用、の 3 段構成。**軸: cohesion / SRP**
- **iteration 計算**: code-review.ts 内に `computeCodeReviewIteration(state)` を private 関数として置く（spec-review.ts:50-52 と対称）。共通化抽出は YAGNI。**軸: readability**

### Module 分割

- **transition table の論理グループ化**: `STANDARD_TRANSITIONS` 配列に新 6 行を追加する際、既存 verification ブロックの直後にコメント区切り `// --- code review loop ---` を入れることで読了性を維持することを推奨。配列分割は Pipeline 内部の `find()` ロジックに影響するため**避ける**。**軸: readability（cohesion ではない）**

## 5. 構造的対称性の評価

| 観点 | code-review | code-fixer | 既存対称項 | 適合 |
|------|-------------|------------|-----------|------|
| `kind` | `"agent"` | `"agent"` | spec-review / spec-fixer / implementer / build-fixer | OK |
| `agent.role` | `"code-review"` | `"code-fixer"` | StepName と一致 | OK（`StepName` union 拡張が前提、tasks.md 2.1） |
| `resultFilePath` | iteration NNN 形式 | `null` | spec-review / spec-fixer | OK |
| `parseResult` | `parseReviewVerdict` delegate | `NULL_PARSE_RESULT` | spec-review / spec-fixer | OK |
| `completionVerdict` | 不要（verdict は file 経由） | `"approved"` | spec-fixer と同 | OK |
| `capabilities.gitWrite` | 無 | `true` | spec-review:無, build-fixer:true | OK |
| system prompt 命名 | `CODE_REVIEW_SYSTEM_PROMPT` | `CODE_FIXER_SYSTEM_PROMPT` | `SPEC_REVIEW_SYSTEM_PROMPT` 等 | OK |

**結論**: 新 2 Step は既存 4 Step と機械的に対称。Step interface への適合は問題なし。

## 6. リスクポイント

| # | リスク | 軸 | 緩和 |
|---|-------|-----|------|
| R1 | `parseSpecReviewVerdict` を wrapper 化する際、call site (`spec-review.ts:90`) の signature を変えると spec-review.test.ts が落ちる | testability | wrapper を `export function parseSpecReviewVerdict(content) { return parseReviewVerdict(content); }` の 1 行で残す（design.md D5 と整合）。tasks.md 1.4 の regression 0 確認で守る |
| R2 | `STANDARD_TRANSITIONS` から `verification --passed→ end` を **削除** する変更は破壊的。既存 `pipeline.transitions.test.ts` のアサーションが追従しないと失敗する | correctness（mechanical） | tasks.md 7.5 で transition test の expected を書き換える。**implementer 注意**: assertion を削除ではなく `verification --passed→ code-review` に書き換える（test の意図を保つ） |
| R3 | `loopNames` 既定値拡張で既存 Pipeline 利用側（テスト含む）が `loopNames` を明示渡ししている場合、自動では code-review が loop 認識されない | coupling | `src/cli/run.ts` の Pipeline 構築箇所と全 test を grep。`loopNames` 明示渡しが残っていれば併せて更新（tasks.md 8.2 の範囲） |
| R4 | code-fixer が前段 review-feedback を見つけられない場合のエラー処理が design.md に明示されていない | testability / cohesion | build-fixer.ts:64-69 の `BUILD_FIXER_NO_VERIFICATION_RESULT` pattern を踏襲し、`CODE_FIXER_NO_REVIEW_RESULT` を新設することを推奨。tasks.md 6.5 への補足として implementer が判断 |
| R5 | system prompt のトーン不統一（既存: spec-review 英語、build-fixer 日本語、spec-fixer 日英混在） | readability | code-review は spec-review と同じく英語、code-fixer は build-fixer と同じく日本語、で role-by-role の対称を取ることを推奨。**implementer の最終判断**事項 |
| R6 | `Verdict` union に既に `approved/needs-fix/escalation` が含まれるため code-review は型拡張不要。だが `code-fixer.completionVerdict = "approved"` を spec-fixer と同じ default に依存させると将来 `completionVerdict` の default が変わったとき silent break する | coupling | `code-fixer.ts` で `completionVerdict: "approved"` を **明示的に書く**ことを推奨（types.ts:73 の default に頼らない）。spec-fixer も明示推奨だが本 request の scope 外 |

## 7. Notes

- 本分析は mechanical division の参考情報のみ。implementer は採否を自由に決定できる。
- 拡張性 / デプロイ独立性 / セキュリティ境界 / ドメイン境界の観点は本 agent の scope 外。これらは architect / spec-reviewer / security-reviewer の判断領域。
