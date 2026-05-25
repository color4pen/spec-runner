# Test Cases: merge-transient-retry

## Coverage Map

| Category | Priority | Source |
|----------|----------|--------|
| A. retryWithBackoff helper | must | Task 1, Task 2, 受け入れ基準 |
| B. isMergeTransientFailure 判定 | must | Task 3b, 受け入れ基準 |
| C. mergePullRequest retry 挙動 | must | Task 3c, Task 4, 受け入れ基準 |
| D. 423 Locked ハンドリング | must | Task 3a |
| E. ログ出力 | should | 受け入れ基準, D5 |
| F. 二重 retry 回避 | should | D6 |
| G. Orchestrator 統合 | could | 受け入れ基準 |

---

## A. retryWithBackoff helper

### TC-RB-001 初回成功は retry しない
- **Category**: A  **Priority**: must  **Source**: Task 2

**GIVEN** `retryWithBackoff` に `shouldRetryResult: () => false` を渡す  
**WHEN** fn() が最初の呼び出しで値 `"ok"` を返す  
**THEN** fn は 1 回だけ呼ばれ、戻り値は `"ok"` である

---

### TC-RB-002 shouldRetryResult: 2 回 retry して 3 回目成功
- **Category**: A  **Priority**: must  **Source**: Task 2

**GIVEN** fn が 1・2 回目は `{ ok: false }` を返し、3 回目は `{ ok: true }` を返す  
**AND** `shouldRetryResult: (r) => !r.ok`、`maxAttempts: 4`  
**WHEN** `retryWithBackoff` を実行する  
**THEN** fn は 3 回呼ばれ、最終戻り値は `{ ok: true }`

---

### TC-RB-003 isTransientError: 1 回 retry して 2 回目成功
- **Category**: A  **Priority**: must  **Source**: Task 2

**GIVEN** fn が 1 回目は `new Error("transient")` を throw し、2 回目は `"done"` を返す  
**AND** `isTransientError: (e) => true`  
**WHEN** `retryWithBackoff` を実行する  
**THEN** fn は 2 回呼ばれ、戻り値は `"done"`

---

### TC-RB-004 shouldRetryResult exhausted → 最後の result を返す (throw しない)
- **Category**: A  **Priority**: must  **Source**: Task 2

**GIVEN** fn が常に `{ merged: false }` を返す  
**AND** `shouldRetryResult: (r) => !r.merged`、`maxAttempts: 4`  
**WHEN** `retryWithBackoff` を実行する  
**THEN** fn は 4 回呼ばれ、戻り値は `{ merged: false }` であり例外は発生しない

---

### TC-RB-005 isTransientError exhausted → 最後の error を re-throw
- **Category**: A  **Priority**: must  **Source**: Task 2

**GIVEN** fn が常に `new Error("boom")` を throw する  
**AND** `isTransientError: () => true`、`maxAttempts: 3`  
**WHEN** `retryWithBackoff` を実行する  
**THEN** fn は 3 回呼ばれ、`Error("boom")` が throw される

---

### TC-RB-006 onRetry が正しい attempt 番号と info で呼ばれる
- **Category**: A  **Priority**: must  **Source**: Task 2

**GIVEN** fn が 1 回目は `{ merged: false }`、2 回目は `{ merged: true }` を返す  
**AND** `shouldRetryResult: (r) => !r.merged`、`onRetry` spy を渡す  
**WHEN** `retryWithBackoff` を実行する  
**THEN** `onRetry` は attempt=1、info.result=`{ merged: false }` で 1 回だけ呼ばれる

---

### TC-RB-007 delay が exponential になっている
- **Category**: A  **Priority**: must  **Source**: Task 2, D2

**GIVEN** fn が 3 回 retry まで `{ merged: false }` を返す  
**AND** `shouldRetryResult: (r) => !r.merged`、`maxAttempts: 4`、`baseDelayMs: 1000`、`sleepFn` spy  
**WHEN** `retryWithBackoff` を実行する  
**THEN** `sleepFn` が順に 1000ms、2000ms、4000ms で呼ばれる

---

### TC-RB-008 shouldRetryResult 未定義 → retry せず result を返す
- **Category**: A  **Priority**: must  **Source**: Task 2

**GIVEN** `shouldRetryResult` を渡さない  
**WHEN** fn が `{ value: 1 }` を返す  
**THEN** fn は 1 回だけ呼ばれ、戻り値は `{ value: 1 }`

---

