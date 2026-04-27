# Build Fixer Decisions

## 型エラー修正方針

- TS2769（line 315）の opt キャスト :: `opt as EnabledOption` で型ガード。VALID_ENABLED_OPTIONS が `as const` で定義済みなので型安全性を維持しつつエラーを消す
- TS2741（lines 336, 360, 382, 402, 421）の fetch モック :: 返却型を `Response` の代わりに `Partial<Response>` でキャストして preconnect 必須フィールドを緩和。Bun の fetch 型拡張を回避しつつ型エラーを消す
