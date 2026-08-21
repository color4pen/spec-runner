# Tasks: Claude Agent SDK 依存更新 PR 自動化

## T-01: `.github/dependabot.yml` を追加する

- [x] `.github/dependabot.yml` を新規作成する（既存ファイルなし）
- [x] トップレベルに `version: 2` を設定する
- [x] `updates` エントリを 1 件追加する:
  - `package-ecosystem: "bun"`
  - `directory: "/"`
  - `schedule.interval: "weekly"`
  - `allow` リスト: `dependency-name: "@anthropic-ai/claude-agent-sdk"` のみ
- [x] YAML コメントとして以下を記載する:
  - `@anthropic-ai/claude-agent-sdk` のみが対象である旨
  - 初回更新は upstream 0.3.x との差分により 0.x minor 境界を越える大型更新になる旨
  - merge 前に pipeline の実地動作を確認すること
  - auto-merge は設定しない旨
- [x] `auto-merge:` キーを含めない（テストで検証される）

**Acceptance Criteria**:
- `.github/dependabot.yml` が存在する
- `package-ecosystem: "bun"` が設定されている
- `schedule.interval` が `"weekly"` または `weekly` である
- `allow` エントリが `@anthropic-ai/claude-agent-sdk` のみを含む
- `auto-merge:` キーが存在しない
- 初回大型更新についての運用注記コメントが含まれる

## T-02: Dependabot 設定の不変条件テストを追加する

- [x] `tests/dependabot-config.test.ts` を新規作成する
- [x] `node:fs/promises` で `.github/dependabot.yml` を文字列として読み込む（`path.resolve(process.cwd(), ".github/dependabot.yml")` で絶対パスを構築）
- [x] `describe("dependabot.yml 不変条件")` ブロックを作成し、以下の `it` を追加する:
  - `"dependabot.yml が存在する"` — `fs.stat` で `isFile()` を確認
  - `"package-ecosystem が bun に設定されている"` — ファイル内容に `package-ecosystem: "bun"` を含む
  - `"スケジュールが weekly である"` — ファイル内容に `weekly` を含む（`interval: "weekly"` / `interval: weekly` の両形式に対応）
  - `"allow に @anthropic-ai/claude-agent-sdk が含まれる"` — ファイル内容に `dependency-name: "@anthropic-ai/claude-agent-sdk"` を含む
  - `"auto-merge キーが存在しない"` — ファイル内容に `auto-merge:` を含まないことを assert
- [x] import は `vitest` の `{ describe, it, expect }` と `node:fs/promises`、`node:path` のみ使用する（外部 YAML パーサー不要）
- [x] `bun run typecheck` で型エラーがないことを確認する
- [x] `bun run test` で 5 件すべての it が green になることを確認する

**Acceptance Criteria**:
- `tests/dependabot-config.test.ts` が存在する
- 5 件すべての `it` が green になる
- `auto-merge:` 不在の assert が明示的に含まれる
- `bun run typecheck && bun run test` が green
