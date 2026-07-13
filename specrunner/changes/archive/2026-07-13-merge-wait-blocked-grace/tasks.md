# Tasks: merge-wait blocked grace

## T-01: 定数とグレース変数を追加する

対象ファイル: `src/core/archive/merge-then-archive.ts`

- [x] `NONE_CHECK_GRACE_MS` の定義の直後（L46 付近）に `const BLOCKED_CHECK_GRACE_MS = 30_000;` を追加する。JSDoc に「Grace period (ms) to allow mergeStateStatus to transition from BLOCKED to CLEAN after checks succeed. GitHub's mergeStateStatus sometimes lags behind check resolution by a few seconds. Not configurable.」を記載する。
- [x] merge-wait loop 直前（`let noneGraceStart: number | null = null;` の直後、L303 付近）に `let blockedGraceStart: number | null = null;` を追加する。JSDoc に「Set-once timestamp (ms) of the first "success+BLOCKED" observation. Never reset.」を記載する。
- [x] ファイル冒頭のフロー説明コメント（L1-23）の wait loop 箇条書きを更新する。`BLOCKED + success/none checks → branch-protection escalation` の行を `BLOCKED + success checks → grace wait (BLOCKED_CHECK_GRACE_MS); if exhausted → branch-protection escalation` に修正する。

**Acceptance Criteria**:
- `BLOCKED_CHECK_GRACE_MS` が `30_000` で定数定義されている。
- `blockedGraceStart` が `null` で初期化されている（`noneGraceStart` の直後）。
- フロー説明コメントが実装と整合している。

## T-02: `success && BLOCKED` の即 escalation を grace ループに置き換える

対象ファイル: `src/core/archive/merge-then-archive.ts`

現行コード（L422-426）:
```typescript
if (rollup.state === "success") {
  if (isBlocked) {
    // Checks resolved but PR is still BLOCKED — a non-check branch-protection requirement is unmet.
    return blockedAfterChecksEscalation(slug, "success");
  }
  // Checks are green — proceed to merge
  stdoutWrite(`PR #${prNumber} checks passed. Proceeding to merge...`);
  break;
}
```

置き換え後のロジック（疑似コード）:
```
if (rollup.state === "success") {
  if (isBlocked) {
    const now = nowFn();
    if (blockedGraceStart === null) {
      blockedGraceStart = now;
    }
    const elapsed = now - blockedGraceStart;
    if (elapsed >= BLOCKED_CHECK_GRACE_MS) {
      // Grace exhausted: treat as genuine branch-protection requirement unmet.
      return blockedAfterChecksEscalation(slug, "success");
    }
    // Grace still running: mergeStateStatus may be transiently BLOCKED after CI resolved.
    stdoutWrite(`PR #${prNumber} checks success but mergeStateStatus BLOCKED (${Math.round(elapsed / 1000)}s / ${BLOCKED_CHECK_GRACE_MS / 1000}s grace). Waiting ${pollIntervalMs / 1000}s...`);
    await sleepFn(pollIntervalMs);
    continue;
  }
  // Checks are green and not blocked — proceed to merge.
  stdoutWrite(`PR #${prNumber} checks passed. Proceeding to merge...`);
  break;
}
```

- [x] 上記疑似コードに従って L422-430 を書き換える。
- [x] `blockedGraceStart` の set-once セマンティクスを保つ（`if (blockedGraceStart === null)` のガードを必ず入れる）。
- [x] `sleepFn` と `continue` の位置が `noneGraceStart` の grace パス（L455-456）と対称になっていることを確認する。

**Acceptance Criteria**:
- `success && BLOCKED && grace not expired` のとき `sleepFn` して loop が続く。
- `success && BLOCKED && grace expired` のとき `blockedAfterChecksEscalation` が返る。
- `success && !BLOCKED` のとき `break` して merge へ進む（既存動作）。
- `blockedGraceStart` は最初の `success && BLOCKED` 観測でのみセットされ、以降はリセットされない。

## T-03: テストを追加する（merge-wait blocked grace）

対象ファイル: `src/core/archive/__tests__/merge-then-archive.test.ts`

既存のテストスイートに `describe("merge-then-archive — blocked-grace wait loop", ...)` ブロックを追加する。以下の各テストケースを実装する。

**テストのセットアップ方針**:
- `sleepFn: noopSleep`（`() => Promise.resolve()`）で sleep をスキップ。
- `nowFn` を制御して grace の経過時間をシミュレートする。
- `JobStateStore.list` は `makeState({ status: "awaiting-archive" })` を返す。
- `runArchiveOrchestrator` は `{ exitCode: 0, headSha: "abc1234" }` を返す（archive 完了済み想定）。

**テストケース**:

- [x] **TBG-01**: `success + BLOCKED → 次の poll で CLEAN → merge へ進む`
  - getPullRequest が 1 回目 `mergeStateStatus: "BLOCKED"`、2 回目 `mergeStateStatus: "CLEAN"` を返す。
  - `nowFn` は常に 0 を返す（grace 未満）。
  - `getCheckStatus` は常に `{ state: "success", ... }` を返す。
  - `mergePullRequest` が呼ばれること、`exitCode: 0` になることを検証。
  - `blockedAfterChecksEscalation` 相当の escalation が返らないことを検証。

- [x] **TBG-02**: `success + BLOCKED → grace 超過後も BLOCKED → branch-protection escalation`
  - getPullRequest は常に `mergeStateStatus: "BLOCKED"` を返す。
  - `nowFn` は呼ばれるたびに単調増加し、2 回目以降の `success && BLOCKED` チェック時に `BLOCKED_CHECK_GRACE_MS` を超えた値を返す（例: 1 回目 = 0, 2 回目 = 31_000）。
  - `getCheckStatus` は常に `{ state: "success", ... }` を返す。
  - `exitCode: 1` かつ escalation に `"merge gate (branch protection)"` が含まれること、`mergePullRequest` が呼ばれないことを検証。

- [x] **TBG-03**: 既存の conflict escalation が不変であること（regression）
  - getPullRequest が `mergeStateStatus: "DIRTY"` を返す。
  - `exitCode: 1` かつ escalation に `"merge gate (conflict)"` が含まれること。

- [x] **TBG-04**: 既存の check failure escalation が不変であること（regression）
  - getPullRequest が `mergeStateStatus: "CLEAN"` を返す。
  - `getCheckStatus` が `{ state: "failure", failing: ["ci/test"], ... }` を返す。
  - `exitCode: 1` かつ escalation に `"check status (failed checks)"` が含まれること。

- [x] **TBG-05**: 既存の none-check grace パスが不変であること（regression）
  - getPullRequest が `mergeStateStatus: "CLEAN"` を返す。
  - `getCheckStatus` が最初は `{ state: "none", ... }`、NONE_CHECK_GRACE_MS を超えたあとも `"none"` を返す。
  - `nowFn` で none grace を超過させる。
  - `exitCode: 0`（CI なしリポジトリとして merge へ進む）を検証。

**Acceptance Criteria**:
- TBG-01〜05 が全て pass する。
- 新しいテストは `describe("merge-then-archive — blocked-grace wait loop", ...)` ブロック内に収める。
- `nowFn` と `sleepFn` を適切に注入し、実際の時間経過に依存しない。

## T-04: 型チェックとテスト実行

- [x] `bun run typecheck` が green であること。
- [x] `bun run test` が green であること（既存テスト含む）。

**Acceptance Criteria**:
- TypeScript 型エラーなし。
- vitest 全テスト pass。
