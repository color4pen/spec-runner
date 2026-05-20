# request 文書のレイアウトを flat 化する (= `requests/active/<slug>.md`)

## Meta

- **type**: spec-change
- **slug**: flatten-request-files
- **base-branch**: main
- **adr**: true

## 背景

現状の request 文書は `specrunner/requests/active/<slug>/request.md` という **dir 1 階層** + 固定ファイル名 `request.md` で配置されている。

```
specrunner/requests/active/
  finish-hint-actionable-fallback/
    request.md
  prompt-common-context-injection/
    request.md
```

問題:

1. **dir 内にファイル 1 個だけ** = dir を作る意味が薄い (= 冗長)
2. **slug が dir 名と file 名で重複** (= dir 名で slug、file 名は固定 `request.md`、視認性低下)
3. **`request ls` の出力が dir 名 listing になり** ファイル単位の操作感が薄い
4. **`request rm <slug>` が dir 削除** = ファイル単独操作より重い (= 誤削除リスク)

`specrunner/changes/<slug>/` 側 (= run 後の作業フォルダ) は design.md / tasks.md / specs/ 等の **multiple artifact** を持つので dir 構造が必要。一方、`requests/` 配下は **request 文書のみ** で、dir 構造は不要。

## 思想

`requests/` 配下と `changes/<slug>/` 配下の **semantic を分ける**:

| path | semantic | 構造 |
|---|---|---|
| `requests/active/<slug>.md` | **request 文書単体** | flat ファイル (= file 名 = slug) |
| `changes/<slug>/request.md` | **artifact 集合の 1 員** | dir 内 (= 固定名 `request.md`) |

両者は文脈が違うので別名規約で問題ない。むしろ「文書単体は flat、artifact 集合は dir」が semantic に整合的。

## 要件

### 1. request 文書の path を flat 化

- `specrunner/requests/active/<slug>/request.md` → `specrunner/requests/active/<slug>.md`
- `specrunner/requests/merged/<slug>/request.md` → `specrunner/requests/merged/<slug>.md`
- 拡張子は `.md` のみ (= 他形式不可)

### 2. `src/core/request/store.ts` の path 解決ロジック修正

- `resolve(cwd, slug)` → `path.join(cwd, ACTIVE_SUBDIR, slug + ".md")`
- `list(cwd)` → active 配下の `*.md` ファイルを listing (= dir 探索しない)
- `read(cwd, slug)` → flat ファイル read
- `write(cwd, slug, content)` → flat ファイル write (= mkdir parent のみ、`<slug>/` は作らない)
- `checkSlugCollision(cwd, slug)` → active と merged 両方の `<slug>.md` の存在をチェック
- `src/core/command/pipeline-run.ts` の `CANONICAL_PATTERN` 正規表現 (= 現状 `/active/([^/]+)/[^/]+\.md$/`) を flat 形式 `/active/([^/]+)\.md$/` に update する (= requestSlug の抽出が壊れないように)

### 3. request 系 CLI コマンドの対応

- `request new <slug>` → 1 ファイル作成 (= dir 作成不要)
- `request generate "<text>"` → 1 ファイル作成
- `request show <slug>` → flat ファイル read
- `request rm <slug>` → flat ファイル削除 (= dir 削除しない)
- `request ls` → `*.md` ファイル listing (= 拡張子 strip して slug 表示)
- `request validate <file|slug>` → slug 指定時は flat ファイル read
- `request review <file|slug>` → 同

### 4. `changes/<slug>/request.md` 側は固定名のまま維持

- worktree setup で `requests/active/<slug>.md` を `changes/<slug>/request.md` にコピー (= file 名変換)
- archive 後の `changes/archive/<slug>/request.md` も固定名のまま
- これは「artifact 集合の中の 1 員」semantic を保持する意図 (= 設計判断、ADR 記録)

### 5. 既存 active / merged の migration

- 既存の `requests/active/<slug>/request.md` (= dir 形式) を `requests/active/<slug>.md` (= flat 形式) に変換する migration script を追加 (= 1 回限り、本 request 内で実行)
- 既存の `requests/merged/<slug>/request.md` も同様に変換
- 変換後、空になった `<slug>/` を削除
- 既存 dir に `request.md` 以外の追加ファイル (= 例: `requests/merged/agent-tool-constraints-research/research-result.md`) が存在する場合の挙動:
  - `request.md` のみを flat 形式に変換 (= `requests/active/<slug>.md` に move)
  - 他ファイル (= `research-result.md` 等) は元 dir に残す (= `requests/active/<slug>/research-result.md` のまま)
  - 移行後 dir は空でないため削除しない
  - migration script の log に「partial migration: <slug> (extra files retained in dir)」を warning として記録

### 6. finish の挙動更新

- `finish` 時の active → merged move 操作を、dir move から **ファイル move** に変更 (= `mv requests/active/<slug>.md requests/merged/<slug>.md`)
- `src/core/finish/resolve-target.ts` の auto-detection (= `readdir` + `isDirectory()` ベース) を `.md` ファイル列挙に変更する (= 現状 dir 列挙のため flat 化後に無効になる)
- 同ファイル内の `detectSlugFromCwd(cwd)` を flat 形式 (= `active/<slug>.md` パターン) 対応に更新する (= 現状 `active/<slug>/` 前提)

### 7. test 更新

- 既存の request 系 test (= store, command 系) が dir 形式を前提にしている箇所を flat 形式に更新
- migration script の unit test を追加

## スコープ外

- `changes/<slug>/` への統合 (= PR #252) は別議論で扱う
- request 文書の中身フォーマット (= request.md の構造) は変更なし
- 過去の archive 配下 (= `changes/archive/<slug>/`) は touch しない (= 履歴 snapshot として固定名で保持)
- 拡張子の柔軟化 (= `.markdown` / `.txt` 等の受付) はスコープ外

## 受け入れ基準

- [ ] `specrunner/requests/active/<slug>.md` 形式で起票・read・write が動く
- [ ] `specrunner/requests/merged/<slug>.md` 形式で finish 後の文書が配置される
- [ ] `src/core/request/store.ts` の `resolve` / `list` / `read` / `write` / `checkSlugCollision` が flat 形式で動作する
- [ ] `request new` / `generate` / `show` / `rm` / `ls` / `validate` / `review` の全 CLI コマンドが flat 形式で動作する
- [ ] `request ls` の出力がファイル名から拡張子を strip した slug 表示になる
- [ ] migration script が既存 dir 形式 → flat 形式の変換を行い、本 request の merge 時に既存 request 群が変換される
- [ ] `changes/<slug>/request.md` 側は固定名のまま維持される (= worktree setup の file 名変換ロジックで吸収)
- [ ] `finish` の active → merged move が **ファイル単位** で行われる
- [ ] `cli-commands` capability の Requirement が flat 形式に合わせて delta spec 経由で update される
- [ ] `bun run typecheck && bun run test` が green
- [ ] ADR に「flat 化の判断」「changes/ 側を固定名のまま維持する判断」「migration の方針」を記録

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

TBD
