# Design: プロジェクト定義のカスタムレビューワー step

## Context

レビュー観点のカスタマイズ手段は現在 `specrunner/rules/<step>/`（既存 step への観点追加 — `resolveStepRules` → `executor.ts:188`）のみで、独立した収束ループ・別 prompt・別 maxIterations を持つレビューレンズ（セキュリティ監査・API 後方互換・ドメイン固有検査など）をプロジェクト側から追加する経路がない。main の code-review prompt に観点を足し続けると prompt が肥大し、両方の精度が落ちる。

一方で judge step の契約は CLI 側に標準化されている:

- findings 契約と verdict 導出は純関数 `judge-verdict.ts`（`deriveJudgeVerdict` / `collectFixableFindings` / `collectVerdictAffectingFindings`）と `JUDGE_REPORT_TOOL`（`report-tool.ts`）に集約。
- findings の実在検証は `RuntimeStrategy.verifyFindingRefs`（`runtime/local.ts:612` / `runtime/managed.ts:328`）の seam として local / managed 両対応。呼び出しは `executor.ts:504-515`、発火条件は `isJudgeStep`（`stepReportTool === JUDGE_REPORT_TOOL || === CODE_REVIEW_REPORT_TOOL` の **identity 判定**）。
- pipeline 合成は `PipelineDescriptor`（`STANDARD_DESCRIPTOR` — `registry.ts:30`）に集約。`steps` / `transitions` / `loopNames` / `loopFixerPairs` / `roles` がデータ。descriptor は job ごとに `getPipelineDescriptor(getPipelineId(jobState))` で解決され、`buildPipelineForJob`（`run.ts:83`）が `Pipeline` を組む。
- step ごとの system prompt は CLI が所有（`prompts/code-review-system.ts`）し、request 制約・diff stat は CLI が初期メッセージに注入（`code-review.ts` `buildCodeReviewInitialMessage`）。

このため、カスタムレビューワーはコードの拡張点（plugin API）ではなく、**データ（markdown 宣言）+ 設定**として表現できる。reviewer の差分は「prompt 素材」と「maxIterations / model」だけであり、judge 契約はすべて CLI 側で固定される。

### 現状コードが持つ「code-review リテラル」依存

要件 3（配線の一般化）の対象となる既存の硬直点:

- `STANDARD_TRANSITIONS`（`pipeline/types.ts:152-177`）: code-fixer の戻り先と code-review の findings-derived routing は `when` ガードに `s.steps?.["code-review"]` がリテラルで埋め込まれている。
- `pipeline.ts:357-358`: fixer → review の逆引きは `loopFixerPairs` entries の `.find()` で **最初の対**を返す。複数 review step が同一 fixer を共有することを想定していない。
- `code-fixer.ts`: `reads()` / `buildMessage()` / `getLatestJudgeFindings()` が `STEP_NAMES.CODE_REVIEW` をリテラル参照。

### 制約

- judge 契約（findings 形式・verdict 導出・実在検証・escalation）はユーザー md から上書き不可とする（architect 評価済み）。
- 既定構成（reviewer ゼロ個）の挙動・出力・テストは完全一致を維持する（architect 評価済み、opt-in）。
- fixer は code-fixer を共用する（専用 fixer は収束ループの組み合わせ爆発を招くため）。

## Goals / Non-Goals

**Goals**:

- `specrunner/reviewers/<name>.md` の宣言形式（frontmatter + 必須セクション + 自由欄）を定義し、リポジトリにコミットされる成果物にする。
- reviewer の system prompt を CLI 所有の固定フレームへのスロット注入で組み立てる（judge 契約を md から上書きできない構造）。
- カスタムレビューワーを code-review の後に宣言順で直列実行する。verdict は既存 judge 契約をそのまま使う。
- needs-fix は共用 code-fixer の既存ループで収束させる。code-fixer の戻り先と routing の `when` ガードを「どの reviewer から来たか」を state から導出する形へ一般化し、`"code-review"` リテラル参照を除去する。
- job start 時に reviewers/ 全定義を load-time validation する。違反時は pipeline を開始せず停止する。
- 定義を job start 時に job state へ snapshot し、job 中（resume 含む）は snapshot を参照する。
- reviewers/ が空・不存在のとき pipeline の構成・挙動・出力を現行と完全一致させる。
- findings・結果ファイル・state 記録・code-fixer prompt 埋め込みを reviewer 名で識別可能にする。
- 組み込み judge と同一の防御（実在検証・存在しない参照の escalation・`ok: false` escalation）をカスタムレビューワーにも適用し、テストで固定する。

