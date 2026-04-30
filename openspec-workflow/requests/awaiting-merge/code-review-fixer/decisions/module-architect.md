# Decisions — module-architect

- parseReviewVerdict を src/core/parser/review-verdict.ts に抽出する :: rule of three（spec-review + code-review）が成立し、pure 関数として独立 testability を確保するため
- parseSpecReviewVerdict は 1 行 wrapper として残す :: spec-review.ts:90 の call site 互換性維持と step-execution-architecture spec に出現する関数名の保全
- code-fixer は CODE_FIXER_NO_REVIEW_RESULT を新設する :: build-fixer.ts:64-69 の BUILD_FIXER_NO_VERIFICATION_RESULT pattern と対称、前段 result 欠落時の halt 規律を継承するため
- code-fixer.completionVerdict は "approved" を明示的に記述する :: AgentStep.completionVerdict default 値（types.ts:73）への暗黙依存を断ち、将来 default 変更時の silent break を予防するため
- STANDARD_TRANSITIONS は分割せず単一配列のまま新 6 行を追加する :: Pipeline.runInternal の find() ロジックが配列全体を走査するため、構造変更は避け readability はコメント区切りで担保する
- iteration 計算ヘルパーの src/state/helpers.ts への抽出は本 request では行わない :: 3 行 × 2 箇所の重複は rule of three 未達、YAGNI 適用
- code-fixer の system prompt は build-fixer と同じく日本語で記述する :: fixer 系の regularity（同型 role の prompt は同一トーン）を保つため
