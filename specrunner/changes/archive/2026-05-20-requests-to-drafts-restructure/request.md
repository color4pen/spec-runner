# request 起票エントリポイントを `drafts/` に rename し、archive 経路を `changes/` に一本化する

## Meta

- **type**: spec-change
- **slug**: requests-to-drafts-restructure
- **base-branch**: main
- **adr**: true

## 背景

現状、1 件の request.md が pipeline を通る間に **4 箇所** に同じ内容が散らばる:

| path | 役割 | 生成タイミング |
|---|---|---|
| `specrunner/requests/active/<slug>.md` | 起票エントリポイント (= 原本) | `request new` |
| `specrunner/changes/<slug>/request.md` | agent 作業ファイルと並ぶコピー | worktree setup (= run 開始時) |
| `specrunner/requests/merged/<slug>.md` | archive 経路 1 (= request だけ) | finish (= `move-requests-dir.ts` で git mv) |
| `specrunner/changes/archive/<slug>/request.md` | archive 経路 2 (= 作業ファイル一式と一緒) | finish (= `archive-change-folder.ts` で git mv) |

= 同じ内容が 4 箇所、archive だけで 2 箇所。冗長。

### 派生バグ (= 本日特定済)

起票で main worktree に作る `requests/active/<slug>.md` は **untracked** で生成される。worktree は `origin/main` から切るため、この untracked file は feature branch には自然継承されず、worktree setup の `fs.cp` + `git add` で **feature branch の 1st commit に「新規追加」として** 紛れ込む。

finish の `git mv active → merged` は worktree 内で正しく動作するが、squash merge で main に統合される時、feature branch 上の「active を add → active を rename to merged」が 1 commit に圧縮されて **active の add と rename が打ち消し合う**。結果:

- main の git index: `merged/<slug>.md` だけ new file として add される (= active は最初から存在しない扱い)
- main worktree の file system: 起票時の untracked `active/<slug>.md` は git の関知外で **永遠に残る**

= 「`finish` 後に active/<slug>.md が untracked のまま残る」現象の root cause。

### `requests/` という名前の意味過多

`requests/active/` の "active" は **起票直後 (= run 前) の状態** を意味しているが、job state の `running / awaiting-merge / archived` 等と語彙が衝突する。「active = job 進行中」と読まれやすい。

## 思想

### 状態と path の対応を 1 対 1 にする

| 状態 | 現状 | 改訂後 |
|---|---|---|
| 起票直後 (= run 前) | `specrunner/requests/active/<slug>.md` | `specrunner/drafts/<slug>.md` |
| run 中・実装中 (= worktree 内) | `specrunner/changes/<slug>/request.md` | 同左 (= 変更なし) |
| finish 後 (= archived) | `specrunner/requests/merged/<slug>.md` + `specrunner/changes/archive/<slug>/request.md` | `specrunner/changes/archive/<slug>/request.md` のみ |

= "drafts" は「まだ run していない原稿」だけを指し、状態が明確。archive は `changes/` 配下の 1 経路に集約。

### 起票エントリポイントを一回限りの「move」で消費する

run 開始時に `drafts/<slug>.md` を **削除しつつ** worktree の `changes/<slug>/request.md` に移す (= コピー後に main worktree の draft file を削除)。これで:

- main worktree から `drafts/<slug>.md` が消える (= 上記 untracked 残骸バグの構造解)
- feature branch 上では `changes/<slug>/request.md` だけが新規追加される (= 経路一本化)
- finish の archive は `changes/<slug>/` → `changes/archive/<slug>/` の 1 経路のみ

### `requests/merged/` の歴史的データは read-only として残す

過去の 140 件は migration せず `requests/merged/` ディレクトリ自体は残す (= 履歴の参照価値あり、breaking 変更を避ける)。新規 archive は `changes/archive/` のみに入る。

## 要件

### 1. `specrunner/drafts/` 新設 + 起票先の変更

- `request new` (= `src/core/command/request-new.ts`) の出力先を `specrunner/requests/active/<slug>.md` から `specrunner/drafts/<slug>.md` に変更
- `request rm` (= `src/core/command/request-rm.ts`) の対象 path を `drafts/` に変更
- `request show` (= `src/core/command/request-show.ts`) の lookup 順を `drafts/` 優先に変更 (= 後方互換で旧 `requests/active/` も fallback)
- `request migrate-flat` (= `src/core/command/request-migrate-flat.ts`) の対象 path を `drafts/` に対応

