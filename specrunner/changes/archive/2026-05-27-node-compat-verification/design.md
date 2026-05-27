# Design: node-compat-verification

## Context

spec-runner は Bun で開発・実行されているが、npm パッケージとして配布すると `npx @color4pen/specrunner` で Node.js 環境から実行される。コード内では Bun 固有 API の使用は禁止されており、実際にすべての import は `node:*` プレフィックスで統一されている。

### 現状の検証結果

ローカルで `bun run build && node dist/bin/specrunner.js` を実行した結果:

- `--help`: exit 0、正常出力 ✓
- `doctor`: exit 0、全チェック正常実行 ✓
- dist/ 内に `Bun.*` / `bun:*` の実 API 使用なし（コメントと文字列リテラル内の言及のみ）✓

つまり**現時点で Node.js 互換性に問題はない**。この request の主な価値は「動くことの継続的検証」を CI に組み込むことにある。

### 互換性が保たれている理由

1. **import パス**: すべて `.js` 拡張子付き + `node:*` プレフィックス → Node.js ESM で解決可能
2. **path alias**: `@/*` は tsconfig.json に定義されているがソースコードでは未使用 → build 成果物に影響なし
3. **`type: "module"`**: package.json に設定済み → ESM として正しくロードされる
4. **`globalThis.fetch`**: Node.js 18+ でネイティブ対応
5. **`AbortSignal.timeout()`**: Node.js 17.3+ で対応
6. **`import.meta.*`**: Bun 固有の `import.meta.dir` / `import.meta.path` は未使用

## Goals / Non-Goals

**Goals**:

- Node.js 20 での `--help` / `doctor` 実行を CI で継続的に検証する
- dist/ 内の Bun 固有 API 混入を CI で検出する
- 互換性問題が発見された場合に修正する（今回は該当なし）

**Non-Goals**:

- テストスイート（vitest）の Node.js 対応
- Bun 固有機能の Node.js ポリフィル導入
- Node.js 18 以前のサポート
- `specrunner run` 等の full pipeline の Node.js テスト（agent SDK 依存のため CI では実行不可）

## Decisions

### D1: CI ワークフローを `.github/workflows/ci.yml` として新設する

**Rationale**: publish.yml はタグ push 時のみ実行される。main push + PR で常時検証するには別ワークフローが必要。

**Alternatives considered**:
- publish.yml に node テストを追加する → トリガー条件（tag push のみ）が異なるため不適
- pre-commit hook で検証 → ローカル環境依存、CI の代替にならない

### D2: Node.js テストは `bun run build` 後の `node dist/bin/specrunner.js` で行う

**Rationale**: npm パッケージの実際の利用形態（`npx` 経由 = `node` 実行）を再現する。Bun でのテスト（既存の `bun run test`）と Node.js での smoke test を分離することで、各ランタイムの責務が明確になる。

**Alternatives considered**:
- `bun run test` を Node.js でも実行する → vitest が Bun 前提、スコープ外

### D3: Bun 固有 API の検出は `grep -rE` で dist/ を検索する

**Rationale**: `import.*from ["']bun:` と `Bun\.` の実 API 呼び出しパターンを検出する。コメントや文字列リテラル内の言及（例: prompt テキスト「Bun.* は禁止」）は false positive だが、grep パターンで import 文と実際の API 呼び出しに絞れば十分精度が出る。

完全な精度が必要なら AST 解析が必要だが、現状のコードベースでは false positive がゼロのため、grep で十分。

**検出パターン**: `from ["']bun:` （import 文）。`Bun.` は文字列リテラル・コメント内に存在するため CI で grep する場合は import パターンに限定する。

**Alternatives considered**:
- ESLint の no-restricted-imports ルール → build 前のソースには使えるが、dist/ の検証にはならない
- AST 解析ツール → 過剰、現状の規模では不要

### D4: CI のジョブ構成は単一ジョブで build → node smoke test → bun test の順とする

**Rationale**: build 成果物を node テストと bun テスト双方で使うため、同一ジョブ内で sequential に実行するのが最もシンプル。matrix strategy で分離するほどの複雑さはない。

**Alternatives considered**:
- matrix strategy で node / bun を並列実行 → build step が重複する、artifact 受け渡しの複雑さが増す

## Risks / Trade-offs

- [Risk] dist/ 内の grep 検出で false positive が出る場合がある → Mitigation: import パターン (`from ["']bun:`) に限定することで prompt テキスト内の「Bun.*」言及を除外。将来 false positive が増えたら allowlist パターンを追加する。
- [Risk] Node.js のマイナーバージョン差異で CI が落ちる → Mitigation: `node-version: "20"` でメジャーバージョンを固定。

## Open Questions

なし。現時点で互換性問題は発見されていない。
