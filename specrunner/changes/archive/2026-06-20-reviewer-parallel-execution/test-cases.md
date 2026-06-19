# Test Cases: カスタムレビュワーの並列実行 + per-reviewer status tracking + invalidation

## Summary

- **Total**: 44 cases
- **Automated** (unit/integration): 44
- **Manual**: 0
- **Priority**: must: 36, should: 7, could: 1

---

### TC-001: approved reviewer の status が approvedAtCommit 付きで記録される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: per-reviewer status を state に記録すること > Scenario: approved reviewer の status が approvedAtCommit 付きで記録される

---

### TC-002: reviewerStatuses 不在の state が pending で初期化される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: per-reviewer status を state に記録すること > Scenario: reviewerStatuses 不在の state が pending で初期化される

---

### TC-003: 2 件以上の custom reviewer が並列に review される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: custom reviewer の review フェーズを並列実行すること > Scenario: 2 件以上の custom reviewer が並列に review される

---

### TC-004: code-review は custom reviewer の前段で直列収束する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: custom reviewer の review フェーズを並列実行すること > Scenario: code-review は custom reviewer の前段で直列収束する

---

### TC-005: 複数 reviewer の findings が集約されて 1 回の fixer に渡る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: needs-fix の findings を集約して code-fixer に 1 回で渡すこと > Scenario: 複数 reviewer の findings が集約されて 1 回の fixer に渡る

---

### TC-006: 全 reviewer approved で fixer を skip して regression-gate へ進む

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: needs-fix の findings を集約して code-fixer に 1 回で渡すこと > Scenario: 全 reviewer approved で fixer を skip して regression-gate へ進む

---

### TC-007: activationPaths 内の変更で reviewer が再 review される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: fixer 後に activationPaths ベースで再 review 対象を絞ること（invalidation） > Scenario: activationPaths 内の変更で reviewer が再 review される

---

### TC-008: activationPaths 外の変更では reviewer が再 review されない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: fixer 後に activationPaths ベースで再 review 対象を絞ること（invalidation） > Scenario: activationPaths 外の変更では reviewer が再 review されない

---

### TC-009: paths 未定義 reviewer は fixer 後に常に再 review される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: fixer 後に activationPaths ベースで再 review 対象を絞ること（invalidation） > Scenario: paths 未定義 reviewer は fixer 後に常に再 review される

---

### TC-010: 全 approved 後に regression-gate が走る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 全 custom reviewer approved 後に regression-gate を実行すること > Scenario: 全 approved 後に regression-gate が走る

---

### TC-011: resume 後に approved reviewer が skip される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: resume 時に approved かつ未 invalidate の reviewer を skip すること > Scenario: resume 後に approved reviewer が skip される

---

### TC-012: reviewer ゼロで標準遷移が不変

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: custom reviewer ゼロで既存挙動と同一であること > Scenario: reviewer ゼロで標準遷移が不変

---

### TC-013: 1 件の reviewer が status tracking 付きで収束する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: custom reviewer 1 件で直列と等価に収束すること > Scenario: 1 件の reviewer が status tracking 付きで収束する

---

### TC-014: reviewerStatuses を持つ state が persist → load で round-trip 保持される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `reviewerStatuses: [{ name: "A", status: "approved", approvedAtCommit: "sha123", activationPaths: ["src/auth/**"] }]` を持つ `JobState`
**WHEN** `stateToStateJson` で state.json 形式に変換し、`validateJobState` で読み戻す
**THEN** `reviewerStatuses` の全フィールドが元の値と一致する

---

### TC-015: reviewerStatuses 不在の旧 state が validateJobState を throw せず通る

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `reviewerStatuses` フィールドを持たない旧形式の `JobState` オブジェクト
**WHEN** `validateJobState` を呼び出す
**THEN** 例外を throw せずに正常完了する（backward compat）

---

### TC-016: 不正な status 値で validateJobState が throw する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `reviewerStatuses: [{ name: "A", status: "unknown" }]` のように `"pending"|"approved"|"skipped"` 以外の status 値を持つ `JobState`
**WHEN** `validateJobState` を呼び出す
**THEN** バリデーションエラーを throw する

---

### TC-017: name 欠落で validateJobState が throw する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `reviewerStatuses: [{ status: "pending" }]` のように `name` フィールドが欠落した `JobState`
**WHEN** `validateJobState` を呼び出す
**THEN** バリデーションエラーを throw する

---

