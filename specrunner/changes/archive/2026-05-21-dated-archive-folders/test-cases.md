# Test Cases: dated-archive-folders

## TC-DAF-001

- **Category**: Unit / parseArchiveDirName
- **Priority**: must
- **Source**: Task 1, 2 / req §2

**GIVEN** `parseArchiveDirName` ヘルパーが実装されている  
**WHEN** `"2026-05-20-foo-bar"` を渡す  
**THEN** `{ date: "2026-05-20", slug: "foo-bar" }` が返る

---

## TC-DAF-002

- **Category**: Unit / parseArchiveDirName
- **Priority**: must
- **Source**: Task 2 / req §2

**GIVEN** `parseArchiveDirName` ヘルパーが実装されている  
**WHEN** 日付なし slug `"foo-bar"` を渡す  
**THEN** `{ date: null, slug: "foo-bar" }` が返る（既存遺産との後方互換）

---

## TC-DAF-003

- **Category**: Unit / parseArchiveDirName
- **Priority**: must
- **Source**: Task 2 / req §2

**GIVEN** `parseArchiveDirName` ヘルパーが実装されている  
**WHEN** 既存の長い日付付き dir 名 `"2026-04-16-phase2-auth-and-app-foundation"` を渡す  
**THEN** `{ date: "2026-04-16", slug: "phase2-auth-and-app-foundation" }` が返る

---

## TC-DAF-004

- **Category**: Unit / parseArchiveDirName
- **Priority**: must
- **Source**: Task 2 / req §2

**GIVEN** `parseArchiveDirName` ヘルパーが実装されている  
**WHEN** 既存の日付なし dir 名 `"abolish-success-status"` を渡す  
**THEN** `{ date: null, slug: "abolish-success-status" }` が返る

---

## TC-DAF-005

- **Category**: Unit / parseArchiveDirName — edge cases
- **Priority**: should
- **Source**: Task 1 / req §2 (regex 境界)

**GIVEN** `parseArchiveDirName` ヘルパーが実装されている  
**WHEN** `"2026-13-01-foo"` のように月が範囲外の文字列を渡す  
**THEN** regex `^(\d{4}-\d{2}-\d{2})-(.+)$` は構文一致するため `{ date: "2026-13-01", slug: "foo" }` が返る（カレンダー検証はスコープ外）

---

## TC-DAF-006

- **Category**: Unit / parseArchiveDirName — edge cases
- **Priority**: should
- **Source**: Task 1 / design D2

**GIVEN** `parseArchiveDirName` ヘルパーが実装されている  
**WHEN** `"20260520-foo"` のようにハイフン区切りなし日付文字列を渡す  
**THEN** `{ date: null, slug: "20260520-foo" }` が返る（regex 不一致 → 全体を slug 扱い）

---

## TC-DAF-007

- **Category**: Unit / parseArchiveDirName — TC-034 制約
- **Priority**: must
- **Source**: Task 1 / design D2 / TC-034

**GIVEN** `src/util/paths.ts` に `parseArchiveDirName` が追加されている  
**WHEN** `src/util/paths.ts` の import 一覧を確認する  
**THEN** `src/` 配下の他モジュールへの import が存在しない（TC-034 pure-util 制約を維持）

---

## TC-DAF-008

- **Category**: Unit / archive-change-folder — path format
- **Priority**: must
- **Source**: Task 3, 4 / req §1 / AC §1

**GIVEN** `archiveChangeFolder` に `now: () => new Date("2026-01-15T10:00:00Z")` を注入している  
**WHEN** slug `"my-slug"` の change を archive する  
**THEN** git mv の移動先 path が `specrunner/changes/archive/2026-01-15-my-slug` である

---

## TC-DAF-009

- **Category**: Unit / archive-change-folder — injectable now
- **Priority**: must
- **Source**: Task 3, 4 / req §1 / AC §2

**GIVEN** `archiveChangeFolder` の params 型に `now?: () => Date` が追加されている  
**WHEN** `now` を省略して呼び出す  
**THEN** エラーにならず、`new Date()` のデフォルト実装で archive が実行される

---

## TC-DAF-010

- **Category**: Unit / archive-change-folder — path prefix 形式
- **Priority**: must
- **Source**: Task 4 / req §7 (再現 test)

**GIVEN** `archiveChangeFolder` が実行された  
**WHEN** 生成された archivePath の dir 名を確認する  
**THEN** `^\d{4}-\d{2}-\d{2}-` の正規表現にマッチする（日付 prefix が先頭に付与されている）

---

## TC-DAF-011

- **Category**: Unit / archive-change-folder — 関数シグネチャ
- **Priority**: must
- **Source**: Task 3 / design D1

**GIVEN** `archiveChangeFolder` の実装が変更されている  
**WHEN** `ArchiveChangeFolderResult` 型を確認する  
**THEN** 既存の戻り値型シグネチャが変更されていない（後方互換維持）

---

## TC-DAF-012

- **Category**: Unit / checkSlugCollision — 日付付き archive での衝突検出
- **Priority**: must
- **Source**: Task 5, 6 / req §3, §7 / AC §4

**GIVEN** archive ディレクトリに `"2026-05-20-archived-feature"` が存在する  
**WHEN** slug `"archived-feature"` で `checkSlugCollision` を実行する  
**THEN** `SLUG_COLLISION` エラーが throw される

---

## TC-DAF-013

- **Category**: Unit / checkSlugCollision — 日付なし archive での衝突検出（後方互換）
- **Priority**: must
- **Source**: Task 6 / req §3

