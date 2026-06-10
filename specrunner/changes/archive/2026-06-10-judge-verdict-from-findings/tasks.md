# Tasks: judge 系 step の verdict を構造化 findings から CLI が導出する

## T-01: `Finding` 型を kernel に定義し state schema を widen する

- [x] `src/kernel/report-result.ts` に `FindingSeverity`（critical/high/medium/low）、
  `FindingResolution`（fixable/decision-needed）、`Finding` interface（severity / resolution /
  file / line? / title / rationale）を追加・export する（D1）
- [x] `src/state/schema.ts` で `Finding` を kernel から import し、`StepOutcome.toolResult` を
  `(BaseReportResult & { findings?: Finding[] }) | null` に widen する
- [x] `src/state/helpers.ts` の `StepResultInput.toolResult` も同型に widen する（`pushStepResult`
  が findings を欠落なく書き込めること）

**Acceptance Criteria**:
- `Finding` が kernel に定義され、state 層から DSM 違反なく参照できる
- `bun run typecheck` が green
- `StepOutcome.toolResult` に findings を含むオブジェクトを代入しても型エラーが出ない

## T-02: `report_result` スキーマに findings 配列を追加する

- [x] `src/core/step/report-tool.ts` の import に `array` を追加（zod/v4-mini）
- [x] `findings` の zod スキーマ（`array(object({ severity, resolution, file, line?, title,
  rationale }))`）を定義し、`JUDGE_REPORT_TOOL` / `CODE_REVIEW_REPORT_TOOL` /
  `REQUEST_REVIEW_REPORT_TOOL` の zodSchema に `findings: optional(findingSchema)` を追加する（D2）
- [x] 各 tool の description に findings 提出指示を追記する
- [x] `approved` / `fixableCount` / `verdict` フィールドは削除しない（互換のため残す）

**Acceptance Criteria**:
- `toCustomToolSpec(JUDGE_REPORT_TOOL)` が findings を含む有効な JSON Schema を生成する
  （`toJSONSchema` が例外を投げない）
- `bun run typecheck` が green

## T-03: findings の構造検証を parseInput に追加する（純粋関数）

- [x] `src/core/port/report-result.ts` に共有 helper `parseFindings(raw): { ok: true; value:
  Finding[] } | { ok: false }` を追加する。各要素の severity ∈ 4 値、resolution ∈ 2 値、file
  string、title string、rationale string、line は number または欠落、を typeof で検証する（zod
  parse は使わない＝B-5 純粋性維持）
- [x] `JudgeReportResult` / `CodeReviewReportResult` / `RequestReviewReportResult` に
  `findings?: Finding[]` を追加する（`Finding` は kernel から import）
- [x] `parseJudgeReportInput` / `parseCodeReviewReportInput` / `parseRequestReviewReportInput` を
  拡張する。`value.ok === true` の場合に findings が欠落または不正構造なら
  `missingFields: ["findings"]` を返す。`value.ok === false` の場合は findings を必須としない。
  正常時は `result.findings` に検証済み配列をセットする（D3）

**Acceptance Criteria**:
- `parseJudgeReportInput({ ok: true, findings: [valid] })` が `ok: true` で findings をセットする
- `parseJudgeReportInput({ ok: true })`（findings 欠落）が `ok: false, missingFields: ["findings"]`
- `parseJudgeReportInput({ ok: true, findings: [{ severity: "bogus", ... }] })` が
  `ok: false, missingFields: ["findings"]`
- `parseJudgeReportInput({ ok: false, reason: "..." })` が `ok: true`（findings 不要）
- parseInput がファイル I/O を一切行わない（純粋関数）
- `bun run typecheck` が green

## T-04: verdict 導出の純粋関数モジュールを実装する

- [x] `src/core/step/judge-verdict.ts` を新規作成し、`deriveJudgeVerdict(findings, ok)`、
  `deriveRequestReviewVerdict(findings, ok)`、`collectVerdictAffectingFindings(findings)` を
  実装する（D4 の導出表に従う）
- [x] `deriveJudgeVerdict`: ok=false→escalation / decision-needed≥1→escalation /
  critical|high≥1→needs-fix / else→approved（この優先順位）
- [x] `deriveRequestReviewVerdict`: ok=false→needs-discussion / blocking≥1→needs-discussion /
  else→approve
- [x] `collectVerdictAffectingFindings`: severity critical|high または resolution decision-needed の
  finding を返す

**Acceptance Criteria**:
- 各関数が純粋関数（副作用なし）として実装される
- `bun run typecheck` が green