### 2. run 開始時の move 化

`src/core/runtime/local.ts:202-251` および `src/core/runtime/managed.ts` の対応箇所で:

```typescript
// 現状: main の active を worktree にコピー (= main 側は untracked のまま残る)
fs.cp(opts.requestFilePath, worktreeRequestPath)

// 改訂後: 1. worktree にコピー、2. main の draft を削除
fs.cp(opts.requestFilePath, worktreeRequestPath)
fs.rm(opts.requestFilePath)  // main worktree から draft 削除
```

これで起票時の untracked file は run と同時に main から消える。

### 3. finish の archive 経路を一本化

- `src/core/finish/move-requests-dir.ts` を **廃止** (= active → merged の git mv は不要)
- `src/core/finish/orchestrator.ts` から `moveRequestsDir` 呼び出しを削除
- `archive-change-folder.ts` の `changes/<slug>/` → `changes/archive/<slug>/` のみで archive 完結

### 4. finish の `resolve-target.ts` 更新

`src/core/finish/resolve-target.ts` の slug 解決ロジックから `requests/active/` / `requests/merged/` への lookup を削除し、`drafts/` および `changes/archive/` を参照する形に変更。

**auto-detect 廃止**: 現状 `resolveByAutoDetect` は `requests/active/` を列挙して entry が 1 件だけなら slug を自動選択している。改訂後は `drafts/` が run 開始時に空になるため auto-detect が機能しない。代替実装 (= job state ベース) は提供せず、**`finish` を引数なしで呼んだ場合は `Specify <slug>, --pr, or --job` エラーで終了** する仕様に変更する。

### 5. doctor の workflow-structure check 更新

`src/core/doctor/checks/repo/workflow-structure.ts` で期待するディレクトリ構造を `drafts/` 主体に変更。`requests/merged/` は read-only として存在を許容するが、`requests/active/` は warn (= 廃止予定の周知)。

### 6. path constants / patterns 更新

- `src/context/request-patterns.ts` の LLM パターン収集ソースを `specrunner/changes/archive/<slug>/request.md` (= dir 形式) に向ける。現状は `requests/merged/` を dir 形式として読み込んでいるが、PR #344 以降 flat 形式 (= `<slug>.md`) に統一されており、`isDirectory()` filter で全エントリ除外され **既に事実上空配列を返している**。本改訂で archive 経路一本化に合わせて修正し、LLM examples を復活させる
- `src/core/request/store.ts` の data layer (= `resolve` / `list` / `read` / `write` / `checkSlugCollision`) を `drafts/` に向ける。**`checkSlugCollision` は `drafts/` + `requests/merged/` (= 既存 140 件) + `changes/archive/` (= 既存 106 件 + 新規分) の 3 経路を参照** し、過去資産との衝突および新規 archive との衝突を引き続き防ぐ
- `src/util/paths.ts` 等にヘルパー (= `draftsDir()` / `draftPath(slug)`) を追加し、ハードコードを排除

### 7. capability spec の delta 更新

該当する capability の delta spec で改訂:
- `cli-commands` (= request 系コマンドの path 仕様)
- `job-state-store` (= request 起点 path の参照)
- `repository-registration` (= dir 構造の前提)

具体 path は delta spec 側に記載 (= request 本文では指定しない)。

### 8. 既存データの扱い

- `specrunner/requests/active/rules-md-injection.md` (= 残骸 1 件): 本 request の run 開始時に move 対象になるため自動で消える
- `specrunner/requests/merged/*.md` (= 140 件): **migration しない**、read-only として保持
- `specrunner/changes/archive/*/` (= 106 件): 変更なし

### 9. doc / skill 更新

- `README.md` の path 言及
- `.claude/skills/parallel-request-workflow/SKILL.md` の起票 path
- `.claude/skills/acceptance-and-issue-audit/SKILL.md` の archive path 参照
- `.claude/skills/rebase-finish/SKILL.md` の active 残骸 cleanup 記述 (= 本改訂で不要化、または `drafts/` への言い換え)

