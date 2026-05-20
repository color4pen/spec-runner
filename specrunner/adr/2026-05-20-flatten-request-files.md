# ADR: Request ファイルの flat 化

**Date**: 2026-05-20
**Status**: Accepted
**Slug**: flatten-request-files

---

## 背景

`specrunner/requests/active/<slug>/request.md` という dir 1 階層 + 固定ファイル名の構造では、1 ディレクトリに 1 ファイルしか置かない冗長な設計になっていた。

問題点:
1. dir 1 個 = ファイル 1 個という自明な 1:1 対応で dir の意味が薄い
2. slug が dir 名と file 名 (`request.md`) の 2 箇所に重複して現れ、視認性が低下する
3. `request ls` の出力が dir 名 listing になり、ファイル単位の操作感が薄い
4. `request rm <slug>` が dir 削除になり、誤削除リスクが高い

---

## 判断 1: requests/ 配下を flat ファイル構造に変更する

**決定**: `specrunner/requests/active/<slug>/request.md` → `specrunner/requests/active/<slug>.md`

**根拠**: `requests/` 配下は request 文書のみを格納する場所であり、1 dir に 1 file という構造は意味がない。flat ファイルにすることで:
- `request ls` がファイル名 listing になり slug が直接見える
- `request rm <slug>` が `unlink` 1 回で完結し、誤操作リスクが下がる
- `request new <slug>` がディレクトリ作成不要でシンプルになる

**却下した選択肢**:
- 現状維持: 冗長性の問題を解決できない
- `request.md` → `<slug>.md` のリネーム（同 dir 内）: dir 構造の問題が残る

---

## 判断 2: changes/<slug>/ 側の request.md は固定名のまま維持する

**決定**: `specrunner/changes/<slug>/request.md` は変更しない

**根拠**: `changes/<slug>/` は design.md / tasks.md / specs/ 等の **複数 artifact を持つ集合** であり、dir 構造が必要かつ適切。その中の一員として `request.md` という固定名を持つことは、他の artifact と同じ命名規則に沿っており semantic が整合的。

**worktree setup でのファイル名変換**:
- `requests/active/<slug>.md` (flat) → `changes/<slug>/request.md` (固定名) のコピー変換をワークフロー内で吸収
- `requests/` と `changes/` の semantic が異なるため、別名規則で問題ない

---

## 判断 3: migration 方針 — extra files がある dir は partial migration

**決定**: dir に `request.md` 以外のファイルが存在する場合は `request.md` のみを flat 形式に移動し、dir を残す

**根拠**: `specrunner/requests/merged/agent-tool-constraints-research/` のように `research-result.md` 等の付随ファイルが存在する dir を一括削除すると情報が失われる。安全側に倒すため:
- `request.md` を `<slug>.md` に移動する
- 残ファイルは元の dir に留める
- migration log に `partial migration: <slug> (extra files retained in dir)` を警告として記録

完全な cleanup は手動で行う（自動化による誤削除を避ける）。

---

## 判断 4: migration は 1 回限りのスクリプトとして実装

**決定**: `src/core/command/request-migrate-flat.ts` に `migrateRequestsFlat(cwd)` 関数として実装し、本 PR の merge 時に既存 request 群を変換する

**根拠**:
- 既存の dir 形式 request (active / merged 双方) を新形式に変換するため
- 冪等性は不要（1 回限り）
- 変換後は dir 形式の request が残らないため、後方互換コードを残す必要がない

---

## 影響範囲

| ファイル | 変更内容 |
|---|---|
| `src/core/request/store.ts` | resolve/list/write/checkSlugCollision を flat 形式に |
| `src/core/command/pipeline-run.ts` | CANONICAL_PATTERN を flat 形式に |
| `src/core/command/request-new.ts` | 出力パス表記を flat に |
| `src/core/command/request-rm.ts` | dir 削除 → ファイル削除 |
| `src/core/command/request-show.ts` | コメント更新 |
| `src/core/finish/move-requests-dir.ts` | dir mv → ファイル mv |
| `src/core/finish/resolve-target.ts` | dir 列挙 → *.md ファイル列挙 |
| `src/core/command/request-migrate-flat.ts` | 新規: migration 関数 |
