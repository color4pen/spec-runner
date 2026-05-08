# Spec Review Result — add-test-case-generation-step

- **reviewer**: spec-reviewer
- **iteration**: 1
- **date**: 2026-05-08
- **verdict**: approved

## Summary

仕様は request.md の全要件を網羅しており、既存コードベースとの整合性が高い。参照している既存 API（NULL_PARSE_RESULT, branchNotSetError, AGENT_TOOLSET_TYPE, buildGitPushInstruction, capabilities.gitWrite）はすべて実在し、パターンも implementer/propose 等の既存 completionVerdict 型ステップと一致する。遷移テーブルの変更箇所（STANDARD_TRANSITIONS の spec-review:approved → implementer）も実コードと一致。design.md の D1–D6 が各設計判断の理由を明記しており、tasks.md の粒度も実装可能な水準にある。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | consistency | design.md:32-34 | request.md は `resultFilePath: openspec/changes/<slug>/test-cases.md` かつ `parseResult: ファイルの存在確認のみ` と指定しているが、design.md D1 は `resultFilePath: null` / `parseResult: NULL_PARSE_RESULT` に変更している。design.md はこの判断の理由（completionVerdict 型パターンの踏襲、code-review での後段検出）と Risk を明記しており妥当だが、request との差異である | request.md の意図は「verdict パース不要」であり、design の判断と実質的に同義。既存の implementer/propose も同パターン。現状のまま進行可 |
| 2 | LOW | completeness | tasks.md:§5 | テストケースに「test-case-gen ステップが steps Map に登録されていること」の検証がない。遷移テーブルのテストはあるが、run.ts の steps Map 登録は未検証 | implementer が steps Map 未登録でもテーブル上は遷移可能だが実行時エラーになる。テスト追加を推奨するが、typecheck + integration で検出可能な範囲 |
| 3 | LOW | consistency | tasks.md:1.1 | `<user-request>` タグの injection 防止注意書きを system prompt に含めると記載されているが、design.md D3 にはこの要件の記載がない | design.md に追記するか、tasks.md の記述で実装者に伝わるため現状でも可 |

## Scoring

| Category | Score | Rationale |
|----------|-------|-----------|
| completeness | 9 | request.md の要件 1–8 および受け入れ基準 5 項目をすべて tasks.md がカバー。テスト観点も十分 |
| consistency | 9 | 既存ステップ（implementer, propose）のパターンと完全一致。参照 API の名前・パス・行番号が実コードと一致。model 文字列 `claude-sonnet-4-6` も正確 |
| feasibility | 9 | 全変更箇所が特定済み。新規ファイル 2 + 既存ファイル変更 2 の最小構成。既存パターンの複製であり実装リスクが低い |

## Verdict Rationale

CRITICAL: 0, HIGH: 0。全 findings が LOW severity であり、いずれも実装への実質的影響がない。design.md の request からの差異（resultFilePath: null）は既存パターンとの整合性を優先した妥当な判断であり、Risk セクションに明記されている。仕様は実装可能な状態にある。
