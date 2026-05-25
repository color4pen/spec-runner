# Design: cleanup-runtime-cli

## Overview

3 件の軽微 cleanup を 1 PR にまとめる:
- A: drafts 空 dir 残置の修正
- B: CLI repo root 解決の挙動意図コメント追加
- C: `resolveRepoRoot` のコピペ重複を共通 util に集約

## Design Decisions

### D1: 空 dir 削除は `path.dirname()` + `fs.rm({ recursive: true, force: true })`

`opts.requestFilePath` は `specrunner/drafts/<slug>/request.md` (canonical) または `specrunner/drafts/<slug>.md` (legacy) の 2 形式。

- Canonical 形式: `path.dirname(requestFilePath)` → `specrunner/drafts/<slug>/` → dir ごと `fs.rm` で一括削除
- Legacy 形式: `path.dirname(requestFilePath)` → `specrunner/drafts/` → **drafts ディレクトリ自体を消してはいけない**

判定方法: `requestFilePath` が `CANONICAL_PATTERN` (`/specrunner/drafts/<slug>/request.md`) にマッチする場合のみ親 dir を削除する。Legacy の場合は file 削除のみ (現行動作維持)。

既存の `CANONICAL_PATTERN` regex は `pipeline-run.ts` にあるが、runtime 側で使うには単純な path check で十分: `path.basename(requestFilePath) === "request.md"` かつ `path.basename(path.dirname(requestFilePath)) !== "drafts"` で判定できる。よりシンプルに、`requestFilePath.endsWith("/request.md")` を使い、その場合のみ親 dir を削除する。

### D2: `resolveRepoRoot` util の配置場所

`src/util/repo-root.ts` に新設。既存の `git-exec.ts` の `gitExec` は SpawnFn を引数に取る低レベル API で、CLI コマンドから直接使うには冗長。CLI 用の高レベル wrapper として `spawnCommand` (from `src/util/spawn.ts`) を使った実装を提供する。

- `resolveRepoRoot(): Promise<string | null>` — git 失敗時 null (read-only 用)
- `resolveRepoRootOrFail(): Promise<string>` — git 失敗時 throw (state-modifying 用)

### D3: CLI 書き換えは import 差し替え + コメント追加のみ

各 CLI entry の private `resolveRepoRoot()` / inline 実装を削除し、共通 util からの import に置き換える。`cancel.ts` では catch して return 1 するパターンは維持 (throw を catch → stderr + return 1)。

## File Changes

| File | Action |
|------|--------|
| `src/util/repo-root.ts` | **新規**: `resolveRepoRoot` / `resolveRepoRootOrFail` |
| `src/core/runtime/local.ts` | 修正: L242-249 の `fs.rm` の後に親 dir 削除ロジック追加 |
| `src/core/runtime/managed.ts` | 修正: L132-139 の `fs.rm` の後に同上 |
| `src/cli/cancel.ts` | 修正: inline git 解決を `resolveRepoRootOrFail` に置換 |
| `src/cli/job-show.ts` | 修正: private `resolveRepoRoot` を共通 util に置換 |
| `src/cli/ps.ts` | 修正: private `resolveRepoRoot` を共通 util に置換 |
| `src/util/repo-root.test.ts` | **新規**: unit test |
| `src/core/runtime/local.test.ts` (or 既存テスト) | 修正: 空 dir 削除の検証追加 |

## Risks & Mitigations

- **親 dir 削除が draft 以外を巻き込む**: `requestFilePath.endsWith("/request.md")` ガードで legacy / non-canonical パスは影響しない
- **`fs.rm` の recursive が意図しないファイルを消す**: draft dir には `request.md` 以外のファイルは作られない設計 (ADR `drafts-directory-structure`)。仮にユーザーが追加ファイルを置いていても、draft consumed 意味論として正当
