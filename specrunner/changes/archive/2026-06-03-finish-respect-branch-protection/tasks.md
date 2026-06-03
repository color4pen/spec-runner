# Tasks: finish-respect-branch-protection

## T-01: pollMergeStateAfterPush で BLOCKED / UNSTABLE を即時 return する

`src/core/finish/pr-status.ts` の `pollMergeStateAfterPush` で DIRTY と同様に BLOCKED / UNSTABLE を retry せず即座に return する。

- [x] `pollMergeStateAfterPush` の polling ループ内に BLOCKED / UNSTABLE の early return を追加（DIRTY と同じパターン）
- [x] BLOCKED / UNSTABLE で return する際のコメントに「branch protection 未充足 — retry しても解消しない」旨を記載

**Acceptance Criteria**:
- `pollMergeStateAfterPush` に mergeStateStatus BLOCKED を渡すと retry せず `{ mergeStateStatus: "BLOCKED" }` を返す
- UNSTABLE も同様
- CLEAN / DIRTY の既存挙動に regression がない

## T-02: orchestrator の Phase 2 post-push で BLOCKED / UNSTABLE guard を追加する

`src/core/finish/orchestrator.ts` の `runPhase2Push` に DIRTY guard と並列で BLOCKED / UNSTABLE guard を追加し escalation する。

- [x] `runPhase2Push` で `mergeStateAfterPush === "BLOCKED"` の escalation を追加（DIRTY guard の直後）
- [x] `mergeStateAfterPush === "UNSTABLE"` の escalation を追加
- [x] escalation メッセージの `recommendedAction` に「branch protection を満たしてから再実行せよ」と `specrunner finish <slug>` を含める

**Acceptance Criteria**:
- mergeStateStatus BLOCKED で finish を実行すると exitCode 1 + escalation が返る
- escalation メッセージに "branch protection" と再実行コマンドが含まれる
- UNSTABLE も同様
- CLEAN / DIRTY の既存挙動に regression がない

## T-03: isMergeTransientFailure の "required status check" 分類を分離する

`src/adapter/github/github-client.ts` の `isMergeTransientFailure` で "required status check" の retry 判定を pending / failed に分離する。

- [x] `msg.includes("required status check")` の一律 transient 判定を削除
- [x] "required status check" を含み かつ "is expected" を含む場合のみ transient（retry）とする
- [x] "required status check" を含み "has failed" を含む場合は permanent（retry しない）
- [x] "required status check" を含むが上記いずれにも該当しない場合は permanent（安全側）

**Acceptance Criteria**:
- `"Required status check \"ci/build\" is expected"` → `isMergeTransientFailure` が `true`
- `"Required status check \"ci/build\" has failed"` → `isMergeTransientFailure` が `false`
- `"Required status check something unknown"` → `isMergeTransientFailure` が `false`
- 既存の transient パターン（"base branch was modified", "unstable state", "locked", "not mergeable", "head branch was modified"）に regression がない

## T-04: admin bypass コメントの削除

`src/core/finish/orchestrator.ts` と `src/adapter/github/github-client.ts` から admin bypass を前提とするコメントを削除し、branch protection 尊重の前提に書き換える。

- [x] `orchestrator.ts` の `mergeFeaturePrPhase3` JSDoc から "D4: --admin equivalent is handled implicitly by admin token" を削除
- [x] `orchestrator.ts` L524 付近の "D4: admin bypass is implicit via token permissions" コメントを削除
- [x] `github-client.ts` の `mergePullRequest` JSDoc から "D4: REST API does not have --admin equivalent; admin token bypasses implicitly" を削除し、「merge は branch protection 充足に依存する」旨のコメントに置換
- [x] codebase 内で "admin bypass" "admin token" を grep し、残存箇所がないことを確認

**Acceptance Criteria**:
- `src/core/finish/` と `src/adapter/github/` に "admin bypass" "admin token bypasses" を含むコメントが存在しない
- `bun run typecheck` が通る

## T-05: mergeFeaturePrPhase3 の merge 失敗メッセージに branch protection hint を追加する

`src/core/finish/orchestrator.ts` の `mergeFeaturePrPhase3` で merge 失敗時の `recommendedAction` に branch protection 由来の hint を含める。

- [x] `mergeResult.merged === false` 時の `recommendedAction` を「Branch protection requirements may not be met. Ensure required checks pass and required reviews are approved, then re-run: specrunner finish <slug>」に改善
- [x] `catch` 句の `recommendedAction` も同様に branch protection の可能性に言及する

**Acceptance Criteria**:
- merge API が `{ merged: false }` を返した場合の escalation メッセージに "branch protection" が含まれる
- 例外発生時の escalation メッセージにも "branch protection" が含まれる

## T-06: 既マージ経路で change folder archive を実行する

`src/core/finish/orchestrator.ts` の `prAlreadyMerged` 分岐で Phase 1 archive を実行し、archive 完了後に `markJobArchived` を呼ぶ。

- [x] `prAlreadyMerged` 分岐の `markJobArchived` 呼び出し前に change folder archive ロジックを追加
- [x] archive に使う cwd は `operationCwd ?? cwd`（通常経路と同じ）
- [x] `archiveChangeFolder` が `ok: true, skipped: true`（change folder 不在）の場合はそのまま `markJobArchived` へ進む
- [x] `archiveChangeFolder` が `ok: false` の場合は `markJobArchived` を呼ばず escalation を返す
- [x] archive 後の commit + push は既マージ経路では不要（PR は既に merge 済み。ローカルの archive 移動 + commit のみ行い、push は次回の変更で含まれる）。commit は best-effort で、失敗しても `markJobArchived` に進む

**Acceptance Criteria**:
- PR already merged + change folder 存在 → archive 移動が実行されてから `markJobArchived` が呼ばれる
- PR already merged + change folder 不在 → archive skip → `markJobArchived`（正常）
- PR already merged + archive 失敗 → escalation、`markJobArchived` は呼ばれない
- 通常経路（PR 未マージ）の挙動に regression がない

## T-07: rules.md に merge gate 設計前提を追記する

`specrunner/changes/<slug>/rules.md` テンプレートに merge gate 設計前提を追記する。

- [x] rules.md の System Facts セクションに以下を追加: 「merge gate はプロジェクトの branch protection で構成する。specrunner finish は admin bypass を行わず、branch protection 未充足の場合は merge せず escalation する」
- [x] rules.md テンプレートの生成元（`src/prompts/` 等）があれば同様に更新

**Acceptance Criteria**:
- rules.md に merge gate 設計前提の記述が存在する
- `bun run typecheck` が通る

## T-08: テスト追加・更新

既存テストの更新と新規テストケースの追加。

- [x] `tests/unit/adapter/github/github-client-pr.test.ts` に TC-PM-020: "required status check has failed" → no retry テストを追加
- [x] 同ファイルに TC-PM-021: "required status check is expected" → retry テストが既存（TC-PM-018）で通ることを確認
- [x] `tests/finish-orchestrator.test.ts` に mergeStateStatus BLOCKED → escalation のテストを追加
- [x] 同ファイルに mergeStateStatus UNSTABLE → escalation のテストを追加
- [x] 同ファイルに既マージ経路 + change folder 存在 → archive 実行のテストを追加
- [x] 同ファイルに既マージ経路 + change folder 不在 → 正常 archive skip のテストを追加
- [x] `bun run typecheck && bun run test` が green
