# Test Cases: requests-to-drafts-restructure

## TC-01: paths.ts — draftsDir() の戻り値

- **Category**: Unit / paths
- **Priority**: must
- **Source**: Task 1, AC「`draftsDir()` が `"specrunner/drafts"` を返す」

**GIVEN** `src/util/paths.ts` に `draftsDir()` が実装されている  
**WHEN** `draftsDir()` を呼び出す  
**THEN** `"specrunner/drafts"` を返す

---

## TC-02: paths.ts — draftPath(slug) の戻り値

- **Category**: Unit / paths
- **Priority**: must
- **Source**: Task 1, AC「`draftPath("foo")` が `"specrunner/drafts/foo.md"` を返す」

**GIVEN** `src/util/paths.ts` に `draftPath(slug)` が実装されている  
**WHEN** `draftPath("foo")` を呼び出す  
**THEN** `"specrunner/drafts/foo.md"` を返す

---

## TC-03: store.ts — resolve() が drafts/ を返す

- **Category**: Unit / store
- **Priority**: must
- **Source**: Task 2, AC「`resolve()` が `specrunner/drafts/<slug>.md` を返す」

**GIVEN** `store.resolve("my-feature")` を呼び出す準備ができている  
**WHEN** `store.resolve("my-feature")` を実行する  
**THEN** `"specrunner/drafts/my-feature.md"` を返す

---

## TC-04: store.ts — checkSlugCollision が drafts/ の衝突を検出する

- **Category**: Unit / store
- **Priority**: must
- **Source**: Task 2, AC「`checkSlugCollision` が 3 経路すべてで衝突を検出する」, 要件6

**GIVEN** `specrunner/drafts/foo.md` が存在する  
**WHEN** slug `"foo"` で `checkSlugCollision` を呼び出す  
**THEN** 衝突検出結果 (= エラーまたは true) を返す

---

## TC-05: store.ts — checkSlugCollision が requests/merged/ の衝突を検出する

- **Category**: Unit / store
- **Priority**: must
- **Source**: Task 2, AC「checkSlugCollision が 3 経路すべてで衝突を検出する」

**GIVEN** `specrunner/requests/merged/old-feature.md` が存在する  
**WHEN** slug `"old-feature"` で `checkSlugCollision` を呼び出す  
**THEN** 衝突を検出する (= 既存 140 件との衝突を防ぐ)

---

## TC-06: store.ts — checkSlugCollision が changes/archive/ の衝突を検出する

- **Category**: Unit / store
- **Priority**: must
- **Source**: Task 2, AC「checkSlugCollision が 3 経路すべてで衝突を検出する」

**GIVEN** `specrunner/changes/archive/archived-feature/` ディレクトリが存在する  
**WHEN** slug `"archived-feature"` で `checkSlugCollision` を呼び出す  
**THEN** 衝突を検出する

---

## TC-07: store.ts — checkSlugCollision が衝突なしの slug を通過させる

- **Category**: Unit / store
- **Priority**: must
- **Source**: Task 2

**GIVEN** 3 経路のいずれにも `"brand-new-slug"` が存在しない  
**WHEN** slug `"brand-new-slug"` で `checkSlugCollision` を呼び出す  
**THEN** 衝突なし (= 成功 / false) を返す

---

## TC-08: request new — drafts/ に出力される

- **Category**: Integration / command
- **Priority**: must
- **Source**: Task 3a, 受け入れ基準「`request new` の path 参照が `drafts/` に更新されている」

**GIVEN** `specrunner/drafts/` ディレクトリが存在する (または自動作成される)  
**WHEN** `request new` コマンドで slug `"test-feature"` の request を作成する  
**THEN** `specrunner/drafts/test-feature.md` が生成される  
**AND** `specrunner/requests/active/test-feature.md` は生成されない

---

## TC-09: request rm — drafts/ のファイルを削除する

- **Category**: Unit / command
- **Priority**: must
- **Source**: Task 3b, 受け入れ基準「`request rm` の path 参照が `drafts/` に更新されている」

**GIVEN** `specrunner/drafts/test-feature.md` が存在する  
**WHEN** `request rm test-feature` を実行する  
**THEN** `specrunner/drafts/test-feature.md` が削除される

---

## TC-10: request show — drafts/ のファイルを表示する

- **Category**: Unit / command
- **Priority**: must
- **Source**: Task 3c, 受け入れ基準「`request show` の path 参照が `drafts/` に更新されている」

**GIVEN** `specrunner/drafts/test-feature.md` が存在する  
**WHEN** `request show test-feature` を実行する  
**THEN** `specrunner/drafts/test-feature.md` の内容が出力される

