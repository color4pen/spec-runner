# Spec Review Result: fix-create-dialog-repl-timing

- **iteration**: 1
- **date**: 2026-05-08
- **verdict**: approved

## Summary

proposal.md / design.md / tasks.md の全参照シンボル（`createPromptGenerator`, `queryInteractive`, `SdkQueryFn`, `hasQueryInteractive`, `pendingAutoMessage` 等）が実コードに存在し、記述と一致することを確認済み。SDK 型定義で `continue` と `resume` の mutually exclusive 制約（コメントレベル）、`SDKResultSuccess.session_id` / `SDKResultError.session_id` の存在も検証済み。`queryInteractive` / `SdkQueryFn` の呼び出し元は `create-dialog.ts` のみであり、削除による影響範囲は spec の記載通り。

設計判断（D1-D7）は根本原因（generator pre-pull と readline の構造的競合）に対して適切な解法であり、request.md の 12 要件・12 受け入れ基準を tasks.md が網羅している。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | consistency | proposal.md:1 | タイトル「continue: true ループに切り替える」だが実際の設計は `resume: sessionId` を使用。`continue: true` は明示的に使わない方針 | タイトルを「while ループ + resume: sessionId 方式に切り替える」等に修正する（実装には影響なし） |
| 2 | LOW | completeness | tasks.md:27 | Task 2.2 の ManagedRuntime ガード代替案が候補列挙に留まり、最終選定がない | 実装者判断で問題ないが、`runtime instanceof LocalRuntime` を推奨案として明記すると迷いが減る |
| 3 | LOW | completeness | tasks.md:9 | `isResultMessage()` ヘルパーの出所が不明確。SDK 提供か自前実装かの記載がない | SDK の `isResultMessage` を使うか、`msg.type === "result"` で判定するかを明記する |

## Completeness Check

| Request Requirement | Spec Coverage | Status |
|---|---|---|
| 1. dialog loop 書き換え（generator → while ループ） | design D1, D5 / tasks 1.1-1.4 | Covered |
| 2. session_id 明示追跡、resume: sessionId | design D2 / tasks 1.2 | Covered |
| 3. systemPrompt 初回のみ | design D3 / tasks 1.2 | Covered |
| 4. 関数分割による phase 境界維持 | design D5 / tasks 1.3 | Covered |
| 5. createPromptGenerator 削除 | design D4 / tasks 2.1 | Covered |
| 6. queryInteractive / SdkQueryFn 削除 | design D4 / tasks 3.1-3.5 | Covered |
| 7. slug collision フィードバック | tasks 1.4 | Covered |
| 8. hot resume（resume: sessionId） | design D6 / tasks 4.1 | Covered |
| 9. cold start（buildResumeInitialMessage） | design D7 / tasks 4.2 | Covered |
| 10. createPromptGenerator テスト削除 | tasks 5.1 | Covered |
| 11. queryInteractive テスト削除 | tasks 5.2 | Covered |
| 12. pure function テスト変更不要 | tasks 5.5 | Covered |

## Consistency Check

- proposal.md ↔ design.md: 整合。proposal の Impact が design の Decisions と対応
- design.md ↔ tasks.md: 整合。D1-D7 の各決定が tasks のタスクに分解されている
- request.md ↔ spec: 12 要件・12 受け入れ基準すべて spec にカバーされている
- SDK 型定義との整合: `session_id` フィールド、`continue`/`resume` mutually exclusive はドキュメントコメントレベルで確認済み

## Risk Assessment

- **R1（session_id 取得）**: SDK 型定義で `SDKResultSuccess.session_id: string` を確認。リスクは低い
- **R2（hasQueryInteractive 代替）**: tasks 2.2 で候補が列挙されており、実装者の判断に委ねる形。bug-fix scope として許容範囲

## Verdict Rationale

CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 3。全 findings は情報提供レベルであり、実装を阻害しない。request.md の全要件が spec に網羅されており、設計判断は根本原因に対して適切。approved。
