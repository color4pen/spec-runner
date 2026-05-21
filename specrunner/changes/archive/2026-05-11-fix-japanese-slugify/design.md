## Context

`src/util/slugify.ts` の line 22 で non-ASCII 文字を空文字に置換（除去）している:

```ts
let slug = description.replace(/[^\x00-\x7F]/g, "");
```

この除去により、日本語文字が ASCII トークン間の**単語境界**として機能しなくなる。
`"pipeline完了時にPR URLをstdoutに表示する"` → 日本語除去 → `"pipelinePR URLstdout"` → `"pipelinepr-urlstdout"`（意味不明な結合）。

日本語のみの場合は全文字が除去されて空文字 → `"untitled"` になるが、これは要件上許容される。

## Goals / Non-Goals

**Goals:**
- 日本語文字を単語境界として扱い、ASCII トークンが結合しないようにする
- 既存テスト（TC-SL-001〜006）を壊さない
- 外部ライブラリを追加しない

**Non-Goals:**
- romaji 変換による日本語 → ASCII slug 生成
- 3 文字未満の slug に対する新しいフォールバック規則の追加（現行動作維持）

## Decisions

### D1: non-ASCII 文字をスペースに置換する（除去ではなく）

- **Decision**: `/[^\x00-\x7F]/g, ""` を `/[^\x00-\x7F]+/g, " "` に変更する。連続する non-ASCII を 1 つのスペースに置換することで、後続の `[^a-z0-9]+` → `-` 変換で自然にハイフン区切りになる。
- **Rationale**: 1 行の regex 変更で、日本語文字が単語区切りとして機能する。既存の ASCII-only 入力には影響なし。
- **Alternatives**:
  - ASCII トークンを正規表現で抽出して join → 既存ロジックの書き換え量が大きい
  - Unicode カテゴリ (`\p{Script=Latin}`) で抽出 → 過剰な複雑化

### D2: maxLength のデフォルト値は変更しない

- **Decision**: `maxLength = 50` は既にデフォルト引数として実装済み。要件 3 は既存実装で充足されている。
- **Rationale**: テストケース TC-SL-004 が既にこの動作を検証済み。

## Risks / Trade-offs

- **Non-ASCII 文字間に 1 文字だけ ASCII がある場合**: `"日本a語"` → `" a "` → `"a"` — 1 文字の slug が生成される。しかし request.md の `slug` フィールドで明示指定すればバイパスできるため、実用上問題なし。
