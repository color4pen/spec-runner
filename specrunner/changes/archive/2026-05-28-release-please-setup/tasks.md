# Tasks: release-please による自動バージョニング + publish 連携

## T-01: release-please GitHub Actions workflow の作成

- [x] `.github/workflows/release-please.yml` を新規作成する
- [x] トリガー: `on: push: branches: [main]`
- [x] `google-github-actions/release-please-action@v4` を使用する
- [x] `release-type: node` を指定する
- [x] `permissions: contents: write, pull-requests: write` を明示する
- [x] token は `${{ secrets.GITHUB_TOKEN }}` を使用する（デフォルトで注入されるため明示不要だが、明示しても可）

**Acceptance Criteria**:
- `.github/workflows/release-please.yml` が存在し、yaml として valid であること
- `bun run typecheck && bun run test` が green

## T-02: TYPE_CONFIG に conventionalPrefix フィールドを追加する

- [x] `src/config/type-config.ts` の `TypeConfigEntry` interface に `conventionalPrefix: string` を追加する
- [x] 各 request type に以下のマッピングで値を設定する:
  - `new-feature` → `"feat"`
  - `bug-fix` → `"fix"`
  - `spec-change` → `"feat"`
  - `refactoring` → `"refactor"`
  - `chore` → `"chore"`
- [x] `getConventionalPrefix(type: string): string` ヘルパー関数を export する（unknown type は `"feat"` fallback）

**Acceptance Criteria**:
- `TypeConfigEntry` に `conventionalPrefix` が定義されている
- `getConventionalPrefix("new-feature")` が `"feat"` を返す
- `getConventionalPrefix("bug-fix")` が `"fix"` を返す
- `getConventionalPrefix("unknown")` が `"feat"` を返す
- `bun run typecheck && bun run test` が green

## T-03: renderPrTitle に conventional commits prefix を付与する

- [x] `src/core/pr-create/body-template.ts` の `renderPrTitle()` を修正し、第2引数として `requestType: string` を受け取る（または `ParsedRequest` から `.type` を参照する — 現在 `parsedRequest` を受け取っているのでそのまま `.type` を使える）
- [x] `getConventionalPrefix(parsedRequest.type)` を使って `"feat: タイトル"` 形式の文字列を返す
- [x] 既に prefix が付いている場合（`/^(feat|fix|refactor|chore|docs|style|perf|test|ci|build|revert)(\(.+\))?:/` にマッチ）は二重付与しない

**Acceptance Criteria**:
- `renderPrTitle({ title: "release-please の導入", type: "new-feature", ... })` が `"feat: release-please の導入"` を返す
- `renderPrTitle({ title: "fix: already prefixed", type: "bug-fix", ... })` が `"fix: already prefixed"` を返す（二重付与しない）
- `bun run typecheck && bun run test` が green

## T-04: package.json の version を 0.1.0 にリセットする

- [x] `package.json` の `"version"` を `"0.2.0"` → `"0.1.0"` に変更する

**Acceptance Criteria**:
- `package.json` の version が `"0.1.0"` であること
- `bun run typecheck && bun run test` が green

## T-05: 既存テストの修正と新規テストの追加

- [x] `renderPrTitle` のシグネチャ変更に伴い、既存の呼び出し箇所（`src/core/step/pr-create.ts`）を修正する
- [x] `renderPrTitle` の unit test を追加（prefix 付与、二重付与防止、各 request type の確認）
- [x] `getConventionalPrefix` の unit test を追加

**Acceptance Criteria**:
- `bun run typecheck` が green
- `bun run test` が green（既存テストの regression なし）
- renderPrTitle の prefix 付与に対するテストが存在する
