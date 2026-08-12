# Code Review Feedback — liveness-probe-jobid-scope — Iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 実装ファイル

**`src/core/resume/safety.ts`**

- Priority 2 ブロックを確認。`resolveJobPid` を import し、`SidecarContent` に変換後 `resolveJobPid({ statePid: null, sidecar, expectedJobId: state.jobId })` を呼ぶ実装になっている。
- `resolved.pid != null` → liveness probe、`resolved.pid == null`（jobId 不一致・欠落・pid 欠落）→ `true`（stale）に分岐。設計 D1 に忠実。
- `catch` ブロックは `return true`（stale）のまま変更なし。

**`src/cli/job-wait.ts`**

- `JobWaitDeps.readSidecarPid` の型が `SidecarContent | null` になっていることを確認。
- `realReadSidecarPid` が `{ pid, jobId }` を返すようになっていることを確認。
- poll ループの sidecar 解決箇所:
  ```typescript
  const sidecarRecord = statePid === null ? deps.readSidecarPid(sidecarAbs) : null;
  const sidecarPid = sidecarRecord !== null
    ? resolveJobPid({ statePid: null, sidecar: sidecarRecord, expectedJobId: currentState.jobId }).pid
    : null;
  ```
  `resolveJobPid` を経由した jobId 照合が行われており、不一致の pid は `sidecarPid = null` になる。`lastKnownPid` もこの `null` を伝播しない（`resolvedPid = statePid ?? sidecarPid ?? lastKnownPid` が既存の lastKnownPid に留まる）。

**`src/core/liveness/resolve-pid.ts`**

- 差分は `SidecarContent.jobId` を `string | null` から `string | null | undefined`（optional）に変更した 1 行のみ。
- `resolveJobPid` 本体は無変更。`sidecar.jobId === expectedJobId` の評価で `undefined === "any-id"` → false が成立するため、optional 化しても correctness は維持される。
- プロダクション実装（`realReadSidecarPid`、`safety.ts` の SidecarContent 構築）はいずれも `null` を返すため、プロダクション経路に影響なし。

### テストファイル

**`src/core/resume/__tests__/safety.test.ts`（新規）**

test-cases.md の isStaleRunning 対象 TC（TC-001、TC-002、TC-003、TC-007、TC-009、TC-010、TC-011、TC-012、TC-016）を全て実装していることを確認。`fs.readFileSync` をモックして I/O なしで動作。`ALIVE_PID = process.pid` を生存プロセスの代替として使用（妥当）。

**`src/cli/__tests__/job-wait.test.ts`（更新）**

- 既存の "sidecar pid resolution" describe ブロックのモック更新: `vi.fn(() => 54321)` → `vi.fn(() => ({ pid: 54321, jobId: "job-abc-0001" }))` に変更済み。`makeJobState` のデフォルト `jobId` が `"job-abc-0001"` なので一致。
- TC-004（一致 → 採用）、TC-005（不一致 → 不採用）、TC-006（jobId フィールドなし → 不採用）、TC-008（resolveJobPid 経由検証）、TC-013（realReadSidecarPid の返り型検証）を追加確認。

### Acceptance Criteria チェック

| 基準 | 確認結果 |
|------|----------|
| jobId 不一致 → 不採用（isStaleRunning・job wait） | ✅ TC-002, TC-005 |
| jobId 一致 → 採用（回帰なし） | ✅ TC-001, TC-004 |
| jobId 欠落 → 不採用 | ✅ TC-003, TC-006 |
| resolveJobPid に集約（並立実装なし） | ✅ 両経路とも直呼び、TC-007, TC-008 |
| 既存テスト原則無変更 | ✅ 変更は mock 型更新のみ（許容範囲） |
| typecheck && test が green | ✅ verification-result.md 全フェーズ passed |

### test-cases.md 全 TC 充足確認

| TC | 充足先 | Priority |
|----|--------|----------|
| TC-001 | safety.test.ts | must ✅ |
| TC-002 | safety.test.ts | must ✅ |
| TC-003 | safety.test.ts | must ✅ |
| TC-004 | job-wait.test.ts | must ✅ |
| TC-005 | job-wait.test.ts | must ✅ |
| TC-006 | job-wait.test.ts | must ✅ |
| TC-007 | safety.test.ts | must ✅ |
| TC-008 | job-wait.test.ts | must ✅ |
| TC-009 | safety.test.ts | must ✅ |
| TC-010 | safety.test.ts | must ✅ |
| TC-011 | safety.test.ts | must ✅ |
| TC-012 | safety.test.ts | must ✅ |
| TC-013 | job-wait.test.ts | must ✅ |
| TC-014 | verification (typecheck gate) | must ✅ |
| TC-015 | verification (test gate) | must ✅ |
| TC-016 | safety.test.ts | should ✅ |

## 検証できなかった項目

None。実装・テスト・verification 結果の全て確認済み。

## Findings 詳細

ブロッキング所見なし。

**情報: `SidecarContent.jobId` の optional 化**

`resolve-pid.ts` の interface を `jobId?: string | null` に変更した理由：TC-006 のテストモック `{ pid: 9999 }` が jobId フィールドを省略するため。`resolveJobPid` は `sidecar.jobId === expectedJobId` で評価するため `undefined` は正しく不採用になる。プロダクション実装は `null` を返すので挙動変化なし。代替として `{ pid: 9999, jobId: null }` とモックする手もあったが、legacy sidecar（フィールド自体が欠落）の実態再現という観点では optional 化の方が自然であり、支障なし。
