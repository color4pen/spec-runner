# Test Cases: finish Phase 3 で merge 前に conflict 状態をチェックする

## Overview

| # | ID | Category | Priority | Source | must/should/could |
|---|-----|----------|----------|--------|-------------------|
| 1 | TC-CONFLICT-001 | correctness | high | 要件2, T-01, T-03 | must |
| 2 | TC-CONFLICT-002 | correctness | high | 要件4, T-02, T-03 | must |
| 3 | TC-CONFLICT-003 | correctness | high | 要件3, T-01, T-03 | must |
| 4 | TC-CONFLICT-004 | correctness | high | 要件3, T-01, T-03 | must |
| 5 | TC-CONFLICT-005 | correctness | high | 要件1, T-01 | must |
| 6 | TC-CONFLICT-006 | correctness | high | 要件2, design D1, T-03 | must |
| 7 | TC-CONFLICT-007 | correctness | high | T-03 (makeHappyPathSpawn 更新), design D4 | must |
| 8 | TC-CONFLICT-008 | correctness | medium | 要件3, design D1 | should |
| 9 | TC-CONFLICT-009 | correctness | medium | design D1 (定数), T-01 | should |
| 10 | TC-CONFLICT-010 | architecture | medium | design D2, T-02 | should |
| 11 | TC-CONFLICT-011 | correctness | medium | design D2 (Phase 2 との相補性) | should |
| 12 | TC-CONFLICT-012 | correctness | low | design D1 (sleepFn DI) | could |

---

## TC-CONFLICT-001: mergeable=CONFLICTING → escalation、gh pr merge 未実行

- **Category**: correctness
- **Priority**: high
- **Source**: 要件2, 受け入れ基準1, T-01, T-03
- **must/should/could**: must

### Scenario

```
GIVEN: PR がオープン状態で awaiting-merge の job が存在する
  AND: spawn mock で `gh pr view <prNumber> --json mergeable` が `{ "mergeable": "CONFLICTING" }` を返す

WHEN: runFinishOrchestrator を実行する（Phase 3 に到達する）

THEN: result.ok === false
  AND: result.exitCode === 1
  AND: result.escalation にrebase を促すメッセージが含まれている
  AND: `gh pr merge` が呼ばれない（spawn calls に含まれない）
```

---

## TC-CONFLICT-002: mergeable=MERGEABLE → 通常通り merge 成功（happy path）

- **Category**: correctness
- **Priority**: high
- **Source**: 要件4, 受け入れ基準2, T-02, T-03
- **must/should/could**: must

### Scenario

```
GIVEN: PR がオープン状態で awaiting-merge の job が存在する
  AND: spawn mock で `gh pr view <prNumber> --json mergeable` が `{ "mergeable": "MERGEABLE" }` を返す
  AND: その他の spawn mock は happy path 通り

WHEN: runFinishOrchestrator を実行する

THEN: result.ok === true
  AND: result.exitCode === 0
  AND: `gh pr merge` が正常に呼ばれている
```

---

## TC-CONFLICT-003: mergeable=UNKNOWN → リトライ後 MERGEABLE → merge 成功

- **Category**: correctness
- **Priority**: high
- **Source**: 要件3, 受け入れ基準3, T-01, T-03
- **must/should/could**: must

### Scenario

```
GIVEN: PR がオープン状態で awaiting-merge の job が存在する
  AND: spawn mock で mergeable チェック 1 回目は `{ "mergeable": "UNKNOWN" }` を返す
  AND: spawn mock で mergeable チェック 2 回目は `{ "mergeable": "MERGEABLE" }` を返す
  AND: sleepFn は即座に resolve する test DI を使用する

WHEN: runFinishOrchestrator を実行する

THEN: result.ok === true
  AND: result.exitCode === 0
  AND: mergeable チェックが合計 2 回実行されている
  AND: sleepFn が MERGEABLE_RETRY_DELAY_MS (5000) で 1 回呼ばれている
  AND: `gh pr merge` が正常に呼ばれている
```

---

## TC-CONFLICT-004: mergeable=UNKNOWN × 3 回リトライ超過 → escalation

- **Category**: correctness
- **Priority**: high
- **Source**: 要件3, 受け入れ基準3, T-01, T-03
- **must/should/could**: must

### Scenario

```
GIVEN: PR がオープン状態で awaiting-merge の job が存在する
  AND: spawn mock で mergeable チェック全回が `{ "mergeable": "UNKNOWN" }` を返す（MERGEABLE_RETRY_COUNT = 3 回分）
  AND: sleepFn は即座に resolve する test DI を使用する

WHEN: runFinishOrchestrator を実行する

THEN: result.ok === false
  AND: result.exitCode === 1
  AND: result.escalation に UNKNOWN タイムアウトを示すメッセージが含まれている
  AND: mergeable チェックが合計 3 回実行されている
  AND: sleepFn が合計 2 回（リトライ間のみ）または 3 回呼ばれている
  AND: `gh pr merge` が呼ばれない
```

---

## TC-CONFLICT-005: gh pr view --json mergeable コマンド失敗 → escalation

- **Category**: correctness
- **Priority**: high
- **Source**: 要件1, design D1 ("gh pr view 失敗時は escalation"), T-01
- **must/should/could**: must

### Scenario

```
GIVEN: PR がオープン状態で awaiting-merge の job が存在する
  AND: spawn mock で `gh pr view <prNumber> --json mergeable` が非ゼロ exit code を返す

WHEN: runFinishOrchestrator を実行する（Phase 3 に到達する）

THEN: result.ok === false
  AND: result.exitCode === 1
  AND: result.escalation にエラーメッセージが含まれている
  AND: `gh pr merge` が呼ばれない
```

