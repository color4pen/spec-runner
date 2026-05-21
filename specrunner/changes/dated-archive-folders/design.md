# Design: dated-archive-folders

## 概要

`specrunner finish` の archive 化時に `specrunner/changes/archive/<YYYY-MM-DD>-<slug>/` 形式の日付 prefix を付与する。ADR の `<YYYY-MM-DD>-<slug>.md` 命名と思想を統一する。

## 設計判断

### D1: 日付 source = finish 実行時刻

ADR と同じ「動作した日」。`new Date()` を使い、外部からの merge 時刻取得は不要。テスト容易性のため `params.now?: () => Date` で injectable にする。

### D2: `parseArchiveDirName` を `src/util/paths.ts` に配置

paths.ts は pure function only の stateless utility（TC-034: 他 src/ module を import しない制約）。`parseArchiveDirName` も pure function なのでここに追加する。

regex: `^(\d{4}-\d{2}-\d{2})-(.+)$`
- match → `{ date: string, slug: string }`
- no match → `{ date: null, slug: dirName }` （既存日付なし dir 互換）

### D3: `checkSlugCollision` は全 archive entry を走査して slug を比較

現状の `entries.includes(slug)` を `entries.some(entry => parseArchiveDirName(entry).slug === slug)` に変更。entry が日付付きでも日付なしでも slug を抽出して比較できる。

archive dir は 151+ entries あるが readdir + some は十分高速（fs stat は collision 検出時のみ）。

### D4: 既存 archive dir は touch しない

過去の日付付き / 日付なし混在は保持。rename すると過去 PR reference が壊れるリスクがある。新規 archive のみ新仕様を適用。

### D5: delta spec は `cli-finish-command` に追加

archive path format は暗黙規約だったため、本変更で Requirement として明文化する。

## 影響範囲

| ファイル | 変更内容 |
|---------|---------|
| `src/core/finish/archive-change-folder.ts` | archivePath 生成に日付 prefix 追加、`now` param 追加 |
| `src/util/paths.ts` | `parseArchiveDirName()` 追加 |
| `src/core/request/store.ts` | `checkSlugCollision` の archive 照合を prefix-aware に変更 |
| `.claude/skills/acceptance-and-issue-audit/SKILL.md` | archive path 言及を `<YYYY-MM-DD>-<slug>` に更新 |
| `tests/unit/core/finish/archive-change-folder.test.ts` | 日付付き archivePath の期待値に更新、`now` injectable テスト |
| `tests/unit/core/request/store.test.ts` | prefix 付き archive dir での collision 検出テスト追加 |
| `tests/util/paths.test.ts` | `parseArchiveDirName` テスト追加 |

### 影響しないファイル（調査済）

- `tests/unit/core/finish/archive-one-path.test.ts` — move-requests-dir 不在検証用、archive path format 無関係
- `src/core/finish/orchestrator.ts` — archive 関連は comment / TC ID のみ
- `src/core/doctor/checks/repo/workflow-structure.ts` — archive を直接参照しない
