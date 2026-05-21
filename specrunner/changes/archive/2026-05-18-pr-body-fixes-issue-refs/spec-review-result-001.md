# Spec Review Result: pr-body-fixes-issue-refs

- **reviewer**: spec-reviewer
- **iteration**: 1
- **verdict**: approved

## Summary

request.md の `issue` field を parser で抽出し、`renderPrBody` で `Fixes #N` 行を挿入するシンプルな bug-fix。既存アーキテクチャパターン（optional field + 条件分岐）に完全に沿っており、影響範囲が限定的。

## Findings

### Positive

1. **現状分析が正確**: `ParsedRequest` に `issue` field が無い、parser が抽出していない、`renderPrBody` に Fixes 行が無い — 3 点すべてソースコード (`src/core/request/types.ts`, `src/parser/request-md.ts`, `src/core/pr-create/body-template.ts`) と一致
2. **既存パターンの踏襲**: `type`/`slug`/`baseBranch` と同一の正規表現パターンで抽出する設計。学習コスト・実装リスクともに最小
3. **Delta spec の GIVEN/WHEN/THEN**: pr-create-runner と request-md-parser 両方のシナリオが具体的で検証可能
4. **Optional field 設計**: issue 不在時に既存挙動を崩さない。既存 request.md の大半が issue field を持たないことを正しく考慮
5. **セキュリティ懸念なし**: PR body は `--body-file` 経由で書き込まれ、入力は request.md meta (ユーザー自身が作成) のみ。injection リスク不在

### Minor observations (non-blocking)

1. **既存 spec の signature 差異**: `pr-create-runner/spec.md` の `renderPrBody` 署名は `{ parsedRequest, jobState }` だが実装は `{ parsedRequest, jobState, slug }` を受け取る。これは既存の gap であり、本 change のスコープ外
2. **`#` prefix なし入力時の挙動**: `- **issue**: 264` と書かれた場合 `Fixes 264` が出力され GitHub auto-close が発動しない。request.md の Meta format 規約が `#N` であることから許容範囲（garbage in, garbage out）
3. **tasks.md の `makeParsedRequest` helper**: テストで使用するが定義場所は未指定。既存テストに類似 helper があるか、implementer が新規作成するかは実装時に判断

## Security Assessment

- 入力ソース: ユーザー自身が作成する request.md meta field のみ
- 出力先: `--body-file` 経由の GitHub PR body（GitHub がサニタイズ）
- OWASP 該当項目なし
- 認証・認可の変更なし

## Conclusion

設計・仕様・タスク分解すべてにおいて整合が取れており、実装阻害要因がない。approved。
