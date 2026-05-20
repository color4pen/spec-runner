# Test Cases: flatten-request-files

## カテゴリ凡例

| Category | 対象 |
|---|---|
| STORE | `src/core/request/store.ts` |
| PIPELINE | `src/core/command/pipeline-run.ts` (CANONICAL_PATTERN) |
| CMD-NEW | `request new` CLI コマンド |
| CMD-RM | `request rm` CLI コマンド |
| CMD-LS | `request ls` CLI コマンド |
| CMD-SHOW | `request show` CLI コマンド |
| CMD-VALIDATE | `request validate` CLI コマンド |
| CMD-REVIEW | `request review` CLI コマンド |
| FINISH | finish 系 (move-requests-dir / resolve-target) |
| MIGRATE | migration script |
| WORKTREE | worktree setup (changes/<slug>/request.md 固定名) |

## Priority 凡例

- **must**: 受け入れ基準に直結
- **should**: 設計判断・design.md から導出
- **could**: edge case / 後方互換

---

## STORE カテゴリ

### TC-STORE-001
- **Category**: STORE
- **Priority**: must
- **Source**: 要件 2 / 受け入れ基準 3

**GIVEN** `cwd` に `specrunner/requests/active/` が存在する  
**WHEN** `resolve(cwd, "my-feature")` を呼び出す  
**THEN** 返却値が `<cwd>/specrunner/requests/active/my-feature.md` である

---

### TC-STORE-002
- **Category**: STORE
- **Priority**: must
- **Source**: 要件 2 / 受け入れ基準 3

**GIVEN** `active/` 配下に `foo.md`, `bar.md`, `baz.txt`, `qux/` (dir) が存在する  
**WHEN** `list(cwd)` を呼び出す  
**THEN** 返却値が `["foo", "bar"]` (`.md` のみ、拡張子 strip) であり `baz` と `qux` を含まない

---

### TC-STORE-003
- **Category**: STORE
- **Priority**: must
- **Source**: 要件 2 / 受け入れ基準 3

**GIVEN** `active/` ディレクトリが存在しない  
**WHEN** `list(cwd)` を呼び出す  
**THEN** 空配列 `[]` が返却され例外が発生しない

---

### TC-STORE-004
- **Category**: STORE
- **Priority**: must
- **Source**: 要件 2 / 受け入れ基準 1

**GIVEN** `cwd` が存在する  
**WHEN** `write(cwd, "new-feature", "<content>")` を呼び出す  
**THEN** `specrunner/requests/active/new-feature.md` が作成される  
AND `specrunner/requests/active/new-feature/` ディレクトリは作成されない  
AND ファイルの内容が `<content>` と一致する

---

### TC-STORE-005
- **Category**: STORE
- **Priority**: must
- **Source**: 要件 2 / 受け入れ基準 3

**GIVEN** `active/<slug>.md` が既に存在する  
**WHEN** `checkSlugCollision(cwd, slug)` を呼び出す  
**THEN** `SLUG_COLLISION` エラーが throw される

---

### TC-STORE-006
- **Category**: STORE
- **Priority**: must
- **Source**: 要件 2 / 受け入れ基準 3

**GIVEN** `merged/<slug>.md` が既に存在する (`active/` にはない)  
**WHEN** `checkSlugCollision(cwd, slug)` を呼び出す  
**THEN** `SLUG_COLLISION` エラーが throw される

---

### TC-STORE-007
- **Category**: STORE
- **Priority**: should
- **Source**: design.md DJ-4

**GIVEN** `active/` 配下に `<slug>/` ディレクトリ (旧 dir 形式の残骸) が存在するが `<slug>.md` は存在しない  
**WHEN** `checkSlugCollision(cwd, slug)` を呼び出す  
**THEN** エラーが発生しない (dir は collision と見なさない)

---

### TC-STORE-008
- **Category**: STORE
- **Priority**: must
- **Source**: 要件 2

**GIVEN** `active/my-feature.md` が存在し内容が `<content>` である  
**WHEN** `read(cwd, "my-feature")` を呼び出す  
**THEN** `<content>` が返却される

---

## PIPELINE カテゴリ

### TC-PIPELINE-001
- **Category**: PIPELINE
- **Priority**: must
- **Source**: 要件 2 / 受け入れ基準 3

