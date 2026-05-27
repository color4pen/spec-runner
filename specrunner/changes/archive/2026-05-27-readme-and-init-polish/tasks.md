# Tasks: README 整備 + specrunner init の npx 対応改善

## T-01: specrunner init にプロジェクトディレクトリ作成を追加

- [x] `src/cli/init.ts` の `runInit` 関数で、`.gitignore` 処理の後に `specrunner/drafts/` と `specrunner/changes/` ディレクトリを `fs.mkdir(path, { recursive: true })` で作成する
- [x] CWD が git repo の場合のみ実行する（既存の `git rev-parse --show-toplevel` の結果を再利用）
- [x] 既にディレクトリが存在する場合は no-op（`recursive: true` で冪等）
- [x] ディレクトリ作成後にログ出力は不要（サイレント。init 全体の成功メッセージで十分）

**Acceptance Criteria**:
- `specrunner init` を git repo 内で実行すると、`specrunner/drafts/` と `specrunner/changes/` が作成される
- 既存のディレクトリがある場合はエラーにならない
- git repo 外では `specrunner/` ディレクトリは作成されない
- 既存テスト (`tests/init.test.ts`) が引き続き pass する

## T-02: init のテスト追加

- [x] `tests/init.test.ts` に git repo 内での init テストを追加する:
  - テスト用 temp dir 内で `git init` し、`runInit` を実行後に `specrunner/drafts/` と `specrunner/changes/` が存在することを検証
- [x] 冪等性テスト: 2 回 `runInit` しても正常に完了すること
- [x] テストで `process.cwd()` を一時ディレクトリに向ける（`vi.spyOn` or `process.chdir`）

**Acceptance Criteria**:
- `bun run test` で新規テストが pass する
- git repo 内での init 後にプロジェクトディレクトリが存在することを検証するテストがある

## T-03: README.md を書き換える

- [x] Installation セクションを Quick Start の前に追加:
  - `.npmrc` に `@color4pen:registry=https://npm.pkg.github.com` を設定する手順
  - `npm install -D @color4pen/specrunner`（または `npm install -g`）
- [x] Quick Start セクションを整理:
  1. `npx specrunner init`（config scaffold + プロジェクトディレクトリ作成）
  2. `npx specrunner login`（GitHub OAuth）
  3. `npx specrunner request new my-feature`（request.md 作成）
  4. `specrunner/drafts/my-feature/request.md` を編集
  5. `npx specrunner run my-feature`（pipeline 開始 — D3: alias を使用）
  6. `npx specrunner job finish my-feature`（PR merge + archive）
- [x] 環境変数セクションを追加（D4: `SPECRUNNER_API_KEY` のみ）:
  - managed runtime で必須、local runtime では不要
- [x] Command Reference / Configuration / Runtime Modes / Troubleshooting は現状維持（内容正確、変更不要）
- [x] README 内のコマンド例が実際の CLI コマンドと整合していることを確認（command-registry.ts の USAGE と照合）

**Acceptance Criteria**:
- README に Installation セクション（`.npmrc` 設定 + `npm install`）がある
- Quick Start の手順が install → init → login → request new → run → job finish の順序になっている
- コマンド名が `src/cli/command-registry.ts` の定義と一致している
- `SPECRUNNER_API_KEY` の説明がある

## T-04: typecheck と test の通過確認

- [x] `bun run typecheck` が 0 で終了する
- [x] `bun run test` が 0 で終了する（pre-existing failure `requires-commit-flags.test.ts` は本 change と無関係）

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green
