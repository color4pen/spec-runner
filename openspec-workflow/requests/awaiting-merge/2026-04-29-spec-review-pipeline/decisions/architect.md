# Architect Decisions — 2026-04-29-spec-review-pipeline

`〜する :: 理由` 形式（current-tense, ex-ante）。Step 3 spec-review iteration 1 の architect 判断記録。

## 設計評価方針

- module-analysis.md の 4 つの推奨を「合意」「保留」「反論」に三分する :: 機械的構造分析と feasibility 観点を分けて評価し、Author-Bias を避けるため
- pollUntilComplete 再利用推奨に合意し HIGH finding として上げる :: tasks.md 4.4 が新規ポーリング実装を読めるため、再利用を仕様レベルで明示しないと implementer が二重実装する可能性が高い
- runProposePipeline ラッパー削除推奨を採用するが design.md の両論併記は MEDIUM finding として残す :: 設計文書の両論併記は実装者の判断分岐を生むので、結論を仕様で固定する
- state.session / state.step を派生フィールドとして明示する推奨を採用 :: 2 つの真実源は中長期で必ず同期不整合を起こすため、Phase 1 で経路を 1 つに閉じる必要がある

## 仕様の代替案検討

- spec-review session 数の決定（1 セッション vs 2 セッション分離）を Phase 2 として保留する :: Phase 1 では single agent で十分機能し、enable/disable の組み合わせ爆発を避けるため
- verdict ファイルパスの相対化（`spec-review-result.md` のみ vs full path）は full path で固定する :: GitHub API 呼び出しの参照解決を CLI 側でする必要があり、相対化は逆にコードを複雑化する
- runPipeline の step 配列を register 機構にするかは Phase 2 判断とする :: n=1 で抽象化すると implementer / code-review の差分が見えていない状態で interface を切ることになる

## 過剰設計の検出

- design.md Decision 5 の「Phase 2 で並列化する際に分離すれば良い」は注記レベルで OK :: 現在の判断 (single file) は適切で、分離判断の trigger 条件 (例: 2 役割でレビューが衝突した時) は次 request スコープ
- tasks.md 4.4 が pollUntilComplete を参照していない点は HIGH レベルの実装指示の漏れ :: 「再利用する」という設計判断が tasks 段階に伝わっていないと実装で二重化する

## Devil's Advocate 観点

- 「Custom Tool なし」の判断は本当に security boundary に合致するか :: spec-review エージェントが change folder を改変できないことを保証する仕組みが仕様にない（修正提案を含めない指示は prompt only）。Phase 1 では agent の挙動規約に依存するが、これは仕様レベルでは弱い保証
- verdict 行 first-write-wins は仕様として正しいか :: agent が verdict 行を複数書いた場合（例: 議論セクション内に approved を書き、結論で needs-fix を書く）、議論セクション側を採用してしまう。コードブロック除外などの prompt 規約強化が必要
