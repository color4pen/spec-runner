# README 整備 + specrunner init の npx 対応改善

## Meta

- **type**: spec-change
- **slug**: readme-and-init-polish
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

npm パッケージとして配布した後、新規ユーザーが `npm install @color4pen/specrunner` → `npx specrunner init` → `npx specrunner login` で使い始められる必要がある。現在の README はインストール手順が未整備で、init コマンドが npm install 後の初回利用で十分なセットアップを行うか未確認。

## 要件

### 1. README.md の整備

- インストール手順（GitHub Packages からの `npm install`、`.npmrc` の設定）
- 初回セットアップ手順（`specrunner init` → `specrunner login`）
- 基本的な使い方（`specrunner request new` → `specrunner run` → `specrunner job finish`）
- 必要な環境変数（`SPECRUNNER_API_KEY` — managed runtime で必須、local runtime では不要）

### 2. specrunner init の動作確認・改善

- `npx specrunner init` が npm install 後の環境で正常に動作すること
- init が生成するディレクトリ構造（`specrunner/specs/`, `specrunner/changes/` 等）が十分か確認する
- 不足があれば改善する

## スコープ外

- 詳細な API ドキュメント / ユーザーガイド
- Web サイトの作成
- CONTRIBUTING.md の整備

## 受け入れ基準

- [ ] README.md にインストール手順、初回セットアップ、基本的な使い方が記載されていること
- [ ] `npx specrunner init` が git 初期化済みの空ディレクトリ（specrunner 未設定状態）で正常に動作すること
- [ ] README の手順が実際のコマンドと整合していること（コマンド名、フラグ、出力例）
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- README は簡潔に。Quick Start + 基本コマンド一覧で十分
- init の改善は最小限にとどめる。大きな構造変更は別リクエスト
