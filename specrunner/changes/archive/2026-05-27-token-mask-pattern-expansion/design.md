# Design: token-mask-pattern-expansion

## Summary

`MASK_PATTERNS` に `ghu_*`, `ghs_*`, `github_pat_*` を追加し、GitHub token の全 prefix をカバーする。既存の 4 パターン（`sk-ant-*`, `gho_*`, `ghp_*`, `ghr_*`）のうち `gh[oprsu]_*` を 1 正規表現に統合し、合計 3 パターンに削減する。

## Background

現状の `MASK_PATTERNS`（`src/logger/stdout.ts` L141-146）:

```typescript
const MASK_PATTERNS: RegExp[] = [
  /\bsk-ant-[A-Za-z0-9_-]+/g,
  /\bgho_[A-Za-z0-9]+/g,
  /\bghp_[A-Za-z0-9]+/g,
  /\bghr_[A-Za-z0-9]+/g,
];
```

カバーされない GitHub token prefix:
- `ghu_` — GitHub user-to-server token（GitHub App）
- `ghs_` — GitHub server-to-server token（GitHub App）
- `github_pat_` — fine-grained personal access token

file-permission-hardening で log ファイルの permission は 0o600 に制限済みだが、マスク漏れは多層防御の穴。

## Architecture Decision

### D1: `gh[oprsu]_*` を 1 正規表現に統合

既存の `gho_*`, `ghp_*`, `ghr_*` と新規の `ghs_*`, `ghu_*` を character class で統合する:

```typescript
/\b(gh[oprsu])_[A-Za-z0-9]+/g
```

capture group `(gh[oprsu])` は `maskSensitive` の prefix 抽出（`match.indexOf("_") + 1`）で `gho_...` / `ghp_...` 等の形式を維持するために必要…ではなく、`indexOf("_")` は capture group の有無に関係なく動作する。ただし capture group があっても害はない。request 指定のパターンをそのまま採用する。

### D2: `github_pat_*` を独立パターンとして追加

```typescript
/\bgithub_pat_[A-Za-z0-9_]+/g
```

`github_pat_` は `gh` prefix 系と構造が異なる（`_` が 2 つ）ため統合不可。独立パターンとする。

**マスク結果**: `maskSensitive` の prefix 抽出は `match.indexOf("_") + 1` で最初の `_` までを取る。`github_pat_abc123` → `github_...` となる。`pat_` 部分はマスクに含まれるが、token の機密部分は確実に隠蔽される。request で maskSensitive ロジック変更はスコープ外と明記されているため、この動作を受容する。

### D3: `sk-ant-*` は現状維持

request の指定通り変更しない。

### 変更後の MASK_PATTERNS

```typescript
const MASK_PATTERNS: RegExp[] = [
  /\bsk-ant-[A-Za-z0-9_-]+/g,
  /\b(gh[oprsu])_[A-Za-z0-9]+/g,
  /\bgithub_pat_[A-Za-z0-9_]+/g,
];
```

3 パターン（受け入れ基準の上限）。

## Affected Capabilities (delta spec)

`cli-commands` spec の「CLI 出力チャネル規約」Requirement L952 がマスクパターンを列挙している:

> 全出力パスで既存のマスクパターン (`sk-ant-` / `gho_` / `ghp_` / `ghr_`) が自動適用される。

この列挙に `ghs_` / `ghu_` / `github_pat_` を追加する delta spec が必要。

`cli-log-persistence` spec は「GitHub token 等」と汎用的に記述しているため delta 不要。

## Scope

### In scope
- `src/logger/stdout.ts` L141-146 — MASK_PATTERNS 配列の置き換え

### Out of scope
- `maskSensitive` 関数のロジック変更（request 明示）
- テスト追加（specrunner pipeline のテスト生成に委ねる）
