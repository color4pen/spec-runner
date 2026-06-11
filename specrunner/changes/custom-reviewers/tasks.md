# Tasks: プロジェクト定義のカスタムレビューワー step

実装順は「純粋なデータ/パース層 → step 層 → state snapshot → 配線（pipeline）→ E2E」。
interface が確定する前に widget テストを書かない（scenario 先・code 後）。
各タスクは原則 `typecheck && test` を green に保ったまま進める。

## T-01: reviewer 定義の型とパーサ

- [x] `src/core/reviewers/types.ts` に `ReviewerDefinition` / `ReviewerSnapshot` / `ReviewerValidationError` を定義する（design D1 / D5）。
- [x] `src/core/reviewers/definition.ts` に `parseReviewerDefinition(filename, content): ReviewerDefinition` を実装する。frontmatter（name / maxIterations / model?）と必須セクション（目的 / 観点 / 判定基準）+ 自由欄をパースする純関数。
- [x] fs は呼び出し元注入とし、本モジュールは `node:fs` を直接 import しない（`rules-resolve.ts` と同流儀）。
- [x] `MAX_REVIEWER_ITERATIONS`（初期値 10）を定義する。

**Acceptance Criteria**:
- 有効な md から `ReviewerDefinition` を返す（unit test）。
- 必須セクション欠落・frontmatter 欠落を区別できる構造でパース結果を返す（生のフィールド有無を保持）。
- 本モジュールが `node:fs` を import しない。

## T-02: 定義の列挙ロードと load-time validation

- [x] `src/core/reviewers/load.ts` に `loadReviewerDefinitions(cwd, fs): Promise<ReviewerDefinition[]>` を実装する。`specrunner/reviewers/*.md` を名前昇順で列挙・パースする。ディレクトリ不存在（ENOENT）・空は `[]`。
- [x] `util/paths.ts` に `reviewersDirRel(): string`（`specrunner/reviewers`）を追加する。
- [x] `src/core/reviewers/validate.ts` に `validateReviewerDefinitions(defs): void`（違反収集 → `ReviewerValidationError` throw）を実装する。検査: (1) frontmatter 必須項目欠落、(2) name とファイル名 stem 不一致、(3) maxIterations が整数でない/範囲外、(4) 必須セクション欠落、(5) `isStandardStepName` との衝突、(6) name 重複、(7) name の文字種制約違反（`/^[a-z0-9][a-z0-9\-_]*$/`）。

**Acceptance Criteria**:
- reviewers/ 不存在で `[]`（unit test）。
- 各違反（1〜7）でそれぞれ throw する（受け入れ #3、unit test）。
- `"../etc/passwd"` や `"../../../etc"` のような name が (7) で拒否される（unit test）。
- 複数違反を 1 回の throw にまとめて報告する。

## T-03: CLI 所有フレームの prompt 合成

- [x] `src/prompts/custom-reviewer-system.ts` に `buildCustomReviewerSystemPrompt(def): string` を実装する（design D2）。judge 固定フレーム（judge 宣言・read-only・findings 形式・結果ファイル書き出し義務・security clause）へ必須セクションをスロット注入する。
- [x] severity / blocking 文言は `judge-rules.ts` の `DECISION_NEEDED_DEFINITION` / `VERDICT_BLOCKING_RULES` を再利用し、`buildSystemPrompt(base, [PIPELINE_RULES])` で組成する。

**Acceptance Criteria**:
- 生成 prompt に judge 契約フレーム（findings 形式 / VERDICT_BLOCKING_RULES）が含まれる（unit test）。
- md 本文がフレームの内側スロットにのみ注入され、judge 契約文言を置換しない（unit test：契約文言が常に出力に存在する）。

## T-04: 結果ファイルパスと artifact 無害性

- [x] `util/paths.ts` に `customReviewerResultPath(slug, name, iteration)` = `specrunner/changes/<slug>/<name>-result-NNN.md` を追加する（要件 7）。
- [x] `writeOutputTemplates` / `cleanupOutputTemplates` が未登録の reviewer 名 step に対し throw せず no-op であることを確認し、必要なら no-op を明示する。

**Acceptance Criteria**:
- `customReviewerResultPath("foo","security",2)` → `specrunner/changes/foo/security-result-002.md`（unit test）。
- 未知 step 名で output template 機構が throw しない（unit test）。

## T-05: カスタムレビューワー step ファクトリ