**GIVEN** request ファイルの絶対パスが `/path/to/specrunner/requests/active/my-feature.md` である  
**WHEN** `CANONICAL_PATTERN` に対して `match()` を実行する  
**THEN** マッチが成立し `match[1]` が `"my-feature"` (slug) になる

---

### TC-PIPELINE-002
- **Category**: PIPELINE
- **Priority**: must
- **Source**: 要件 2 (旧形式を受け付けないこと)

**GIVEN** 旧形式パス `/path/to/specrunner/requests/active/my-feature/request.md`  
**WHEN** `CANONICAL_PATTERN` に対して `match()` を実行する  
**THEN** マッチが不成立になる (slug 抽出不可)

---

### TC-PIPELINE-003
- **Category**: PIPELINE
- **Priority**: should
- **Source**: design.md 影響範囲

**GIVEN** request ファイルのパスが `specrunner/requests/active/multi-part-slug.md` である  
**WHEN** `CANONICAL_PATTERN` でマッチする  
**THEN** `match[1]` が `"multi-part-slug"` になる (ハイフン含む slug が正しく抽出される)

---

## CMD-NEW カテゴリ

### TC-NEW-001
- **Category**: CMD-NEW
- **Priority**: must
- **Source**: 要件 3 / 受け入れ基準 4

**GIVEN** `active/my-feature.md` が存在しない  
**WHEN** `request new my-feature` を実行する  
**THEN** `specrunner/requests/active/my-feature.md` が作成される  
AND `specrunner/requests/active/my-feature/` ディレクトリは作成されない  
AND stderr に `specrunner/requests/active/my-feature.md` を含む成功メッセージが出力される

---

### TC-NEW-002
- **Category**: CMD-NEW
- **Priority**: must
- **Source**: 要件 3 / 受け入れ基準 4

**GIVEN** `active/my-feature.md` が既に存在する  
**WHEN** `request new my-feature` を実行する  
**THEN** exit code が非ゼロで終了し slug collision エラーが表示される  
AND 既存ファイルは上書きされない

---

### TC-NEW-003
- **Category**: CMD-NEW
- **Priority**: should
- **Source**: tasks.md Task 3.1

**GIVEN** `request new my-feature` が成功した  
**WHEN** 出力されたパスを確認する  
**THEN** メッセージ内のパス表記が `requests/active/my-feature.md` 形式である  
AND `requests/active/my-feature/request.md` のような旧形式は含まれない

---

## CMD-RM カテゴリ

### TC-RM-001
- **Category**: CMD-RM
- **Priority**: must
- **Source**: 要件 3 / 受け入れ基準 4

**GIVEN** `active/my-feature.md` が存在する  
**WHEN** `request rm my-feature` を実行する  
**THEN** `active/my-feature.md` ファイルが削除される  
AND exit code が 0  
AND stderr に `specrunner/requests/active/my-feature.md` を含む削除完了メッセージが出力される

---

### TC-RM-002
- **Category**: CMD-RM
- **Priority**: must
- **Source**: 要件 3 / 受け入れ基準 4

**GIVEN** `active/my-feature.md` が存在しない  
**WHEN** `request rm my-feature` を実行する  
**THEN** exit code が 1  
AND stderr にエラーメッセージが出力される

---

### TC-RM-003
- **Category**: CMD-RM
- **Priority**: should
- **Source**: tasks.md Task 3.2 (安全性)

**GIVEN** `active/my-feature.md` が存在する  
AND 他の request ファイル `active/other-feature.md` も存在する  
**WHEN** `request rm my-feature` を実行する  
**THEN** `active/my-feature.md` のみ削除される  
AND `active/other-feature.md` は削除されない

---

### TC-RM-004
- **Category**: CMD-RM
- **Priority**: should
- **Source**: tasks.md Task 3.2

**GIVEN** 無効な slug (`Invalid!Slug`) を指定する  
**WHEN** `request rm "Invalid!Slug"` を実行する  
**THEN** exit code が 2  
AND バリデーションエラーが表示される

---

## CMD-LS カテゴリ

### TC-LS-001
- **Category**: CMD-LS
- **Priority**: must
- **Source**: 要件 3 / 受け入れ基準 4, 5

**GIVEN** `active/` 配下に `foo.md`, `bar.md` が存在する  
**WHEN** `request ls` を実行する  
**THEN** 出力に `foo` と `bar` が含まれる (拡張子 `.md` strip 済み)  
AND `.md` サフィックスは表示されない

---