**Non-Goals**（request スコープ外）:

- creator 側（implementer / design）のカスタム step。
- カスタム fixer（fixer は code-fixer を共用）。
- reviewer 間の並列実行・順序の依存宣言。
- 起動条件ゲート（paths / requestTypes による宣言的 skip）。
- レビュー収束後の退行ゲート（累積 findings の再照合）。
- `reviewers new` scaffold コマンド。
- spec フェーズ（spec-review 前後）への挿入。
- マーケットプレイス的な reviewer 配布機構。

## Decisions

### D1: 宣言形式とパーサ（`specrunner/reviewers/<name>.md`）

- 配置: `specrunner/reviewers/<name>.md`。`<name>` がファイル名 stem（reviewer 名）。
- frontmatter: `name`（必須・ファイル名 stem と一致）/ `maxIterations`（必須・整数）/ `model`（任意）。
- 本文の必須セクション: `## 目的` / `## 観点` / `## 判定基準`。これ以降の自由記述（補足知識・例示・例外）は任意。request.md（必須構造 + 自由記述）と同型のハイブリッド。
- 新規モジュール `src/core/reviewers/definition.ts`: frontmatter + セクションを純粋にパースして `ReviewerDefinition` を返す。fs は注入（`rules-resolve.ts` と同流儀 — core → node:fs 直依存を避ける）。

```
ReviewerDefinition = {
  name: string;
  maxIterations: number;
  model?: string;
  sections: { purpose: string; perspective: string; criteria: string };
  freeform: string;   // 必須セクション以降の自由欄（空文字可）
}
```

**Rationale**: rules/ と同じ「リポジトリにコミットされた宣言を load-time validation で守る」モデルに揃える。judge 契約は CLI 側に標準化済みなので、コード拡張面を開かずデータだけで reviewer を足せる。
**Alternatives considered**: plugin API（コードで reviewer を登録）→ judge 契約が既に標準化されており拡張面を開く必要がない。frontmatter に prompt 全文を持たせる案 → judge 契約上書き経路が開くため却下（D2）。

### D2: prompt 合成 — CLI 所有フレーム + スロット注入

- 新規 `src/prompts/custom-reviewer-system.ts`: `buildCustomReviewerSystemPrompt(def)` が CLI 所有の固定フレーム（judge であること・read-only・findings 形式・severity 定義・結果ファイル書き出し義務・security clause）を**外枠**として組み、md の必須セクション内容を `## 目的 / ## 観点 / ## 判定基準 / ## 補足` の**スロットへ注入**する。
- severity / blocking ルールは `judge-rules.ts` の `DECISION_NEEDED_DEFINITION` / `VERDICT_BLOCKING_RULES` を再利用し、組み込み code-review と同一文言にする。`buildSystemPrompt(base, [PIPELINE_RULES])` で組成。
- ユーザー md は外枠の内側のスロットにしか入らないため、judge 契約部分（verdict 導出・findings 形式）を構造的に上書きできない。

**Rationale**: prompt 全文をユーザーに所有させず、判定の骨格を CLI に固定する。judge 契約を md 側から上書きする経路を排除する（architect 評価済み）。
**Alternatives considered**: md 全文を system prompt にする → 契約上書き経路が開く。テンプレート文字列の単純連結（フレーム後置）→ 後置でも上書きはされないが、スロット注入の方が「どこがユーザー領域か」を構造的に明示でき validation と対応づけやすい。

### D3: カスタムレビューワーを judge 型 AgentStep として動的生成

