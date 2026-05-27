# Node.js 互換性の確認と修正

## Meta

- **type**: spec-change
- **slug**: node-compat-verification
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

spec-runner は Bun で開発・実行されているが、npm パッケージとして配布すると Node.js 環境から `npx @color4pen/specrunner` で実行される可能性がある。コード内で Bun 固有 API の使用は明示的に禁止されているが、Node.js で実際に動くかの検証はされていない。

## 要件

### 1. Node.js での実行テスト

- `node dist/bin/specrunner.js --help` が正常に動作すること
- `node dist/bin/specrunner.js doctor` が正常に動作すること
- `child_process.spawn` の挙動差異（Bun vs Node.js）がないか確認する

### 2. 互換性問題の修正

- テストで発見された非互換箇所を修正する
- Bun 固有の暗黙的な挙動（例: TypeScript の自動解決、グローバル API の差異）に依存している箇所があれば修正する

### 3. CI での Node.js テスト追加

- `.github/workflows/ci.yml` を新規作成し、Node.js 20 での `node dist/bin/specrunner.js --help` 実行を含める。トリガーは `push: branches: [main]` + `pull_request`

## スコープ外

- テストスイート（vitest）の Node.js 対応。テスト実行は引き続き Bun 前提
- Bun 固有機能の積極的な Node.js ポリフィル導入
- Node.js 18 以前のサポート

## 受け入れ基準

- [ ] `node dist/bin/specrunner.js --help` が exit 0 で正常出力すること
- [ ] `node dist/bin/specrunner.js doctor` が実行可能なこと（認証エラーは許容、起動クラッシュは不可）
- [ ] Bun 固有 API（`Bun.*`, `bun:*`）が dist/ 内のどのファイルにも含まれないこと
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- 実行ランタイムの主サポートは Bun のまま。Node.js は「動く」レベルを保証する
- テストスイートの Node.js 対応は行わない（vitest + Bun で継続）
