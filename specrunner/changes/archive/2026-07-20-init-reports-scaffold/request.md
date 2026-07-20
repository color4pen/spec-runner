# init が実行結果を報告する — git repo 外の無言スキップと再実行時の無言成功を解消する

## Meta

- **type**: spec-change
- **slug**: init-reports-scaffold
- **base-branch**: main
- **adr**: false

<!-- 新しい port/adapter や構造変更は無い。init コマンドの出力契約と exit code の変更のため spec-change -->

## 背景

`specrunner init` が自分の仕事を報告しない。両方向に無言になっている。

- **無言スキップ**: cwd が git repo でない場合、project scaffold（`specrunner/drafts` / `specrunner/changes` / `.gitignore` 追記）の作成を黙って飛ばし、exit 0 で成功のように終わる
- **無言成功**: git repo 内で再実行すると scaffold は実際に作成されるのに、出力は `Config already exists. Skipping global config generation.` のみ。半初期化状態の正しい復旧手段が「git repo 内での init 再実行」であることを、init 自身の出力が隠している

実測（pristine な node:22 container + macOS、npm 公開物 v0.4.1）:

1. 空 dir で `npm install -D @color4pen/specrunner` → `npx specrunner init` → 出力は `Config saved.` のみ・exit 0・`specrunner/` は生成されない
2. 直後の `doctor` → `workflow-structure: specrunner/ is missing dirs: drafts, changes`
3. `git init` 後に `init` 再実行 → 出力は `Skipping` のみだが、FS には `changes/` と `.gitignore` が生成されている

README quickstart は `git init` を前提に書いていないため、新規ユーザーはほぼ確実に無言スキップを踏む。以降どのコマンドも scaffold を補完しない（`request new` は `drafts/` のみ作成）ため、半初期化が静かに継続する。

## 現状コードの前提

- `src/cli/init.ts:139-152` — scaffold 作成（`.gitignore` 追記 + `draftsDir()` + `changesDirRel()` の mkdir）は `git rev-parse --show-toplevel` が成功した場合のみ。`:149-151` に「Non-zero exit = not a git repo; skip silently」「git not available or other error — skip silently」とコメント明記。どちらの経路でも exit 0
- `src/cli/init.ts:136` — config 既存時の出力は `Config already exists. Skipping global config generation.` のみ。`:144-147` の scaffold 作成は成功しても何も出力しない
- `src/cli/init.ts:133-134` — config 新規作成時の出力は `Config saved.` + login 案内のみ（scaffold への言及なし）
- `README.md:12-14`（Quick Start）— `npm install -D` → `npx specrunner init` → `npx specrunner login` の並びで、git repo であることへの言及が無い
- `src/util/gitignore.ts` の `ensureDotSpecrunnerGitignore` は冪等（既存エントリなら追記しない）

## 要件

1. **git repo 外では明示エラーで停止する**: cwd が git repo でない場合、非ゼロ exit + 「git repo 内で実行すること（`git init` または既存 repo へ移動）」の処方を stderr に出す。自動で `git init` はしない。scaffold だけを作ることもしない。git バイナリ不在も同様にエラーとして報告する（無言スキップの全廃）。

2. **実行結果を項目別に全報告する**: global config / `.gitignore` / `specrunner/drafts` / `specrunner/changes` のそれぞれについて created / already-exists を stdout に列挙する。config 既存かつ scaffold 欠損の半初期化状態では、欠損分を補完して created として報告する（`Skipping` 一行で終わらない）。

3. **冪等性の維持**: 完全初期化済み repo での再実行は全項目 already-exists の報告 + exit 0。

4. **README quickstart に git repo 前提を明記する**: Quick Start の手順に git repo 内であることを組み込む（`git init` を含む形）。

## スコープ外

- doctor の hint 文言の整合（別 request）
- `managed setup` / provider 選択フローの変更
- `request new` 等、init 以外のコマンドの scaffold 補完責任

## 受け入れ基準

- [ ] **T1（repo 外の明示停止）**: 非 git dir での `init` が非ゼロ exit で停止し、stderr に git repo を要求する処方が出て、FS に何も作られない（global config も含む）ことを固定する。**破壊確認**: 修正を無効化すると本テストが exit 0 で落ちること。
- [ ] **T2（作成の報告）**: 未初期化の git repo での `init` が、config / `.gitignore` / `drafts` / `changes` の作成を個別に stdout へ報告することを固定する。
- [ ] **T3（冪等 + 報告）**: 初期化済み repo での再実行が全項目 already-exists を報告し exit 0 であること、FS が無変更であることを固定する。
- [ ] **T4（半初期化の補完報告）**: config 既存かつ scaffold 欠損の状態から `init` を実行すると、欠損分が作成され created として報告されることを固定する（無言 `Skipping` の再発防止）。
- [ ] **T5（README）**: Quick Start が git repo 前提を含むこと。
- [ ] **T6**: `typecheck && test` が green（本 request で出力契約が変わる init テストの期待更新を除き、既存テストは無変更で green）。

## architect 評価済みの設計判断

- **repo 外は明示エラー**。→ 却下: 自動 `git init`（ユーザーの repo 状態に勝手に触る）。→ 却下: scaffold のみ作成（`.gitignore` が git 前提であり、worktree 運用の前提も崩れる）。→ 却下: warn を出して exit 0（無言スキップの半減にしかならず、CI で誤成功が残る）。
- **T1 で global config も作らない**。→ 却下: config だけ作って scaffold を落とす現行分岐の維持（「どこまで済んだか」が実行場所依存になる非決定性が今回の欠陥の根）。
- **報告は項目別列挙**。→ 却下: 「initialized」の一行要約（半初期化からの補完と全新規が区別できず、復旧手段としての init 再実行が発見不能なまま）。
