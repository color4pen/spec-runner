# Design: PR body に Fixes #N を自動付与

## 概要

`renderPrBody` が `parsedRequest.issue` を読み取り、PR body に `Fixes #N` 行を挿入する。

## 現状分析

- `ParsedRequest` 型に `issue` field が存在しない
- parser (`src/parser/request-md.ts`) は `- **issue**: #N` を抽出していない
- `renderPrBody` は Summary / Workflow / Test plan / signature の 4 section を出力するが、issue 参照は含まない

## 設計

### D1: ParsedRequest に `issue` optional field を追加

```ts
// src/core/request/types.ts
export interface ParsedRequest {
  // ... existing fields ...
  /** Issue reference from Meta section (e.g. "#264"). undefined if not present. */
  issue?: string;
}
```

- Optional — 既存 request.md の大半は `issue` field を持たない
- `#` prefix 付き string (`"#264"`) として保持。parser が Meta section から raw value をそのまま取得

### D2: parser で `issue` field を抽出

`src/parser/request-md.ts` に既存の `type`/`slug`/`baseBranch` と同じパターンで追加:

```ts
const issuePattern = /^\s*-\s+\*\*issue\*\*:\s+(.+)$/;
```

- 必須ではない — 見つからなくても `issue = undefined` で続行
- 値は trim のみ、`#` の正規化は行わない (入力の形式をそのまま保持)

### D3: renderPrBody で Fixes 行を挿入

挿入位置: `## Summary` section の直後（Workflow table の直前）。GitHub UI で最初に目に入る位置。

```
## Summary
### 背景
...
### 目的
...

Fixes #264

## Workflow
...
```

- `parsedRequest.issue` が存在する場合のみ挿入
- 変換式: `Fixes ${issue}` — issue が `"#264"` なら出力は `Fixes #264`
- issue が `undefined` のとき何も挿入しない (既存挙動維持)

### D4: 複数 issue の扱い

現時点では単数のみ対応。request.md の Meta format は `- **issue**: #N` で単一値。
将来的に複数対応が必要になった場合は、配列パース + 複数行出力に拡張可能だが、今回はスコープ外。

## 影響範囲

| ファイル | 変更内容 |
|---------|---------|
| `src/core/request/types.ts` | `issue?: string` 追加 |
| `src/parser/request-md.ts` | issue 抽出ロジック追加 |
| `src/core/pr-create/body-template.ts` | Fixes 行挿入 |
| `tests/unit/core/pr-create/body-template.test.ts` | TC追加 |
| `tests/unit/parser/request-md.test.ts` | TC追加 (既存ファイルがあれば) |

## リスク

- 低: 変更は optional field 追加 + 条件分岐のみ。既存パスに影響しない
- parser の既存テストが `issue` field なしの input で通り続けることを確認
