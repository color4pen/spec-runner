# Tasks: added-turn 削減の仕上げ

## T-01: addedTurns を journal record に永続化する

- [ ] `src/store/event-journal.ts` の `StepAttemptRecord.outcome`（現 :36-50）に optional field `addedTurns?: { reportRetry: number; postWork: number; outputRepair: number }` を追加する。既存 optional field と同様に JSDoc で「addedTurns なしの旧 record は fold で undefined（後方互換）」を明記する。
- [ ] `stepRunToRecord`（現 :344-363）の outcome 構築に `...(outcome.addedTurns !== undefined ? { addedTurns: outcome.addedTurns } : {})` を追加する（既存 optional field と同一の conditional-spread パターン）。
- [ ] `fold`（現 :274-293）の outcome 復元に `...(r.outcome.addedTurns !== undefined ? { addedTurns: r.outcome.addedTurns } : {})` を追加する。
- [ ] `tests/store/event-journal.test.ts` に round-trip テストを追加する: `addedTurns` を持つ record（例 `{ reportRetry: 2, postWork: 1, outputRepair: 3 }`）を append → `fold` して `outcome.addedTurns` が入力と deep-equal になることを固定する。`stepRunToRecord` 経由（`StepRun` → record → append → fold）も 1 ケース含める。
- [ ] `tests/store/event-journal.test.ts` に後方互換テストを追加する: `addedTurns` キーを持たない `step-attempt` 行を `fold` しても例外なく、その step の `outcome.addedTurns` が `undefined` になることを固定する。

**Acceptance Criteria**:
- `addedTurns` を持つ `StepRun` を journal に append し `fold` で読み戻すと `addedTurns` が一致する（round-trip ロスレス）。
- `addedTurns` を持たない旧 record を `fold` しても例外なく `outcome.addedTurns` が `undefined` になる。
- `src/core/step/executor.ts` / `commit-orchestrator.ts` / `src/state/helpers.ts` の既存 write 経路は無改変（それらは既に `addedTurns` を伝播済み）。
- `typecheck && test` が green。

## T-02: local adapter の post-work count-miss を修正し全 return 経路に addedTurns を付与する

- [ ] `src/adapter/claude-code/agent-runner.ts` の post-work loop（現 :749-803）で `postWork++`（現 :779）を、post-work 失敗チェック（現 :763）より前・`runFollowUpQueryWithRetry` 呼び出し直後へ移動する。turn 消費のたびに 1 回だけ加算される single increment point にする。
- [ ] `ADDED_TURNS_ZERO`（`src/core/port/agent-runner.ts:241`）を value import に追加する（現在は type のみ import）。
- [ ] `addedTurns` を欠く return 経路すべてに付与する:
  - result file not found（現 :884-895）→ 実カウンタ `addedTurns: { reportRetry, postWork, outputRepair }`。
  - agent redirect 超過（現 :667-677）/ main query 失敗（現 :685-695）/ catch の timeout（現 :916-926）/ catch の error（現 :933-943）→ `addedTurns: ADDED_TURNS_ZERO`。
- [ ] 既存の success（現 :898-909）・post-work 失敗 early-return（現 :765-776）の `addedTurns` はそのまま維持する（post-work 失敗経路は `postWork++` 移動により失敗 turn を計上済みになる）。
- [ ] `tests/unit/adapter/claude-code/agent-runner.test.ts` に post-work 失敗計上テストを追加する: main work turn 成功 + `postWorkPrompts: ["..."]` 1 件、follow-up turn が非 success（非 transient、retry 対象外）を yield する構成で `run()` を実行し、`result.completionReason === "error"` かつ `result.addedTurns?.postWork === 1` を固定する。
- [ ] `tests/unit/adapter/claude-code/agent-runner.test.ts` に不変テストを追加する: 上記および代表的な success/error 経路の返却結果で `addedTurns.reportRetry + addedTurns.outputRepair === followUpAttempts` が成立することを固定する。

**Acceptance Criteria**:
- post-work turn が失敗した場合も `addedTurns.postWork` に計上される。
- 不変 `reportRetry + outputRepair === followUpAttempts` が全返却経路で保たれる。
- `run()` の全 return 経路が `addedTurns` を返す（返却値が常に整合）。
- postWork は不変計算に含めない（reportRetry / outputRepair のみが `followUpAttempts` と対応）。
- `typecheck && test` が green。

## T-03: code-review の無条件 post-work self-check turn を除去する

- [ ] `src/core/step/code-review.ts` の `CodeReviewStep` から `followUpPrompt`（現 :161-175）を削除する。`getFollowUpPrompt` は元々未定義のため追加しない。content-format outputContract（現 :139-159）と system prompt 参照（現 :86）は無改変で維持する。
- [ ] `tests/unit/step/code-review.test.ts` に follow-up 除去テストを追加する: `CodeReviewStep.followUpPrompt` と `CodeReviewStep.getFollowUpPrompt` がいずれも `undefined` であることを固定する。
- [ ] `tests/unit/step/code-review.test.ts` に形式適合テストを追加する: 形式適合（separator 行 + 7 カラム header あり）の review-feedback 文字列に対し、`CodeReviewStep.outputContracts(...)[0].checks` を `evaluateContentFormatChecks`（`src/core/step/output-verify.ts`）で評価し、failed checks が空（= post-work / repair turn が発火しない）であることを固定する。
- [ ] `tests/unit/step/code-review.test.ts` に形式違反テストを追加する: テーブル不正（separator 行 or header 欠落）の review-feedback 文字列に対し、`evaluateContentFormatChecks` が非空の failed checks を返す（= 従来どおり repair が発火する）ことを固定し、content-format 契約の挙動保存を示す。
- [ ] routing lock テストを追加する（`tests/unit/step/code-review.test.ts` または `tests/unit/step/judge-verdict.test.ts`）: 構造化 findings に critical|high を含み `ok === true` のとき `deriveJudgeVerdict`（`src/core/step/judge-verdict.ts`）が `needs-fix` を返すことを、review-feedback `.md` の内容と無関係に固定し、「.md は routing の入力でない」ことを lock する。

**Acceptance Criteria**:
- `CodeReviewStep.followUpPrompt` / `getFollowUpPrompt` が存在しない（無条件 post-work turn の除去）。
- 形式適合の review-feedback で code-review の post-work / repair turn が発火しない。
- 形式違反の review-feedback（テーブル不正）で従来どおり repair が発火する。
- routing verdict が構造化 findings から導出され、.md self-check 除去で pipeline 遷移の観測挙動が不変。
- 本変更で期待が変わる箇所以外の既存テストは無改変で green。
- `typecheck && test` が green。

## T-04: 全体検証

- [ ] `bun run typecheck` を実行し型エラーが無いことを確認する。
- [ ] `bun run test`（vitest）を実行し全テストが green であることを確認する。
- [ ] 編集面が T-01（`src/store/event-journal.ts`）/ T-02（`src/adapter/claude-code/agent-runner.ts`）/ T-03（`src/core/step/code-review.ts`）+ 各テストに限定され、managed adapter・content-format seam・code-fixer フォールバック経路に変更が及んでいないことを確認する（スコープ外を触っていない）。

**Acceptance Criteria**:
- `typecheck && test` が green。
- スコープ外（managed adapter の addedTurns 計上、content-format 負検査の新設、code-fixer legacy-resume フォールバック）に変更が無い。
