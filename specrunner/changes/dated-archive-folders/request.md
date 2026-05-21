# changes archive 時に `<YYYY-MM-DD>-<slug>` 形式の日付 prefix を付与する

## Meta

- **type**: spec-change
- **slug**: dated-archive-folders
- **base-branch**: main
- **adr**: true

## 背景

`finish` で `specrunner/changes/<slug>/` → `specrunner/changes/archive/<slug>/` に git mv する時、現状は **slug のみ** で archive 化される (= `src/core/finish/archive-change-folder.ts:46`)。後で archive 配下を眺めた時、時系列が dir 名からは判断できない (= 各 dir 内の commit log を見ないと archive 日が分からない)。

実際に過去の archive を見ると、**日付付き dir と日付なし dir が混在** している:

```
specrunner/changes/archive/
  2026-04-16-phase2-auth-and-app-foundation/    ← 日付付き (= 古い、手動付与の遺産)
  2026-04-17-bootstrap-for-managed-agents/      ← 日付付き
  2026-04-25-slug-delegation-and-branch-tracking/
  abolish-success-status/                       ← 日付なし (= 現 archive-change-folder.ts 経由)
  ...
```

= ad-hoc に「日付付与は便利」と認識されていた時期があったが、archive-change-folder.ts の自動化と同時に prefix が外れていた。

本 request で archive 化時に **`<YYYY-MM-DD>-<slug>` 形式に統一** する。ADR 配置の `specrunner/adr/<YYYY-MM-DD>-<slug>.md` と思想を揃え、archive 配下の時系列把握を容易にする。

## 思想

### 「動作した日」を path に刻む

ADR は `2026-05-20-<slug>.md` という date prefix で生成され、後から「いつの設計判断か」が dir listing だけで把握できる。archive folder も同じ思想で **「いつ archive 化されたか」を path に刻む** ことで:

- archive 配下 ls 一発で時系列順に並ぶ (= 辞書順 = 時系列順)
- 古い archive を発掘する時の grep / git log コストが下がる
- ADR と archive の path 命名規約が統一される (= 思想の一貫性)

### 既存 archive は touch しない

過去手動付与の日付付き dir と日付なし dir の混在は **保持する** (= rename しない)。理由:

- 既存 dir を rename すると過去 PR の reference が壊れる (= 各 archive 内の commit message や issue link で「`changes/archive/<slug>/`」と参照されている可能性)
- 「過去の不整合は touch せず、新規ルールから整合させる」= PR #347 の `requests/merged/` 保持と同じ判断

### 日付 source は finish 実行時刻

ADR と同じ source (= 「動作した日」)。PR merge 時刻ではなく finish 実行時刻を採用する理由:
- archive 化と日付付与は同一処理 (= `archive-change-folder.ts` 内で完結)、外部からの merge 時刻取得を避ける
- ADR の生成も同じ「動作した日」採用、思想一貫性

## 要件

### 1. `archive-change-folder.ts` の archive path 変更

`src/core/finish/archive-change-folder.ts:44` の `archivePath` 生成を変更:

```typescript
// Before:
const archivePath = `${changesDirRel()}/archive/${slug}`;

// After:
const dateStr = new Date().toISOString().slice(0, 10);  // YYYY-MM-DD
const archivePath = `${changesDirRel()}/archive/${dateStr}-${slug}`;
```

副作用テストしやすいよう、日付取得を injectable に (= `params.now?: () => Date`)。

### 2. archive dir 名 → slug 解決のヘルパー追加

`src/util/paths.ts` 等に `parseArchiveDirName(dirName: string): { date: string | null; slug: string }` を追加。挙動:

- `2026-05-20-foo-bar` → `{ date: "2026-05-20", slug: "foo-bar" }`
- `foo-bar` (= 日付なし、既存遺産) → `{ date: null, slug: "foo-bar" }`
- `2026-04-16-phase2-auth-and-app-foundation` (= 既存日付付き) → `{ date: "2026-04-16", slug: "phase2-auth-and-app-foundation" }`

regex: `^(\d{4}-\d{2}-\d{2})-(.+)$` で prefix detection、マッチしなければ全体を slug とする。

### 3. `store.ts` の `checkSlugCollision` 対応

`src/core/request/store.ts:80-97` の Check 3 (= archive 経路の slug 衝突検出) を、prefix 付き dir 名でも slug match する形に変更:

```typescript
// Before: entries.includes(slug)  (= 完全一致)
// After: parseArchiveDirName(entry).slug === slug  (= prefix を strip して比較)
```

