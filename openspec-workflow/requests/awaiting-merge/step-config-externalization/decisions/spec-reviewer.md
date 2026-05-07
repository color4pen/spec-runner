# Spec-Reviewer Decisions — step-config-externalization

## Completeness 評価

request.md の 13 要件と delta spec の対応を 1:1 突合する :: 要件 1-12 は cli-config-store delta で全カバー。要件 13（delta spec 存在）は構造的に充足。ただし要件 3（null = 制限なし）の validation 面が不足：maxTurns に負数/0/文字列を書いた場合の挙動が未定義

MODIFIED header の完全一致を確認する :: cli-config-store delta の `### Requirement: 設定ファイルは固定スキーマに従う` は main spec の同 header と完全一致。format 整合性 OK

## Gap 分析

steps config の validation が未定義と判定する :: validateConfig() は pipeline.maxRetries の range check を行っているが、steps セクションの validation scenario がない。maxTurns: -1、maxTurns: "abc"、model: ""、timeoutMs: -1000 等の異常値に対する挙動を spec で定義すべき

managed runtime での steps 設定の扱いが未定義と判定する :: runtime: "managed" 時に config.steps を設定した場合の挙動（無視？warning？エラー？）が spec に未記載。サイレント無視は UX 上の混乱要因

## Scenario Coverage 評価

解決順序の 4 段階テストを充足と判定する :: cli-config-store delta の 5 scenarios が step-level > defaults > stepDefaults > SDK fallback の全パスをカバー。null as valid value のテストも含まれる

init の 3 パターンを充足と判定する :: 新規 / 既存 steps なし / 既存 steps あり の 3 scenarios がすべて定義済み

ClaudeCodeRunner の 4 scenarios を充足と判定する :: config override / null maxTurns / no config / defaults priority の全パターンが step-execution-architecture delta でカバー済み
