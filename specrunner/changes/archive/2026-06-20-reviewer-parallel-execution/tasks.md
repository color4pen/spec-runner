# Tasks: カスタムレビュワーの並列実行 + per-reviewer status tracking + invalidation

実装順は「state スキーマ → 純粋な status/aggregation/invalidation 層 → executor の commit 直列化 →
遷移 builder + predicate → descriptor 合成 → code-fixer 集約 → engine の fan-out 統合 → resume →
E2E → 仕上げ」。interface が確定する前に widget テストを書かない（scenario 先・code 後）。
各タスクは原則 `bun run typecheck && bun run test` を green に保ったまま進める。zero-reviewer / standard /
fast pipeline のテストは**全タスクを通じて無変更 green を維持**すること（D2）。

## T-01: `ReviewerStatus` 型と `JobState.reviewerStatuses` の追加

- [x] `src/kernel/reviewer-snapshot.ts` に `ReviewerStatus { name: string; status: "pending" | "approved" | "skipped"; approvedAtCommit?: string | null; activationPaths?: string[]; invalidatedByCommit?: string | null }` を定義する（design D1）。
- [x] `src/state/schema.ts` で `ReviewerStatus` を import し、`JobState` に `reviewerStatuses?: ReviewerStatus[]`（backward compat: 不在 OK）を追加する。JSDoc に「state.json projection で round-trip、event-journal threading 不要」と明記する。
- [x] `validateJobState` に reviewers と同型の軽量検査を足す: `reviewerStatuses` present 時は配列であり、各要素が非空 string `name` と `"pending"|"approved"|"skipped"` の `status` を持つこと。absence は OK。

**Acceptance Criteria**:
- `reviewerStatuses` を持つ state が persist → load で round-trip 保持される（unit test、受け入れ #1）。
- `reviewerStatuses` 不在の旧 state が `validateJobState` を throw せず通る（unit test、後方互換）。
- 不正な status 値 / name 欠落で `validateJobState` が throw する（unit test）。
- 既存 schema / store テストが無変更 green。

## T-02: status / aggregation / invalidation の純関数層

- [x] `src/core/pipeline/reviewer-status.ts` を新設し、I/O・LLM を含まない純関数群を実装する（design D5 / D6 / D8）:
  - `deriveReviewerStatuses(state, members): ReviewerStatus[]` — `reviewerStatuses` を読み、不在なら全 member を `pending` で初期化（activationPaths は snapshot.paths からコピー）。
  - `selectPendingMembers(statuses, members): string[]` — `status === "pending"` の member 名を宣言順で返す（resume skip / 通常実行 共通、D8）。
  - `applyRoundResults(statuses, results, headSha): ReviewerStatus[]` — 各 member の最新 verdict（approved / needs-fix / skipped）を status に反映。approved は `approvedAtCommit = headSha`、needs-fix は `pending`、skipped は `skipped`。
  - `aggregateVerdict(memberVerdicts): "approved" | "needs-fix" | "escalation"` — escalation > needs-fix > approved（design D5）。skipped は approved 扱い（regression-gate へ）。
  - `computeInvalidations(statuses, touchedByApprovedReviewer, requestType, headSha): ReviewerStatus[]` — approved member ごとに `evaluateActivation({ paths: activationPaths }, { changedFiles, requestType })` を評価し、activated なら `pending`（invalidatedByCommit = headSha）に戻す（design D6）。`evaluateActivation` を再利用する。
- [x] git diff 取得は engine 側で行い、この層には touched files を引数で渡す（純関数を保つ）。

**Acceptance Criteria**:
- `deriveReviewerStatuses` が不在時に全 member を pending 初期化し、既存 statuses はそのまま返す（unit test、受け入れ #1）。
- `aggregateVerdict` が escalation/needs-fix/approved の優先順位を正しく返す（unit test、受け入れ #3 / #4）。
- `computeInvalidations` が paths マッチで pending に戻し、paths 不一致で approved 維持、paths 未定義で常に pending に戻す（unit test、受け入れ #4）。
- `selectPendingMembers` が approved を除外し pending のみ返す（unit test、受け入れ #5 / #7）。

## T-03: needs-fix member findings の集約ヘルパ

- [x] `src/core/pipeline/findings-ledger.ts`（または `reviewer-status.ts`）に `collectParallelFixerFindings(state, members): Finding[]` を追加する: 各 member の最新 run の verdict が `needs-fix` のものについて `outcome.toolResult.findings` を集め、`collectFixableFindings` で fixable を抽出、`dedupeFindings` で重複排除する（design D5）。
- [x] `collectFindingsLedger`（regression-gate 用）は**変更しない**（design D9）。

