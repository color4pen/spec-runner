# Test Cases: finish-phase3-retry-expand

## 凡例

- **Priority**: must / should / could
- **Source**: tasks.md のタスク番号 or request.md / design.md の判断
- **Category**: Transient-Retry / Permanent-Error / Regression / Edge-Case / Build

---

## Category: Transient-Retry — 新規パターンが retry されること

### TC-001: `Pull Request is not mergeable` → retry → 成功

- **Priority**: must
- **Source**: T-02, T-03 (TC-PM-016 書き換え + TC-PM-019)
- **GIVEN** `mergePullRequest()` を呼び出す
- **WHEN** 1 回目の merge API が 405 `"Pull Request is not mergeable"` を返し、2 回目が 200 merged を返す
- **THEN** 戻り値は `{ merged: true }` であり、fetch が 2 回呼ばれる

---

### TC-002: `Pull Request is not mergeable` (小文字 r) → retry → 成功

- **Priority**: must
- **Source**: design.md D2 (lowercase 両方対応)
- **GIVEN** `mergePullRequest()` を呼び出す
- **WHEN** 1 回目の merge API が 405 `"Pull request is not mergeable"` (小文字 r) を返し、2 回目が 200 merged を返す
- **THEN** 戻り値は `{ merged: true }` であり、fetch が 2 回呼ばれる

---

### TC-003: `Head branch was modified` → retry → 成功

- **Priority**: must
- **Source**: T-03 (TC-PM-017)
- **GIVEN** `mergePullRequest()` を呼び出す
- **WHEN** 1 回目の merge API が 405 `"Head branch was modified. Review and try the merge again."` を返し、2 回目が 200 merged を返す
- **THEN** 戻り値は `{ merged: true }` であり、fetch が 2 回呼ばれる

---

### TC-004: `Required status check` → retry → 成功

- **Priority**: must
- **Source**: T-03 (TC-PM-018)
- **GIVEN** `mergePullRequest()` を呼び出す
- **WHEN** 1 回目の merge API が 405 `"Required status check \"ci/build\" is expected"` を返し、2 回目が 200 merged を返す
- **THEN** 戻り値は `{ merged: true }` であり、fetch が 2 回呼ばれる

---

### TC-005: `Pull Request is not mergeable` × 4 → retry 上限到達 → 失敗

- **Priority**: must
- **Source**: T-03 (TC-PM-019), design.md D4 (maxAttempts: 4)
- **GIVEN** `mergePullRequest()` を呼び出す
- **WHEN** 4 回すべて 405 `"Pull Request is not mergeable"` を返す
- **THEN** 戻り値は `{ merged: false }` であり、fetch がちょうど 4 回呼ばれる

---

### TC-006: `Head branch was modified` × 4 → retry 上限到達 → 失敗

- **Priority**: should
- **Source**: design.md D4 (maxAttempts: 4), T-03 analogous
- **GIVEN** `mergePullRequest()` を呼び出す
- **WHEN** 4 回すべて 405 `"Head branch was modified."` を返す
- **THEN** 戻り値は `{ merged: false }` であり、fetch がちょうど 4 回呼ばれる

---

### TC-007: `Required status check` × 4 → retry 上限到達 → 失敗

- **Priority**: should
- **Source**: design.md D4 (maxAttempts: 4), T-03 analogous
- **GIVEN** `mergePullRequest()` を呼び出す
- **WHEN** 4 回すべて 405 `"Required status check \"ci/build\" is expected"` を返す
- **THEN** 戻り値は `{ merged: false }` であり、fetch がちょうど 4 回呼ばれる

---

## Category: Permanent-Error — 永続エラーは retry しないこと

### TC-101: 403 permission denied → no retry

- **Priority**: must
- **Source**: request.md 受け入れ基準 (永続エラーは escalation), T-04 対応
- **GIVEN** `mergePullRequest()` を呼び出す
- **WHEN** merge API が 403 `"Forbidden"` を返す
- **THEN** 戻り値は `{ merged: false }` で message が `"permission denied"` を含み、fetch は 1 回のみ呼ばれる

---

### TC-102: 409 merge conflict → no retry

- **Priority**: must
- **Source**: request.md 受け入れ基準, design.md D5
- **GIVEN** `mergePullRequest()` を呼び出す
- **WHEN** merge API が 409 `"Merge conflict"` を返す
- **THEN** 戻り値は `{ merged: false }` であり、fetch は 1 回のみ呼ばれる

---

### TC-103: 405 `"Merge not allowed"` → no retry

- **Priority**: should
- **Source**: design.md D5 (other non-transient 405 は retry しない)
- **GIVEN** `mergePullRequest()` を呼び出す
- **WHEN** merge API が 405 `"Merge not allowed"` を返す
- **THEN** 戻り値は `{ merged: false }` であり、fetch は 1 回のみ呼ばれる

