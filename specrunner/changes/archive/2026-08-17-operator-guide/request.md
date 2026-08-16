# specrunner guide サブコマンド: 運用知識の CLI 正本化と skill のダイエット

## Meta

- **type**: new-feature
- **slug**: operator-guide
- **base-branch**: main
- **adr**: true

## 背景

spec-runner を agent session から運用する知識(状況ごとのコマンド・flag の使い分け、escalation 対応の分岐、起票・レビューの規律)には repo の正本が無く、`.claude/skills/` の 4 skill が一部を持つほかは session 側の記憶に依存している。skill を厚くする案には配布と版ずれの問題がある: skill の中身は CLI のコマンド面に強く結合しており、CLI と別経路(plugin 等)で配ると project ごとの CLI 版と必ずずれる。

対応: 運用知識の正本を CLI 自身に置く。`specrunner guide <topic>` が運用ガイドを stdout に出力する。知識はコードと同じパッケージに入るため版ずれが構造的に消え、配布経路は既存の npm パッケージ・実行時出力・init だけで完結する。発見性は (a) halt / escalation メッセージ内の導線(既に CANON_FINDING_ESCALATION が resume コマンドを案内している形の拡張)、(b) init が出力する CLAUDE.md 用 snippet、(c) --help 末尾の一行で担う。skill は「guide を引け」と誘導する薄いトリガーに縮退させ、厚い手順の重複著述を廃す(docs の再構成は本 request のスコープ外だが、同じ参照構造で後段のダイエットが可能になる)。

## 現状コードの前提

