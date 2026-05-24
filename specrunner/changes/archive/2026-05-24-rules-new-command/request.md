# `specrunner rules new` コマンドの追加 (rules ファイル scaffold UX)

## Meta

- **type**: new-feature
- **slug**: rules-new-command
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

PR #380 (`per-step-rule-followup`) で `specrunner/rules/<step>/<NN>.md` に project 固有の規約ファイルを置くと、対象 step の作業 turn 後に N 段 follow-up が走る機構が導入された。ファイル中身は完全自由文、CLI は中身を解釈しない方針。

書き手が空のリポジトリから書き始めるとき、以下を自力でやる必要が出る:

- step 名一覧を知る (= `STEP_NAMES` を ソースから読む)
- ディレクトリを切る (= `mkdir -p specrunner/rules/<step>/`)
- 番号 prefix を採番する (= 既存ファイルを ls して次の番号)
- ファイル名規約を覚える (= `<NN>-<rule-slug>.md`)
- 推奨見出しを毎回手で書く (= `## やめてほしいこと` 等)

これは UX 上「自分で頑張って」の領域で、書き始めの障壁になる。既存 `specrunner request new <slug>` と同型の noun-verb で `specrunner rules new <step-name> <rule-slug>` を提供することで、書き始めの摩擦を消す。

## 要件

### コマンド形

1. **`specrunner rules new <step-name> <rule-slug>` を CLI に追加**: `specrunner/rules/<step-name>/<NN>-<rule-slug>.md` を生成して stdout に作成 path を返す。ディレクトリが存在しない場合は `mkdir -p` 相当で自動作成する。
2. **step 名の検証**: `<step-name>` は `AGENT_STEP_NAMES` (`src/core/step/step-names.ts`) と突き合わせる。CLI step (verification / pr-create / delta-spec-validation) は executor が rules を無視するため受け付けない。一致しない場合はエラー終了し、有効な agent step 名一覧を suggestion として表示する。
3. **番号 prefix の自動採番**: `specrunner/rules/<step-name>/` 配下を scan し、既存ファイルの最大番号 + 1 で採番する (ゼロパディング 2 桁、`01-` `02-` ...)。空ディレクトリなら `01-` から開始する。
4. **rule slug の sanitize**: `<rule-slug>` は kebab-case を期待。許容文字セットは既存 `request new` の slug 検証と同じ (kebab-case allowlist)。空白 / `_` は警告して `-` に変換、その他 invalid 文字はエラー終了する。エラー動作は本要件の記述 (warn+convert / error) が優先。
5. **既存ファイルとの衝突回避**: 同名ファイルが既に存在する場合はエラー終了 (上書き禁止)。

### template 内容 (rules new 実行時のみ scaffold)

6. **推奨見出し付き template を書き込む**: `## やめてほしいこと` / `## こうしてほしいこと` / `## 例外` の 3 セクションを含む空 template を生成する。
7. **冒頭コメントで方針を明示**: template の冒頭に `<!-- ... -->` コメントで以下を埋め込む:
   - CLI はこのファイルの中身を解釈しないこと
   - 書き手の自然文で書いてよいこと (推奨見出しは強制ではない)
   - 番号 prefix が follow-up 順序を決めること
   - 順序の方針 (= 重要度高いものを末尾、recency 武器化)
8. **template を CLI 内に embedded const として保持**: 別 `.md` ファイルからの実行時読み込みではなく、source code 内の string const として持つ (= 既存 `request template` と同じパターン)。

### help / error message

9. **`specrunner rules --help` で usage を表示**: `request --help` と同等の structure で表示する。step 名規約 / 番号 prefix の自動採番 / 推奨見出し / 順序方針 (末尾優先) を help 出力に含める。
10. **エラーメッセージは候補を提示**: step 名 typo / invalid slug / 既存衝突 のいずれもエラーメッセージで次のアクションを明示する (例: 「step 名 `implmentor` は不明です。候補: implementer, code-review, ...」)。

### CLI surface 整合

11. **`specrunner rules` は `request` と同型の noun-verb 構造**: `specrunner rules new` を追加し、将来 `rules ls` / `rules show` を後追いで追加できる構造にする (本 request では `new` のみ実装)。
12. **`bin/specrunner.ts` のコマンドルーティングに `rules` noun を登録**: 既存 `request` / `job` / `runtime` と同パターンで `src/cli/command-registry.ts` または同等経路に登録する。

## スコープ外

- **`specrunner rules ls` / `rules show` / `rules template` 等の閲覧コマンド**: 別途 GitHub issue で judgment 待ち、UX 検証してから後追いする。
- **rules ファイル中身の CLI 解釈**: 別 request の方針通り、書式の押し付けはしない。
- **rules ファイルの自動 lint / format 機械チェック**: project の linter に任せる方針 (= `per-step-rule-followup` のスコープ外規定と一貫)。
- **N 段 follow-up 機構**: PR #380 で merge 済み。本 request はファイル scaffold UX のみを扱う。
- **`specrunner init` の変更**: 本 request では `init` を触らない。

## 受け入れ基準

- [ ] `specrunner rules new <step-name> <rule-slug>` で `specrunner/rules/<step-name>/<NN>-<rule-slug>.md` が作成される
- [ ] 不正な step 名でエラー終了し、候補一覧が表示される
- [ ] 同ディレクトリ内の番号 prefix が自動採番される (既存ファイル最大 + 1)
- [ ] 既存ファイル名と衝突する場合はエラー終了 (上書き禁止)
- [ ] 生成された template に推奨見出しと方針コメントが含まれる
- [ ] `specrunner rules --help` で usage と書き方の方針が表示される
- [ ] `specrunner --help` の出力に `rules new` が記載されている
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

### D1: noun-verb 構造の踏襲

`specrunner request new <slug>` / `specrunner job start <slug>` と同型の `specrunner rules new <step-name> <rule-slug>` で CLI surface の一貫性を保つ。将来 `rules ls` / `rules show` を後追いで追加できる構造にしておく。

### D2: template は source code 内 const

既存 `request template` (`src/cli/...` 系) と同じく、template は source code 内の string const として持つ。実行時に別ファイルから読み込まない (= 配布物への依存を増やさない)。

### D3: step 名は `AGENT_STEP_NAMES` を single source of truth として使う

`src/core/step/step-names.ts` の `AGENT_STEP_NAMES` を import して使う。CLI step (verification / pr-create / delta-spec-validation) は executor が rules を無視するため受け付けない。CLI 側で step 名をハードコードしない (= `tests/grep-no-step-name-hardcode.test.ts` の精神と整合)。

### D4: 番号 prefix の採番は max + 1 / 連番方式

10 番単位 (10, 20, 30) のスキップは採用しない。`per-step-rule-followup` 側の resolver が数字昇順でソートするだけなので、連番でも 10 単位でもソート結果は同じ。連番のほうが UX が単純なので連番で開始する。書き手が手で並べ直したい場合は手動 rename で可能 (= 強制しない)。

### D5: ファイル名規約は PR #380 の resolver と一致させる

PR #380 の `rules-resolve.ts` は `specrunner/rules/<step>/` 配下の `.md` ファイルを数字 prefix 昇順でソートする。本 request で生成するファイル名 (`<NN>-<rule-slug>.md`) はこの規約と一致する (= 要件 1, 3)。
