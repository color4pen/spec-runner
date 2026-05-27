# release-please による自動バージョニング + publish 連携

## Meta

- **type**: new-feature
- **slug**: release-please-setup
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

現在 npm publish は手動で `npm version` → `git push --tags` → publish.yml が実行される。リクエスト対応のたびに手動でバージョンアップするのは面倒で、忘れやすい。

release-please（Google 製 GitHub Action）を導入し、main への push 時に conventional commits を解析して自動で version bump + CHANGELOG の PR を生成する。その PR をマージすると tag が作られ、既存の publish.yml が連鎖して npm publish が走る。

## 要件

### 1. release-please GitHub Action の導入

- `.github/workflows/release-please.yml` を作成する
- トリガー: `push: branches: [main]`
- `google-github-actions/release-please-action@v4` を使用する
- release-type: `node`（package.json の version を自動更新）
- permissions: `contents: write`, `pull-requests: write` を明示する
- CHANGELOG.md を自動生成する

### 2. publish.yml との連携

- release-please が tag を作成した際に既存の publish.yml（`v*` tag push トリガー）が自動で走ることを確認する
- 二重 publish にならないよう、publish.yml のトリガーは現状の `v*` tag push のままで変更しない

### 3. conventional commits の整合

- specrunner の `finish` コマンドが squash merge する際の commit message が conventional commits 形式であることを確認する
- 現在の squash merge message の形式を確認し、`feat:` / `fix:` / `chore:` 等のプレフィックスが付いていない場合は、pr-create step が PR title に type prefix を付けるよう修正する
- request type → conventional commits prefix のマッピング:
  - `new-feature` → `feat:`
  - `bug-fix` → `fix:`
  - `spec-change` → `feat:`
  - `refactoring` → `refactor:`
  - `chore` → `chore:`

### 4. 初期バージョンの設定

- package.json の version を `0.1.0` に設定する（現在 `0.2.0` だがリセット）
- release-please の初回実行で正しく動作するよう、manifest または config で initial version を指定する

## スコープ外

- release-please 以外のバージョニングツール（changesets, standard-version 等）の検討
- major version の自動判定（0.x の間は手動で major bump が必要な場合 release-please の設定で対応）
- CHANGELOG の過去分の生成（導入時点からの記録のみ）

## 受け入れ基準

- [ ] main に `feat:` プレフィックス付き commit が push されたとき、release-please が version bump PR を自動生成すること
- [ ] release-please の PR をマージすると `v*` tag が作成されること
- [ ] tag 作成により publish.yml が走り npm publish が実行されること（GitHub Packages）
- [ ] CHANGELOG.md が自動生成されること
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- release-please を選択する。単一パッケージで conventional commits ベースの運用に最適
- publish.yml は変更しない。release-please の tag 作成が既存の publish トリガーを起動する設計
- 0.x の間は breaking change を minor で扱う（release-please のデフォルト動作）