---

## TC-11: request show — requests/active/ への fallback

- **Category**: Unit / command
- **Priority**: should
- **Source**: Task 3c「後方互換: `drafts/` に存在しない場合、旧 `requests/active/` を fallback」

**GIVEN** `specrunner/drafts/old-req.md` は存在しない  
**AND** `specrunner/requests/active/old-req.md` が存在する  
**WHEN** `request show old-req` を実行する  
**THEN** `specrunner/requests/active/old-req.md` の内容が出力される  
**AND** stderr に deprecation warning が出力される

---

## TC-12: request migrate-flat — drafts/ を対象にする

- **Category**: Unit / command
- **Priority**: should
- **Source**: Task 3d

**GIVEN** `specrunner/drafts/` 配下に dir 形式の request が存在する  
**WHEN** `request migrate-flat` を実行する  
**THEN** `specrunner/drafts/<slug>.md` の flat 形式に変換される

---

## TC-13: pipeline-run — CANONICAL_PATTERN が drafts/ の path を認識する

- **Category**: Unit / pipeline-run
- **Priority**: must
- **Source**: Task 4, AC「`specrunner/drafts/my-feature.md` から `requestSlug = "my-feature"` が抽出される」

**GIVEN** CANONICAL_PATTERN が `/^.*\/specrunner\/drafts\/([^/]+)\.md$/` に更新されている  
**WHEN** パス `"/repo/specrunner/drafts/my-feature.md"` に対してパターンマッチを実行する  
**THEN** capture group から `"my-feature"` が抽出される

---

## TC-14: pipeline-run — 旧 requests/active/ の path は CANONICAL_PATTERN に一致しない

- **Category**: Unit / pipeline-run
- **Priority**: should
- **Source**: Task 4 (旧パスは対象外であることの確認)

**GIVEN** CANONICAL_PATTERN が更新されている  
**WHEN** パス `"/repo/specrunner/requests/active/my-feature.md"` でマッチを試みる  
**THEN** マッチしない (= null)

---

## TC-15: local runtime — run 後に main worktree の draft が消える (再現テスト)

- **Category**: Regression / runtime
- **Priority**: must
- **Source**: Task 5, Task 14a, 受け入れ基準「`pipeline-run` の worktree setup で `drafts/<slug>.md` が move される」

**GIVEN** `specrunner/drafts/test-slug.md` が main cwd に存在する  
**WHEN** local runtime の setupWorkspace を呼び出す  
**THEN** main cwd の `specrunner/drafts/test-slug.md` が存在しない  
**AND** worktree の `specrunner/changes/test-slug/request.md` が存在する

---

## TC-16: local runtime — worktree に drafts/<slug>.md が作られない

- **Category**: Unit / runtime
- **Priority**: must
- **Source**: Task 5「canonical path コピーを廃止」、design D2

**GIVEN** local runtime の setupWorkspace を実行する  
**WHEN** worktree の `specrunner/drafts/` を確認する  
**THEN** `specrunner/drafts/<slug>.md` は worktree に存在しない  
**AND** `specrunner/changes/<slug>/request.md` のみが存在する

---

## TC-17: local runtime — fs.rm 失敗は非致命的

- **Category**: Unit / runtime
- **Priority**: should
- **Source**: Task 5「fs.rm 失敗は非致命的 warning」、design R1

**GIVEN** `fs.rm` が例外を throw するようにモックされている  
**WHEN** local runtime の setupWorkspace を呼び出す  
**THEN** pipeline は中断せず継続する  
**AND** stderr に warning メッセージが出力される

---

## TC-18: managed runtime — run 後に main cwd の draft が消える

- **Category**: Regression / runtime
- **Priority**: must
- **Source**: Task 6, 受け入れ基準「managed runtime でも `drafts/<slug>.md` が main cwd から消える」

**GIVEN** `specrunner/drafts/test-slug.md` が main cwd に存在する  
**WHEN** managed runtime の setupWorkspace を呼び出す  
**THEN** main cwd の `specrunner/drafts/test-slug.md` が存在しない

---

## TC-19: finish — move-requests-dir.ts が廃止されている (再現テスト・静的)

- **Category**: Regression / static
- **Priority**: must
- **Source**: Task 7, Task 14c, 受け入れ基準「`move-requests-dir.ts` が廃止され呼び出しが消えている」

**GIVEN** `src/core/finish/orchestrator.ts` のソースコードを文字列として読み込む  
**WHEN** `"move-requests-dir"` を含む行を検索する  
**THEN** 該当行が存在しない (= import も呼び出しも消えている)

---

## TC-20: finish — move-requests-dir.ts ファイルが存在しない

