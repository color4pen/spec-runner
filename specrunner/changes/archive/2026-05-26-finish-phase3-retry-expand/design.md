# Design: finish-phase3-retry-expand

## 背景

PR #398 (merge-transient-retry) で Phase 3 merge の transient retry を導入済。対象は `"Base branch was modified"` / `"unstable state"` / 423 Locked の 3 パターン。

しかし `"Pull Request is not mergeable"` は permanent 扱いのまま残っていた。Phase 2 push 直後に Phase 3 merge を試行すると GitHub のメタデータ再計算が間に合わず、この 405 メッセージで fail するケースが発生。手動再実行で成功するため、transient として retry すべき。

## 設計判断

### D1: `isMergeTransientFailure()` の pattern matching を拡充するだけ

**理由**: PR #398 で `retryWithBackoff` + `isMergeTransientFailure` + `shouldRetryResult` の retry infrastructure は完成している。変更は `isMergeTransientFailure()` 関数内のパターンマッチング条件を追加するだけ。新規の仕組みは不要。

**変更箇所**: `src/adapter/github/github-client.ts` の `isMergeTransientFailure()` 関数 1 箇所のみ。

### D2: 追加する transient パターン 3 件

| pattern (message.toLowerCase()) | HTTP status | GitHub の原因 |
|---|---|---|
| `"not mergeable"` | 405 | メタデータ再計算待ち（Phase 2 push 直後に頻発） |
| `"head branch was modified"` | 405 | push と merge の race condition |
| `"required status check"` | 405 | CI 完了待ち |

**部分一致 (`msg.includes()`)** で判定。既存パターンと同じ方式。

`"not mergeable"` は `"Pull Request is not mergeable"` の部分一致で拾える。GitHub API のメッセージ表記が `"Pull request is not mergeable"` (小文字 r) と `"Pull Request is not mergeable"` (大文字 R) の両方あり得るが、`.toLowerCase()` 済みなので問題なし。

### D3: 既存パターンとの重複・干渉なし

既存 transient パターン:
- `"base branch was modified"` — 維持
- `"unstable state"` — 維持
- `"locked"` — 維持（423 Locked 用）

追加パターンは既存のいずれとも部分一致しない。OR 条件の追加なので既存パターンの振る舞いに影響なし。

### D4: retry 回数・backoff は変更なし

既存の設定 (`maxAttempts: 4` = 初回 + retry 3 回、`baseDelayMs: 1000` = 1s → 2s → 4s) はそのまま。Phase 2 push 後の GitHub メタデータ再計算は数秒〜十数秒なので、最大 ~7s (1+2+4) の retry window で十分吸収可能。

### D5: permanent error は変わらず retry しない

以下は引き続き `isMergeTransientFailure()` が `false` を返し、retry せず即座に結果を返す:
- 403 → `"permission denied"` (message 内に transient keyword が含まれない)
- 409 → `"Merge not allowed"` / `"Merge conflict"` (同上)
- repo archived / token 権限不足 → 403 or 別エラー

### D6: GitHub API 5xx / timeout は対象外

`request()` 層で最大 3 回の exponential backoff retry 済。`mergePullRequest()` の `attemptMerge()` 内で `this.request()` を呼ぶため、5xx は `request()` 層で吸収される。二重 retry は発生しない。

## 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/adapter/github/github-client.ts` | `isMergeTransientFailure()` に 3 パターン追加 |
| `tests/unit/adapter/github/github-client-pr.test.ts` | 追加パターンの retry テスト + 既存 TC-PM-016 の期待値変更 |

## 変更しないファイル

- `src/util/retry.ts` — 変更なし（既存 infrastructure をそのまま使う）
- `src/core/port/github-client.ts` — port interface 変更なし
- `src/core/finish/orchestrator.ts` — adapter 内で吸収するため変更不要
- `src/core/finish/pr-status.ts` — Phase 0 / Phase 2 polling は本 request のスコープ外
