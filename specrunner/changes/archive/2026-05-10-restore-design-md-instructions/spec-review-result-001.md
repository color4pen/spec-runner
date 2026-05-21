# Spec Review Result: restore-design-md-instructions

- **iteration**: 1
- **verdict**: approved
- **timestamp**: 2026-05-11

## Summary

request.md の要件は明確で、置換テキストが正確に指定されている。design.md は D1 に alternatives considered を記載し、request.md のスコープ外定義と整合。tasks.md は request.md の置換テキストを忠実に転記しており、受け入れ基準も一致。対象ファイル `src/prompts/propose-system.ts` lines 60-65 の現状も request.md の記述と一致することを確認済み。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | completeness | tasks.md:6 | 行番号 "lines 60-65" はハードコードされており、main の変更で実際の行番号と乖離する可能性がある | implementer はコンテンツマッチで特定するため実害なし。対応不要 |

## Checklist

- [x] request.md の要件が design.md / tasks.md に網羅されている
- [x] design.md の Decisions に alternatives considered が記載されている
- [x] tasks.md の置換テキストが request.md の要件セクションと完全一致
- [x] 受け入れ基準が request.md と tasks.md で一致
- [x] スコープ外の作業が design.md / tasks.md に混入していない
- [x] delta spec が不要な type (bug-fix) であり、specs/ が生成されていない — 正しい
- [x] セキュリティ上の問題なし（prompt テンプレートの文言変更のみ）
