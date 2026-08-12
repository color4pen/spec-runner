# Conformance Result — liveness-probe-jobid-scope — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### J1: request.md 受け入れ基準

| 基準 | 結果 | 根拠 |
|------|------|------|
| jobId 不一致の sidecar pid が生存判定に採用されない（両経路） | ✓ | safety.test.ts TC-002 / job-wait.test.ts TC-005 |
| jobId 一致の sidecar pid は従来どおり採用される（回帰なし） | ✓ | safety.test.ts TC-001 / job-wait.test.ts TC-004 |
| jobId フィールド欠落の sidecar は pid 無しと同分岐 | ✓ | safety.test.ts TC-003 / job-wait.test.ts TC-006 |
| sidecar pid 採用判定が resolveJobPid に集約 | ✓ | safety.ts:58、job-wait.ts:220 で resolveJobPid 直接呼び出し。並立実装なし |
| 既存テストは原則無変更（許容更新のみ） | ✓ | "sidecar pid resolution" describe の mock のみ SidecarContent に更新。他は無変更 |
| typecheck && test green | ✓ | verification-result.md: typecheck passed、test passed |

### J2: design.md 設計判断

**D1 — isStaleRunning が resolveJobPid を使う**

`src/core/resume/safety.ts` Priority 2 ブロック（49-67行）:
- `SidecarContent` を構築し `resolveJobPid({ statePid: null, sidecar: sidecarContent, expectedJobId: state.jobId })` を呼ぶ
- `resolved.pid != null` → `!isProcessAlive(resolved.pid)`
- `resolved.pid == null` → `return true`（stale）— 設計どおり ✓

**D2 — readSidecarPid を SidecarContent | null に変更し poll ループで resolveJobPid を呼ぶ**

`src/cli/job-wait.ts`:
- インターフェース（49行）: `readSidecarPid: (sidecarAbsPath: string) => SidecarContent | null` ✓
- `realReadSidecarPid`（107-118行）: `{ pid, jobId }` を返す（同期版、readFileSync 使用）✓
- poll ループ（218-221行）: sidecarRecord を取得後 `resolveJobPid(...)` を呼び、`resolved.pid` を sidecarPid として使用 ✓

**D3 — jobId 欠落 sidecar は不一致と同じ扱い**

`resolveJobPid` の条件 `sidecar.jobId === expectedJobId`:
- `null === "id"` → false → pid 不採用 ✓
- `undefined === "id"` → false → pid 不採用 ✓

なお `resolve-pid.ts` の 1 行差分: `SidecarContent.jobId` を `string | null` → `string | null` (optional) に変更。テストの `{ pid: 9999 }` 形式 mock が型適合するための変更。実運用の `realReadSidecarPid` は常に `jobId: string | null` を返すため挙動変化なし ✓

### J3: tasks.md タスク完了確認

全チェックボックス `[x]` を実装コードと照合:

| Task | チェック | 実装確認 |
|------|---------|---------|
| T-01: isStaleRunning に jobId 照合追加 | [x] | safety.ts 3行目 import、49-67行 Priority 2 書き換え ✓ |
| T-02: job wait sidecar pid に jobId 照合追加 | [x] | job-wait.ts 49行（型）、107-118行（realReadSidecarPid）、218-221行（poll ループ）✓ |
| T-03: isStaleRunning unit テスト新規作成 | [x] | safety.test.ts 新規、TC-001〜TC-016（S01-S07 全件）実装 ✓ |
| T-04: job wait sidecar jobId 照合 unit テスト追加 | [x] | job-wait.test.ts に TC-004〜TC-006、TC-008、TC-013 追加。"sidecar pid resolution" mock 更新 ✓ |
| T-05: typecheck && test green | [x] | verification-result.md: build/typecheck/test/lint 全 passed ✓ |

### J4: spec.md 要件適合

**Requirement: isStaleRunning は jobId 一致の sidecar pid のみ生存証拠として採用する**

| Scenario | 実装 | テスト |
|----------|------|-------|
| jobId 一致・生存中 → false | resolveJobPid で pid 採用 → `!isProcessAlive` → false | TC-001 ✓ |
| jobId 不一致 → true（プロセス生死不問） | resolveJobPid → pid null → return true | TC-002 ✓ |
| jobId フィールドなし → true | null === "job-A" → false → pid null → return true | TC-003 ✓ |

**Requirement: job wait の sidecar pid 採用も jobId 照合を要求する**

| Scenario | 実装 | テスト |
|----------|------|-------|
| jobId 一致・生存中 → pid 採用・待機継続 | resolveJobPid.pid = 5678 → isProcessAlive(5678) | TC-004 ✓ |
| jobId 不一致 → no-pid パス | resolveJobPid.pid = null → sidecarPid = null | TC-005 ✓ |
| jobId なし（legacy）→ no-pid パス | undefined === "job-abc-0001" → false | TC-006 ✓ |

**Requirement: sidecar pid 採用判定を resolveJobPid に集約する**

| Scenario | 実装 | テスト |
|----------|------|-------|
| isStaleRunning が resolveJobPid 経由 | safety.ts:58 直接呼び出し | TC-007 ✓ |
| job wait が resolveJobPid 経由 | job-wait.ts:220 直接呼び出し | TC-008 ✓ |

並立実装の不在を確認: `sidecar["jobId"] === jobId` 等の inline 比較はコードベースに存在しない ✓

## 検証できなかった項目

None

## Findings 詳細

None