**Acceptance Criteria**:
- 複数 needs-fix member の fixable findings が集約・dedup される（unit test、受け入れ #3）。
- approved のみの member からは findings を集めない（unit test）。
- `collectFindingsLedger` の挙動が無変更（既存 test green、design D9）。

## T-04: code-fixer の composed-path findings 集約

- [x] `src/core/step/code-fixer.ts` の `reads()` / `buildMessage()` に composed-path 分岐を追加する（`state.reviewers?.length` > 0、design D5 / D7）:
  - conformance 起点（`getConformanceFixContext`）は従来どおり conformance findings。
  - それ以外で composed path のとき、戻り先 predicate（T-05）と整合する findings 源を選ぶ:
    custom-reviewer ループ起点 → `collectParallelFixerFindings`（T-03）の集約 findings を inline 埋め込み、`reads()` は needs-fix member の各 result file を IoRef で返す（pre-validation 用）。regression-gate ループ起点 → regression-gate findings。code-review ループ起点 → code-review findings。
- [x] standard path（`reviewers` 空）は `resolveActiveReviewer(deriveImplFixerChain([code-review]))` のまま**不変**にする。
- [x] 集約時の reviewer 名ラベルは複数源なので "custom reviewers" 等の集約ラベルにする（`buildFindingsBlock` の reviewerName 引数）。

**Acceptance Criteria**:
- composed path で複数 needs-fix member の findings が 1 つの fixer message に集約される（unit test、受け入れ #3）。
- standard path（reviewers 空）の code-fixer message / reads が無変更（unit test、受け入れ #8 の前提）。
- conformance 起点 fixer が従来どおり conformance findings を読む（既存 test green）。

## T-05: 並列 reviewer 遷移 builder と戻り先 predicate

- [x] `src/core/pipeline/reviewer-chain.ts` に決定的 predicate を追加する（design D7）:
  - `conformanceFixInProgress(state): boolean`（`getConformanceFixContext(state, code-fixer) !== null` を委譲）。
  - `regressionGateActive(state): boolean`（regression-gate 最新 verdict が needs-fix、または approved かつ fixable findings あり）。
  - `codeReviewLoopActive(state, coordinatorName): boolean`（coordinator に run が無い かつ code-review 最新 verdict が needs-fix）。
- [x] `buildParallelReviewerTransitions(opts: { coordinator: string; members: string[] }): Transition[]` を追加する。生成する行:
  - `code-review needs-fix → code-fixer`、`code-review approved`+fixable → `code-fixer`、`code-review approved`(clean) → `coordinator`
  - `coordinator approved → regression-gate`、`coordinator needs-fix → code-fixer`、`coordinator skipped → regression-gate`
  - `regression-gate needs-fix → code-fixer`、`regression-gate approved`+fixable → `code-fixer`、`regression-gate approved`(clean) → `conformance`
  - `code-fixer` 戻り行（優先順 when 付き）: `→ conformance`(conformanceFixInProgress) / `→ regression-gate`(regressionGateActive) / `→ code-review`(codeReviewLoopActive) / `→ custom-reviewers`(default)
  - `code-fixer error → escalate`
- [x] member step 個別の遷移行は**生成しない**（engine が batch 駆動するため、design D3）。
- [x] `resolveActiveReviewer` は削除せず、standard path と exhaustion attribution 用に残す（design D4 / D7）。
- [x] `src/core/pipeline/types.ts` の `LOOP_ERROR_CODES` に coordinator 用エラー形（例: `CUSTOM_REVIEWERS_RETRIES_EXHAUSTED`）を追加する。coordinator 名定数（例 `CUSTOM_REVIEWERS_STEP_NAME = "custom-reviewers"`）を `types.ts` に定義する。

**Acceptance Criteria**:
- `code-fixer` の戻り先が conformance > regression-gate > code-review > coordinator の優先順で解決される（unit test、受け入れ #4）。
- `coordinator approved → regression-gate` / `coordinator needs-fix → code-fixer` 行が生成される（unit test、受け入れ #4 / #6）。
- member 名の遷移行が生成されない（unit test）。
- standard path（`buildReviewerChainTransitions([code-review])`）が無変更 green。

## T-06: PipelineDescriptor への parallelReview 宣言と compose-reviewers の合成

- [x] `src/core/pipeline/types.ts` の `PipelineDescriptor` に `parallelReview?: { coordinator: string; members: readonly string[] }` を追加する（design D2）。
- [x] `src/core/pipeline/compose-reviewers.ts` を改修する（design D2 / D4）:
  - steps map: 各 member step + regression-gate step を従来どおり挿入（coordinator は steps map に入れない）。
  - transitions: `buildParallelReviewerTransitions({ coordinator, members })`（T-05）を使用。
  - `loopNames` に coordinator を追加（member step は除外）、`loopFixerPairs[coordinator] = code-fixer`（member step は除外）、`roles[coordinator] = { role: "gate", phase: "impl" }`、`maxIterationsByStep[coordinator] = max(member.maxIterations)`。
  - `parallelReview = { coordinator, members: snapshots.map(s => s.name) }` を設定する。