### 10. test 更新

影響する test (= 約 18 ファイル):
- `tests/finish-adversarial.test.ts` / `finish-orchestrator.test.ts` / `finish-ps-integration.test.ts` / `finish-resolve-target.test.ts`
- `tests/unit/core/command/request-new.test.ts` / `request-rm.test.ts` / `request-show.test.ts` / `request-migrate-flat.test.ts`
- `tests/unit/core/command/pipeline-run-canonical.test.ts` / `validation-tc.test.ts`
- `tests/unit/core/request/store.test.ts` / `generator.test.ts`
- `tests/unit/context/request-patterns.test.ts`
- `tests/unit/core/resume/resolve-job.test.ts`
- `tests/state/job-slug.test.ts` / `tests/unit/cli/job-show.test.ts` / `cli/resume.test.ts`
- `tests/unit/util/slugify.test.ts` / `tests/unit/core/pr-create/body-template.test.ts`

### 11. 再現 test (= 静的 unit test、LLM 呼び出しなし)

本日のバグの構造的 catch:

- `run` 後に main worktree (= cwd) の drafts/<slug>.md が存在しないことを assert (= move されたことを確認)
- `finish` 後に main の archive path のみに request.md が存在し、`requests/active/` / `requests/merged/` には新規ファイルが生成されないことを assert
- `move-requests-dir.ts` が import されていないことを静的に確認 (= 廃止漏れ catch)

## スコープ外

- **既存 140 件の `requests/merged/` の `changes/archive/` への migration** (= 別 request で議論、本 request は read-only 保持のみ)
- **prompt ファイルの修正** (= `request.md` ファイル名は維持、prompt 層は path 抽象化済で影響なし、確認済)
- **並列起票時の衝突対策** (= 別議論)
- **`requests/` ディレクトリ自体の削除** (= 140 件の merged が残るため保持)
- **`finish` 引数なし呼び出しの代替 auto-detect 実装** (= job state ベース等の代替を提供しない、エラーで終了)

## 受け入れ基準

- [ ] `specrunner/drafts/<slug>.md` への起票が `request new` で成立する
- [ ] `request new` / `request rm` / `request show` / `request migrate-flat` の path 参照が `drafts/` に更新されている
- [ ] `pipeline-run` (= local / managed 両 runtime) の worktree setup で `drafts/<slug>.md` が worktree に move (= main から削除) される
- [ ] `finish` 後に main worktree に untracked file が残らない (= `bun run test` および手動検証で確認)
- [ ] `move-requests-dir.ts` が廃止され、`finish` の orchestrator から呼び出しが消えている
- [ ] `finish` を引数なしで呼んだ場合 `Specify <slug>, --pr, or --job` エラーで終了する (= `resolveByAutoDetect` 廃止)
- [ ] `resolve-target.ts` / `doctor/workflow-structure.ts` / `request-patterns.ts` / `request/store.ts` / `util/paths.ts` の path 参照が更新されている
- [ ] `request-patterns.ts` が `changes/archive/<slug>/request.md` から examples を収集し、空配列ではなく実際のサンプルが返る
- [ ] `store.ts` の `checkSlugCollision` が `drafts/` + `requests/merged/` + `changes/archive/` の 3 経路を参照して衝突を検出する
- [ ] 該当する capability spec の delta 更新が含まれる (= `cli-commands` / `job-state-store` / `repository-registration` 等)
- [ ] `specrunner/requests/merged/` 既存 140 件は read-only として残されており、新規ファイルは生成されない
- [ ] `specrunner/requests/active/rules-md-injection.md` 残骸が本 run の move 機構で消える (= 副次効果として確認)
- [ ] `README.md` / 関連 3 skill の path 言及が更新されている
- [ ] 再現 test (= drafts move / archive 一本化 / `move-requests-dir.ts` 廃止) が静的 unit test として追加され green
- [ ] 既存 18 件前後の test が新設計に合わせて update され green
- [ ] `bun run typecheck && bun run test` が green
- [ ] ADR に「`drafts/` rename の採用」「archive 経路 1 本化」「起票 untracked 残骸バグの構造解 (= run 開始時の move 化)」「既存 `requests/merged/` の read-only 維持判断」を記録

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

TBD