- **Category**: Regression / static
- **Priority**: must
- **Source**: Task 7b

**GIVEN** `src/core/finish/` ディレクトリを確認する  
**WHEN** `move-requests-dir.ts` の存在を確認する  
**THEN** ファイルが存在しない

---

## TC-21: finish — archive 後に changes/archive/ のみに request.md が存在する (再現テスト)

- **Category**: Regression / finish
- **Priority**: must
- **Source**: Task 14b, 受け入れ基準「finish 後に main worktree に untracked file が残らない」

**GIVEN** finish orchestrator の Phase 1 Archive を実行する準備がある  
**WHEN** Phase 1 Archive を実行する  
**THEN** `specrunner/changes/archive/<slug>/request.md` が存在する  
**AND** `specrunner/requests/active/<slug>.md` は生成されていない  
**AND** `specrunner/requests/merged/<slug>.md` は新規生成されていない

---

## TC-22: finish — 引数なしで Specify エラーが返る

- **Category**: Unit / resolve-target
- **Priority**: must
- **Source**: Task 8, 受け入れ基準「`finish` を引数なしで呼んだ場合 `Specify <slug>, --pr, or --job` エラーで終了」

**GIVEN** resolve-target の `resolveByAutoDetect` が廃止されエラー返却実装になっている  
**WHEN** `finish` をスラグ・`--pr`・`--job` いずれの引数もなしで呼び出す  
**THEN** exit code 2 で終了する  
**AND** エラーメッセージに `"Specify <slug>, --pr, or --job"` が含まれる

---

## TC-23: resolve-target — detectSlugFromCwd が削除されている

- **Category**: Unit / resolve-target
- **Priority**: should
- **Source**: Task 8, design D9

**GIVEN** `src/core/finish/resolve-target.ts` のソースコードを確認する  
**WHEN** `"detectSlugFromCwd"` のシンボルを検索する  
**THEN** 定義も呼び出しも存在しない

---

## TC-24: request-patterns.ts — changes/archive/ から examples を収集する

- **Category**: Unit / context
- **Priority**: must
- **Source**: Task 9, 受け入れ基準「`request-patterns.ts` が空配列ではなく実際のサンプルが返る」

**GIVEN** `specrunner/changes/archive/<slug>/request.md` が存在する  
**WHEN** `collectRequestPatterns(cwd)` を呼び出す  
**THEN** 空配列ではなく 1 件以上の examples を返す

---

## TC-25: request-patterns.ts — isDirectory() filter が archive dir 形式に対応する

- **Category**: Unit / context
- **Priority**: must
- **Source**: Task 9, design D6「PR #344 以降 flat 形式で isDirectory() filter により全エントリ除外」の修正

**GIVEN** `specrunner/changes/archive/` 配下に `<slug>/` ディレクトリが存在する  
**WHEN** `collectRequestPatterns` が archive ディレクトリを列挙する  
**THEN** ディレクトリエントリが `isDirectory()` filter を通過し、`request.md` が読み込まれる

---

## TC-26: doctor — drafts/ 不在で warn が出る

- **Category**: Integration / doctor
- **Priority**: should
- **Source**: Task 10, AC「`drafts/` 不在で warn」

**GIVEN** `specrunner/drafts/` ディレクトリが存在しない  
**WHEN** `doctor` の workflow-structure check を実行する  
**THEN** `drafts/` ディレクトリ不在に関する warning が出力される

---

## TC-27: doctor — requests/active/ 存在で deprecation warn が出る

- **Category**: Integration / doctor
- **Priority**: should
- **Source**: Task 10, AC「`requests/active/` 存在で warn (deprecation)」

**GIVEN** `specrunner/requests/active/` ディレクトリが存在する  
**WHEN** `doctor` の workflow-structure check を実行する  
**THEN** `requests/active/` が廃止予定である旨の deprecation warning が出力される

---

## TC-28: doctor — requests/merged/ は check 対象外

- **Category**: Unit / doctor
- **Priority**: should
- **Source**: Task 10, AC「`requests/merged/` は無視」

**GIVEN** `specrunner/requests/merged/` ディレクトリが存在する  
**WHEN** `doctor` の workflow-structure check を実行する  
**THEN** `requests/merged/` に関するエラーまたは warning は出力されない

---

## TC-29: delta spec — cli-commands delta spec が存在する

- **Category**: Static / delta-spec
- **Priority**: must
- **Source**: Task 12a, 受け入れ基準「3 capability の delta spec が存在する」

**GIVEN** `specrunner/changes/requests-to-drafts-restructure/delta-specs/` を確認する  
**WHEN** `cli-commands.md` の存在を確認する  
**THEN** ファイルが存在する  
**AND** `specrunner/drafts/<slug>.md` の path 仕様が含まれている