- 新規 `src/core/step/custom-reviewer.ts`: `createCustomReviewerStep(snapshot): AgentStep`。
  - `name = snapshot.name`、`agent = { name: \`specrunner-reviewer-${name}\`, role: name, model: snapshot.model ?? DEFAULT_REVIEW_MODEL, system: buildCustomReviewerSystemPrompt(snapshot), tools: [agent_toolset, toCustomToolSpec(JUDGE_REPORT_TOOL)], capabilities: { gitWrite: true } }`。
  - **`reportTool = JUDGE_REPORT_TOOL`（既存の singleton インスタンスをそのまま参照）** — これが最重要 seam。`executor.ts` の `isJudgeStep` は reportTool の **identity** で判定するため、`JUDGE_REPORT_TOOL` を再利用するだけで findings 由来 verdict 導出・`verifyFindingRefs`・no-tool-call → escalation がカスタムレビューワーにも**executor 無改修で**適用される（要件 8 / 受け入れ #1, #8）。
  - `needsProjectContext: true`、`maxTurns: 20`、`completionVerdict` 未設定（judge は findings から導出）。
  - `resultFilePath` = `customReviewerResultPath(slug, name, iteration)`（D10、名前識別ファイル）。
  - `reads` = `[design.md, tasks.md, test-cases.md, gitState]`、`writes` = `[result file]`。
  - `buildMessage` = code-review 同型（`buildRequestConstraintsBlock` で request 制約注入 + `dynamicContext.diffStat`）に reviewer 名と目的を明示。
  - `parseResult` = `{ verdict: null, findingsPath: null }`（verdict は typed toolResult から導出、prose parse path は未使用）。

**Rationale**: `JUDGE_REPORT_TOOL` の identity を再利用することで、executor の verdict 導出・実在検証・escalation 分岐を一切変更せずカスタムレビューワーへ波及させられる。組み込み judge と「同一の枠」で動く（request 前提）。
**Alternatives considered**: 専用 `CUSTOM_REVIEWER_REPORT_TOOL` を新設し `isJudgeStep` を拡張 → executor の判定面を増やすだけで利得がなく却下。

**Note — stdout `[iter N/M]` 表示**: カスタムレビューワー実行中の `[iter N/M]` カウンタは `spec-review` ループを示す固定値であり、カスタムレビューワーごとの独立カウンタを持たない（仕様）。実行ログの `[iter N/M]` がカスタムレビューワー実行中に更新されないのは意図的な設計判断であり、将来のカスタムレビューワー専用進捗表示は Non-Goals のスコープ外とする。

### D4: load-time validation を job start 前に実行

- 新規 `src/core/reviewers/load.ts`: `loadReviewerDefinitions(cwd, fs)` が `specrunner/reviewers/*.md` を列挙（名前昇順）・パースし `ReviewerDefinition[]` を返す。ディレクトリ不存在（ENOENT）・空は `[]`。
- 新規 `src/core/reviewers/validate.ts`: `validateReviewerDefinitions(defs)` が全違反を収集して `ReviewerValidationError` を throw する。検査項目:
  1. frontmatter 必須項目欠落（name / maxIterations）。
  2. name とファイル名 stem の不一致。
  3. maxIterations が整数でない / 範囲外（許容 `1..MAX_REVIEWER_ITERATIONS`、初期値 10）。
  4. 必須セクション（目的 / 観点 / 判定基準）の欠落。
  5. name が組み込み step 名と衝突（`isStandardStepName`）。
  6. reviewer 名の重複。
  7. name の文字種制約違反（`/^[a-z0-9][a-z0-9\-_]*$/` を満たさない）。name はパスコンポーネントに無加工で埋め込まれる（`customReviewerResultPath`）ため、パストラバーサルを防ぐ文字種制約を validation で強制する。
- 呼び出し位置: `PipelineRunCommand.prepare()`（`pipeline-run.ts`）の `bootstrapJob()` **前**。`cwd = repoRoot` で reviewers/（コミット済み）を読む。違反時は prepare が throw → `CommandRunner.execute` が exit 1 を返し pipeline は開始されない（受け入れ #3）。

**Rationale**: rules/ と同じく「宣言を load-time validation で守る」。pipeline 開始前に止めることで、不正定義が pipeline 形状を壊す事故を構造的に消す。
**Alternatives considered**: pipeline 内の最初の step で検証 → 既に worktree / branch を作った後の失敗になり、停止コストが高い。preflight に置く案も可だが、reviewer 検証は run/resume 双方の prepare に閉じる方が責務が明確。

### D5: 定義を job state に snapshot、resume は snapshot 参照

- `JobState` に `reviewers?: ReviewerSnapshot[]` を追加（optional、後方互換）。snapshot は step を**決定的に再構築できる**内容を持つ:

```
ReviewerSnapshot = {
  name: string;
  maxIterations: number;
  model?: string;
  promptMaterial: { purpose: string; perspective: string; criteria: string; freeform: string };
}
```