## T-05: 実在検証 seam `verifyFindingRefs` を RuntimeStrategy に追加する

- [x] `src/core/port/runtime-strategy.ts` に `FindingRef { file: string; line?: number }` DTO と
  `verifyFindingRefs(refs: FindingRef[], cwd: string, branch: string | null): Promise<FindingRef[]>`
  メソッドを追加する（不実在 refs を返す契約、空入力→空出力）（D6）
- [x] `src/core/runtime/local.ts` に実装を追加: `path.join(cwd, file)` の fs 存在確認、line が
  あればファイル行数 >= line を確認。不実在を集めて返す
- [x] `src/core/runtime/managed.ts` に実装を追加: `this.githubClient.getRawFile(this.repo.owner,
  this.repo.name, branch, file)` の null 判定、line があれば取得内容の行数 >= line を確認。null /
  行数不足を不実在として返す（branch が null の場合は全 refs を不実在として返す）

**Acceptance Criteria**:
- `RuntimeStrategy` interface に `verifyFindingRefs` が宣言され、local / managed 両実装が
  interface を満たす
- 空配列入力で空配列を返す（no-op）
- `bun run typecheck` が green

## T-06: RuntimeStrategy のテスト fake / mock に `verifyFindingRefs` を追加する

- [x] `verifyFindingRefs` 未実装で型エラーになる全テストファイルの RuntimeStrategy fake を更新する
  （`tests/unit/step/executor.commit.test.ts` /
  `tests/unit/step/executor-input-validation.test.ts` /
  `tests/unit/step/commit-and-push.test.ts` / `tests/unit/core/command/runner.test.ts` /
  `tests/unit/core/command/resume.test.ts` / `tests/pipeline-integration.test.ts` ほか
  `grep` で検出した全 fake）。デフォルト実装は空配列を返す（全 finding 実在扱い）

**Acceptance Criteria**:
- `bun run typecheck` が green（全 fake が interface を満たす）
- 既存テストが regression なく pass する

## T-07: executor finalizeStep の verdict 導出を findings ベースに差し替える

- [x] `src/core/step/executor.ts` の judge 分岐（非 null toolResult）を `deriveJudgeVerdict(
  tr.findings, tr.ok)` に差し替える（旧 `approved === true ? ...` を削除）（D4）
- [x] request-review 分岐（非 null toolResult）を `deriveRequestReviewVerdict(tr.findings, tr.ok)`
  に差し替える
- [x] no-tool-call フォールバック（toolResult === null）の judge 分岐を `needs-fix` から
  `escalation` に変更する。request-review の null 分岐は `needs-discussion` のまま据え置く（D7）
- [x] verdict 導出後、judge / request-review step かつ非 null toolResult のとき
  `collectVerdictAffectingFindings(tr.findings)` を `FindingRef[]` に写像し、空でなければ
  `deps.runtimeStrategy?.verifyFindingRefs(refs, cwd, state.branch)` を await。戻り値が 1 件以上なら
  `verdict = "escalation"` に上書きする（D6）

**Acceptance Criteria**:
- judge verdict が findings 集計のみから決まり、`approved` boolean が routing に影響しない
- no-tool-call 時および `ok: false` 時の judge verdict が `escalation`
- 不実在参照を含む blocking finding で verdict が `escalation` に上書きされる
- `bun run typecheck` が green

## T-08: fixer が構造化 findings を prompt 経由で受け取るようにする

- [x] `src/core/step/fixer-helpers.ts` に `getLatestJudgeFindings(state, judgeStepName):
  Finding[] | null`（直前 judge run の `toolResult.findings`、無ければ null）と
  `buildFindingsBlock(findings): string`（severity / file:line / title / rationale を整形）を
  追加する（D8）
- [x] `buildContinuationMessage` に findings 埋め込み版の分岐（または新関数）を追加する
- [x] `src/core/step/spec-fixer.ts` の `buildMessage`: `getLatestJudgeFindings(state, SPEC_REVIEW)`
  が findings を返せば本文に埋め込む（初回・継続とも）。null なら現行の findingsPath 方式に
  フォールバック
- [x] `src/core/step/code-fixer.ts` の `buildMessage`: 同様に
  `getLatestJudgeFindings(state, CODE_REVIEW)` で分岐する
- [x] build-fixer は変更しない（findingsPath 方式を維持）

**Acceptance Criteria**:
- findings を持つ state で fixer prompt に findings 本文が埋め込まれ、findingsPath ファイル読み込み
  指示に依存しない
