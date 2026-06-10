# Design: secrets-mask-openai

## Context

`src/logger/stdout.ts` の `MASK_PATTERNS` は出力 seam（B-7）で API キー等を短縮形に置換する。
現在 Anthropic / GitHub の 3 パターンのみを保持しており、OpenAI 系キーはマスク対象外。

```ts
// 現状（L141-145）
const MASK_PATTERNS: RegExp[] = [
  /\bsk-ant-[A-Za-z0-9_-]+/g,
  /\b(gh[oprsu])_[A-Za-z0-9]+/g,
  /\bgithub_pat_[A-Za-z0-9_]+/g,
];
```

## Goals / Non-Goals

**Goals**:
- `MASK_PATTERNS` に OpenAI 系キーパターンを追加する
- 既存 3 パターンの挙動を維持する

**Non-Goals**:
- env-filter（B-6）の `OPENAI_API_KEY` 継承遮断
- Google・Azure 等 他 provider のパターン追加

## Decisions

### D1: 追加するパターンの順序と優先度

`sk-ant-` パターンより後に汎用 `sk-` パターンを置く。評価は配列順に逐次適用（`replace` ループ）されるため、より具体的なパターン（`sk-proj-`、`sk-svcacct-`）を汎用パターン（`sk-[A-Za-z0-9_-]{20,}`）より前に配置する。

追加順:
1. `/\bsk-proj-[A-Za-z0-9_-]+/g`
2. `/\bsk-svcacct-[A-Za-z0-9_-]+/g`
3. `/\bsk-[A-Za-z0-9_-]{20,}/g`

**Rationale**: `sk-ant-` は既存パターンが先に評価されるため Anthropic キーが誤って汎用 `sk-` にマッチすることはない。`sk-proj-` / `sk-svcacct-` を先に評価することで prefix 表示が正確になる。汎用パターンに `{20,}` 下限を設けることで短い `sk-` 文字列の誤爆を抑制する。

**Alternatives**: 1 つの大きな OR 正規表現でまとめる案 — パターンごとの prefix 抽出ロジックが複雑化するため不採用。

### D2: prefix 抽出ロジックを変えない

既存の `maskSensitive` は `match.indexOf("_") + 1` で prefix 末尾を検出する。
`sk-proj-xxx` の場合 `_` が存在しないため `indexOf("_")` が `-1` → `slice(0, 0)` = 空文字となる。
prefix が空になることを避けるため、`-` を区切り文字として追加 fallback する。

変更後:
```ts
const sep = match.indexOf("_") !== -1 ? match.indexOf("_") : match.lastIndexOf("-");
const prefix = match.slice(0, sep + 1);
return `${prefix}...`;
```

**Rationale**: 既存 Anthropic パターン（`sk-ant-api03-xxx` など `_` を含む）への影響を最小化しつつ、`-` 区切りの OpenAI パターンにも対応する。

## Risks / Trade-offs

- [Risk] 汎用 `sk-[A-Za-z0-9_-]{20,}` が将来の他 provider キーにも適用される → 誤マスクではなく過剰マスクであり安全側の挙動なので許容。

## Open Questions

なし