- `buildInitialJobState` に `reviewers?` パラメータを追加し、`PipelineRunCommand.prepare` が load + validate 済みの snapshot を渡す。
- `validateJobState` は `reviewers` が present のとき配列・要素形状を軽く検証（absence は OK、後方互換）。
- prompt 素材（必須セクション + 自由欄）を snapshot に保持することで、**resume を含む job ライフサイクル中にディスクの定義ファイルが変わっても pipeline 形状・prompt が一切変わらない**（要件 5 / 受け入れ resume）。`ResumeCommand` は永続化済み state を読むだけで、reviewers/ を再ロードしない。

**Rationale**: 定義を job start 時に固定することで、実行中の定義変更が pipeline 形状に影響する事故を構造的に消す（architect 評価済み）。snapshot に prompt 素材まで含めるのは「state だけで再現可能」を満たすため。
**Alternatives considered**: snapshot にパスだけ持たせ resume 時に再ロード → 実行中の編集が反映されてしまい要件 5 違反。

### D6: snapshot からの descriptor 合成

- 新規 `src/core/pipeline/compose-reviewers.ts`: `composeReviewerDescriptor(base, snapshots): PipelineDescriptor`。
  - `snapshots` 空 → `base` をそのまま返す（参照同一）。**reviewers ゼロ個 = base 不変 = 現行完全一致**（要件 6 / 受け入れ #2）。
  - 非空 → 以下を base から派生:
    - `steps`: code-review の直後・conformance の直前へ reviewer step（`createCustomReviewerStep`）を宣言順に挿入。
    - `roles`: 各 reviewer = `{ role: "custom-reviewer", phase: "impl" }`。`pipeline/types.ts:53` のインバリアント「each phase has exactly one creator and exactly one reviewer」は `role: "reviewer"` を持つ step が 1 つのみであることを前提とするため、カスタムレビューワーは専用ロール値 `"custom-reviewer"` を使用して既存インバリアントを維持する。下流の resume 解決・step-role 解決コードは `"reviewer" | "custom-reviewer"` を impl phase の judge として認識するよう拡張する（T-10 に含む）。
    - `loopNames`: 各 reviewer を追加。
    - `loopFixerPairs`: 各 reviewer → `code-fixer`（多対一）。
    - `transitions`: impl phase の reviewer / fixer 行を `buildReviewerChainTransitions(["code-review", ...names])` で再生成（D7）。
- `buildPipelineForJob` / `runPipeline` を `composeReviewerDescriptor(getPipelineDescriptor(...), state.reviewers ?? [])` 経由に変更。job state を持たない `createStandardPipeline`（後方互換ラッパ）は base のまま。

**Rationale**: descriptor がデータなので、合成も純粋なデータ変換に閉じる。空 snapshot で base 同一を返すことで zero-config 完全一致をコードで保証する。
**Alternatives considered**: reviewer ごとに新 pipelineId を登録 → registry が動的になり過剰。job 単位の合成で十分。

### D7: chain routing の一般化（`"code-review"` リテラル除去）

- 新規 `src/core/pipeline/reviewer-chain.ts`（純関数）:
  - `deriveImplReviewerChain(state | snapshots)`: `["code-review", ...reviewerNames]`。
  - `resolveActiveReviewer(state, chain)`: chain の中で**最後に実行された reviewer**（`steps[name]` の最新 StepRun の startedAt が最大）を返す = 「いま収束対象の reviewer」。startedAt が同値の場合は chain 上の後位（index が大きい）reviewer を優先する（モック時刻を使うテスト環境で同一タイムスタンプが発生した場合の決定性を保証）。
  - `nextAfterReviewer(reviewer, chain)`: chain 上の次 reviewer、最後尾なら `conformance`。
  - `buildReviewerChainTransitions(chain)`: chain から impl phase の遷移行を生成。各 reviewer R について:
    - `R needs-fix → code-fixer`
    - `R approved` かつ `collectFixableFindings(R 最新 findings) > 0` → `code-fixer`（observation fix）
    - `R approved`（fixable なし）→ `nextAfterReviewer(R)`
    - code-fixer 行（reviewer ごとに `when` で active reviewer を判定し生成）:
      - `code-fixer approved` かつ `resolveActiveReviewer == R && lastVerdict(R) == approved` → `nextAfterReviewer(R)`
      - `code-fixer approved` かつ `resolveActiveReviewer == R`（fallback = needs-fix 由来）→ `R`
    - `code-fixer error → escalate`
