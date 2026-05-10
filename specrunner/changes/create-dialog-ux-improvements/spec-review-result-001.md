# Spec Review Result: create-dialog-ux-improvements

- **iteration**: 1
- **date**: 2026-05-08
- **verdict**: approved

## Summary

proposal.md / design.md / tasks.md / specs/message-streaming/spec.md の全体が request.md の 11 要件・8 受け入れ基準を網羅している。既存コード（`processAssistantTurn` の構造、`detectCompletion` の実装、`isTextDelta`/`isToolUseSummary`/`isResultMessage` の型ガード、`AssistantTurnResult` の型定義）との整合を確認済み。

設計判断 D1-D4 は architect 評価済みの方針と一致し、D4 の callback パターンは現在の assistant メッセージ後の slug 検出 → FINAL_DRAFT 検出 → ユーザー確認の順序を自然に保持できる。「1 ターン 1 スピナー」モデルにより、ツール連続実行時のチャタリング防止とスピナーライフサイクル管理を同時に解決している。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | completeness | tasks.md:34 | Task 2.4 で `try/finally` による spinner cleanup を指示しているが、delta spec (`specs/message-streaming/spec.md`) に対応する MUST 要件がない。実装上は tasks から導出可能だが、仕様としての明示がない | delta spec の「スピナーモジュール」要件に「例外発生時も MUST `stop()` が呼ばれること」を追加する。または現状のまま実装者判断に委ねる（実装には影響なし） |
| 2 | LOW | consistency | design.md:77 | D2 テーブルの「`query()` 呼び出し直後 → `spinner.start()`」と後段の「query() 呼び出しの**前**に 1 回だけ start() する」が微妙に矛盾。tasks.md 3.2 は「consumeStream() 呼び出し前に spinner.start()」で統一されている | design.md テーブルの記述を「consumeStream() 呼び出し直前」に修正するか、現状維持で tasks.md を正とする |

## Completeness Check

| Request Requirement | Spec Coverage | Status |
|---|---|---|
| 1. query() → 最初の text_delta 間にスピナー表示 | design D1, D2 / tasks 1.x, 3.x / spec: LLM応答待ちスピナー | Covered |
| 2. stderr 出力 + 非 TTY 無効化 | design D1 / tasks 1.3 / spec: 非TTY環境シナリオ | Covered |
| 3. 最初の text_delta でスピナー停止 | design D2 / tasks 2.2 / spec: スピナー表示と停止シナリオ | Covered |
| 4. tool_use_summary でスピナー停止 + [tool] 表示、次の text_delta まで再開しない | design D2 / tasks 2.2 / spec: ツール実行中の表示制御 | Covered |
| 5. src/cli/spinner.ts に独立モジュール | design D1 / tasks 1.1 / spec: スピナーモジュール要件 | Covered |
| 6. detectCompletion() 方式維持（リアルタイムスキャンしない） | design D3 / spec: MODIFIED FINAL_DRAFT | Covered |
| 7. ストリーミング出力済み全文は ANSI クリアしない + draft パス表示 | design D3 / tasks 4.1 / spec: FINAL_DRAFT 検出時の表示 | Covered |
| 8. 書き出し確認 [y/N] 維持 | design D3 / tasks 4.2 / spec: FINAL_DRAFT シナリオ | Covered |
| 9. processAssistantTurn からストリーミング制御を抽出 | design D4 / tasks 2.1-2.3 / spec: processAssistantTurn 要件 | Covered |
| 10. スピナーのユニットテスト（TTY / 非 TTY） | tasks 5.1 | Covered |
| 11. processAssistantTurn 抽出後の動作テスト | tasks 5.2 | Covered |

## Consistency Check

- proposal.md ↔ design.md: 整合。proposal の変更ファイル一覧が design の D1-D4 に対応
- design.md ↔ tasks.md: 整合。D4 の `consumeStream` シグネチャと tasks 2.1 が一致。callback パターン（`onAssistantComplete`）の設計が tasks 2.2-2.3 に正しく反映
- design.md ↔ delta spec: 整合。D2 の「1 ターン 1 スピナー」モデルが spec のシナリオ（ツール実行後もスピナー再開しない）と一致
- tasks.md ↔ delta spec: 整合。tasks の各ステップが spec の MUST/MUST NOT 要件をカバー
- request.md スコープ外 ↔ design Non-Goals: 整合。マークダウンレンダリング、進捗バー、ANSI クリアが共に除外

## Security Assessment

セキュリティ影響なし。変更は CLI の表示制御（スピナー ANSI エスケープ、stderr/stdout 出力パターン）に限定される。新たな外部入力の受け付け、認証・認可フローの変更、ファイルシステムへの書き込みパス変更はない。ANSI エスケープシーケンスはハードコードされた定数であり、ユーザー入力からの注入リスクはない。