---

## TC-CONFLICT-006: CONFLICTING 時の escalation メッセージに baseBranch のrebase コマンド例が含まれる

- **Category**: correctness
- **Priority**: high
- **Source**: 要件2, design D1 ("`baseBranch` は escalation メッセージ内の rebase コマンド例に使用"), T-03
- **must/should/could**: must

### Scenario

```
GIVEN: PR がオープン状態で awaiting-merge の job が存在する
  AND: baseBranch が "main" である
  AND: spawn mock で mergeable チェックが `{ "mergeable": "CONFLICTING" }` を返す

WHEN: runFinishOrchestrator を実行する（Phase 3 に到達する）

THEN: result.escalation が "main" を含む rebase コマンド例（例: "git rebase origin/main"）を持っている
```

---

## TC-CONFLICT-007: makeHappyPathSpawn が --json mergeable クエリに MERGEABLE を返す（既存テスト非破壊）

- **Category**: correctness
- **Priority**: high
- **Source**: design D4 (リスク: 既存テスト破壊), T-03
- **must/should/could**: must

### Scenario

```
GIVEN: makeHappyPathSpawn ヘルパーを使用する既存の happy path テスト群

WHEN: Phase 3 の checkMergeableForMerge が `gh pr view <prNumber> --json mergeable` を呼ぶ

THEN: spawn mock が `{ "mergeable": "MERGEABLE" }` を返す
  AND: 既存の全 finish-orchestrator テストが regression なく pass する
```

---

## TC-CONFLICT-008: mergeable=UNKNOWN → UNKNOWN → MERGEABLE（2 回 UNKNOWN 後に成功）

- **Category**: correctness
- **Priority**: medium
- **Source**: 要件3, design D1
- **must/should/could**: should

### Scenario

```
GIVEN: PR がオープン状態で awaiting-merge の job が存在する
  AND: spawn mock で mergeable チェック 1・2 回目が `{ "mergeable": "UNKNOWN" }`、3 回目が `{ "mergeable": "MERGEABLE" }` を返す
  AND: sleepFn は即座に resolve する test DI を使用する

WHEN: runFinishOrchestrator を実行する

THEN: result.ok === true
  AND: result.exitCode === 0
  AND: mergeable チェックが合計 3 回実行されている
  AND: sleepFn が合計 2 回呼ばれている
  AND: `gh pr merge` が正常に呼ばれている
```

---

## TC-CONFLICT-009: MERGEABLE_RETRY_COUNT と MERGEABLE_RETRY_DELAY_MS の定数が正しく定義されている

- **Category**: correctness
- **Priority**: medium
- **Source**: design D1 ("module-level 定数"), T-01
- **must/should/could**: should

### Scenario

```
GIVEN: pr-status.ts の module-level 定数を参照する

WHEN: MERGEABLE_RETRY_COUNT と MERGEABLE_RETRY_DELAY_MS を確認する

THEN: MERGEABLE_RETRY_COUNT === 3
  AND: MERGEABLE_RETRY_DELAY_MS === 5000
  AND: 既存の UNKNOWN_RETRY_COUNT, POST_PUSH_RETRY_COUNT と同じ定義パターンに揃っている
```

---

## TC-CONFLICT-010: checkMergeableForMerge は gh pr merge args 構築より前に実行される

- **Category**: architecture
- **Priority**: medium
- **Source**: design D2 ("`const mergeArgs = ...` の前"), T-02
- **must/should/could**: should

### Scenario

```
GIVEN: orchestrator.ts の mergeFeaturePrPhase3 実装を参照する

WHEN: 関数内の処理順序を確認する

THEN: checkMergeableForMerge の呼び出しが `const mergeArgs = ...` の構築より前に記述されている
  AND: ok: false の場合は mergeArgs 構築に到達せず即 return している
```

---

## TC-CONFLICT-011: Phase 2 DIRTY ガードをすり抜けた後、Phase 3 で CONFLICTING を検出できる

- **Category**: correctness
- **Priority**: medium
- **Source**: design "Phase 2 DIRTY との相補性"（背景の gap 説明）
- **must/should/could**: should

### Scenario

```
GIVEN: Phase 2 の pollMergeStateAfterPush が MERGEABLE（DIRTY なし）で完了している
  AND: Phase 3 開始直前に base branch が更新されたシナリオを模倣する
  AND: spawn mock で Phase 3 の mergeable チェックが `{ "mergeable": "CONFLICTING" }` を返す

WHEN: runFinishOrchestrator を実行する

THEN: Phase 2 は正常に通過している（Phase 2 の DIRTY ガードは発動しない）
  AND: Phase 3 の checkMergeableForMerge が CONFLICTING を検出してエスカレーションする
  AND: result.ok === false、result.exitCode === 1
```

---

## TC-CONFLICT-012: sleepFn DI でリトライ間の待機が制御できる

- **Category**: correctness
- **Priority**: low
- **Source**: design D1 ("sleepFn はテスト用 DI"), T-01
- **must/should/could**: could

### Scenario

```
GIVEN: sleepFn として呼び出し履歴を記録するスパイ関数を渡す
  AND: spawn mock で mergeable チェック 1 回目が UNKNOWN、2 回目が MERGEABLE を返す

WHEN: checkMergeableForMerge を直接呼び出す

THEN: sleepFn が 1 回呼ばれている
  AND: sleepFn に渡された引数が MERGEABLE_RETRY_DELAY_MS (5000) である
  AND: デフォルト（sleepFn 省略時）は実際の setTimeout 相当の sleep が使われる（型確認）
```