- **`STANDARD_TRANSITIONS` の impl reviewer / fixer 行（現状の `s.steps["code-review"]` リテラル 4 行）を `buildReviewerChainTransitions(["code-review"])` の出力に置換**する。これにより base 自体からリテラル参照が消え（要件 3）、かつ chain=`["code-review"]` の生成結果が現行 4 行と**挙動完全一致**することを parity テストで固定する（受け入れ #2）。
- reviewer 非空時は `composeReviewerDescriptor` が同じ generator を長い chain で呼ぶだけ。code-review も custom reviewer も同一ロジックを通る。

**Rationale**: 「どの reviewer から来たか」を `when` ガード内のリテラルではなく state（最新実行 reviewer）から導出することで、N reviewer を 1 つの generator に閉じる。base を generator 出力に置換することで「リテラル除去」と「zero-config 一致」を両立させる。
**Alternatives considered**: `Transition.to` を関数化 → 遷移表の `to: string` 不変条件を壊し table 駆動の利点を失う。code-review 専用 + reviewer 専用の二系統 → リテラル除去要件を満たせない。

### D8: pipeline.ts の fixer → review 逆引き一般化（多対一）

- `pipeline.ts:355-360`（fixer exhaustion 前の逆引き）の `Object.entries(loopFixerPairs).find(...)` は同一 fixer に複数 review が対応すると常に先頭（= code-review）を返す。これを `resolvePairedReviewForFixer(state, fixerName, loopFixerPairs)` に置換し、複数対応時は `resolveActiveReviewer(state, chain)` で**いま収束中の reviewer** を返す（単一対応時は従来通りそのエントリ）。
- `handleExhausted` の `resumeStep`（`pipeline.ts:512`）と exhaustion attribution（error code / report iteration）も、active reviewer を使って正しい reviewer に紐づける。
- `loopIters` は step 名キーで既に reviewer ごと独立。`fixerIters` は fixer 名（code-fixer）キーで共有だが、「fresh convergence episode reset」（`pipeline.ts:318-324`）が非 fixer step から reviewer へ入るたびに `fixerIters[code-fixer]=0` にするため、各 reviewer の収束エピソードは fixer 予算をフレッシュに開始する。この不変条件が chain 遷移（R_i → R_{i+1} の前進入場でも reset 発火）でも成立することをテストで固定する（受け入れ #6）。

**Rationale**: 逆引きを state 由来にすることで、共用 fixer の exhaustion・resume・予算カウントを「いま収束中の reviewer」に正しく帰着させる（fixer → review 逆引きの多対一対応）。
**Alternatives considered**: reviewer ごとに専用 fixer → スコープ外かつ組み合わせ爆発。`loopFixerPairs` を `Record<string, string[]>` に拡張 → 逆引きの曖昧性は解消せず、結局 state 由来の解決が必要。

### D9: per-reviewer maxIterations

- `Pipeline` に `maxIterationsByStep?: Record<string, number>` を追加し、`resolveMaxIterations(stepName) = maxIterationsByStep[stepName] ?? this.maxIterations` を導入。`tryExhaust` の比較・bypass 判定・`handleExhausted` のメッセージは当該 loop / 当該 reviewer の max を解決して使う。共用 fixer の exhaustion 判定では「active reviewer の max」を使う（D8 の逆引きで解決）。
- `composeReviewerDescriptor` が `maxIterationsByStep = { [name]: snapshot.maxIterations }` を供給。`buildPipeline`（`run.ts`）が descriptor → Pipeline へ受け渡す。組み込み step は override なし → 既存スカラ `maxIterations` に fallback（挙動不変）。

**Rationale**: frontmatter の maxIterations 宣言を反映しつつ、組み込み step の予算は不変に保つ。
**Alternatives considered**: 全 reviewer 一律で global maxIterations → frontmatter 宣言が無効化され要件 1 と矛盾。

### D10: 結果ファイル・テンプレート・artifact

- `util/paths.ts`: `reviewersDirRel()` = `specrunner/reviewers`、`customReviewerResultPath(slug, name, iteration)` = `specrunner/changes/<slug>/<name>-result-NNN.md`（名前識別、3 桁ゼロ埋め — 要件 7）。
- output template: `prepareStepArtifacts` / `writeOutputTemplates` は step 名キーで template を引く。カスタム reviewer 名は未登録なので no-op になることを確認（throw しない）。agent は prompt の指示に従い結果ファイルを新規に書く。`cleanupOutputTemplates` も未知 step で no-op を確認。
- `LOOP_ERROR_CODES`（`types.ts:91`）に reviewer 名は無いが、`handleExhausted` は未知 loop 名に対し generic な `<NAME>_RETRIES_EXHAUSTED` を生成する fallback を既に持つ（`pipeline.ts:504-508`）。追加不要。

