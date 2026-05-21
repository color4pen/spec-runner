# Spec Review Result: request-review-system-refinement

- **verdict**: approved
- **reviewer**: claude (spec-review)
- **date**: 2026-05-15

## Summary

request.md / design.md / tasks.md の三点は整合しており、問題の根拠（4周・3周ループの実績データ）も明確。prompt 責務の縮小と output formatter 追加の設計は妥当で、既存コードベースとの整合性も確認済み。以下の MEDIUM/LOW findings は情報提供として記録する。

## Findings

#1 [MEDIUM] task-coverage — fallback path に number フィールド付与が欠落
   Location: src/core/request/reviewer.ts L76-86, tasks.md Task 3
   Task 3 は `parseReviewOutput()` の parsed findings に `number` fallback を追加するが、JSON parse 失敗時の fallback finding（L78-82: `{ severity: "HIGH", category: "parse-error", ... }`）には触れていない。Task 2 で `RequestReviewFinding.number` を required にすると、この fallback path が型エラーになる。implementer は typecheck で気付くが、Task 3 の記述に「fallback finding にも `number: 1` を付与する」を含めるのが正確。

#2 [MEDIUM] task-coverage — TC-RVR-001 のテストフィクスチャ型不整合
   Location: tests/unit/core/request/reviewer.test.ts L30-34, tasks.md Task 7
   TC-RVR-001 は `RequestReviewResult` 型付きオブジェクト内に `number` なしの finding を直接構築している。Task 2 で `number` を required にした時点で型エラーになる。Task 7 は「assertion に追加」と書いているが、フィクスチャ自体の修正（`number: 1` 追加 or JSON 文字列経由に変更）が必要。同様に fallback テスト（TC-RVR-002, 003, 005）のフィクスチャ検証も必要。

#3 [LOW] implementation-detail — Task 5 の dynamic import が既存パターンと不一致
   Location: tasks.md Task 5
   `request-review.ts` は既に L15 で `reviewer.ts` から static import している。Task 5 の `await import("../request/reviewer.js")` は不要な dynamic import で、既存の static import パターンと不整合。re-export ブロック（L22-27）に `formatHumanReadable` を追加し static import で使う方が一貫性がある。

#4 [LOW] wording — acceptance criteria の「--json 不変」の表現精度
   Location: request.md 受け入れ基準 6 行目
   `number` / `location` / `recommendation` フィールドが追加されるため出力は厳密には「不変」ではない。design.md D3 で「additive change なので後方互換」と正しく記述されているが、acceptance criteria 側も「既存フィールドの意味・構造は不変（additive のみ）」とすると正確。

## Security Review

- 変更対象は prompt テキストと output formatter のみ。認証・入力検証・外部 API 呼び出しの変更なし
- `permissionMode: "bypassPermissions"` は既存コード（reviewer.ts L175）で、本 change では変更なし
- OWASP Top 10 に該当する変更なし