- [x] `src/core/step/custom-reviewer.ts` に `createCustomReviewerStep(snapshot): AgentStep` を実装する（design D3）。
- [x] `reportTool` に **既存 singleton `JUDGE_REPORT_TOOL` をそのまま参照**設定する（executor の `isJudgeStep` identity 判定に乗せる）。
- [x] agent tools = `[agent_toolset, toCustomToolSpec(JUDGE_REPORT_TOOL)]`、`capabilities.gitWrite: true`、`model = snapshot.model ?? DEFAULT_REVIEW_MODEL`、`needsProjectContext: true`、`maxTurns: 20`。
- [x] `resultFilePath` = `customReviewerResultPath`、`reads` = [design.md, tasks.md, test-cases.md, gitState]、`writes` = [result file]、`buildMessage` = request 制約 + diff stat + reviewer 名/目的の注入、`parseResult` = `{ verdict: null, findingsPath: null }`。

**Acceptance Criteria**:
- 生成 step の `reportTool === JUDGE_REPORT_TOOL`（identity、unit test）。
- `resultFilePath` が reviewer 名識別パスを返す（unit test）。
- `buildMessage` 出力に reviewer 名が含まれる（unit test）。

## T-06: JobState への snapshot フィールド追加

- [x] `state/schema.ts` の `JobState` に `reviewers?: ReviewerSnapshot[]`（optional、後方互換）を追加する（design D5）。
- [x] `buildInitialJobState` に `reviewers?` パラメータを追加する。
- [x] `validateJobState` で `reviewers` present 時に配列・要素形状を軽く検証する（absence は OK）。

**Acceptance Criteria**:
- `reviewers` を含む state が round-trip（persist→load）で保持される（unit test）。
- 既存の `buildInitialJobState` / `validateJobState` テストが無変更 green。

## T-07: prepare への load+validate+snapshot 配線

- [x] `PipelineRunCommand.prepare`（`pipeline-run.ts`）で `bootstrapJob` の **前**に `loadReviewerDefinitions(repoRoot, fs)` → `validateReviewerDefinitions` を実行し、`ReviewerDefinition[]` を `ReviewerSnapshot[]` に変換して `bootstrapJob` / `buildInitialJobState` に渡す。
- [x] 検証違反時は prepare が throw し、pipeline が開始されないことを保証する（`CommandRunner.execute` が exit 1）。
- [x] `ResumeCommand.prepare` は reviewers/ を再ロードせず、永続化済み state の snapshot をそのまま使う（変更不要なことを確認 / 必要なら明示）。

**Acceptance Criteria**:
- 不正定義で `run` が pipeline 開始前に停止する（受け入れ #3、test）。
- 有効定義で snapshot が初期 state に載る（test）。
- resume が reviewers/ を読まない（snapshot 参照、受け入れ resume、test）。

## T-08: reviewer-chain 純関数

- [x] `src/core/pipeline/reviewer-chain.ts` に純関数を実装する（design D7）:
  - `deriveImplReviewerChain(state | snapshots): string[]`（`["code-review", ...names]`）
  - `resolveActiveReviewer(state, chain): string`（最新実行 reviewer）
  - `nextAfterReviewer(reviewer, chain): string`（次 reviewer or conformance）
  - `buildReviewerChainTransitions(chain): Transition[]`

**Acceptance Criteria**:
- chain=`["code-review"]` で `nextAfterReviewer` が conformance を返す（unit test）。
- `resolveActiveReviewer` が複数 reviewer の最新実行を正しく選ぶ（unit test）。

## T-09: STANDARD_TRANSITIONS の generator 置換（リテラル除去 + parity）

- [x] `STANDARD_TRANSITIONS`（`pipeline/types.ts`）の impl phase reviewer/fixer 行（`s.steps["code-review"]` リテラルを含む 4 行）を `buildReviewerChainTransitions(["code-review"])` の出力へ置換する（要件 3）。
- [x] code-review/code-fixer のルーティング判定を `resolveActiveReviewer` ベースに統一し、`"code-review"` リテラル参照を除去する。

**Acceptance Criteria**:
- `STANDARD_TRANSITIONS` に `s.steps["code-review"]` リテラルが残らない（grep / test）。
- 既存 pipeline テスト（run.test / pipeline-integration / multi-layer-defense 等）が無変更で green（受け入れ #2）。

## T-10: descriptor 合成

- [x] `src/core/pipeline/compose-reviewers.ts` に `composeReviewerDescriptor(base, snapshots): PipelineDescriptor` を実装する（design D6）。空 snapshot は base を参照同一で返す。
- [x] 非空時に steps（code-review 後・conformance 前に挿入）/ roles / loopNames / loopFixerPairs（reviewer → code-fixer の多対一）/ transitions（`buildReviewerChainTransitions(chain)`）を派生する。
- [x] `buildPipelineForJob` / `runPipeline`（`run.ts`）を `composeReviewerDescriptor(getPipelineDescriptor(...), state.reviewers ?? [])` 経由に変更する。`createStandardPipeline` は base のまま。

**Acceptance Criteria**:
- 空 snapshot で base と参照同一を返す（受け入れ #2、unit test）。
- 2 reviewer で steps/roles/loopNames/loopFixerPairs/transitions が宣言順で正しく構成される（unit test）。