- findings を持たない旧 toolResult の state で fixer が findingsPath 方式の prompt を生成する
- build-fixer の buildMessage は無変更
- `bun run typecheck` が green

## T-09: judge 系 system prompt を findings 提出指示に更新する

- [x] `src/prompts/spec-review-system.ts` / `src/prompts/code-review-system.ts` /
  `src/prompts/request-review-system.ts` の system prompt に `report_result` の `findings` 配列
  提出指示を追加する。severity（critical/high/medium/low）と resolution（fixable /
  decision-needed）の判定基準、`file` は path のみ・`line` は任意、verdict/approved 自己申告は
  CLI が無視する旨を明記する（D9）
- [x] `src/core/step/code-review.ts` の `followUpPrompt`（self-check）を findings 構造の確認に
  整合させる（verdict 行整合チェックの文言を findings 提出確認に更新）
- [x] markdown result ファイルの出力指示は残す（廃止しない）

**Acceptance Criteria**:
- 3 つの judge 系 prompt が findings 提出と severity/resolution 基準を含む
- `bun run typecheck` が green

## T-10: verdict 導出・findings parse のユニットテスト

- [x] `tests/unit/step/judge-verdict.test.ts` を新規作成。`deriveJudgeVerdict` /
  `deriveRequestReviewVerdict` / `collectVerdictAffectingFindings` を網羅:
  - critical を含むのに approved 申告 → needs-fix（不整合が構造的に起きない）
  - decision-needed を含む → escalation
  - 空 findings → approved
  - ok=false → escalation（judge）/ needs-discussion（request-review）
  - request-review: high あり → needs-discussion / medium のみ → approve
- [x] `tests/unit/port/report-result-findings.test.ts`（または既存 parse テストに追記）。findings
  構造検証: 正常 / 欠落（ok=true）/ 不正 severity / 不正 resolution / line 非 number / ok=false で
  findings 不要

**Acceptance Criteria**:
- findings と verdict の不整合（critical を含む approved 等）が構造的に発生しないことがテストで
  示される
- `bun run test` で当該テストが pass

## T-11: executor verdict・実在検証のユニットテスト

- [x] `tests/unit/step/executor.test.ts`（または新規）に以下を追加:
  - no-tool-call（toolResult null）の judge verdict が escalation
  - `ok: false` 報告の judge verdict が escalation
  - 不実在参照を含む blocking finding で verdict が escalation（`verifyFindingRefs` が不実在を返す
    mock を注入）
  - 実在する finding のみのとき verdict が導出表どおり（escalation 上書きされない）

**Acceptance Criteria**:
- 上記 4 ケースが pass する
- `verifyFindingRefs` mock 注入で検証経路がテストされる

## T-12: 実在検証 runtime のユニットテスト（local / managed）

- [x] local: `verifyFindingRefs` が worktree fs 上の存在/不存在・line 行数を正しく判定する
  テストを追加する
- [x] managed: `GitHubClient` mock を注入し、getRawFile が null を返す finding を不実在として返す
  ことをテストする（`tests/unit/core/runtime/managed.test.ts` 等に追記）

**Acceptance Criteria**:
- local / managed 両 runtime で実在検証が機能する（managed は GitHubClient mock）
- `bun run test` で当該テストが pass

## T-13: fixer findings 注入のユニットテスト

- [x] spec-fixer / code-fixer の `buildMessage` が、findings を持つ state で findings 本文を
  埋め込み、findings を持たない旧 state で findingsPath 方式にフォールバックすることをテストする

**Acceptance Criteria**:
- fixer が findings を prompt 経由で受け取り、findingsPath のファイル読み込みに依存しない
- 旧 toolResult の state で findingsPath 方式が動作する
- `bun run test` で当該テストが pass

## T-14: pipeline routing の確認テストと最終検証

- [x] decision-needed を含む judge 報告で pipeline が escalate 経路（awaiting-resume）に入ることを
  確認するテストを追加する（`transition?.to ?? "escalate"` の default 動作を明示検証、D5）
- [x] `bun run typecheck` が green
- [x] `bun run test` で全テストが pass（regression なし）
- [x] `grep -rn "deriveJudgeVerdict\|verifyFindingRefs\|getLatestJudgeFindings" src/` で配線が
  正しいことを確認する

**Acceptance Criteria**:
- findings に decision-needed が含まれる場合に pipeline が escalation 経路に入る
- `typecheck && test` が green
