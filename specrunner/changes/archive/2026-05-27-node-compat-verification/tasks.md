# Tasks: node-compat-verification

## T-01: CI ワークフロー `.github/workflows/ci.yml` を作成する

- [x] `.github/workflows/ci.yml` を新規作成する
- [x] トリガー: `push: branches: [main]` + `pull_request`
- [x] ジョブ構成（単一ジョブ、sequential）:
  1. `actions/checkout@v4`
  2. `actions/setup-node@v4` (node-version: "20")
  3. `oven-sh/setup-bun@v2`
  4. `bun install --frozen-lockfile`
  5. `bun run build`
  6. `node dist/bin/specrunner.js --help` — exit 0 を確認
  7. `node dist/bin/specrunner.js doctor --json` — 起動クラッシュしないことを確認（exit code は問わない。doctor は環境依存チェックを含むため CI 環境では fail も許容）
  8. Bun 固有 API の混入チェック: `! grep -rE "from ['\"]bun:" dist/` — マッチしたら失敗
  9. `bun run typecheck`
  10. `bun run test`

**Acceptance Criteria**:
- `.github/workflows/ci.yml` が存在する
- トリガーが `push: branches: [main]` と `pull_request` である
- Node.js 20 がセットアップされている
- `node dist/bin/specrunner.js --help` ステップが含まれている
- `grep` による Bun API 検出ステップが含まれている
- `bun run typecheck && bun run test` が含まれている

## T-02: 検証

- [x] `bun run build` を実行する
- [x] `node dist/bin/specrunner.js --help` が exit 0 であることを確認する
- [x] `node dist/bin/specrunner.js doctor` が起動クラッシュしないことを確認する
- [x] `! grep -rE "from ['\"]bun:" dist/` がマッチ 0 件であることを確認する
- [x] `bun run typecheck` が green であることを確認する
- [x] `bun run test` が green であることを確認する

**Acceptance Criteria**:
- 上記すべてのコマンドが期待通りの結果を返す