### TC-LS-002
- **Category**: CMD-LS
- **Priority**: must
- **Source**: 受け入れ基準 5

**GIVEN** `active/` 配下に `.md` ファイルが存在しない  
**WHEN** `request ls` を実行する  
**THEN** 空のリスト (または「no requests」相当のメッセージ) が表示される  
AND エラー終了しない

---

### TC-LS-003
- **Category**: CMD-LS
- **Priority**: should
- **Source**: tasks.md Task 1.2

**GIVEN** `active/` 配下に `.md` ファイルと `.txt` ファイルと dir が混在する  
**WHEN** `request ls` を実行する  
**THEN** `.md` ファイルに対応する slug のみが一覧に表示される

---

## CMD-SHOW カテゴリ

### TC-SHOW-001
- **Category**: CMD-SHOW
- **Priority**: must
- **Source**: 要件 3 / 受け入れ基準 4

**GIVEN** `active/my-feature.md` が存在し内容が `<content>` である  
**WHEN** `request show my-feature` を実行する  
**THEN** `<content>` が stdout に出力される  
AND exit code が 0

---

### TC-SHOW-002
- **Category**: CMD-SHOW
- **Priority**: must
- **Source**: 要件 3

**GIVEN** `active/my-feature.md` が存在しない  
**WHEN** `request show my-feature` を実行する  
**THEN** exit code が非ゼロでエラーが表示される

---

## CMD-VALIDATE カテゴリ

### TC-VALIDATE-001
- **Category**: CMD-VALIDATE
- **Priority**: must
- **Source**: 要件 3 / 受け入れ基準 4

**GIVEN** `active/my-feature.md` が有効な request 形式で存在する  
**WHEN** `request validate my-feature` (slug 指定) を実行する  
**THEN** flat ファイルが正常に読み込まれ validation が完了する  
AND exit code が 0

---

### TC-VALIDATE-002
- **Category**: CMD-VALIDATE
- **Priority**: should
- **Source**: 要件 3

**GIVEN** `active/my-feature.md` が存在する  
**WHEN** `request validate specrunner/requests/active/my-feature.md` (ファイルパス指定) を実行する  
**THEN** 同様に validation が完了する

---

## CMD-REVIEW カテゴリ

### TC-REVIEW-001
- **Category**: CMD-REVIEW
- **Priority**: must
- **Source**: 要件 3 / 受け入れ基準 4

**GIVEN** `active/my-feature.md` が有効な request として存在する  
**WHEN** `request review my-feature` (slug 指定) を実行する  
**THEN** flat ファイルが読み込まれ review agent が起動する  
AND exit code が 0

---

## FINISH カテゴリ

### TC-FINISH-001
- **Category**: FINISH
- **Priority**: must
- **Source**: 要件 6 / 受け入れ基準 8

**GIVEN** `requests/active/my-feature.md` が存在する  
AND `requests/merged/my-feature.md` が存在しない  
**WHEN** `finish my-feature` を実行する  
**THEN** `git mv` が `requests/active/my-feature.md` → `requests/merged/my-feature.md` のファイル単位で呼ばれる  
AND `requests/merged/my-feature.md` が存在する  
AND `requests/active/my-feature.md` が削除される

---

### TC-FINISH-002
- **Category**: FINISH
- **Priority**: must
- **Source**: 要件 6 / 受け入れ基準 8

**GIVEN** `requests/merged/my-feature.md` が既に存在する (idempotent ケース)  
**WHEN** `finish my-feature` の move ステップを実行する  
**THEN** エラーにならずスキップされる (idempotent 動作)

---

### TC-FINISH-003
- **Category**: FINISH
- **Priority**: must
- **Source**: 要件 6 / 受け入れ基準 2

**GIVEN** `requests/active/` 配下に `foo.md`, `bar.md` が存在する  
AND ワークツリーが特定の slug と紐付いていない (auto-detect 状況)  
**WHEN** `finish` (slug 未指定) を実行する  
**THEN** `resolveByAutoDetect()` が `.md` ファイルを列挙し slug を抽出する  
AND dir ではなく `.md` ファイルが対象になる

---

### TC-FINISH-004
- **Category**: FINISH
- **Priority**: should
- **Source**: tasks.md Task 4.2

**GIVEN** `active/` 配下に `.md` ファイルが 1 つだけ存在する  
**WHEN** `resolveByAutoDetect()` が呼ばれる  
**THEN** そのファイル名から拡張子を strip した slug が返却される