### TC-RB-009 isTransientError 未定義 → error を re-throw (retry しない)
- **Category**: A  **Priority**: must  **Source**: Task 2

**GIVEN** `isTransientError` を渡さない  
**WHEN** fn が `new Error("permanent")` を throw する  
**THEN** fn は 1 回だけ呼ばれ、`Error("permanent")` が即 throw される

---

## B. isMergeTransientFailure 判定

### TC-TF-001 "Base branch was modified" → transient
- **Category**: B  **Priority**: must  **Source**: Task 3b, request.md 要件 2

**GIVEN** `{ merged: false, message: "Base branch was modified. Review and try the merge again." }`  
**WHEN** `isMergeTransientFailure` を呼ぶ  
**THEN** `true` を返す

---

### TC-TF-002 "unstable state" → transient
- **Category**: B  **Priority**: must  **Source**: Task 3b

**GIVEN** `{ merged: false, message: "This repository is currently in an unstable state." }`  
**WHEN** `isMergeTransientFailure` を呼ぶ  
**THEN** `true` を返す

---

### TC-TF-003 "Locked" (大文字小文字不問) → transient
- **Category**: B  **Priority**: must  **Source**: Task 3b, D3

**GIVEN** `{ merged: false, message: "Branch locked" }`  
**WHEN** `isMergeTransientFailure` を呼ぶ  
**THEN** `true` を返す

---

### TC-TF-004 "Pull request is not mergeable" → permanent
- **Category**: B  **Priority**: must  **Source**: Task 3b, Task 4 TC-PM-016

**GIVEN** `{ merged: false, message: "Pull request is not mergeable" }`  
**WHEN** `isMergeTransientFailure` を呼ぶ  
**THEN** `false` を返す

---

### TC-TF-005 merged: true → transient 判定されない
- **Category**: B  **Priority**: must  **Source**: Task 3b

**GIVEN** `{ merged: true, message: "Base branch was modified" }`  
**WHEN** `isMergeTransientFailure` を呼ぶ  
**THEN** `false` を返す

---

## C. mergePullRequest retry 挙動

### TC-PM-010 405 "Base branch was modified" → retry → 2 回目 200 成功
- **Category**: C  **Priority**: must  **Source**: Task 4, 受け入れ基準

**GIVEN** mockFetch が 1 回目: `405 { message: "Base branch was modified." }`、2 回目: `200 { merged: true }` を返す  
**WHEN** `mergePullRequest()` を呼ぶ  
**THEN** 戻り値は `{ merged: true }` であり、mockFetch は 2 回呼ばれる

---

### TC-PM-011 405 "unstable state" → retry → 2 回目 200 成功
- **Category**: C  **Priority**: must  **Source**: Task 4

**GIVEN** mockFetch が 1 回目: `405 { message: "unstable state" }`、2 回目: `200 { merged: true }` を返す  
**WHEN** `mergePullRequest()` を呼ぶ  
**THEN** 戻り値は `{ merged: true }` であり、mockFetch は 2 回呼ばれる

---

### TC-PM-012 423 Locked → retry → 2 回目 200 成功
- **Category**: C  **Priority**: must  **Source**: Task 4, Task 3a

**GIVEN** mockFetch が 1 回目: `423 { message: "Locked" }`、2 回目: `200 { merged: true }` を返す  
**WHEN** `mergePullRequest()` を呼ぶ  
**THEN** 戻り値は `{ merged: true }` であり、mockFetch は 2 回呼ばれる

---

### TC-PM-013 405 transient × 4 回 → exhausted → `{ merged: false }` を返す
- **Category**: C  **Priority**: must  **Source**: Task 4, 受け入れ基準

**GIVEN** mockFetch が 4 回とも `405 { message: "Base branch was modified." }` を返す  
**WHEN** `mergePullRequest()` を呼ぶ  
**THEN** 戻り値は `{ merged: false, message: "Base branch was modified." }` であり、例外は発生せず、mockFetch は 4 回呼ばれる

---

### TC-PM-014 403 permission denied → retry なし → `{ merged: false }`
- **Category**: C  **Priority**: must  **Source**: Task 4, 受け入れ基準 (permanent failure)

**GIVEN** mockFetch が `403` を返す  
**WHEN** `mergePullRequest()` を呼ぶ  
**THEN** 戻り値は `{ merged: false }` であり、mockFetch は 1 回だけ呼ばれる

---

### TC-PM-015 409 conflict → retry なし → `{ merged: false }`
- **Category**: C  **Priority**: must  **Source**: Task 4

