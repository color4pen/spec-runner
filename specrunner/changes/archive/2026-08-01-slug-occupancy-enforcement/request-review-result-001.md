# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション（現状コードの前提）全 13 件確認

| # | アサーション | 確認結果 |
|---|------------|--------|
| 1 | `src/core/runtime/duplicate-slug-guard.ts:40-84` — pid 生存のみ検査、fail-open | ✅ 確認。`checkDuplicateLiveJob` が 40-84 行、pid が死亡・sidecar 欠落・JSON 破損はすべて `return`（許可） |
| 2 | `src/core/resume/resolve-job.ts:18-35` — `updatedAt` 最新選択、status 不問 | ✅ 確認。`includeArchived: true` で全 state を引き、複数一致時に `updatedAt` 降順 sort して先頭返却 |
| 3 | `src/core/cancel/runner.ts:437-446` — `--purge` 時のみ sidecar dir を `fs.rm`（jobId 一致チェック無し）| ✅ 確認。`if (purge)` ブランチで slug 対応の `localSidecarDir` を `recursive: true` で削除、jobId 照合なし |
| 4 | `src/core/cancel/runner.ts:423-431` — managed marker `unlink` は jobId 一致に関わらず無条件 | ✅ 確認。`getJobSlug(state)` の slug でパスを組み jobId を見ずに `fs.unlink` |
| 5 | `src/core/runtime/local.ts:1417-1425` — `writeLivenessSidecar` は既存チェック無しの上書き | ✅ 確認。1423 行の `async writeLivenessSidecar`（コメントは 1416 〜）が read-before-write 無しで `fs.writeFile` を直呼び |
| 6 | `src/store/local-job-index.ts:42-89` — `listLocalSidecars` は slug キー・sidecar 1 枚 | ✅ 確認。42-89 行が slug ディレクトリを走査し liveness.json → marker.json の順で試みて 1 エントリを push |
| 7 | `src/core/job-access/load-by-job-id.ts:79-84` — 索引に無い jobId を fallback 無しで JOB_NOT_FOUND | ✅ 確認。79-84 行で `JOB_NOT_FOUND` を throw し `specrunner job ls` へ案内 |
| 8 | `src/cli/progress.ts:162-166` — `pipeline:complete` handler が無条件に archive 案内を出力 | ✅ 確認。162-166 行の `onPipelineComplete` は payload を無視し `Next: specrunner job archive ${this.options.slug}` を固定出力 |
| 9 | `src/core/pipeline/pipeline.ts:145-148` — halt（`awaiting-resume` 戻り）でも `pipeline:complete` が発火 | ✅ 確認。147 行 `this.events.emit("pipeline:complete", { state: result })` は try の最終 return と同じパスで発火 |
| 10 | `src/core/inbox/run-inbox.ts:339-376` — `postRejectComment` seam 既存、`startJob` が `runRunCore` を呼ぶ | ✅ 確認。350 行に `postRejectComment`、344 行に `runRunCore` 呼び出し |
| 11 | `src/core/doctor/checks/` — storage カテゴリを含む構成 | ✅ 確認。`checks/index.ts` が storage カテゴリ（`localStateWritableCheck` / `legacyJobsDirCheck` / `orphanSidecarsCheck` / `orphanWorktreesCheck` / `journalIntegrityCheck`）を持つ |
| 12 | `src/state/lifecycle.ts` — `TERMINAL_STATUSES` / `ACTIVE_STATUSES` が正典 | ✅ 確認。58 行 `TERMINAL_STATUSES = {archived, canceled}`、60 行 `ACTIVE_STATUSES = {running, awaiting-resume}` |
| 13 | `src/errors.ts:53-114` — `ERROR_CODES` 台帳、`DUPLICATE_LIVE_JOB` 既存 | ✅ 確認。101 行に `DUPLICATE_LIVE_JOB` エントリ、`duplicateLiveJobError` factory も実装済み |

### 参照ドキュメント確認

- `architecture/adr/2026-08-01-slug-occupancy-and-attempt-identity.md` — 存在確認。D1〜D4 の決定内容が request 要件 1〜5 に対応していることを照合
- `architecture/divergence-status.md` — 2026-08-01 記録の divergence 3 件（start guard / resolve-job / cancel sidecar 残置）が request 背景と一致

### 要件と受け入れ基準の照合

| 要件 | 受け入れ基準の対応 |
|------|--------------------|
| 1 start guard | guard 単体テスト（非 terminal→拒否、terminal→許可、state 読取不能→拒否）＋ シナリオ歯 ✅ |
| 2 sidecar check-and-claim | guard・シナリオ歯の中でカバー ✅ |
| 3 cancel 自 jobId 限定 | cancel テスト（自 jobId→削除、他 jobId→残す）✅ |
| 4 状態基準 slug 解決 | 解決テスト（非 terminal 1 件→返す、複数→エラー）✅ |
| 5 doctor 整合検査・修復口 | doctor テスト（断面検出・掛け直し・複数での修復拒否）✅ |
| 6 halt 時 Next 案内 | Next 案内テスト（awaiting-resume→resume 案内、awaiting-archive→archive 案内）✅ |
| 7 inbox 拒否伝搬・冪等 | 受け入れ基準に明示的テスト項目なし ⚠️ |
| 8 managed runtime 対称 | 受け入れ基準に明示的テスト項目なし ⚠️ |

## 検証できなかった項目

None（全アサーションを直接 Read/Grep で確認）

## Findings 詳細

None（ブロッキング finding なし）

### Observations（参考情報、verdict に影響しない）

**OBS-1: 受け入れ基準に req 7（inbox 冪等）のテスト項目が明示されていない**

要件 7 は「同一の先住 job による拒否は一度だけコメントし周期実行で連投しない」を求めるが、受け入れ基準のチェックリストに対応テスト項目が存在しない。冪等の実装手段（既存コメント走査 / ローカル状態など）は実装者裁量になる。歯が無ければ周期実行でのコメント連投が見逃されやすい。  
→ 実装者は inbox 拒否冪等の単体/統合テストを追加すること。

**OBS-2: 受け入れ基準に req 8（managed runtime 対称）のテスト項目が明示されていない**

要件 8 は start guard と cancel jobId 一致解除を managed marker 経路にも適用することを求めるが、受け入れ基準に managed 経路の独立テスト項目がない。local runtime のテストが通っても managed 経路の guard 欠落を見逃す可能性がある。  
→ 実装者は managed marker への guard 適用を検証するテストを追加すること。
