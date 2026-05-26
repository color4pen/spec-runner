# Test Cases: worktree-retry-branch-fix

## 凡例

| フィールド | 値の例 |
|---|---|
| Category | unit / integration |
| Priority | must / should / could |
| Source | tasks.md / design.md / request.md |

---

## TC-WTM-013: lock contention → branch 存在 → `-b` なし retry で成功

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md (Task 1, Task 3), request.md (受け入れ基準 1)

```
GIVEN branchName が指定された worktree add
  AND 1 回目の git worktree add が lock contention で exit 128 になる
  AND git rev-parse --verify refs/heads/<branchName> が exit 0 を返す（branch は既に作成済み）
WHEN manager.create() が retry を実行する
THEN 2 回目の git worktree add は -b を含まない
 AND 2 回目の引数末尾は <branchName> である（既存 branch を使った checkout）
 AND 最終的に worktree path を返す（成功）
 AND git branch -D は呼ばれない
```

---

## TC-WTM-014: lock contention → branch 未存在 → `-b` 付き retry で成功

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md (Task 1, Task 3), design.md (retry 前の branch 存在チェック)

```
GIVEN branchName が指定された worktree add
  AND 1 回目の git worktree add が lock contention で exit 128 になる
  AND git rev-parse --verify refs/heads/<branchName> が exit 非 0 を返す（branch は未作成）
WHEN manager.create() が retry を実行する
THEN 2 回目の git worktree add は -b を含む
 AND 最終的に worktree path を返す（成功）
 AND git branch -D は呼ばれない
```

---

## TC-WTM-015: 全 retry 失敗 → branch cleanup 呼び出し

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md (Task 2, Task 3), request.md (受け入れ基準 2)

```
GIVEN branchName が指定された worktree add
  AND MAX_RETRIES（3回）すべてが lock contention で失敗する
  AND 各 retry 前の rev-parse の結果は任意
WHEN manager.create() が全 retry 消費後に throw する
THEN git branch -D <branchName> が呼ばれる
 AND "git worktree add failed" を含む Error がスローされる
```

---

## TC-WTM-016: `--detach` モードで全 retry 失敗 → branch cleanup なし

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md (Task 3), design.md (cleanup 対象は branchName 指定時のみ)

```
GIVEN branchName が指定されていない（--detach モード）
  AND MAX_RETRIES（3回）すべてが lock contention で失敗する
WHEN manager.create() が全 retry 消費後に throw する
THEN git branch -D は一切呼ばれない
 AND "git worktree add failed" を含む Error がスローされる
```

---

## TC-WTM-017: lock contention → branch cleanup 失敗でも元の Error を throw する

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md (Task 2), design.md (cleanup の失敗は無視)

```
GIVEN branchName が指定された worktree add
  AND MAX_RETRIES（3回）すべてが lock contention で失敗する
  AND git branch -D が exit 非 0 を返す（branch が既に消えている等）
WHEN manager.create() が cleanup を試みる
THEN cleanup の失敗は握りつぶされ、propagate されない
 AND "git worktree add failed" を含む元の Error がスローされる
```

---

## TC-WTM-018: lock contention 2 回 → 3 回目で成功（branch 存在チェックが複数回走る）

- **Category**: unit
- **Priority**: should
- **Source**: design.md (retry loop 内で branch 存在チェック), request.md (MAX_RETRIES = 3)

```
GIVEN branchName が指定された worktree add
  AND 1 回目: lock contention fail, rev-parse exit 0（branch 存在）
  AND 2 回目: -b なしで試みるが lock contention fail, rev-parse exit 0（branch 存在）
  AND 3 回目: -b なしで成功
WHEN manager.create() が retry を繰り返す
THEN rev-parse は 2 回呼ばれる（attempt 1 後と attempt 2 後）
 AND 3 回目の worktree add に -b は含まれない
 AND 最終的に worktree path を返す（成功）
 AND git branch -D は呼ばれない
```

---

## TC-WTM-019: branchName なし（--detach）で lock contention retry — rev-parse もスキップ

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md (Task 1 注意書き「branchName が undefined の場合はチェック自体をスキップ」)

```
GIVEN branchName が指定されていない（--detach モード）
  AND 1 回目の git worktree add が lock contention で失敗する
  AND 2 回目の git worktree add が成功する
WHEN manager.create() が retry を実行する
THEN git rev-parse は呼ばれない
 AND 2 回目の git worktree add は --detach を含む
 AND 最終的に worktree path を返す（成功）
```

---

## TC-WTM-020: lock contention 後に branch 存在チェックし、その後 non-lock エラー → 即 throw

- **Category**: unit
- **Priority**: could
- **Source**: design.md (isLockContention 判定ロジック), manager.ts 既存挙動

```
GIVEN branchName が指定された worktree add
  AND 1 回目: lock contention fail, rev-parse exit 非 0（branch 未存在）
  AND 2 回目（retry）: lock contention ではない別エラー（e.g. "fatal: worktree already exists"）
WHEN manager.create() が 2 回目のエラーを受け取る
THEN lock contention 以外のエラーなので即座に throw する
 AND sleepFn は 1 回のみ呼ばれる（attempt 1 後）
 AND git branch -D が呼ばれる（branchName が指定されているため）
```

---

## TC-WTM-021: regression — 既存の単独 run（lock contention なし）に影響なし

- **Category**: unit
- **Priority**: must
- **Source**: request.md (受け入れ基準 3「既存の単独 run に regression なし」)

```
GIVEN branchName が指定された worktree add
  AND git worktree add が 1 回目で成功する（lock contention なし）
WHEN manager.create() を呼ぶ
THEN git rev-parse は呼ばれない
 AND git branch -D は呼ばれない
 AND bun install が続けて呼ばれる
 AND 最終的に worktree path を返す
```

---

## TC-WTM-022: regression — --detach 単独 run（lock contention なし）に影響なし

- **Category**: unit
- **Priority**: must
- **Source**: request.md (受け入れ基準 3), TC-WTM-001 の継続保証

```
GIVEN branchName が指定されていない（--detach モード）
  AND git worktree add が 1 回目で成功する
WHEN manager.create() を呼ぶ
THEN git rev-parse は呼ばれない
 AND git branch -D は呼ばれない
 AND bun install が続けて呼ばれる
 AND 最終的に worktree path を返す
```

---

## TC-WTM-023: typecheck + test suite が全て green

- **Category**: integration
- **Priority**: must
- **Source**: request.md (受け入れ基準 6「bun run typecheck && bun run test が green」)

```
GIVEN 上記 Task 1〜3 の実装が完了した状態
WHEN bun run typecheck && bun run test を実行する
THEN TypeScript コンパイルエラーが 0 件
 AND TC-WTM-001〜TC-WTM-023 の全テストが pass する
 AND 既存テスト TC-WTM-001〜TC-WTM-012 も含め regression が 0 件
```
