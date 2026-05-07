# test-case-generator 決定ログ

## TC-001〜TC-004: 解決順序を 4 ケースに分割する :: 各優先順位レベル（step-level / defaults / stepDefaults / SDK fallback）が独立して検証できるよう分ける。1 ケースで全段階をまとめると失敗箇所の特定が困難になるため

## TC-005: maxTurns: null を独立した must ケースにする :: null が undefined と異なる有効値として fallback を止める動作は本変更の中核仕様。step-level と defaults の両側でこの動作が成立することを保証するため

## TC-006: SDK options への maxTurns 省略を integration ケースにする :: ClaudeCodeRunner が null を受け取ったとき options に key を含めないことは、unit で getStepExecutionConfig を検証するだけでは不十分。実際の query() 呼び出しを経由した連携を確認するため

## TC-008〜TC-009: 後方互換を 2 ケースに分割する :: steps 未定義と steps: {} 空オブジェクトは JSON 上で異なる状態。両方を must として列挙し、どちらも既存動作を壊さないことを担保するため

## TC-010〜TC-011: init の steps.defaults 生成と上書き防止を分ける :: 生成ロジックと防御ロジックは独立した実装パス。両方を must として確認することで D4 の仕様を完全にカバーするため

## TC-012: 既存フォールバック削除を must にする :: step.maxTurns ?? 30 のコードが残存すると config の maxTurns: null が機能しない。削除が正しく行われたことを integration レベルで確認する必要があるため

## TC-013〜TC-016: バリデーションを should にする :: 中核機能（解決順序・後方互換）ではなくエラーハンドリングの側面。動いているときの正常系が最優先で、バリデーション不備は運用上の問題だが即座に機能停止にはならないため

## TC-017: timeoutMs の非適用を should にする :: timeoutMs は config に定義するが SDK に渡さないという「設計の意図的な省略」。must ではないが、将来の実装で誤って渡すリグレッションを防ぐ観点で should として記録するため

## TC-018: null の優先を should にする :: TC-005 と類似するが step-level が defaults より null 優先になる点を別ケースで確認。重複と判断しなかったのは、null の扱いが解決チェーンの各レベルで独立して機能するかを検証する観点が異なるため

## TC-021〜TC-022: manual を could にする :: JSON の見た目確認と managed runtime の影響非確認は自動化が困難だが、コア仕様の合否には直結しない確認事項のため

## total 22、must 12 とした根拠 :: must-areas 4 領域（解決順序 4 ケース + null/unlimited 2 ケース + 後方互換 2 ケース + init 2 ケース + ClaudeCodeRunner 適用 2 ケース）を確実に列挙した上で should/could を追加した
