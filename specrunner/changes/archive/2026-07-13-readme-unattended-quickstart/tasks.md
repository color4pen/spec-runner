# Tasks: README Quick Start を無人ループ中心に再構成

## T-01: README.md の Quick Start を無人ループ一次・attended 代替の構成に書き換える

対象ファイル: `README.md`（5–22 行が現在の Quick Start）

書き換え後の構成イメージ（実際の文言は implementer が確定すること）:

```
## Quick Start

### 無人ループ（推奨）

# 1. セットアップ
npx specrunner init
npx specrunner login

# 2. GitHub issue を request.md 形式で書く
#    specrunner request template で雛形を確認できる

# 3. issue に承認ラベルを付ける
#    デフォルト: specrunner-approved

# 4. inbox を起動（cron / GitHub Actions で定期実行）
npx specrunner inbox run

# 5. escalation が発生したら issue コメントで返答
#    /resume <指示> とコメントすると次の tick で再開

# スケジューラ（crontab / GitHub Actions）の詳細は docs/operations.md を参照

### 代替: attended フロー（小規模・単発利用）

npx specrunner request new my-feature
# → specrunner/drafts/my-feature/request.md を編集
npx specrunner run my-feature
# PR をレビューしてから:
npx specrunner job archive --with-merge my-feature
```

- [x] `README.md` の Quick Start 節（`## Quick Start` から次の `##` 節の直前まで）を上記構成に準じて書き換える。
  - [x] 無人ループを第一パスとして提示する（install → init/login → issue 作成 → 承認ラベル → `inbox run` → escalation 応答の順番付き手順）。
  - [x] スケジューラの詳細（crontab/launchd/GitHub Actions 例）は Quick Start 本文に展開せず、`docs/operations.md` へのリンクのみを置く。
  - [x] attended フローを「代替パス」として Quick Start 内の別小節（例: `### 代替: attended フロー`）に移動する（削除しない）。
  - [x] `specrunner request template` への言及を無人ループの手順内に含め、issue 本文の書き方に迷わないようにする。
  - [x] escalation 応答（`/resume`）の最小説明を無人ループの手順内に含める。

**Acceptance Criteria**:
- README.md を開いたとき、Quick Start の第一パスが無人ループ（issue → 承認ラベル → `inbox run` → PR → `/resume`）である。
- attended フロー（`request new` / `run` / `job archive --with-merge`）が Quick Start 内に代替として存在する（削除されていない）。
- Quick Start 内にスケジューラ詳細（crontab/launchd/GitHub Actions の全設定例）が展開されておらず、`docs/operations.md` へのリンクが存在する。
- `bun run typecheck && bun run test` が green（README 変更のみのためテスト変更なし）。