---

## TC-30: delta spec — job-state-store delta spec が存在する

- **Category**: Static / delta-spec
- **Priority**: must
- **Source**: Task 12b

**GIVEN** `specrunner/changes/requests-to-drafts-restructure/delta-specs/` を確認する  
**WHEN** `job-state-store.md` の存在を確認する  
**THEN** ファイルが存在する  
**AND** CANONICAL_PATTERN が `specrunner/drafts/<slug>.md` に更新されている

---

## TC-31: delta spec — repository-registration delta spec が存在する

- **Category**: Static / delta-spec
- **Priority**: must
- **Source**: Task 12c

**GIVEN** `specrunner/changes/requests-to-drafts-restructure/delta-specs/` を確認する  
**WHEN** `repository-registration.md` の存在を確認する  
**THEN** ファイルが存在する  
**AND** `drafts/` への bootstrap check 記述が含まれている

---

## TC-32: README.md — requests/active/ の言及が drafts/ に更新されている

- **Category**: Static / doc
- **Priority**: should
- **Source**: Task 11a

**GIVEN** `README.md` のソースを確認する  
**WHEN** `requests/active/` の文字列を検索する  
**THEN** 言及が `drafts/` に置き換えられている

---

## TC-33: parallel-request-workflow SKILL.md — 起票 path が drafts/ になっている

- **Category**: Static / doc
- **Priority**: should
- **Source**: Task 11b

**GIVEN** `.claude/skills/parallel-request-workflow/SKILL.md` を確認する  
**WHEN** `requests/active/` の文字列を検索する  
**THEN** 言及が `drafts/` に置き換えられている

---

## TC-34: acceptance-and-issue-audit SKILL.md — archive path が changes/archive/ になっている

- **Category**: Static / doc
- **Priority**: should
- **Source**: Task 11c

**GIVEN** `.claude/skills/acceptance-and-issue-audit/SKILL.md` を確認する  
**WHEN** archive path の記述を確認する  
**THEN** `changes/archive/` を参照している

---

## TC-35: rebase-finish SKILL.md — active 残骸 cleanup 記述が更新されている

- **Category**: Static / doc
- **Priority**: could
- **Source**: Task 11d

**GIVEN** `.claude/skills/rebase-finish/SKILL.md` を確認する  
**WHEN** `active` 残骸 cleanup に関する記述を確認する  
**THEN** 不要化された手順が削除されているか `drafts/` に言い換えられている

---

## TC-36: typecheck — bun run typecheck が green

- **Category**: Build / typecheck
- **Priority**: must
- **Source**: Task 15, 受け入れ基準「`bun run typecheck && bun run test` が green」

**GIVEN** 全コアファイルの変更が完了している  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で終了する

---

## TC-37: test — bun run test が green

- **Category**: Build / test
- **Priority**: must
- **Source**: Task 15

**GIVEN** 全テストファイルの更新が完了している  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが通過する

---

## TC-38: store.ts — write() が specrunner/drafts/ に mkdir する

- **Category**: Unit / store
- **Priority**: must
- **Source**: Task 2「`write()` の `mkdir` 対象を `specrunner/drafts` に変更」

**GIVEN** `specrunner/drafts/` ディレクトリが存在しない状態  
**WHEN** `store.write(slug, content)` を呼び出す  
**THEN** `specrunner/drafts/` が自動作成され、`specrunner/drafts/<slug>.md` が書き込まれる

---

## TC-39: store.ts — list() が drafts/ のファイルを返す

- **Category**: Unit / store
- **Priority**: must
- **Source**: Task 2 (store data layer の drafts/ 向け変更)

**GIVEN** `specrunner/drafts/foo.md` と `specrunner/drafts/bar.md` が存在する  
**WHEN** `store.list()` を呼び出す  
**THEN** `["foo", "bar"]` (または同等の slug リスト) を返す  
**AND** `specrunner/requests/active/` のファイルは含まれない

---

## TC-40: ADR — 4 つの設計判断が記録されている

- **Category**: Static / adr
- **Priority**: must
- **Source**: 受け入れ基準「ADR に記録」

**GIVEN** ADR ファイルが `specrunner/changes/requests-to-drafts-restructure/` 配下に存在する  
**WHEN** ADR の内容を確認する  
**THEN** 以下の 4 項目が記録されている:
1. `drafts/` rename の採用
2. archive 経路 1 本化
3. 起票 untracked 残骸バグの構造解 (run 開始時の move 化)
4. 既存 `requests/merged/` の read-only 維持判断