### TC-018: deriveReviewerStatuses が reviewerStatuses 不在時に全 member を pending で初期化する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `reviewerStatuses` が `undefined` の `JobState`、member スナップショット `[{ name: "A", paths: ["src/auth/**"] }, { name: "B", paths: undefined }]`
**WHEN** `deriveReviewerStatuses(state, members)` を呼び出す
**THEN** A / B がそれぞれ `status: "pending"` で返され、A の `activationPaths` が `["src/auth/**"]` に、B の `activationPaths` が `undefined` にコピーされる

---

### TC-019: deriveReviewerStatuses が既存 reviewerStatuses をそのまま返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `reviewerStatuses: [{ name: "A", status: "approved", approvedAtCommit: "sha-abc" }]` を持つ `JobState` と member `["A"]`
**WHEN** `deriveReviewerStatuses(state, members)` を呼び出す
**THEN** 既存レコードが変更されずそのまま返される（再初期化は行われない）

---

### TC-020: aggregateVerdict が escalation > needs-fix > approved の優先順位を守る

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** 以下の各 member verdicts の組み合わせ:
  (1) `["approved", "escalation", "needs-fix"]`
  (2) `["approved", "needs-fix"]`
  (3) `["approved", "approved"]`
  (4) `["skipped", "approved"]`
**WHEN** `aggregateVerdict(memberVerdicts)` を各組み合わせで呼び出す
**THEN** (1)→`"escalation"`、(2)→`"needs-fix"`、(3)→`"approved"`、(4)→`"approved"`（skipped は approved 扱い）

---

### TC-021: computeInvalidations は touched files を引数で受け取る純関数である

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `status: "approved"` の reviewer A（`activationPaths: ["src/auth/**"]`）と touched files `["src/auth/login.ts"]`
**WHEN** `computeInvalidations(statuses, touchedFiles, requestType, headSha)` を呼び出す
**THEN** 関数内部で git コマンドを実行せず、`evaluateActivation` のみで判定が完了し、A が `pending`（invalidatedByCommit 付き）に戻る

---

### TC-022: applyRoundResults が approved verdict に approvedAtCommit を設定する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** member A の最新 verdict が `"approved"`、member B の最新 verdict が `"needs-fix"`、headSha = `"sha-round1"`
**WHEN** `applyRoundResults(statuses, results, headSha)` を呼び出す
**THEN** A の `status: "approved"` かつ `approvedAtCommit: "sha-round1"`、B の `status: "pending"` かつ `approvedAtCommit` は設定されない

---

### TC-023: selectPendingMembers が approved / skipped を除外して pending のみ返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `reviewerStatuses: [{ name: "A", status: "approved" }, { name: "B", status: "pending" }, { name: "C", status: "skipped" }]`
**WHEN** `selectPendingMembers(statuses, ["A", "B", "C"])` を呼び出す
**THEN** `["B"]` が返される（approved の A と skipped の C は除外される）

---

### TC-024: collectParallelFixerFindings が複数 needs-fix member の fixable findings を集約・dedup する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** reviewer A が needs-fix で findings `[X, Y]`、reviewer B が needs-fix で findings `[Y, Z]`（Y は重複）を持つ state
**WHEN** `collectParallelFixerFindings(state, ["A", "B"])` を呼び出す
**THEN** fixable findings として `[X, Y, Z]` が返される（Y の重複は dedup される）

---

### TC-025: collectParallelFixerFindings が approved member の findings を集めない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** reviewer A が needs-fix で findings あり、reviewer B が approved の state
**WHEN** `collectParallelFixerFindings(state, ["A", "B"])` を呼び出す
**THEN** B の findings は含まれず、A の findings のみが集約される

---

### TC-026: collectFindingsLedger が coordinator synthetic run を含まずに動作する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 / design.md > D9

**GIVEN** coordinator synthetic StepRun が `steps["custom-reviewers"]` に、member A / B の実 StepRun が `steps["A"]` / `steps["B"]` にある state
**WHEN** `collectFindingsLedger(state, ["code-review", "A", "B"])` を呼び出す
**THEN** A と B の findings が集約され、`"custom-reviewers"` は chain に含まれないため coordinator synthetic run の findings は混入しない

---

### TC-027: code-fixer composed path で needs-fix member の result file を reads() が返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `state.reviewers` が非空（composed path）で、coordinator から code-fixer へ遷移（A / B が needs-fix）する状態
**WHEN** `code-fixer.reads(state)` を呼び出す
**THEN** A と B の `customReviewerResultPath` が IoRef として返される（conformance / regression-gate の result file ではない）

