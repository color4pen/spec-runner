# ADR: archive 化時に `<YYYY-MM-DD>-<slug>` 形式の日付 prefix を付与する

- **date**: 2026-05-21
- **slug**: dated-archive-folders
- **status**: accepted

## Context

`specrunner finish` は change folder を `specrunner/changes/archive/<slug>/` に git mv する。現状は slug のみで archive 化されるため、archive 配下を ls した時に時系列が判断できない（各 dir 内の commit log を参照しないと archive 日が分からない）。

実際の archive 配下は、手動付与の日付付き dir と自動化後に生じた日付なし dir が混在していた。

ADR のファイル名は `specrunner/adr/<YYYY-MM-DD>-<slug>.md` 形式で date prefix を持っており、ls 一発で時系列を把握できる。archive folder に同じ規約を適用することが自然な統一である。

## Decisions

### D1: archive dir 名を `<YYYY-MM-DD>-<slug>` に統一する

`archive-change-folder.ts` の archivePath 生成を:

```
specrunner/changes/archive/<slug>/
↓
specrunner/changes/archive/<YYYY-MM-DD>-<slug>/
```

に変更する。これにより:

- `ls` 一発で辞書順 = 時系列順に並ぶ
- ADR と archive の path 命名規約が統一される（思想の一貫性）
- 古い archive の grep / git log コストが下がる

### D2: 日付 source は finish 実行時刻（`new Date()`）

PR merge 時刻ではなく finish コマンド実行時刻を採用する。

理由:
- archive 化と日付付与は `archive-change-folder.ts` 内で完結するため、外部から merge 時刻を取得する必要がない
- ADR 生成も同じ「動作した日」採用であり、思想が一致する
- テスト容易性のため `params.now?: () => Date` で injectable にする

### D3: 既存 archive dir は rename しない

過去の日付付き / 日付なし混在は保持し、新規 archive のみ新仕様を適用する。

理由:
- 既存 dir を rename すると過去 PR の commit message や issue link（`changes/archive/<slug>/`）が壊れるリスクがある
- 「過去の不整合は touch せず、新規ルールから整合させる」= PR #347 の `requests/merged/` 保持と同じ判断

### D4: `parseArchiveDirName` で後方互換維持

`src/util/paths.ts` に `parseArchiveDirName(dirName: string): { date: string | null; slug: string }` を追加し、slug 衝突検出（`checkSlugCollision`）等で date prefix を透過的に扱えるようにする。

```
regex: ^(\d{4}-\d{2}-\d{2})-(.+)$
- match → { date: "2026-05-21", slug: "foo-bar" }
- no match → { date: null, slug: dirName }  // 既存日付なし dir 互換
```

`entries.includes(slug)` という完全一致検索を `entries.some(e => parseArchiveDirName(e).slug === slug)` に変更することで、日付付き / なし両方の archive dir に対して slug 衝突を正しく検出できる。

## Consequences

- `specrunner finish` 後の archive dir が `2026-05-21-foo-bar/` 形式になり、時系列が dir listing だけで把握可能になる
- `parseArchiveDirName` を経由することで、既存の日付なし dir も slug として正しく認識され続ける
- 既存 archive dir の参照（commit message / issue link）は壊れない
- `archive-change-folder.ts` の `now` param により、テストで固定日付を注入できる