**GIVEN** archive ディレクトリに日付なし `"archived-feature"` dir が存在する  
**WHEN** slug `"archived-feature"` で `checkSlugCollision` を実行する  
**THEN** `SLUG_COLLISION` エラーが throw される（既存動作と変わらない）

---

## TC-DAF-014

- **Category**: Unit / checkSlugCollision — 衝突なし
- **Priority**: must
- **Source**: Task 5 / req §3

**GIVEN** archive ディレクトリに `"2026-05-20-other-feature"` が存在する  
**WHEN** slug `"my-feature"` で `checkSlugCollision` を実行する  
**THEN** エラーにならず処理が続行される

---

## TC-DAF-015

- **Category**: Unit / checkSlugCollision — 日付付き複数 entries
- **Priority**: should
- **Source**: Task 5 / design D3

**GIVEN** archive ディレクトリに `"2026-04-16-foo"`, `"2026-05-01-bar"`, `"baz"` が存在する  
**WHEN** slug `"foo"` で `checkSlugCollision` を実行する  
**THEN** `SLUG_COLLISION` エラーが throw される（全 entries を走査して slug 抽出比較する）

---

## TC-DAF-016

- **Category**: Unit / checkSlugCollision — stat は衝突検出時のみ
- **Priority**: should
- **Source**: design D3

**GIVEN** archive ディレクトリに `"2026-05-20-archived-feature"` が存在する  
**WHEN** slug `"archived-feature"` で衝突 entry を `find` した後、fs.stat を呼ぶ  
**THEN** stat の引数が `archive/<original-entry-name>` 形式（= `2026-05-20-archived-feature`）である（slug でなく実 dir 名を使う）

---

## TC-DAF-017

- **Category**: 仕様 / delta spec 存在確認
- **Priority**: must
- **Source**: Task 7 / req §4 / AC §5

**GIVEN** `specrunner/changes/dated-archive-folders/specs/cli-finish-command/delta.md` が作成されている  
**WHEN** ファイルの内容を確認する  
**THEN** `specrunner/changes/archive/<YYYY-MM-DD>-<slug>/` 形式を Requirement として明文化する記述が含まれる

---

## TC-DAF-018

- **Category**: ドキュメント / SKILL.md 更新
- **Priority**: must
- **Source**: Task 8 / req §5 / AC §6

**GIVEN** `.claude/skills/acceptance-and-issue-audit/SKILL.md` が更新されている  
**WHEN** archive path の記述箇所を確認する  
**THEN** `specrunner/changes/archive/<YYYY-MM-DD>-<slug>/request.md` と記載されている（旧 `<slug>/` 形式でない）

---

## TC-DAF-019

- **Category**: 非回帰 / 既存 archive dir 不変
- **Priority**: must
- **Source**: req §背景 / AC §7 / design D4

**GIVEN** 実装前に `specrunner/changes/archive/` 配下の dir 一覧を記録している  
**WHEN** 実装後に同 dir 一覧を確認する  
**THEN** 既存の日付付き dir・日付なし dir の両方が rename されておらず保持されている

---

## TC-DAF-020

- **Category**: 非回帰 / archive-one-path.test.ts 不変
- **Priority**: must
- **Source**: req §6 (スコープ外明記)

**GIVEN** `tests/unit/core/finish/archive-one-path.test.ts` が存在する  
**WHEN** 本変更の実装後にファイルを確認する  
**THEN** ファイルの内容が変更されていない（move-requests-dir 不在検証 test は本変更スコープ外）

---

## TC-DAF-021

- **Category**: ビルド / typecheck + test
- **Priority**: must
- **Source**: Task 9 / AC §10

**GIVEN** 全タスクの実装が完了している  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN** エラーゼロで green になる

---

## TC-DAF-022

- **Category**: ドキュメント / ADR 内容確認
- **Priority**: must
- **Source**: AC §11

**GIVEN** ADR ファイルが生成されている  
**WHEN** 内容を確認する  
**THEN** 以下の4点が記録されている: (1) archive 化時の日付 prefix 採用理由、(2) 日付 source = finish 実行時刻（ADR と同じ思想）、(3) 既存 archive 不変保持の判断、(4) `parseArchiveDirName` での後方互換維持

---

## TC-DAF-023

- **Category**: Unit / parseArchiveDirName — slug 内ハイフン保持
- **Priority**: should
- **Source**: Task 2 / req §2

**GIVEN** `parseArchiveDirName` ヘルパーが実装されている  
**WHEN** `"2026-05-20-foo-bar-baz"` のように slug 部分にハイフンが複数含まれる dir 名を渡す  
**THEN** `{ date: "2026-05-20", slug: "foo-bar-baz" }` が返る（slug の途中ハイフンが削除されない）

---

## TC-DAF-024

- **Category**: Unit / archive-change-folder — 日付は UTC
- **Priority**: should
- **Source**: req §1 (ISO string slice)

**GIVEN** `now` に `() => new Date("2026-01-15T23:30:00Z")` を注入している  
**WHEN** archivePath を生成する  
**THEN** date 部分が `"2026-01-15"` である（`toISOString().slice(0, 10)` = UTC 日付）

---

## TC-DAF-025

- **Category**: Unit / checkSlugCollision — import 確認
- **Priority**: must
- **Source**: Task 5 / design D3

**GIVEN** `src/core/request/store.ts` が変更されている  
**WHEN** import 文を確認する  
**THEN** `parseArchiveDirName` が `../../util/paths.js` から import されている