---

### TC-028: code-fixer standard path（reviewers 空）の reads/message が無変更

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `state.reviewers` が空（standard path）で、code-review が needs-fix の状態
**WHEN** `code-fixer.reads(state)` および `buildMessage()` を呼び出す
**THEN** `resolveActiveReviewer(["code-review"])` ベースの従来の結果が返され、composed path の分岐は通らない（既存テスト green）

---

### TC-029: buildParallelReviewerTransitions が coordinator の遷移行を生成する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `coordinator = "custom-reviewers"`、`members = ["A", "B"]` で `buildParallelReviewerTransitions` を呼び出す
**WHEN** 生成された遷移リストを確認する
**THEN** 以下の遷移行が含まれる: `code-review approved(clean) → custom-reviewers`、`custom-reviewers approved → regression-gate`、`custom-reviewers needs-fix → code-fixer`、`custom-reviewers skipped → regression-gate`

---

### TC-030: buildParallelReviewerTransitions が member 名の遷移行を生成しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `coordinator = "custom-reviewers"`、`members = ["A", "B"]` で `buildParallelReviewerTransitions` を呼び出す
**WHEN** 生成された遷移リストを確認する
**THEN** `"A"` / `"B"` を step 名に持つ遷移行は一切含まれない

---

### TC-031: code-fixer の戻り先が conformance > regression-gate > code-review > coordinator の優先順で解決される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 / design.md > D7

**GIVEN** `buildParallelReviewerTransitions` が生成した遷移と、各 predicate の組み合わせ state:
  (1) `conformanceFixInProgress = true`
  (2) `conformanceFixInProgress = false`、`regressionGateActive = true`
  (3) `conformanceFixInProgress = false`、`regressionGateActive = false`、`codeReviewLoopActive = true`
  (4) 全て false（default）
**WHEN** code-fixer の戻り先遷移を解決する
**THEN** (1)→`conformance`、(2)→`regression-gate`、(3)→`code-review`、(4)→`custom-reviewers`

---

### TC-032: buildReviewerChainTransitions([code-review]) が無変更で green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `buildReviewerChainTransitions(["code-review"])` を呼び出す（standard path、本変更前と同じ呼び出し）
**WHEN** 生成された遷移リストを確認する
**THEN** 本変更前と同一の遷移セットが返される（既存テスト無変更 green）

---

### TC-033: snapshots 空で composeReviewerDescriptor が base を参照同一で返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06 / design.md > D2

**GIVEN** custom reviewer の `snapshots = []`（空配列）で `composeReviewerDescriptor(base, snapshots)` を呼び出す
**WHEN** 返り値を確認する
**THEN** 返り値が `base` オブジェクトと参照同一（`===`）であり、`coordinator` / `parallelReview` / `reviewerStatuses` 関連のフィールドが一切追加されていない

---

### TC-034: snapshots 非空で coordinator が parallelReview 関連フィールドに登録される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06 / design.md > D2 / D4

**GIVEN** `snapshots = [{ name: "A", maxIterations: 3, paths: ["src/auth/**"] }, { name: "B", maxIterations: 5 }]` で `composeReviewerDescriptor(base, snapshots)` を呼び出す
**WHEN** 返された descriptor を確認する
**THEN** `parallelReview = { coordinator: "custom-reviewers", members: ["A", "B"] }` が設定され、`loopNames` に `"custom-reviewers"` が含まれ、`loopFixerPairs["custom-reviewers"] = "code-fixer"`、`roles["custom-reviewers"]` が設定され、A / B の step が `steps` map に存在する

---

### TC-035: 並行 execute() で finalizeStepArtifacts が直列実行される（commit mutex）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07 / design.md > D3

**GIVEN** `spawnFn` と `finalizeStepArtifacts`（commit/push）を stub した executor で、member A / B の step を `Promise.allSettled` で同時に `executor.execute()` する
**WHEN** 両 execute が完了する
**THEN** `finalizeStepArtifacts` の 2 回の呼び出しが重複せず直列に行われる（2 回目の開始は 1 回目の完了後）

---

### TC-036: 単一ステップ経路で commit/push の呼び出し順・回数が無変更

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07