**Rationale**: 名前識別ファイルで findings / 結果 / state を reviewer ごとに区別する（要件 7）。既存の artifact / exhaustion fallback 機構をそのまま使う。

### D11: code-fixer の一般化（findings の出所識別）

- `code-fixer.ts` の `reads()` / `buildMessage()` / findings 取得（`getLatestJudgeFindings`）の `STEP_NAMES.CODE_REVIEW` リテラルを **active reviewer** へ一般化:
  - `activeReviewer = resolveActiveReviewer(state, deriveImplReviewerChain(state))`（reviewer 無し → code-review）。
  - `reads` = `resolveReviewerResultPath(slug, activeReviewer, iteration)` で解決した最新結果ファイル。`findings = getLatestJudgeFindings(state, activeReviewer)`。
- 新規ヘルパー `resolveReviewerResultPath(slug, stepName, iteration): string`（`util/paths.ts` または `reviewer-chain.ts` に追加）: `stepName` が組み込み `"code-review"` の場合は `reviewFeedbackPath(slug, iteration)`、カスタムレビューワー（`isStandardStepName` が false）の場合は `customReviewerResultPath(slug, stepName, iteration)` を返す統一リゾルバー。`reads()` の返却値は必ずこの関数を経由させ、executor の `STEP_INPUT_MISSING` 検証が正しいパスを参照できるようにする（T-13 参照）。
- `fixer-helpers.ts` の `buildFindingsBlock` / `buildContinuationMessage` に **reviewer 名ラベル**を加え、code-fixer prompt 内でどの reviewer の指摘かを区別可能にする（要件 7 / 受け入れ #8）。`source`（build-fixer は "verification"）を reviewer 名に拡張。

**Rationale**: 共用 fixer でも findings の出所を reviewer 名で識別することで、専用 fixer なしに要件 7 を満たす（architect 評価済み）。

## Risks / Trade-offs

- [Risk] `pipeline.ts` の exhaustion / reset ロジックは最も繊細な配線部で、多対一 fixer・per-step max の導入で regression を生みやすい
  → Mitigation: chain=`["code-review"]` 単一 reviewer での parity テストを必須化し、既存 pipeline テストの無変更 green（受け入れ #2）を gate にする。多 reviewer の予算独立（#6）は専用テストで固定。
- [Risk] `JUDGE_REPORT_TOOL` の identity 依存に結合する（executor の `isJudgeStep`）
  → Mitigation: 既存 code-review も同じ identity 依存であり、カスタムレビューワーは singleton をそのまま参照する。identity が崩れると test が即落ちる。
- [Risk] managed runtime は agent を事前登録する（`AgentRegistry.fromSteps`）ため、動的なカスタムレビューワー agent の登録経路が必要
  → Mitigation: verifyFindingRefs 等の防御は runtime-neutral に実装する。managed の動的 agent 登録は Open Questions に切り出し、本変更は local + mock で受け入れ基準を満たす。
- [Risk] code-fixer の session 継続（`FIXER_STEP_NAMES`）が reviewer をまたいで前回コンテキストを引き継ぐ
  → Mitigation: findings の出所識別（D11）で「今どの reviewer の指摘か」を prompt に明示する。専用 fixer はスコープ外。
- [Risk] snapshot に prompt 素材を持たせることで state.json が肥大する
  → Mitigation: 素材は必須セクション + 自由欄のテキストのみ。reviewer は既定ゼロ・opt-in で、持つ場合のみ増える。

## Open Questions

- managed runtime で動的カスタムレビューワー agent をどう登録するか（`managed setup` 時に reviewers/ を読んで AgentRegistry に追加するか、別 issue にするか）。本変更では local + mock を対象とし、managed 登録は後続に切り出す候補。
- `MAX_REVIEWER_ITERATIONS` の上限値（初期値 10）を config 化するか固定にするか。初期は固定とし、必要になれば config 解決チェーンに載せる。
- `model` frontmatter と step-config 解決チェーン（`config.steps[name].model` 等）の優先順位。初期は frontmatter を hardcode default（chain level 5）相当とし、config 上書きを許す方向。
