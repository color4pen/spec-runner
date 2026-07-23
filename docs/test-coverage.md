# test-coverage 規約

## 概要

test-coverage フェーズは、`test-cases.md` に宣言された `Priority: must` の TC（テストケース）が、
プロジェクト内のテストファイルに存在することを機械的に検証します。

## TC-ID リテラル走査

test-coverage は、must TC の ID（例: `TC-001`）が次のいずれかのテストファイル拡張子を持つファイル内に
**リテラルとして出現すること**を検査します:
`.test.ts`, `.spec.ts`, `.test.js`, `.spec.js`, `.test.tsx`, `.spec.tsx`,
`.test.jsx`, `.spec.jsx`, `.test.mts`, `.spec.mts`, `.test.mjs`, `.spec.mjs`

- **走査範囲**: プロジェクトルート以下（`node_modules` / `dist` / `.git` を除外）
- **出現形式の区別なし**: コメント・文字列・識別子など、TC-ID がリテラルとして存在すればカバー済みと判定します
- **境界一致**: `TC-001` は `TC-0010` や `TC-001-2` とは区別されます（後続の数字 / `-数字` は不一致）

must TC の ID が 1 つもテストファイルに見つからない場合、そのテストは `missingTcIds` に追記され
フェーズ全体が `failed` になります。

## assertion 存在確認

TC-ID がテストファイルに存在していても、**そのファイルに assertion が 1 つもない**場合は
`assertionless` 判定となり、フェーズは `failed` になります。

assertion として認識されるパターン: `expect(`, `assert(`, `assert.`

追記先に assertion が存在する必要があります。assertion のないファイル（空スタブ等）への追記は
assertionless 判定になるため、必ず assertion を持つ既存テストファイルに追記してください。

## トレーサビリティコメントによる既存カバレッジの表明

must TC が変更前から存在する既存テストで既に検証されている場合、
**その既存テストに `// TC-0XX: <TC 名>` トレーサビリティコメントを 1 行追記することが
coverage 検査を満たす正式な表明手段**です。

```typescript
// TC-001: ユーザー登録 — 正常系
describe('user registration', () => {
  it('registers a user with valid input', () => {
    expect(register(validInput)).resolves.toEqual({ id: expect.any(String) });
  });
});
```

このコメント追記により:
- coverage 検査（TC-ID リテラル走査）がそのファイルで TC-ID を発見し、カバー済みと判定します
- 既存テストが当該 TC の振る舞いを検証していることが、テストファイル自体に記録として残ります
- 新規テストの重複作成は不要です

> **注意**: トレーサビリティコメントの追記先は、`expect()` 等の assertion を持つ既存テストファイルである
> 必要があります。assertion を持たないファイルに追記するだけでは assertionless 判定になります。

## まとめ

| ケース | 対応 |
|---|---|
| must TC に対応するテストコードがない | 新規テストコードを作成する |
| must TC が既存テストで既に検証されている | 既存テストの該当箇所に `// TC-0XX: <TC 名>` コメントを追記する |
| TC-ID はあるが assertion が一切ない | assertion を持つファイルへ追記先を変更する |