- [x] snapshots 空のときは base を参照同一で返す早期 return を**維持**する（D2）。

**Acceptance Criteria**:
- snapshots 空で base が参照同一で返る（unit test、受け入れ #7）。
- snapshots 非空で coordinator が loopNames / loopFixerPairs / roles / maxIterationsByStep / parallelReview に登録される（unit test）。
- 合成後 transitions に member 名の行が無く、coordinator / regression-gate の行がある（unit test、受け入れ #4 / #6）。
- `buildPipelineForJob` / `runPipeline`（`src/core/pipeline/run.ts`）が parallelReview を Pipeline に渡せる（型確認）。

## T-07: executor の commit 直列化（commit mutex）

- [x] `src/core/step/executor.ts` に instance レベルの promise-chain mutex を追加し、`runAgentStep` 内の `deps.runtimeStrategy?.finalizeStepArtifacts(...)` 呼び出しを直列化する（design D3）。
- [x] mutex は常に直列化する単純な chain で良い（commit/push は秒オーダー）。session 実行・activation の `listChangedFiles`・`prepareStepArtifacts`・verdict 導出は直列化対象外（並行のまま）。
- [x] 単一ステップ実行（非並列経路）の挙動が無変更であることを保証する（mutex は単独呼び出しでは素通り）。

**Acceptance Criteria**:
- 2 つの `execute()` を同時呼び出ししても `finalizeStepArtifacts`（commit/push）が直列に実行される（spawnFn/finalize を stub した unit test）。
- 単一ステップ経路で commit/push の呼び出し順・回数が無変更（既存 executor.commit テスト green）。

## T-08: pipeline engine の coordinator fan-out 統合

- [x] `src/core/pipeline/pipeline.ts` の `Pipeline` constructor に `parallelReview?: { coordinator: string; members: string[] }` を受け取り保持する。`buildPipeline`（`run.ts`）が descriptor から渡す。
- [x] `mergeParallelReviewerStates(base, results): JobState` 純関数を追加する（pipeline 内）: base に各 member の `steps[member]` と history delta（base.history.length 以降）を merge。step/status などの cursor は engine 側で決定的に設定。
- [x] `runInternal` の while ループに coordinator 分岐を追加する（design D3 / D4 / D6 / D8）:
  - `currentStep === this.parallelReview?.coordinator` を `this.steps.get` の前に検出する（coordinator は steps map に無い）。
  - 入口で `deriveReviewerStatuses` → invalidation（`computeInvalidations`、approved member の touched は `deps.runtimeStrategy.listChangedFiles(approvedAtCommit, cwd, branch)`、HEAD は `captureHeadSha`）→ `selectPendingMembers`。
  - pending が空なら batch を skip して aggregate = `approved`（all-approved / resume skip の fast path、D8）。
  - pending member を `Promise.allSettled(members.map(m => this.executor.execute(memberStep, base, deps)))` で同時実行。fulfilled は merge、rejected は err.state の failed step を merge。
  - `applyRoundResults`（headSha = ラウンド完了時 `captureHeadSha`）で `reviewerStatuses` 更新、`aggregateVerdict` 算出（rejected があれば escalation）。
  - synthetic coordinator StepRun（verdict = aggregate）を `steps[coordinator]` に push（D4）。
  - merge state を 1 回 persist し、`outcome = getStepOutcome(state, coordinator)`（synthetic verdict を返す）として既存の遷移ルックアップ / loop bookkeeping / exhaustion へ合流する。
- [x] coordinator は `loopNames` に含まれるため loop 入口 bookkeeping（iter 増分）・exhaustion（round 予算）・episode-reset が自動適用される。`skipped`/`approved` で false exhaustion を起こさないことを確認する（必要な微修正があれば最小限で行い design D4 と整合させる）。

**Acceptance Criteria**:
- coordinator 入口で pending member のみが `executor.execute` される（executor を stub した unit test、受け入れ #2 / #5）。
- 2 件以上の pending member が同時に execute される（並行性を観測する test、受け入れ #2）。
- 全 member approved で batch skip → aggregate approved → regression-gate へ遷移（unit test、受け入れ #4）。
- fixer 後の再入で invalidation が `listChangedFiles` を approvedAtCommit 起点で呼び、pending を再導出する（runtimeStrategy stub の unit test、受け入れ #4）。
- synthetic coordinator StepRun が verdict 付きで記録され遷移が解決する（unit test）。
- coordinator の round 予算超過で exhaustion → awaiting-resume（resumeStep = code-fixer）になる（unit test）。

