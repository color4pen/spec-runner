# Design:

## Context

`job archive` の Phase 2 は liveness.json と marker.json を個別に unlink するが、
親ディレクトリ `.specrunner/local/<slug>/` を削除しない。
その結果、archive 済み job の sidecar ディレクトリが堆積し続ける（現在 67 件）。

既存コードの関連箇所:
- `localSidecarDir(slug)` = `.specrunner/local/<slug>` — `src/util/paths.ts:270`
- `livenessJsonPath(slug)` / `managedMarkerPath(slug)` — 同ファイル
- archive Phase 2 の cleanup ブロック — `src/core/archive/orchestrator.ts:277-305`
- `FinishFs.rm(path, { recursive, force })` — `src/core/finish/types.ts:47`（drafts/ 削除で既利用）
- doctor storage checks — `src/core/doctor/checks/storage/`

## Goals / Non-Goals

**Goals**:
- archive 完了時に `.specrunner/local/<slug>/` をディレクトリごと削除する（best-effort）
- `specrunner doctor` に orphan sidecar 検出チェックを追加する（read-only、削除はしない）

**Non-Goals**:
- local-job-index の index 化（O(1) 解決）
- `.specrunner/logs/` の retention
- orphan sidecar の自動一括削除

## Decisions

### D1: archive 時のディレクトリ削除に `fs.rm(..., { recursive: true, force: true })` を使う

既存の liveness.json / marker.json の unlink ブロックの直後に、親ディレクトリ全体を
`fs.rm` で best-effort 削除する。`force: true` により ENOENT を無視できる。
個別 unlink が先行するため、`rm -rf` は実質空ディレクトリへの呼び出しになり安全。

注入済みの `FinishFs.rm` を使う（drafts/ 削除の TC-014 と同パターン）。
try/catch で囲み、失敗は stderrWrite 警告のみ — archive の成否に影響させない。

**代替案**: 個別 unlink のみ（現状）→ ディレクトリ残骸が堆積するため却下。
**代替案**: `rmdir`（再帰なし）→ 残留ファイルがある場合 ENOTEMPTY で失敗するため却下。

### D2: doctor check は `DoctorFs` 経由でファイルを直接読む（JobStateStore を使わない）

`DoctorCheck` は `DoctorContext.fs` のみを依存として持ち、`src/core/` をインポートしない制約がある。
orphan 判定に必要なのは `state.json` の `status` フィールドのみであり、`JobStateStore` を経由しなくても
`ctx.fs.readFile` で JSON を読めば十分。

active 判定: `specrunner/changes/<slug>/state.json` を main checkout で参照し、
さらに `liveness.json` の `worktreePath` を使って worktree 内の state.json も参照する。
どちらかで "running" / "awaiting-*" / "failed" / "terminated" が見つかれば active とみなす。

見つからない、もしくは "archived" / "canceled" → orphan 候補。
判定不能（JSON 破損等）→ 安全側に倒して orphan とみなさない（スキップ）。

**代替案**: JobStateStore.list を呼ぶ → 循環依存・doctor の軽量性を壊すため却下。

### D3: doctor check は `commonChecks` に追加する（required: false / warn）

orphan sidecar は機能を壊さない警告レベルの問題であり、required: false / status: "warn" が適切。
`commonChecks` に追加することで local / managed 両ランタイムで報告される。

## Risks / Trade-offs

- [Risk] worktree 内 active job を orphan と誤検知する可能性
  → Mitigation: liveness.json の `worktreePath` を辿って state.json を確認する二段階判定。
    それでも判定不能な場合はスキップ（false negative 許容、false positive 回避優先）。

- [Risk] `fs.rm` が権限エラーで失敗しても archive に影響しない
  → Mitigation: 既存 unlink ブロックと同様に try/catch で囲み best-effort とする。

## Open Questions

なし。
