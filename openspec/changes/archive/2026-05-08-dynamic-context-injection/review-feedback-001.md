# Code Review — dynamic-context-injection — Iteration 1

## Summary

DynamicContext の型定義、収集関数、PipelineDeps → AgentRunContext → StepContext → buildMessage の全経路転送は正しく実装されている。設計判断（optional 追加、CommandRunner 後付け、1 回 collect）は design.md に忠実で、依存方向も正しい。テストは build/typecheck/test 全 green。

ただし `collectSpecsList` が実プロジェクト構造と不一致で、`specsList` は常に空配列を返す。propose agent に既存 spec 情報が渡らず、feature の stated goal の一部が機能しない。

## Metadata

- **iteration**: 1
- **verdict**: needs-fix
- **total-score**: 7.20
- **pass-threshold**: 7.0

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 6 | 0.30 | 1.80 |
| security | 8 | 0.25 | 2.00 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 6 | 0.10 | 0.60 |
| **Total** | | | **7.20** |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | correctness | src/git/dynamic-context.ts:78-89 | `collectSpecsList` は `openspec/specs/` 直下の `.md` ファイルを探すが、実プロジェクト構造は `openspec/specs/<name>/spec.md`（サブディレクトリ）。`.isFile()` フィルタにより常に空配列が返る。propose agent に既存 spec 情報が渡らない | `isFile()` を `isDirectory()` に変更し、サブディレクトリ名の一覧を返す（`changesList` と同じパターン）。あるいは再帰的に `.md` ファイルを探索する |
| 2 | MEDIUM | testing | tests/git/dynamic-context.test.ts:117-131 | `specsList` のテストが `openspec/specs/` 直下にフラット `.md` ファイルを配置しているが、実プロジェクトはサブディレクトリ構造。テストが実構造と乖離しており Finding #1 を検出できなかった | テストケースをサブディレクトリ構造（`openspec/specs/pipeline/spec.md`）に合わせ、ディレクトリ名が返ることを検証する |
| 3 | LOW | maintainability | src/prompts/propose-system.ts:233 | `buildInitialMessage` の `dynamicContext` パラメータが `{ specsList?: string[]; changesList?: string[] }` のインライン型。他の buildMessage 関数は `DynamicContext` 型を import して使用しており一貫性がない | `DynamicContext` 型を import して使用する。または Pick ユーティリティ型を使う |
| 4 | LOW | correctness | src/git/dynamic-context.ts:56 | `_branch` パラメータが未使用（`main..HEAD` がハードコード）。request.md の要件通りではあるが、将来 main 以外のベースブランチに対応する際に変更が必要 | 現時点では設計通り（D3: 1 回 collect + snapshot）。将来の拡張時に branch パラメータを活用する旨のコメントを追加する |

## Verdict Rationale

HIGH finding (#1) が 1 件存在するため、承認阻止条件に該当。`collectSpecsList` の修正後に再レビュー。

スコアは 7.20 で pass threshold (7.0) を超えているが、review-standards.md の承認阻止条件「CRITICAL >= 1 または HIGH >= 1 の findings が存在する場合、verdict は自動的に needs-fix」により needs-fix。
