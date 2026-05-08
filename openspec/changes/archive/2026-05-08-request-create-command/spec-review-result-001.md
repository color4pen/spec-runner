# Spec Review Result: request-create-command

- **iteration**: 1
- **verdict**: approved
- **date**: 2026-05-08

## Summary

仕様は request.md の全要件を網羅しており、設計判断・タスク分解ともに整合している。既存コードベース（LocalRuntime, QueryOptions, parseRequestMdContent, collectDynamicContext, factory.ts）との参照はすべて正確。セキュリティ上の懸念もない。MEDIUM 2 件・LOW 2 件の指摘があるが、いずれも承認阻止条件に該当しない。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | consistency | tasks.md:99 | Task 5.3 flow: `--no-llm` 時に「f へジャンプ」とあるが、tasks のレタリングでは f = `runtime.query()`（LLM 呼び出し）。request.md の元フロー（b-f をスキップ → g の書き出しへ）と tasks のレタリングがずれている。正しくは「h へジャンプ」（write file ステップ） | tasks.md 5.3b の「f へジャンプ」を「h へジャンプ」に修正する |
| 2 | MEDIUM | completeness | tasks.md:106 | Task 5.3i の `parseRequestMdContent()` は構造バリデーション（title/type/slug の存在チェック）のみ。request.md requirement 10h が求める「生成された type/slug が入力値と一致するか」のセマンティックチェックがタスクに含まれていない | Task 5.3i に追記: `parseRequestMdContent()` の返り値の `type` と `slug` が入力パラメータと一致することを検証し、不一致時は stderr にメッセージを出力して exit code 1 |
| 3 | LOW | architecture | design.md:57-58 | `src/context/request-patterns.ts` を新設するが、同種のコンテキスト収集関数 `collectDynamicContext` は `src/git/dynamic-context.ts` に配置されている。コンテキスト収集の責務が 2 ディレクトリに分散する | 現時点では許容。将来的にコンテキスト収集を統合する場合は `src/context/` へ移動を検討 |
| 4 | LOW | maintainability | tasks.md:103 | `model: "sonnet"` がハードコードされている。config.json の model 設定との関係が未定義 | YAGNI で現状は許容。config override が必要になった時点で対応 |

## Completeness Matrix

| Request Requirement | Design | Tasks | Coverage |
|---|---|---|---|
| 1. CLI エントリポイント (`specrunner create`) | Architecture diagram | 6.1, 6.2 | Full |
| 2. slug 導出 + 衝突チェック | D3 | 1.1, 1.2 | Full |
| 3. request パターン収集 | D4 | 2.1, 2.2 | Full |
| 4. LocalRuntime.query() 実装 | D1, D2 | 4.1-4.5 | Full |
| 5. create コマンド実行フロー | Architecture diagram | 5.1-5.6 | Full (Finding #1 のレタリング修正要) |
| 6. prompt 設計 | D5 | 5.1, 5.2 | Full |
| 7. query() 応答の型安全性 | D7 | 5.5 | Full |
| 8. テスト | — | 7.1-7.6 | Full |
| QueryOptions 拡張 (暗黙要件) | D8 | 3.1 | Full |

## Security Assessment

- `permissionMode: "bypassPermissions"` + `allowedTools: ["Read", "Grep", "Glob"]`: read-only ツールのみ許可。安全
- slug のサニタイズ（英数字 + ハイフンのみ）: path traversal を防止
- ユーザー入力 `description` は LLM への自然言語入力として使用。インジェクションリスクなし
- `--run` はデフォルト OFF。明示フラグ必須。意図しない pipeline 起動を防止
- 認証情報の露出なし

## Task Dependency Order

```
1 (slugify) ─────────┐
2 (patterns) ────────┤
3 (QueryOptions) ──┐ ├→ 5 (create) → 6 (CLI) → 7 (tests)
4 (LocalRuntime) ──┘ │
                     ┘
```

依存順序は正しい。並行実施可能なタスク: 1, 2, 3 は独立。4 は 3 に依存。
