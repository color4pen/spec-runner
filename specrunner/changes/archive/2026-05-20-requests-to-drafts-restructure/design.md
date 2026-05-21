# Design: requests-to-drafts-restructure

## 概要

起票エントリポイントを `specrunner/requests/active/` から `specrunner/drafts/` に rename し、archive 経路を `specrunner/changes/archive/` に一本化する。run 開始時に draft を move (= main から削除) することで、squash merge 後に untracked 残骸が残るバグを構造的に解消する。

## 設計判断

### D1: `drafts/` は起票状態のみを表す

`specrunner/drafts/<slug>.md` は「まだ run していない原稿」だけを保持する。run 開始と同時に main worktree から削除され、以後は `specrunner/changes/<slug>/request.md` が唯一のコピーになる。

**根拠**: 現行の `requests/active/` は job state の "active" と語彙が衝突し、状態が不明瞭。"drafts" は run 前の一時状態であることが明確。

### D2: run 開始時の move 化で untracked 残骸バグを構造的に解消

現行: main worktree の `requests/active/<slug>.md` は untracked のまま残り、worktree にコピーされる。squash merge 後に main の untracked file が残る。

改訂: `fs.cp` 後に `fs.rm` で main の draft file を削除。feature branch には `changes/<slug>/request.md` のみが新規追加される。

```
// local.ts / managed.ts の setupWorkspace 内
fs.cp(opts.requestFilePath, worktreeRequestPath)  // worktree にコピー
fs.rm(opts.requestFilePath)                         // main から draft 削除
```

**重要**: feature branch 上の canonical path (`specrunner/requests/active/<slug>.md`) へのコピーも廃止する。feature branch には `specrunner/changes/<slug>/request.md` のみが残る。

### D3: archive 経路の一本化

| 現行 | 改訂後 |
|---|---|
| `requests/active/` → `requests/merged/` (git mv) | 廃止 |
| `changes/<slug>/` → `changes/archive/<slug>/` | 唯一の archive 経路 |

`move-requests-dir.ts` を廃止し、orchestrator から呼び出しを削除する。finish 後は `changes/archive/<slug>/request.md` のみが archive として存在する。

### D4: `resolveByAutoDetect` の廃止

現行の auto-detect は `requests/active/` を列挙して 1 件なら自動選択するが、改訂後は `drafts/` が run 開始時に空になるため機能しない。代替 (job state ベース等) は提供せず、引数なし `finish` は `Specify <slug>, --pr, or --job` エラーで終了する。

### D5: `CANONICAL_PATTERN` の更新

`pipeline-run.ts` の CANONICAL_PATTERN を `specrunner/drafts/<slug>.md` に対応させる。flat file 形式 (= `<slug>.md`) のため、regex を調整:

```typescript
const CANONICAL_PATTERN = /^.*\/specrunner\/drafts\/([^/]+)\.md$/;
```

### D6: `request-patterns.ts` の archive 経路切り替え

現行は `requests/merged/` を dir 形式 (`<slug>/request.md`) で読み込むが、PR #344 以降 flat 形式に統一済みで `isDirectory()` filter により全エントリ除外され事実上空配列。改訂で `changes/archive/<slug>/request.md` を読むように変更し、LLM examples を復活させる。

### D7: `checkSlugCollision` の 3 経路参照

衝突検出は `drafts/` + `requests/merged/` (既存 140 件) + `changes/archive/` (既存 106 件 + 新規分) の 3 経路を参照。過去資産との衝突を引き続き防ぐ。

### D8: 既存データの扱い

- `specrunner/requests/merged/*.md` (140 件): migration しない、read-only 保持
- `specrunner/changes/archive/*/` (106 件): 変更なし
- `specrunner/requests/active/rules-md-injection.md` (残骸 1 件): 本 run の move 機構で自動消去

### D9: `detectSlugFromCwd` の削除

`resolve-target.ts` の `detectSlugFromCwd` は `specrunner/requests/active/<slug>` パターンでマッチするが、`drafts/` は run 前にしか存在せず cwd がその中になることはない。auto-detect 廃止 (D4) に伴い、この関数も削除する。

## 影響範囲

### コア変更 (data path)

| ファイル | 変更内容 |
|---|---|
| `src/util/paths.ts` | `draftsDir()`, `draftPath(slug)` 追加 |
| `src/core/request/store.ts` | ACTIVE_SUBDIR → `specrunner/drafts`, collision 3 経路化 |
| `src/core/runtime/local.ts` | canonical path コピー廃止、`fs.rm` 追加 |
| `src/core/runtime/managed.ts` | 同上 |
| `src/core/command/pipeline-run.ts` | CANONICAL_PATTERN 更新 |
| `src/cli/run.ts` | storeResolve 呼び出し (= store.ts 変更で自動対応) |

### finish 関連

| ファイル | 変更内容 |
|---|---|
| `src/core/finish/move-requests-dir.ts` | 廃止 (ファイル削除) |
| `src/core/finish/orchestrator.ts` | moveRequestsDir import・呼び出し削除 |
| `src/core/finish/resolve-target.ts` | resolveByAutoDetect → エラー返却、detectSlugFromCwd 削除 |

### コマンド

| ファイル | 変更内容 |
|---|---|
| `src/core/command/request-new.ts` | 出力先 `drafts/` |
| `src/core/command/request-rm.ts` | 対象 `drafts/` |
| `src/core/command/request-show.ts` | lookup 先 `drafts/` (fallback: `requests/active/`) |
| `src/core/command/request-migrate-flat.ts` | 対象 `drafts/` |

### LLM context / doctor

| ファイル | 変更内容 |
|---|---|
| `src/context/request-patterns.ts` | `changes/archive/<slug>/request.md` 読み込み |
| `src/core/doctor/checks/repo/workflow-structure.ts` | `drafts/` check 追加、`requests/active/` warn |

### doc / skill

| ファイル | 変更内容 |
|---|---|
| `README.md` | path 言及更新 |
| `.claude/skills/parallel-request-workflow/SKILL.md` | 起票 path |
| `.claude/skills/acceptance-and-issue-audit/SKILL.md` | archive path |
| `.claude/skills/rebase-finish/SKILL.md` | active 残骸 cleanup 記述 |

## リスク

### R1: managed runtime の fs.rm タイミング

managed runtime は main cwd で直接作業するため、`fs.rm` が確実に draft を消す。local runtime は worktree に cp した後に main cwd の draft を消すため、失敗時に中途半端な状態になりうる。→ `fs.rm` 失敗は非致命的 warning とし、pipeline は継続する。

### R2: 並行実行時の race condition

2 つの run が同じ draft を同時に read する可能性は理論上あるが、slug ベースの排他 (= 同一 slug の二重実行) は job state で防がれるため実害なし。スコープ外。