**GIVEN** mockFetch が `409` を返す  
**WHEN** `mergePullRequest()` を呼ぶ  
**THEN** 戻り値は `{ merged: false }` であり、mockFetch は 1 回だけ呼ばれる

---

### TC-PM-016 405 "Pull request is not mergeable" → retry なし → `{ merged: false }`
- **Category**: C  **Priority**: must  **Source**: Task 4

**GIVEN** mockFetch が `405 { message: "Pull request is not mergeable" }` を返す  
**WHEN** `mergePullRequest()` を呼ぶ  
**THEN** 戻り値は `{ merged: false }` であり、mockFetch は 1 回だけ呼ばれる

---

## D. 423 Locked ハンドリング

### TC-423-001 423 + JSON body → message をそのまま返す
- **Category**: D  **Priority**: must  **Source**: Task 3a, D4

**GIVEN** mockFetch が `423 { message: "Branch temporarily locked" }` を返す  
**AND** retry を無効化 (maxAttempts=1) した状態  
**WHEN** `mergePullRequest()` を呼ぶ  
**THEN** 戻り値は `{ merged: false, message: "Branch temporarily locked" }`

---

### TC-423-002 423 + body 解析失敗 → デフォルトメッセージ
- **Category**: D  **Priority**: should  **Source**: Task 3a

**GIVEN** mockFetch が `423` を返し、body が JSON として解析不能  
**AND** retry を無効化 (maxAttempts=1) した状態  
**WHEN** `mergePullRequest()` を呼ぶ  
**THEN** 戻り値は `{ merged: false, message: "Merge failed: branch locked (status 423)" }`

---

## E. ログ出力

### TC-LOG-001 retry 時にログが出力される
- **Category**: E  **Priority**: should  **Source**: 受け入れ基準, D5

**GIVEN** mockFetch が 1 回目: `405 "Base branch was modified."`、2 回目: `200 { merged: true }` を返す  
**AND** `process.stdout.write` を spy する  
**WHEN** `mergePullRequest()` を呼ぶ  
**THEN** stdout に `"GitHub PR merge retry: Base branch was modified., retrying (1/3)..."` が出力される

---

### TC-LOG-002 retry 中に sleep も実行される (ユーザーが「動いている」と分かる)
- **Category**: E  **Priority**: should  **Source**: 要件 3

**GIVEN** sleepFn spy を `mergePullRequest()` に注入可能な形で渡す  
**AND** 1 回目が transient failure  
**WHEN** `mergePullRequest()` を呼ぶ  
**THEN** sleepFn が retry 前に 1 回呼ばれ、delay > 0 ms が渡される

---

### TC-LOG-003 exhausted 後は retry ログを出さない
- **Category**: E  **Priority**: should  **Source**: D5

**GIVEN** mockFetch が 4 回とも transient failure を返す  
**AND** `process.stdout.write` を spy する  
**WHEN** `mergePullRequest()` を呼ぶ  
**THEN** retry ログは 3 回 (`retrying (1/3)` / `(2/3)` / `(3/3)`) 出力され、4 回目は出力されない

---

## F. 二重 retry 回避

### TC-DR-001 5xx は mergePullRequest 層で retry されない
- **Category**: F  **Priority**: should  **Source**: D6, 要件 2

**GIVEN** `request()` 層が 5xx 時に自前で 3 回 retry し最終的に throw する  
**WHEN** mockFetch が 5xx を返し続け、`request()` が throw する  
**THEN** `retryWithBackoff` の `isTransientError` は未定義のため re-throw される (mergePullRequest 層での retry は 0 回)

---

## G. Orchestrator 統合

### TC-ORC-001 Phase 3 が retry で回復 → Phase 4 へ進む (escalation なし)
- **Category**: G  **Priority**: could  **Source**: 受け入れ基準

**GIVEN** `mergeFeaturePrPhase3()` が呼ばれる  
**AND** 1 回目の `mergePullRequest()` は transient failure、2 回目は成功する  
**WHEN** Phase 3 を実行する  
**THEN** escalation が発生せず、pipeline は Phase 4 (PR close 等) へ進む

---

### TC-ORC-002 Phase 3 が 4 回失敗 → 既存と同等の escalation 出力
- **Category**: G  **Priority**: could  **Source**: 受け入れ基準

**GIVEN** `mergePullRequest()` が 4 回とも transient failure を返す  
**WHEN** Phase 3 を実行する  
**THEN** escalation 出力に `"Phase 3 (REST API squash merge)"` が含まれ、現状と同等のフォーマットで終了する