- `.claude/skills/` 配下: acceptance-and-issue-audit / job-run-monitor / parallel-request-workflow / rebase-finish。job-run-monitor は job 起動→監視→halt 対応→取り込みの手順、rebase-finish は archive 前の手動 rebase 手順、acceptance-and-issue-audit は merge 後の AC 監査手順を厚く持つ。parallel-request-workflow は廃止済み `request review` コマンド前提で陳腐化している
- prompt 系の単一ソース+参照埋め込み+drift-guard の先例: `src/prompts/pipeline-map.ts` の `PIPELINE_MAP` 定数を各 prompt が埋め込み、`src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts` が `toContain(PIPELINE_MAP)` で固定している
- escalation メッセージの組み立ては `formatEscalation`(archive 系)および resumePoint.reason の文面(CANON_FINDING_ESCALATION 等)が担い、既に「次に打つコマンド」を本文で案内している
- `request prompt` が起票プロンプトを stdout に出す「知識は CLI が注入する」先例
- `job resume` の flag: --from / --force / --prompt / --prompt-file / --apply-canon / --adopt-commits / --detach。`job reopen` は --from / --reason 必須で apply-canon / adopt-commits / detach / prompt を持たない。awaiting-archive は resume 不可(reopen のみ)
- 並列起動は `git worktree add` の `.git/config` ロック競合(Issue #166)があり sleep 3 の stagger が必要
- 無人運用面: `inbox run` は承認ラベル(既定 `specrunner-approved`、`DEFAULT_INBOX_APPROVE_LABEL`)付き issue からの job 自動発火と `/resume` コメントによる再開を 1 pass で処理する(daemon ではない)。terminal 時と reject 時は issue にコメント通知し、reject は承認ラベルを除去する。`job start --issue <number>` で手動起動も issue に紐付く

## 要件

1. **`specrunner guide [topic]` サブコマンド** — 引数なしは topic 一覧(topic 名 + 一行説明)。`guide <topic>` は当該ガイド全文を stdout に出力する。未知 topic は一覧を添えてエラー。ガイド本文は CLI パッケージ内の定数/資産として保持し、実行時のネットワーク・repo 状態に依存しない
2. **topic 構成と内容** — 以下 9 topic。(a)〜(c) は既存 skill の内容を正本として移設、(d)〜(i) は本 request 記載の内容で新規著述する:
   - (a) **jobs** — job-run-monitor の内容を移設(起動は `job start --detach`、監視は `job wait`、取り込みは `job archive --with-merge`、完了判定・halt 時の一次対応)。並列起動の stagger(sleep 3、理由は worktree ロック競合 #166)を追補
   - (b) **merge** — rebase-finish の内容を移設(archive 前の手動 rebase 手順、PR が CLEAN/MERGEABLE なら rebase 省略可)
   - (c) **audit** — acceptance-and-issue-audit の内容を移設(merge 済み PR の受け入れ基準監査)
   - (d) **setup** — 前提(bun install)→ `init`(user-global config scaffold(0600) + per-repo scaffold(specrunner/drafts・specrunner/changes・.gitignore 追記)、provider 選択 anthropic|openai)と project-local `.specrunner/config.json` の 2 層 → **`doctor` で不足を確認**し、足りないものだけセットアップする(doctor 中心導線): GitHub 認証は `gh auth login` 済み / GH_TOKEN・GITHUB_TOKEN env 供給済みなら不要、無ければ `specrunner login`(GitHub Device Flow 専用。公式 GitHub App の client_id が CLI に組み込み済みのため OAuth App の自作や client_id の環境変数設定は不要。有効な token を検出すると出所を表示して Device Flow を自動省略、`--force` で強制実行)/ headless(cron・inbox)用 Claude Code token は `claude setup-token` → `specrunner credentials set claude-code`(attended 利用では不要 — doctor は warn 表示のみ)/ managed runtime 用 API key は `SPECRUNNER_API_KEY` env または `specrunner credentials set anthropic-api-key`。credential は `~/.config/specrunner/credentials.json`(0600)、`credentials set` の入力は echo されない(TTY silent / 非 TTY stdin)→ 再度 `doctor`(fail 0 なら warn が残っていても Ready)→ 最初の 1 本(`request template` → `request validate` → `job start --detach` → `job wait`)。token の cat / echo 禁止
   - (e) **escalation** — halt 診断(job log 末尾の escalation finding と `job show` の resumePoint.reason)→ 復帰 flag 分岐表: 保護正典の手当ては worktree 内編集(commit しない)→ `resume --apply-canon` / code・テストの手当ては worktree 内 commit → `resume --adopt-commits`(両 flag 併用可)/ 転記型 fix は `resume --from code-fixer --prompt "<置換後の文面まで指定>"`(曖昧指示は fixer が no-op)/ spec-review escalation は plain resume が空回りするため `--from spec-fixer --prompt` / operator commit 採択後は `--from code-review` 等 judge から(複合 step の custom-reviewers / regression-gate は --from 不可)/ 3 連続 escalation guard は手当て済みなら `--force` / awaiting-archive は `job reopen --from <step> --reason <text>`(apply-canon / adopt-commits / detach は無い)。後片付け: `job cancel --restore-draft` / `job prune --force` / `job attach --branch`
   - (f) **request** — 起票規律: `request template` ベースで書く / type 選択(設計追加は spec-change / new-feature。chore はテスト生成免除なので機械の歯が要る変更に使わない)/ 受け入れ基準で必要な pin テストを名指しする / 既定値変更は旧値 pin テストを全列挙し更新許容を明記 / スコープ外の明記で設計分岐を先に潰す / 外部 SDK・API の制約は作成者が request.md に明示 / `request validate` → `job start`(意味レビューは pipeline 先頭の request-review step)
   - (g) **review** — PR 精読の観点: 起点 issue / request の正典と照合する / 「収束・routing する」と断定する前に該当関数を現物で読む / 別経路の緑テストを証拠にしない / AC が名指しした歯(pin テスト)の生存を最終 HEAD で確認する / fail-open を safe 扱いしない / レビュー深度は難易度で変える(小粒 bug-fix は機械検証で足りる)/ 修正は 1 件ずつでなく分類してバッチ適用 / approve 後に非ブロッキング指摘で再レビューに回さない
   - (h) **inject** — project 固有知識は CLI 組み込み prompt でなく `rules new <step> <slug>` で step 単位に注入する / 配送方式は frontmatter `delivery` で宣言: 事後検証型(コード規約等)は `followup`(既定)、行動制約型(禁止コマンド・触ってはいけないファイル等)は `prompt`(main prompt 前置注入。作業中に効かなければ意味がないルールはこちら)/ rules 化の判断基準(同種 escalation の反復。ただしルール追加は対症療法で、根本対策は agent の判断場面を消す構造化)/ `reviewers new <name>` は既存 gate に無い観点がある時のみ / `config effective [--type <t>]` で実効値と出所を確認
   - (i) **inbox** — 無人運用: 承認ラベル(既定 `specrunner-approved`)が発火 trigger / `inbox run` は 1 pass で daemon ではない(定期実行は cron 等の外部スケジューラ)/ terminal 時は issue にコメント通知 / escalation の裁定は issue コメントに残し `/resume` コメントで再開 / `job start --issue <n>` で手動起動も issue に紐付け可能 / issue を判断台帳として使う(発火・裁定・完了が issue 上に時系列で残る)
3. **実行時導線** — halt して operator 対応が必要になる出力(escalation の formatEscalation、resumePoint.reason 系の案内文)に「詳細: `specrunner guide escalation`」の一行を加える。`--help` 末尾に guide サブコマンドの案内一行を加える
4. **init の CLAUDE.md snippet** — `init` 完了時に、project の CLAUDE.md へ貼るための数行 snippet(spec-runner 運用時は `specrunner guide <topic>` を参照する旨 + topic 一覧一行)を stdout に出力する。topic 一覧一行は要件 6 の topic registry から導出し、手書きしない。ファイルへの自動書き込みはしない
5. **skill のダイエット** — job-run-monitor / rebase-finish / acceptance-and-issue-audit を、発火条件(description)と「`specrunner guide <topic>` を実行して従う」誘導だけの薄いトリガー(本文 10 行以内)に書き換える。厚い手順本文を skill 側に残さない。parallel-request-workflow は内容を (a) に畳んだ上で削除する
6. **重複の歯** — topic 名・一行説明・本文を単一の topic registry に集約し、`guide`(引数なし)の一覧・未知 topic エラー時の候補一覧・init snippet の topic 一覧一行の全てがこの registry から導出されることをテストで固定する(PIPELINE_MAP と同じ単一ソース+drift-guard パターン。topic 一覧の手書き重複を残さない)。escalation 導線・--help 案内・init snippet の存在もテストで固定する

## スコープ外

- docs / README の再構成(guide を正本とする参照構造は本 request で成立するため、docs のダイエットは後段の別 request)
- skill の配布機構(init による project への skill 展開、plugin 化)
- guide 内容の i18n・pager 対応
- pipeline の step / 遷移 / prompt の変更

## 受け入れ基準

- [ ] `specrunner guide` が topic 一覧を、`specrunner guide <topic>` が全 9 topic(jobs / merge / audit / setup / escalation / request / review / inject / inbox)の本文を出力することをテストで固定する。未知 topic はエラー + 一覧
- [ ] `guide`(引数なし)の一覧・未知 topic エラー時の候補一覧・init snippet の topic 一覧が同一の topic registry から導出されることをテストで固定する(いずれかに topic を手書き列挙しない)
- [ ] escalation 系の operator 向け halt 出力に `specrunner guide escalation` への導線が含まれることをテストで固定する
- [ ] `--help` 出力に guide の案内が含まれることをテストで固定する
- [ ] `init` の完了出力に CLAUDE.md 用 snippet が含まれることをテストで固定する
- [ ] guide escalation の本文に --apply-canon / --adopt-commits / --from の分岐と reopen の制約が含まれることをテストで固定する(誤案内の drift 防止)
- [ ] `.claude/skills/` の 3 skill が guide への誘導のみの薄いトリガーになり、`.claude/skills/parallel-request-workflow/` が存在しないこと。skills 配下に廃止済みコマンド文字列(`request review` / `job finish` / `specrunner ps`)が存在しないこと
- [ ] guide 本文に記載するコマンド・flag が現行 CLI に実在することをテストまたは機械検証で確認する(存在しないコマンドを案内しない)
- [ ] `typecheck && test` が green