### 4. capability spec への archive path format の明文化

調査の結果、archive 操作の詳細仕様は `specrunner/specs/cli-finish-command/spec.md` に集中している。ただし archive **path format 自体** は同 spec でも直接言及されておらず、暗黙の規約として運用されている。

本 request で archive path format を変更する機会に、**新規 Requirement として明文化** する:
- `cli-finish-command` capability の delta spec に「finish 時の archive path は `specrunner/changes/archive/<YYYY-MM-DD>-<slug>/` 形式である」旨の Requirement を追加
- 暗黙規約を成文化することで、今後の改訂で再ブレを防止

具体 path は delta spec 側に記載 (= request 本文では指定しない)。

### 5. skill / doc の archive path 言及更新

`.claude/skills/acceptance-and-issue-audit/SKILL.md:45` で archive path を `specrunner/changes/archive/<slug>/request.md` と documentation している。本 request で path format が変わるため、以下に更新:

```
merged: specrunner/changes/archive/<YYYY-MM-DD>-<slug>/request.md
```

その他 README / 関連 skill で archive path 言及があれば同様に追従 (= 起票時点では SKILL.md 以外に発見なし)。

### 6. test 更新

影響する test:
- `tests/unit/core/finish/archive-change-folder.test.ts` 等 (= archive path 生成の test、`<date>-<slug>` 形式期待に更新、`now` injectable で固定日付テスト)
- `tests/unit/core/request/store.test.ts` (= checkSlugCollision archive 経路の suffix match test)
- `tests/util/paths.test.ts` 等 (= 新ヘルパー `parseArchiveDirName` の test)

`tests/unit/core/finish/archive-one-path.test.ts` は **本 request で touch 不要** (= move-requests-dir 不在検証の regression test、archive path format には関与しない、調査済)。

`src/core/finish/orchestrator.ts` は archive 関連が comment / TC ID のみで動作変更なし = **修正不要** (= 調査済)。

`src/core/doctor/checks/repo/workflow-structure.ts` は **archive を直接見ない** = **本 request スコープ外** (= 調査済)。

### 7. 再現 test (= 静的 unit test)

- archive 化後の dir 名が `^\d{4}-\d{2}-\d{2}-` で始まることを assert
- `parseArchiveDirName` の解析が日付付き / なし両方で正しく動くことを assert
- `checkSlugCollision` が既存日付付き archive dir (= 例: `2026-04-16-foo`) に対して slug `foo` で衝突検出することを assert

## スコープ外

- **既存 archive dir の rename / 日付付与** (= 過去日付なし dir も日付付き dir も保持、新規 archive のみ新仕様)
- **archive 日付の取得 source 変更** (= finish 実行時刻のみ、PR merge 時刻等は採用しない)
- **prompt ファイルの修正** (= archive path は CLI が決定する責務、prompt 層は path 抽象化済で影響なし)
- **`requests/merged/` 削除 + src 参照 cleanup** (= 別 request `merged-to-archive-consolidation` で並走)

## 受け入れ基準

- [ ] `archive-change-folder.ts` の archive path 生成が `<YYYY-MM-DD>-<slug>` 形式
- [ ] 日付取得が injectable (= test で固定日付差し込み可能)
- [ ] `src/util/paths.ts` 等に `parseArchiveDirName` ヘルパー追加 (= 日付付き / なし両方対応)
- [ ] `store.ts` の `checkSlugCollision` が prefix 付き archive dir でも slug match する
- [ ] `cli-finish-command` capability の delta spec に「finish 時の archive path は `specrunner/changes/archive/<YYYY-MM-DD>-<slug>/` 形式」旨の Requirement が新規追加されている
- [ ] `.claude/skills/acceptance-and-issue-audit/SKILL.md:45` の archive path 言及が `<YYYY-MM-DD>-<slug>` 形式に更新されている
- [ ] 既存 archive dir (= 日付付き + 日付なし両方) は touch されていない
- [ ] 既存 / 新規 test が新設計に合わせて update され green
- [ ] 新規再現 test (= dir 名 format / parseArchiveDirName / checkSlugCollision suffix match) が追加され green
- [ ] `bun run typecheck && bun run test` が green
- [ ] ADR に「archive 化時の日付 prefix 採用」「日付 source = finish 実行時刻 (= ADR と同じ思想)」「既存 archive 不変保持の判断」「`parseArchiveDirName` での後方互換維持」を記録

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

TBD
