# Design: flatten-request-files

## 概要

`specrunner/requests/active/<slug>/request.md` (dir + 固定ファイル名) を `specrunner/requests/active/<slug>.md` (flat ファイル) に変更する。`changes/<slug>/request.md` 側は固定名のまま維持する。

## 設計判断

### DJ-1: flat ファイル vs dir 維持

**決定**: flat ファイル化する。

requests/ 配下は文書 1 個だけの dir で冗長。一方 changes/ 配下は design.md / tasks.md / specs/ 等の多 artifact を持つため dir 構造に semantic がある。requests/ は flat、changes/ は dir という棲み分けが semantic に整合的。

### DJ-2: `changes/<slug>/request.md` は固定名維持

**決定**: 維持する。

worktree setup で `requests/active/<slug>.md` → `changes/<slug>/request.md` にコピー時にファイル名変換する。artifact 集合の中の 1 員としての semantic を保つ。

### DJ-3: migration は 1 回限りの script

**決定**: `src/core/command/request-migrate-flat.ts` に migration 関数を配置。CLI サブコマンドとしては追加せず、finish 時の merge commit に含める形で実行する。ただし test は書く。

extra files (e.g. `research-result.md`) がある dir は request.md だけ flat 化し、dir は残す (partial migration)。

### DJ-4: `checkSlugCollision` の検出方式

**決定**: dir 名の `entries.includes(slug)` から、ファイル名の `entries.includes(slug + ".md")` に変更。readdir 結果の中から `.md` 拡張子ファイルを探す。

### DJ-5: `move-requests-dir.ts` → ファイル単位 mv

**決定**: `git mv active/<slug>.md merged/<slug>.md` に変更。dir mv ではなくファイル mv になるため、関数名は `moveRequestFile` に rename（旧名 `moveRequestsDir`）。ただし export 名の変更は呼び出し元 (orchestrator.ts) との整合を取る。

## 影響範囲

### Core 変更 (store.ts 中心)

| 関数 | 変更内容 |
|------|---------|
| `resolve(cwd, slug)` | `path.join(cwd, ACTIVE_SUBDIR, slug, "request.md")` → `path.join(cwd, ACTIVE_SUBDIR, slug + ".md")` |
| `list(cwd)` | `readdir` → `*.md` ファイル列挙、拡張子 strip して slug 返却 |
| `read(cwd, slug)` | `resolve()` 経由で自動的に flat path |
| `write(cwd, slug, content)` | `mkdir(slug/)` → `mkdir(ACTIVE_SUBDIR)` に変更、ファイル直接書き込み |
| `checkSlugCollision(cwd, slug)` | `entries.includes(slug)` → `entries.includes(slug + ".md")` |

### CLI コマンド変更

| ファイル | 変更内容 |
|---------|---------|
| `request-new.ts` | 出力メッセージの path を flat 形式に更新 |
| `request-rm.ts` | `fs.rm(dir, { recursive: true })` → `fs.unlink(filePath)` に変更 |
| `request-show.ts` | `store.resolve()` 経由で自動対応 (変更不要) |
| `request-list.ts` | `manager.list()` 経由で自動対応 (変更不要) |

### pipeline-run.ts

`CANONICAL_PATTERN` 正規表現を flat 形式に更新:

```
// Before: /^.*\/specrunner\/requests\/active\/([^/]+)\/[^/]+\.md$/
// After:  /^.*\/specrunner\/requests\/active\/([^/]+)\.md$/
```

### finish 系

| ファイル | 変更内容 |
|---------|---------|
| `move-requests-dir.ts` | `activePath` / `mergedPath` を flat ファイルパスに変更。`git mv` の対象をファイルに。idempotent check も `.md` ファイル存在チェックに変更 |
| `resolve-target.ts` | `resolveByAutoDetect()`: `isDirectory()` filter → `.md` ファイル filter + 拡張子 strip。`detectSlugFromCwd()`: pattern を `/active/([^/]+)\.md$/` に更新 (ただし cwd detection は dir pattern のままでも成立するため影響小) |

### runtime 系 (worktree setup)

| ファイル | 変更内容 |
|---------|---------|
| `local.ts` | `relativeRequestPath` が flat path (`specrunner/requests/active/<slug>.md`) になるため `path.relative()` で自動対応。`changes/<slug>/request.md` へのコピーは変更なし |
| `managed.ts` | 同上 |

### spec 変更 (delta spec)

`cli-commands` capability の以下 Requirement を flat 形式に更新:
- `request new` の path 表記 (`active/<slug>/request.md` → `active/<slug>.md`)
- `request show` の path 表記
- `request rm` の削除対象 (dir 再帰削除 → ファイル削除)
- `request validate` / `request review` の slug 解決

## ファイル変更一覧

### 実装ファイル

1. `src/core/request/store.ts` — resolve / list / write / checkSlugCollision の path ロジック変更
2. `src/core/command/pipeline-run.ts` — CANONICAL_PATTERN 正規表現更新
3. `src/core/command/request-new.ts` — 出力メッセージ path 更新
4. `src/core/command/request-rm.ts` — dir 削除 → ファイル削除
5. `src/core/finish/move-requests-dir.ts` — ファイル単位 mv + idempotent check
6. `src/core/finish/resolve-target.ts` — auto-detect を `.md` ファイル列挙に変更 + detectSlugFromCwd パターン更新
7. `src/core/command/request-migrate-flat.ts` — migration 関数 (新規)

### テストファイル

8. `tests/unit/core/request/store.test.ts` — flat path 前提に更新
9. `tests/unit/core/command/request-new.test.ts` — flat path 前提に更新
10. `tests/unit/core/command/request-rm.test.ts` — ファイル削除前提に更新
11. `tests/finish-move-requests-dir.test.ts` — ファイル mv 前提に更新
12. `tests/unit/core/command/request-migrate-flat.test.ts` — migration テスト (新規)

### Spec ファイル

13. `specrunner/changes/flatten-request-files/specs/cli-commands/delta.md` — Requirement 更新

### ADR

14. `docs/adr/flatten-request-files.md` — flat 化判断 + changes/ 固定名維持 + migration 方針
