# CLI を noun-verb 体系で再編し request / job の責務境界を確立する

## Meta

- **type**: spec-change
- **slug**: cli-noun-verb-restructure
- **base-branch**: main
- **adr**: true

## 背景

現状の CLI は init / login / run / ps / resume / finish / rm / doctor / request <sub> / managed <sub> という **9 サブコマンド + 5 トップレベル動詞** の混成構造。初見で「何を扱っているか」が読み取りづらく、dogfood 中心の現状 (= 利用者ほぼ作者 1 名、npm 配布は #210 で merge 済) を踏まえ、配布前提が整った今が再編の好機。

過去の検討経緯:
- 既存 request (`specrunner/requests/active/cli-command-hierarchy/request.md` 系) では「alias 5 個永続維持」を提案していたが、1 ユーザー dogfood + 破壊コスト最小の現実条件と整合しない
- アーキテクト評価で `gh` / `docker 19+` / `aws` 慣用の noun-verb 体系が推奨
- `bin/specrunner.ts:36-74` の `WORKTREE_GUARDED_COMMANDS` が **subcommand dispatch path を通っていない** 既存 bug を併発 (= `managed setup` が現状 guard 対象外、`job start/resume/finish` 導入時に同じ罠を踏む)

## 思想

### 設計原則

1. **主語の責務境界**: `request` (= 静的な文書、`request.md` ファイル操作) と `job` (= 動的な実行単位、`jobId` + state file) を厳密に分離する
2. **主語選択の判断軸**: 「**static file を扱うか、stateful 実行を扱うか**」で分ける。LLM を呼ぶか否かは内部実装の話であり、主語選択には影響させない
3. **動詞のセマンティクス統一**: `new` / `start` / `ls` / `show` / `rm` / `validate` / `template` / `review` / `resume` / `finish` を主語横断で同じ意味として使う

### 過去案からの修正

以前検討された `request review → job review` への移動案は **却下**。理由:
- `request review` は state-less な one-shot LLM 呼び出しで、`jobId` を振らず ps に出ず resume できない (= job 性質を持たない)
- ユーザー視点で `request review <file>` は「request 文書のレビュー」と直感的だが、`job review <file>` は「job? 何の job? 実行してない request だけど?」と混乱を招く
- 「LLM を呼ぶ」を主語選択の判断軸にしない原則と整合しない

## 提案体系

```
# 文書 (request) — static markdown 操作
specrunner request new <slug>          # template から request.md を作る
specrunner request generate "<text>"   # LLM 生成で request.md を作る (= 既存 request create の rename)
specrunner request ls                  # active 配下の request 一覧
specrunner request show <slug>         # request.md の本文を表示
specrunner request rm <slug>           # active 配下から削除
specrunner request validate <file|slug> # 構文 / 規律 check (= 静的、LLM 不使用)
specrunner request template            # 雛形 markdown を stdout
specrunner request review <slug|file>  # architect agent によるレビュー (= one-shot LLM、state-less)

# 実行 (job) — jobId 発行 + state file 操作
specrunner job start <request-slug|file>  # pipeline 開始、jobId 発行 (= 旧 run の主流名)
specrunner job ls                         # 全 job 一覧 (= 旧 ps)
specrunner job show <jobId|slug>          # job state 詳細
specrunner job rm <jobId>                 # job state file + cloud session 削除
specrunner job resume <slug>              # halted job を再開
specrunner job finish <slug>              # PR merge + archive

# 環境 — object を持たない設定系
specrunner init                       # config scaffold
specrunner login                      # GitHub Device Flow OAuth
specrunner doctor                     # 環境診断
specrunner runtime setup|status|reset # Anthropic Managed Agents (= 旧 managed の rename、本 request にスコープイン)
```

## 主要設計判断 (= design 段で確定、ADR 記録)

### 判断 1: 動詞の選択

| 動詞 | 採用 | 理由 |
|---|---|---|
| `new` | ✅ | template から作る (= `git checkout -b` 系の慣用、短い) |
| `generate` | ✅ | LLM 生成と template の動詞分離 (= 動詞 = 振る舞いの差で区別) |
| `start` | ✅ | 実行開始 (= `gh workflow start` / `docker container start` 慣用) |
| `ls` | ✅ (= `list` でなく) | UNIX 慣用、短い |
| `show` | ✅ (= `view` / `get` でなく) | 口語、直感的 |
| `rm` | ✅ | UNIX 慣用 |
| `finish` | ✅ | 現状語維持、PR merge + archive を 1 語で表す既存語 |
| `resume` | ✅ | 現状語維持 |

### 判断 2: alias 戦略

- **`run <slug>`** のみ唯一の alias として `job start <slug>` に展開する (= `python run` / `npm run` の慣性最強、世界共通動詞)
- それ以外 (= `ps` / 旧 top-level `rm` / 旧 top-level `resume` / 旧 top-level `finish`) は **全廃**
- 配布前 (= #210 merge 済、`"private": true` は維持) なので破壊コストはゼロに近い

### 判断 3: `managed` → `runtime` rename を本 request にスコープインする

`managed setup/status/reset` を `runtime setup/status/reset` に rename し、本 request のスコープに含める。

| 観点 | 判断材料 |
|---|---|
| 配布前 (= `"private": true` 維持中) の破壊コスト | ゼロに近い |
| noun-verb 統一原則 | `runtime` は object としての主語、原則整合 |
| dogfood 慣性破壊 | 軽微 (= 1 ユーザー、移行 1 回) |

→ **rename 採用**、AC に `runtime setup/status/reset` の動作確認を含める

### 判断 4: `job start` / `request review` の引数受付

- `job start` は `<request-slug>` と `<file-path>` の **両受け** (= 現状の `run` の挙動を維持、UX 後退なし)
- `request review` も `<slug>` と `<file>` の **両受け** (= `request show <slug>` と一貫性、現状は file path のみ)
- `request validate` も同様に `<file|slug>` 両受け

### 判断 5: `job review` の新設可否

AC 監査 (= `acceptance-and-issue-audit` skill 相当) を `job review <slug>` として CLI 化する案は **本 request のスコープ外** とする (= 現状 skill で運用、CLI 化の優先度は低い)。将来別 issue で扱う。

## worktree guard の subcommand dispatch 漏れ修正 (= 既存 bug)

`bin/specrunner.ts:36-74` の `WORKTREE_GUARDED_COMMANDS` は top-level command 名 set として運用されており、**subcommand dispatch path (= `bin/specrunner.ts:36-61`) は guard を通らない**。

現状: `managed setup/status/reset` が worktree guard 対象外。本 request で `job start/resume/finish` を導入すると同じ罠を踏む。

修正方針 (= design 段で 1 つ選択):
1. `ParentCommandDef` に guarded subcommand 情報を持たせ、親コマンド dispatch 内で guard する
2. dispatch 後に解決済み operation kind を作り、top-level command と subcommand を共通 guard 判定に通す
3. `job start/resume/finish` handler 内で既存 top-level command と同じ guard helper を呼ぶ

## help / README

- `specrunner --help` を主語別グルーピング (= request / job / 環境系 の 3 ブロック)
- README を新体系の最短フローで書き直す: `init` → `login` → `request new` → `job start` → `job ls` → `job finish`
- 失敗時フロー: `job ls` → `job resume`
- alias 一覧 (= `run` 1 個のみ)
- local / managed runtime 差分の簡潔説明

## スコープ外

- **`resume --from <step>` 拡張** (= step 名直接受付): 別 issue で扱う
- **npm 配布** (= `"private": true` を外す、CI リリース自動化、別 request)
- **新機能追加** (= watch / multi-provider 等は別 issue)
- **pipeline step の実行順変更**
- **request.md のフォーマット変更**
- **`job review` (= AC 監査の CLI 化)** (= 将来別 issue)
- **`specrunner cancel`** (= 旧 hint で言及されているが本 request では実装しない、別 issue)

## 受け入れ基準

- [ ] `specrunner request new/generate/ls/show/rm/validate/template/review` が全て動く
- [ ] `specrunner job start/ls/show/rm/resume/finish` が全て動く
- [ ] `specrunner run <slug>` が `specrunner job start <slug>` の alias として動く (= 唯一の互換 alias)
- [ ] 旧 top-level `ps` / `rm` / `resume` / `finish` は **削除** されている (= `Unknown command: ps` 等が返る)
- [ ] `specrunner runtime setup/status/reset` が `managed setup/status/reset` の現状機能と同等に動く (= rename スコープイン)
- [ ] 旧 `specrunner managed setup/status/reset` は `Unknown command: managed` を返す (= rename 後の削除確認)
- [ ] `job start/resume/finish` が linked worktree 内から実行された場合 worktree guard error になる (= subcommand dispatch path の guard 漏れ修正)
- [ ] `job ls` / `job rm` は linked worktree 内でも実行できる
- [ ] `request review <slug>` および `request validate <slug>` が slug 名で active 配下を解決する (= file path 引数も継続サポート)
- [ ] `job start <slug>` も slug / file path 両方を受ける (= 現状の `run` 互換)
- [ ] `specrunner --help` が主語別グルーピング (= request / job / 環境系) で表示される
- [ ] README が新体系で書き直されている (= `init → login → request new → job start → job ls → job finish` の最短フロー)
- [ ] `cli-commands` capability の Requirement が新体系に合わせて delta spec 経由で update されている
- [ ] `cli-finish-command` および `cli-resume-command` capability の Requirement が新体系の主語 (= `job finish` / `job resume`) に合わせて delta spec 経由で update されている
- [ ] `managed-cli-commands` capability の Requirement が `runtime setup/status/reset` に rename された主語に合わせて delta spec 経由で update されている
- [ ] 旧 `request create` は `Unknown request subcommand: create` を返す (= `request generate` に rename された結果)
- [ ] 旧 `request list` は `Unknown request subcommand: list` を返す (= `request ls` に rename された結果)
- [ ] `specrunner request show <slug>` は active 配下 (= `specrunner/requests/active/<slug>/request.md`) の本文を stdout に出力する
- [ ] `specrunner job show <jobId|slug>` は job state の主要フィールド (= jobId / status / branch / step / createdAt / updatedAt) を stdout に出力する
- [ ] `specrunner job unknown` が `Unknown job subcommand: unknown` のようなメッセージを返す (= 親コマンドエラーメッセージ汎用化)
- [ ] `bun run typecheck && bun run test` が green
- [ ] ADR に「noun-verb 体系の採用理由」「`request` / `job` 責務境界の判断軸」「`run` alias のみ維持の判断」「`managed` → `runtime` rename 判断」「worktree guard 修正方針」を記録

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

TBD