## T-11: Pipeline の per-step maxIterations

- [x] `Pipeline` に `maxIterationsByStep?: Record<string, number>` と `resolveMaxIterations(stepName)` を追加する（design D9）。`tryExhaust` / bypass / `handleExhausted` を per-step 解決に変更する。
- [x] `buildPipeline`（`run.ts`）が descriptor 由来の `maxIterationsByStep` を Pipeline へ渡す。`composeReviewerDescriptor` が `{ [name]: snapshot.maxIterations }` を供給する。

**Acceptance Criteria**:
- override 無しの組み込み step は既存スカラ maxIterations にフォールバックし挙動不変（既存テスト green）。
- reviewer の maxIterations が exhaustion 判定に反映される（unit test）。

## T-12: pipeline.ts の fixer→review 逆引き一般化（多対一）

- [x] `pipeline.ts` の fixer exhaustion 逆引き（`Object.entries(loopFixerPairs).find(...)`）を `resolvePairedReviewForFixer(state, fixerName, loopFixerPairs)` に置換し、多対応時は `resolveActiveReviewer` で active reviewer を返す（design D8）。
- [x] `handleExhausted` の `resumeStep` / exhaustion attribution を active reviewer に紐づける。
- [x] 「fresh convergence episode reset」が chain 遷移（R_i → R_{i+1}）でも各 reviewer の fixer 予算をフレッシュ開始する不変条件を確認する。

**Acceptance Criteria**:
- 複数 reviewer が code-fixer を共用しても exhaustion 予算が reviewer ごとに独立して数えられる（受け入れ #6、test）。
- exhaust した reviewer に exhaustion / resume step が正しく帰着する（test）。

## T-13: code-fixer の active reviewer 一般化と findings 出所識別

- [x] `util/paths.ts`（または `reviewer-chain.ts`）に `resolveReviewerResultPath(slug, stepName, iteration): string` を追加する。`stepName === "code-review"` は `reviewFeedbackPath(slug, iteration)`、それ以外（カスタムレビューワー）は `customReviewerResultPath(slug, stepName, iteration)` を返す統一リゾルバー（design D11）。
- [x] `code-fixer.ts` の `reads()` / `buildMessage()` / `getLatestJudgeFindings` 呼び出しの `STEP_NAMES.CODE_REVIEW` リテラルを `resolveActiveReviewer(state, deriveImplReviewerChain(state))` へ一般化する（design D11）。reviewer 無しは code-review。`reads()` の結果ファイルパスは `resolveReviewerResultPath` を経由する。
- [x] `fixer-helpers.ts` の `buildFindingsBlock` / `buildContinuationMessage` に reviewer 名ラベルを追加し、`source` を reviewer 名へ拡張する（要件 7 / 受け入れ #8）。

**Acceptance Criteria**:
- `resolveReviewerResultPath("slug","code-review",1)` → `reviewFeedbackPath`、`resolveReviewerResultPath("slug","security",1)` → `customReviewerResultPath`（unit test）。
- code-fixer が active reviewer の最新結果ファイル・findings を読む（test）。
- code-fixer prompt の findings ブロックに reviewer 名が含まれる（受け入れ #8、test）。
- zero reviewer 時は従来どおり code-review 由来 findings を読む（既存テスト green）。

## T-14: E2E mock pipeline テスト

- [x] mock pipeline（`tests/helpers/pipeline-mock-client.ts` ベース）で以下を固定する:
  - reviewers/ に 1 件定義 → code-review の後にその judge が実行され、findings 契約（CLI 導出 / 実在検証 / fixer ループ / escalation）が組み込み judge と同一に機能する（受け入れ #1, #8）。
  - 複数 reviewer が宣言順に直列実行される（受け入れ #4）。
  - code-fixer が needs-fix を出した reviewer に戻る（受け入れ #5）。
  - 共用 fixer の iteration 予算が reviewer ごとに独立（受け入れ #6）。
  - resume 後も snapshot 定義が使われ、定義ファイル変更が実行中 job に影響しない（受け入れ resume）。

**Acceptance Criteria**:
- 上記すべてのシナリオが green。
- reviewers/ 空・不存在で既存テストが無変更 green（受け入れ #2）。

## T-15: 仕上げ（typecheck / test / managed リスク明記）

- [x] `bun run typecheck && bun run test` が green。
- [x] managed runtime の動的 agent 登録ギャップを design Open Questions のとおりコメント / 既知制約として残す（本変更は local + mock 対象）。
- [x] 必要に応じ `specrunner/project.md` / README にカスタムレビューワーの宣言形式を追記する（実装者判断、change folder 外編集を伴う場合のみ実装段階で実施）。

**Acceptance Criteria**:
- `typecheck && test` が green（受け入れ最終）。
- managed の既知制約が文書化されている。