**GIVEN** 単一 step（非並列経路）で `executor.execute()` を呼び出す
**WHEN** 実行完了後に commit/push の呼び出しを確認する
**THEN** `finalizeStepArtifacts` が 1 回だけ呼び出され、commit mutex の導入前後で呼び出し順・回数に変化がない（既存 executor テスト green）

---

### TC-037: coordinator 入口で approved member は executor.execute に渡されない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08 / design.md > D3 / D8

**GIVEN** `reviewerStatuses: [{ name: "A", status: "approved", approvedAtCommit: "sha-abc" }, { name: "B", status: "pending" }]` の state で coordinator に入る。`executor.execute` を spy する
**WHEN** engine が coordinator fan-out を実行する
**THEN** `executor.execute` が B の step のみに対して呼ばれ、A には呼ばれない

---

### TC-038: fixer 後再入時に listChangedFiles が approvedAtCommit 起点で呼ばれる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08 / design.md > D6

**GIVEN** reviewer A が `approvedAtCommit: "sha-before-fix"` で approved、その後 code-fixer が実行されて coordinator に再入する。`runtimeStrategy.listChangedFiles` を spy する
**WHEN** engine が coordinator 入口で invalidation を評価する
**THEN** `listChangedFiles("sha-before-fix", cwd, branch)` が呼ばれ、返されたファイルリストで A の invalidation 判定（evaluateActivation）が行われる

---

### TC-039: synthetic coordinator StepRun が aggregate verdict 付きで steps に記録される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08 / design.md > D4

**GIVEN** coordinator fan-out で member A が `"approved"`、member B が `"needs-fix"` を返すラウンド
**WHEN** engine がラウンドを完了して state を更新する
**THEN** `state.steps["custom-reviewers"]` に aggregate verdict `"needs-fix"`、`sessionId: null`、`startedAt` / `endedAt` を持つ synthetic StepRun が push される

---

### TC-040: coordinator round 予算超過で exhaustion → awaiting-resume となる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08 / design.md > D4

**GIVEN** `maxIterationsByStep["custom-reviewers"] = 3` で、coordinator が 3 ラウンド連続で `"needs-fix"` の synthetic StepRun を記録した状態
**WHEN** engine が exhaustion チェックを実行する
**THEN** job が `awaiting-resume` に落ち、`resumeStep = "code-fixer"` が記録される

---

### TC-041: mergeParallelReviewerStates が member steps と history delta を base に正しく merge する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08 / design.md > D3

**GIVEN** base state に対して、A の実行結果（`steps["A"]` + history delta）と B の実行結果（`steps["B"]` + history delta）の 2 つの result state
**WHEN** `mergeParallelReviewerStates(base, [resultA, resultB])` を呼び出す
**THEN** マージ後 state の `steps` に A と B 両方の StepRun が含まれ、history は base から各 delta を completion 順に concat した形になり、step key が互いに disjoint で衝突しない

---

### TC-042: managed runtime で listChangedFiles が [] を返し invalidation が発火しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-10 / design.md > D6 Risks

**GIVEN** managed runtime の `listChangedFiles` stub が `[]` を返す設定で、approved な reviewer A（`activationPaths: ["src/**"]`）が存在し coordinator に再入する
**WHEN** `computeInvalidations(statuses, [], requestType, headSha)` を呼び出す
**THEN** touched が空のため activationPaths マッチが発生せず、A は `approved` のまま pending に戻らない（fail-safe: 再 review されない）

---

### TC-043: 2 件以上の custom reviewer の result file が全て branch に乗る

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-12 / design.md > D3 Risks

**GIVEN** custom reviewer A / B を含む mock pipeline で並列 review ラウンドを実行し、commit mutex で finalizeStepArtifacts を直列化した状態
**WHEN** 並列ラウンドが完了する
**THEN** A の result file と B の result file が共に feature branch の最新 commit 履歴に含まれ、どちらも欠落していない

---

### TC-044: maxIterationsByStep[coordinator] が member の maxIterations 最大値に設定される

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-06 / design.md > Open Questions

**GIVEN** `snapshots = [{ name: "A", maxIterations: 3 }, { name: "B", maxIterations: 5 }]` で `composeReviewerDescriptor` を呼び出す
**WHEN** 返された descriptor の `maxIterationsByStep["custom-reviewers"]` を確認する
**THEN** 値が `5`（member maxIterations の最大値）に設定されている

---

## Result

```yaml
result: completed
total: 44
automated: 44
manual: 0
must: 36
should: 7
could: 1
blocked_reasons: []
```
