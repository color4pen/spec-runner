# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション照合（全 5 件）

| 主張 | 確認結果 |
|---|---|
| `src/core/resume/safety.ts:49-62` — Priority 2 が sidecar `pid` を jobId 照合なしに読む | ✅ 確認。lines 49-62 に `sidecar["pid"]` を読む処理があり `jobId` フィールドを参照していない |
| `src/cli/job-wait.ts:106-116` — `realReadSidecarPid` が `jobId` を見ていない | ✅ 確認。lines 106-116 の関数は `sidecar["pid"]` のみ返す |
| `src/core/liveness/resolve-pid.ts:60-80` — `resolveJobPid` が `sidecar.jobId === expectedJobId` 照合を持つ純関数 | ✅ 確認。lines 68-80 に正確な照合実装あり |
| `src/core/runtime/local.ts:1445` — sidecar record は `{ pid, session, worktreePath, jobId }` | ✅ 確認。line 1445: `const record: SidecarRecord = { pid, session: null, worktreePath, jobId }` |
| `src/core/runtime/local.ts:258` — worktreePath 解決で `sidecar["jobId"] === jobId` を照合済み | ✅ 確認。line 258 に正確な照合コードあり |

### 架け橋の整合性確認

- `architecture/divergence-status.md` line 11: 本 request が修正対象とする divergence（生存判定が jobId 非照合）が既知 divergence として明記済みを確認
- `architecture/dynamic-model.md` line 48: 「sidecar は自 jobId 一致時のみ fallback」という所有規則が `resolveJobPid` を正典として記載済みを確認
- `src/state/schema/types.ts`: `JobState` は `jobId: string`（line 403）と `pid?: number | null`（line 440）を持つことを確認 — `isStaleRunning` は `state.jobId` を通じて期待 jobId にアクセス可能

### 既存テスト確認

- `src/cli/__tests__/job-wait.test.ts` line 696-724: sidecar pid resolution のテストが jobId 照合なしの現挙動を固定していることを確認（request の「期待値更新を許容する」対象）
- `isStaleRunning` の専用テストファイルは存在しないことを確認（`safety.test.ts` 不在）

### 設計検討: 純関数共有の実現可能性

`resolveJobPid` は sync 純関数（I/O なし、`SidecarContent | null` を引数で受け取る）。
一方 `isStaleRunning` は `fs.readFileSync`（同期 I/O）、`readLivenessSidecar` は async I/O を使う。
I/O レイヤーは分かれるが **純関数 `resolveJobPid` でジャッジ部を共有する**設計は成立する。
acceptance criteria の「同一実装/共通純関数に集約」はこの構成で満たせる（I/O ラッパーの分岐は許容範囲）。

## 検証できなかった項目

None。コードアサーション全件・アーキテクチャ参照・既存テスト構造を実ファイルで確認済み。

## Findings 詳細

指摘なし。
