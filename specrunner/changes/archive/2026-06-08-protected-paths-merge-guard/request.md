# 保護パスを変更する PR を無人マージ対象外にする

## Meta

- **type**: spec-change
- **slug**: protected-paths-merge-guard
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

`job archive --with-merge` は PR を無人で squash merge して main に取り込む。この経路では、CI / release の仕組み自体を定義するファイル（`.github/workflows/*`、release 設定、publish 設定など）を変更した PR も、人間が中身を見ないまま自動で main に入る。

結果として pipeline が「自分を動かす仕組み」を自分で書き換えて自分で取り込む閉ループが成立する。無人 merge を持つ specrunner 固有のリスクであり、変更を禁止するのではなく **人間 merge に回す**ことで断つ。

## 要件

1. `job archive --with-merge` は merge を実行する前に、対象 PR が変更したファイルの一覧を GitHub REST API `GET /repos/{owner}/{repo}/pulls/{pull_number}/files` で取得する。既存の `GitHubClient` port にこのメソッドが無いため新規追加する。
   - 同 API は 1 PR あたり最大 3000 ファイルまでしか返さない。変更ファイルが 3000 を超えて打ち切られた場合は保護パスを取りこぼす恐れがあるため、自動 merge せず escalation で停止する（fail-closed）。
2. 変更ファイルが設定の保護パス（glob）のいずれかに一致する場合、自動 merge を行わず escalation で停止する。escalation メッセージには「一致したファイル」と「人間が手で merge する手順」を含める。
3. 一致するファイルが無い場合は従来どおり自動 merge する。
4. 保護パスは `.specrunner/config.json` に glob のリストとして設定する（コードにハードコードしない）。キーが未設定または空なら保護なし＝従来どおりの挙動（後方互換）。
5. ファイルの変更・コミット自体は禁止しない。実装段階で保護パスを変更する request はそのまま PR に含まれ、merge 段でのみ人間に委ねられる。

## スコープ外

- design step / request validate など merge より前の段階での検出（本 request は merge-gate のみ）。
- 検証 / 受け入れロジックを変更する request の検出（別件）。
- GitHub branch protection / CODEOWNERS の設定（プラットフォーム側の別レイヤ。本 request はそれに依存せず CLI 内で完結させる）。

## 受け入れ基準

- [ ] 保護パスに一致する変更を含む PR は `job archive --with-merge` で自動 merge されず escalation で停止する
- [ ] 一致しない PR は従来どおり自動 merge される
- [ ] `.specrunner/config.json` に保護パスのキーが未設定／空なら従来どおり自動 merge する（後方互換）
- [ ] escalation 出力に「該当したファイル」と「手動 merge 手順」が含まれる
- [ ] 変更ファイルが API 上限（3000）で打ち切られた場合は自動 merge せず escalation する（取りこぼし防止 = fail-closed）
- [ ] 保護パスの glob 設定と判定ロジックを検証するユニットテストを追加する
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **検出点は merge-gate（`job archive --with-merge` の merge 直前）一択**。不可逆な merge が起きる唯一の地点で、PR の最終 diff に対して判定できる。design / validate 段階の検出は「宣言ベースで実態を保証できない」という本問題の弱点をそのまま抱えるため不採用。
- **commit は禁止しない**。保護パスを正当に修正する request も pipeline で実行可能に保ち、merge のみ人間に委ねる。
- **保護パスはハードコードせず `.specrunner/config.json` に注入**する。specrunner 以外のプロジェクトは CI / release の構成が異なるため、各プロジェクトが自分の保護対象を列挙できる形にする（設定による知識注入）。
- **変更ファイル一覧を完全に取得できない場合は fail-closed**（自動 merge せず escalation）。保護パスの取りこぼしは「人が見ないまま CI を書き換える」という本ガードが防ぎたい事象そのものなので、不完全な情報での自動 merge は許さない。