---

### TC-FINISH-005
- **Category**: FINISH
- **Priority**: should
- **Source**: tasks.md Task 4.2

**GIVEN** `active/` 配下に `.md` ファイルが複数存在する  
**WHEN** `resolveByAutoDetect()` が呼ばれる  
**THEN** 複数候補があるため auto-detect が曖昧エラーを返す (または明示的な slug 指定を促す)

---

### TC-FINISH-006
- **Category**: FINISH
- **Priority**: must
- **Source**: 受け入れ基準 7

**GIVEN** finish 後に `changes/my-feature/request.md` を確認する  
**WHEN** worktree setup で `requests/active/my-feature.md` → `changes/my-feature/request.md` のコピーが行われた  
**THEN** `changes/my-feature/request.md` が固定名 `request.md` で存在する  
AND `changes/my-feature/my-feature.md` のようなファイルは作成されない

---

## MIGRATE カテゴリ

### TC-MIGRATE-001
- **Category**: MIGRATE
- **Priority**: must
- **Source**: 要件 5 / 受け入れ基準 6

**GIVEN** `requests/active/old-slug/request.md` が存在する (旧 dir 形式)  
AND `old-slug/` 内に `request.md` のみが存在する  
**WHEN** `migrateRequestsFlat(cwd)` を実行する  
**THEN** `requests/active/old-slug.md` が作成され内容が一致する  
AND `requests/active/old-slug/` ディレクトリが削除される  
AND `result.migrated` に `"active/old-slug"` が含まれる

---

### TC-MIGRATE-002
- **Category**: MIGRATE
- **Priority**: must
- **Source**: 要件 5 / 受け入れ基準 6

**GIVEN** `requests/merged/done-slug/request.md` が存在する (旧 dir 形式)  
**WHEN** `migrateRequestsFlat(cwd)` を実行する  
**THEN** `requests/merged/done-slug.md` が作成される  
AND `requests/merged/done-slug/` が削除される  
AND `result.migrated` に `"merged/done-slug"` が含まれる

---

### TC-MIGRATE-003
- **Category**: MIGRATE
- **Priority**: must
- **Source**: 要件 5 (extra files ケース)

**GIVEN** `requests/merged/research-slug/request.md` が存在する  
AND 同 dir に `research-result.md` も存在する  
**WHEN** `migrateRequestsFlat(cwd)` を実行する  
**THEN** `requests/merged/research-slug.md` が作成される (request.md の内容)  
AND `requests/merged/research-slug/research-result.md` が残る  
AND `requests/merged/research-slug/` ディレクトリは削除されない  
AND `result.partial` に `"merged/research-slug"` が含まれる

---

### TC-MIGRATE-004
- **Category**: MIGRATE
- **Priority**: must
- **Source**: 要件 5 (skip ケース)

**GIVEN** `requests/active/no-request-md/` ディレクトリが存在するが `request.md` を含まない  
**WHEN** `migrateRequestsFlat(cwd)` を実行する  
**THEN** 該当 dir は変換されない  
AND `result.skipped` に `"active/no-request-md"` が含まれる  
AND エラーが発生しない

---

### TC-MIGRATE-005
- **Category**: MIGRATE
- **Priority**: must
- **Source**: 要件 5

**GIVEN** `requests/active/` および `requests/merged/` ディレクトリが存在しない  
**WHEN** `migrateRequestsFlat(cwd)` を実行する  
**THEN** エラーが発生せず空の result が返る  
AND `result.migrated`, `result.partial`, `result.skipped` がすべて空配列

---

### TC-MIGRATE-006
- **Category**: MIGRATE
- **Priority**: should
- **Source**: 要件 5 (idempotent 性)

**GIVEN** `requests/active/old-slug.md` が既に存在する (flat 形式、migration 済み)  
AND `requests/active/old-slug/` ディレクトリは既に削除済み  
**WHEN** `migrateRequestsFlat(cwd)` を再度実行する  
**THEN** エラーが発生しない  
AND 既存の `old-slug.md` は破壊されない

---

### TC-MIGRATE-007
- **Category**: MIGRATE
- **Priority**: should
- **Source**: 要件 5

**GIVEN** `active/` 配下に `.md` ファイル (既に flat 形式) が存在する  
**WHEN** `migrateRequestsFlat(cwd)` を実行する  
**THEN** `.md` ファイルは dir として認識されず migration 対象にならない (`stat.isDirectory()` が false)  
AND `result.migrated` / `result.partial` / `result.skipped` に含まれない

