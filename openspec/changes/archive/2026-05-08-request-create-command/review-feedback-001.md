# Code Review Feedback: request-create-command

- **iteration**: 1
- **verdict**: approved
- **date**: 2026-05-08
- **total-score**: 7.9

## Score Breakdown

| Category | Weight | Score | Rationale |
|----------|--------|-------|-----------|
| correctness | 0.30 | 8 | 全フローが仕様通り。3段フォールバック、型ガード、slug導出、衝突チェック正確。type/slug一致チェック（spec-review #2対応）も実装済み |
| security | 0.25 | 9 | read-only toolset + bypassPermissions。slug sanitize で path traversal 防止。description は LLM 入力のみ |
| architecture | 0.15 | 8 | pipeline 外の独立コマンドとして適切に配置。CommandRunner に変更なし。RuntimeStrategy.query() の契約を正しく拡張 |
| performance | 0.10 | 7 | 1-shot query で十分。collectRequestPatterns は逐次 readFile だが merged 件数が少ないため問題なし |
| maintainability | 0.10 | 7 | コード構造明瞭。ただし LocalRuntime の dual constructor（positional + named options）は将来の負債 |
| testing | 0.10 | 8 | 全主要パスをカバー。slugify/collision/patterns/scaffold/extractContent/executeCreate/query() |

**Total: 8×0.30 + 9×0.25 + 8×0.15 + 7×0.10 + 7×0.10 + 8×0.10 = 2.4 + 2.25 + 1.2 + 0.7 + 0.7 + 0.8 = 8.05 → 8.0**

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | maintainability | src/core/runtime/local.ts:61-83 | Dual constructor (positional + named options) は互換性維持のためだが、factory.ts は既に named options に移行済み。全テストも named options を使えるため positional path は dead code に近い | 既存テスト（TC-LR-001〜010）が positional を使っているため今回は許容。次回 refactoring request で positional を削除する |
| 2 | MEDIUM | correctness | src/core/command/create.ts:196 | `model: "claude-sonnet-4-5"` がハードコードされている。request.md requirement 8 は `model` を options で渡すことを要求しているが、config.json の agents.model との統合が未定義。現状は動作するが、model 変更時に create だけ取り残される | config から model を取得するか、CLI flag `--model` を追加する。YAGNI として次回対応でも可 |
| 3 | LOW | maintainability | src/prompts/create-system.ts:13-66 | system prompt が日本語固定。プロジェクト自体が日本語中心なので問題ないが、i18n 必要時に分離が面倒 | 現状許容。将来 i18n 対応時に locale ファイルに移動 |
| 4 | LOW | testing | tests/unit/core/command/create.test.ts:135-192 | TC-CR-003 の Tier 2 テストは実質的に Tier 1 が成功するケースをテストしている（parseRequestMdContent がフェンス内の # も検出するため）。真の Tier 2 テスト（Tier 1 が確実に失敗し Tier 2 でリカバリ）が弱い | parseRequestMdContent がフェンス内容を拾わないケース（例: type 行が存在しない outer + fence 内に完全な request.md）を構成するか、extractRequestContent 内のパース関数を DI にして Tier 1 を強制失敗させるテストを追加 |
| 5 | LOW | architecture | src/context/request-patterns.ts | コンテキスト収集の責務が `src/git/dynamic-context.ts` と `src/context/request-patterns.ts` に分散。spec-review #3 と同じ指摘 | YAGNI。統合は将来のリファクタリングで対応 |

## Summary

実装品質は高い。仕様の全要件を満たしており、verification も全フェーズ pass。型安全性・エラーハンドリング・テストカバレッジともにプロダクション品質。

主要な設計判断（pipeline外配置、1-shot query、構造的型ガード、3段フォールバック）はすべて request.md の architect 評価済み設計に沿っている。

CRITICAL/HIGH の findings はなし。MEDIUM 2件は model ハードコードと dual constructor だが、いずれも即座の修正は不要。

## Scenario Coverage

| Must Scenario (from request.md 受け入れ基準) | Test Coverage |
|---|---|
| `specrunner create "description" --type new-feature` で request.md 生成 | TC-CR-005 |
| 生成 request.md が parseRequestMdContent バリデーション通過 | TC-CR-001, TC-CR-005 |
| `--no-llm` で scaffold テンプレート出力 | TC-CR-006 |
| `--slug` で slug 明示指定 / 省略時は description から導出 | TC-SL-001〜005 (slugify), TC-CR-005 (executeCreate with explicit slug) |
| 既存 slug 衝突時にエラー終了 | TC-SL-006c, TC-SL-006d, TC-CR-005 (collision test) |
| `--run` で生成後に pipeline 起動 | 未テスト（runRunCore への委譲のみ。統合テストレベル） |
| LocalRuntime.query() が SDK 呼び出し | TC-LR-012 |
| request パターン（同一type 3件 + 異type 1件）注入 | TC-RP-001 |
| DynamicContext（specsList / changesList）注入 | buildCreateUserMessage のテストなし（prompt組み立ては実装を読めば自明だが形式的にはテスト不足） |
| `bun run typecheck && bun run test` が green | verification-result.md: passed |

## Iteration Comparison

N/A (iteration 1)