## T-09: resume skip の検証

- [x] resume 経路（`src/core/resume/`）で coordinator に戻った時、`reviewerStatuses` から approved & 未 invalidate の member が `selectPendingMembers` で除外されることを確認する（design D8）。coordinator 名は injected step（`STEP_NAMES` 外）なので、`--from coordinator` の明示指定は不可（regression-gate / custom reviewer 同様の既知制約）であることをコメントで明記する。resumePoint 経由の自動 resume は機能すること。

**Acceptance Criteria**:
- approved reviewer A + pending reviewer B の状態で resume すると A は skip、B のみ再 review される（E2E / 統合 test、受け入れ #5）。
- resumePoint 経由の resume が coordinator → batch で正しく継続する（test）。

## T-10: runtime 制約の確認と invalidation seam の再利用

- [x] invalidation の touched files 取得に既存 `listChangedFiles(approvedAtCommit, cwd, branch)`（three-dot、ancestor では two-dot と一致）を再利用する。新規 seam を追加しないことをコメントで明記する（design D6）。
- [x] managed runtime（`listChangedFiles` が `[]`）では invalidation 不発（再 review しない fail-safe）であること、並列 custom reviewer の managed 非対応が既存の既知制約の継承であることをコメントで残す（design Non-Goals / Risks）。

**Acceptance Criteria**:
- local 実装で approvedAtCommit 起点の `git diff --name-only <commit>...HEAD` が touched files を返す（spawnFn stub の unit test）。
- managed で touched が `[]` となり invalidation が発火しない（unit test）。

## T-11: unit テスト群

- [x] T-01〜T-08 の純関数 / 遷移 / code-fixer / schema を unit test で固定する:
  - schema round-trip（reviewerStatuses、受け入れ #1）— `tests/schema.test.ts` TC-RS-01。
  - reviewer-status 純関数（aggregate / invalidation / pending 選択、受け入れ #3 / #4 / #5）— `src/core/pipeline/__tests__/reviewer-status.test.ts`。
  - 並列遷移 builder + 戻り先 predicate（受け入れ #4 / #6）— `src/core/pipeline/__tests__/reviewer-chain.test.ts`。
  - code-fixer 集約 / standard path 不変（受け入れ #3 / #8）— `src/core/pipeline/__tests__/findings-ledger.test.ts`。
  - compose-reviewers の合成（受け入れ #4 / #7）— `src/core/pipeline/__tests__/compose-reviewers.test.ts`。

**Acceptance Criteria**:
- 上記 unit test がすべて green。
- zero-reviewer / standard / fast の既存 pipeline・transitions・compose テストが無変更 green（受け入れ #8）。

## T-12: E2E mock pipeline テスト

- [x] mock pipeline（`tests/custom-reviewers-e2e.test.ts` 流儀）で受け入れシナリオを固定する:
  - custom reviewer 2 件以上で review が並列実行される（受け入れ #2）— TC-041。
  - needs-fix の findings が集約されて 1 回の code-fixer に渡る（受け入れ #3）— TC-044 / TC-047。
  - fixer が activationPaths 内を変更 → 該当 reviewer が pending に戻り再 review（受け入れ #4）— TC-051。
  - 全 reviewer approved 後に regression-gate が走る（受け入れ #6）— TC-RG-01 / TC-040。
  - resume 時に approved & 未 invalidate の reviewer が skip される（受け入れ #5）— TC-050。
  - reviewer 1 件で収束する（受け入れ #8 の一部）— TC-040。
- [x] reviewer 0 件で既存 E2E が無変更 green であることを確認する（受け入れ #7）— TC-045 / TC-048。

**Acceptance Criteria**:
- 上記すべてのシナリオが green。
- 既存 custom-reviewers / pipeline-integration / reviewer-activation E2E が無変更 green。

## T-13: 仕上げ（typecheck / test / 後方互換 / 制約明記）

- [x] `bun run typecheck && bun run test` が green（受け入れ最終）。
- [x] reviewer 0 件 / 1 件の後方互換を最終確認する（受け入れ #7 / #8）。
- [x] managed runtime の並列 custom reviewer 非対応・invalidation fail-safe が design / コメントに記録されていることを確認する。

**Acceptance Criteria**:
- `typecheck && test` が green（受け入れ #9）。
- zero/single reviewer の挙動が直列実装と等価（受け入れ #7 / #8）。
- managed 既知制約が文書化されている。