---

## Category: Regression — 既存 transient retry に変化がないこと

### TC-201: `Base branch was modified` → retry → 成功 (regression)

- **Priority**: must
- **Source**: T-04 (TC-PM-010 regression), request.md 受け入れ基準
- **GIVEN** `mergePullRequest()` を呼び出す
- **WHEN** 1 回目の merge API が 405 `"Base branch was modified. Review and try the merge again."` を返し、2 回目が 200 merged を返す
- **THEN** 戻り値は `{ merged: true }` であり、fetch が 2 回呼ばれる

---

### TC-202: `unstable state` → retry → 成功 (regression)

- **Priority**: must
- **Source**: T-04 (TC-PM-011 regression)
- **GIVEN** `mergePullRequest()` を呼び出す
- **WHEN** 1 回目の merge API が 405 `"Repository is in an unstable state. Please wait and try again."` を返し、2 回目が 200 merged を返す
- **THEN** 戻り値は `{ merged: true }` であり、fetch が 2 回呼ばれる

---

### TC-203: 423 Locked → retry → 成功 (regression)

- **Priority**: must
- **Source**: T-04 (TC-PM-012 regression)
- **GIVEN** `mergePullRequest()` を呼び出す
- **WHEN** 1 回目の merge API が 423 を返し、2 回目が 200 merged を返す
- **THEN** 戻り値は `{ merged: true }` であり、fetch が 2 回呼ばれる

---

### TC-204: `Base branch was modified` × 4 → retry 上限到達 → 失敗 (regression)

- **Priority**: must
- **Source**: T-04 (TC-PM-013 regression)
- **GIVEN** `mergePullRequest()` を呼び出す
- **WHEN** 4 回すべて 405 `"Base branch was modified."` を返す
- **THEN** 戻り値は `{ merged: false }` で message が `"Base branch was modified"` を含み、fetch がちょうど 4 回呼ばれる

---

## Category: Edge-Case — 境界条件

### TC-301: メッセージ大文字/小文字混在でも transient 判定される

- **Priority**: should
- **Source**: design.md D2 (`.toLowerCase()` 済み)
- **GIVEN** `mergePullRequest()` を呼び出す
- **WHEN** 1 回目の merge API が 405 `"NOT MERGEABLE"` を返し、2 回目が 200 merged を返す
- **THEN** 戻り値は `{ merged: true }` であり、fetch が 2 回呼ばれる（大文字でも `"not mergeable"` の部分一致で retry される）

---

### TC-302: `merged: true` の場合は transient retry が起動しない

- **Priority**: should
- **Source**: design.md D1 (`if (result.merged) return false`)
- **GIVEN** `mergePullRequest()` を呼び出す
- **WHEN** merge API が 200 `{ merged: true, message: "not mergeable" }` を返す（矛盾した応答）
- **THEN** 戻り値は `{ merged: true }` であり、fetch は 1 回のみ呼ばれる（retry しない）

---

### TC-303: 新旧 transient パターンが互いに干渉しない

- **Priority**: should
- **Source**: design.md D3 (既存パターンとの重複・干渉なし)
- **GIVEN** `isMergeTransientFailure()` に `"base branch was modified"` を含むメッセージを渡す
- **WHEN** 追加された 3 パターン (`"not mergeable"`, `"head branch was modified"`, `"required status check"`) のいずれにも部分一致しないメッセージを与える
- **THEN** それぞれ独立して `true` / `false` が返り、他パターンの結果に影響しない

---

## Category: Build — typecheck + test green

### TC-401: TypeScript typecheck が pass する

- **Priority**: must
- **Source**: T-05, request.md 受け入れ基準
- **GIVEN** `isMergeTransientFailure()` に 3 パターンを追加した状態
- **WHEN** `bun run typecheck` を実行する
- **THEN** エラーなしで終了する

---

### TC-402: `bun run test` が全件 pass する

- **Priority**: must
- **Source**: T-05, request.md 受け入れ基準
- **GIVEN** T-01〜T-03 の変更が適用された状態
- **WHEN** `bun run test` を実行する
- **THEN** TC-PM-010〜019 を含む全テストが pass する

---

## カバレッジサマリー

| request.md 受け入れ基準 | 対応 TC |
|---|---|
| Phase 3 で「Pull Request is not mergeable」が transient として retry される | TC-001, TC-002, TC-005 |
| GitHub API 5xx / timeout は `request()` 層の retry で十分 (Phase 3 追加不要を確認) | design.md D6 に文書化済み、実装変更なし |
| 永続的 error (repo archived / 権限不足) は retry せず escalation | TC-101, TC-102, TC-103 |
| 既存の「Base branch was modified」retry に regression なし | TC-201, TC-204 |
| `bun run typecheck && bun run test` が green | TC-401, TC-402 |