---

## WORKTREE カテゴリ

### TC-WORKTREE-001
- **Category**: WORKTREE
- **Priority**: must
- **Source**: 要件 4 / 受け入れ基準 7

**GIVEN** `requests/active/my-feature.md` が存在する (flat 形式)  
**WHEN** worktree setup (local.ts / managed.ts) が実行される  
**THEN** `changes/my-feature/request.md` が作成される (固定名 `request.md`)  
AND コピー元のファイル名 (`my-feature.md`) がそのまま使われない

---

### TC-WORKTREE-002
- **Category**: WORKTREE
- **Priority**: should
- **Source**: 要件 4

**GIVEN** `changes/my-feature/request.md` が worktree setup で作成された  
**WHEN** `changes/` 配下を確認する  
**THEN** `changes/my-feature/design.md` / `changes/my-feature/tasks.md` 等の artifact と同じ dir に `request.md` が配置されている  
AND `changes/archive/<slug>/request.md` も固定名で保持される

---

## 統合・回帰テスト

### TC-INTEG-001
- **Category**: STORE + CMD-NEW
- **Priority**: must
- **Source**: 受け入れ基準 1, 4

**GIVEN** 空の `specrunner/requests/` ディレクトリ  
**WHEN** `request new my-feature` → `request ls` → `request show my-feature` → `request rm my-feature` の順に実行する  
**THEN** 各コマンドが成功し、flat ファイルの作成・listing・読み込み・削除がすべて flat 形式で完結する

---

### TC-INTEG-002
- **Category**: MIGRATE + STORE
- **Priority**: must
- **Source**: 受け入れ基準 6

**GIVEN** migration 実行後に `active/some-slug.md` が存在する  
**WHEN** `store.read(cwd, "some-slug")` を呼び出す  
**THEN** migration 済みファイルが正常に読み込まれる

---

### TC-INTEG-003
- **Category**: PIPELINE + STORE
- **Priority**: must
- **Source**: 受け入れ基準 3 + pipeline 整合

**GIVEN** `run` コマンドが `specrunner/requests/active/my-feature.md` を対象ファイルとして受け取る  
**WHEN** `CANONICAL_PATTERN` で slug を抽出し `store.read()` で内容を取得する  
**THEN** slug が `"my-feature"` として正しく抽出され、store が flat ファイルを読める

---

### TC-INTEG-004
- **Category**: FINISH + WORKTREE
- **Priority**: must
- **Source**: 受け入れ基準 2, 7, 8

**GIVEN** `active/my-feature.md` が存在する  
**WHEN** `finish my-feature` をエンドツーエンドで実行する  
**THEN** `active/my-feature.md` が `merged/my-feature.md` に移動する (ファイル単位)  
AND `changes/my-feature/request.md` は固定名のまま維持される

---

## ビルド・型チェック

### TC-BUILD-001
- **Category**: BUILD
- **Priority**: must
- **Source**: 受け入れ基準 10

**GIVEN** 全実装ファイルの変更が完了している  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で終了する

---

### TC-BUILD-002
- **Category**: BUILD
- **Priority**: must
- **Source**: 受け入れ基準 10

**GIVEN** 全テストファイルの更新が完了している  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが green で終了する

---

## ADR・Spec

### TC-SPEC-001
- **Category**: SPEC
- **Priority**: must
- **Source**: 受け入れ基準 9

**GIVEN** `specrunner/changes/flatten-request-files/specs/cli-commands/delta.md` が存在する  
**WHEN** 内容を確認する  
**THEN** `request new` / `request show` / `request rm` の path 表記が flat 形式 (`active/<slug>.md`) に更新されている  
AND `request rm` の削除対象が「ディレクトリ再帰削除」から「ファイル削除」に変更されている

---

### TC-SPEC-002
- **Category**: ADR
- **Priority**: must
- **Source**: 受け入れ基準 11

**GIVEN** `docs/adr/flatten-request-files.md` が存在する  
**WHEN** 内容を確認する  
**THEN** 以下の 3 判断が記録されている:  
1. flat 化の判断 (requests/ 配下の dir 冗長性)  
2. `changes/` 側を固定名 `request.md` で維持する判断  
3. migration 方針 (extra files ある dir の partial migration)
