# Implementer Decisions — review-exit-contract

## 形式: 〜する :: 理由

- `specReviewResultNotFoundError` のシグネチャに `iteration: number` を必須引数として追加する :: hardcode suffix が divergence の直接原因であり、TypeScript 必須引数化によって呼び出し漏れを型エラーで捕捉できる
- `codeReviewResultNotFoundError` を新規追加する :: code-review 専用 error code `CODE_REVIEW_RESULT_NOT_FOUND` を `ERROR_CODES` に追加し、executor が spec-review と code-review で同じ generic error を再利用する現状の ambiguity を解消する
- `executor.ts` で `specReviewResultNotFoundError` の呼び出しを step 固有 error factory に切り替える :: executor は現在 `specReviewResultNotFoundError` を全 polling-style step に対して呼ぶため、code-review step には `codeReviewResultNotFoundError` を、spec-review step には `specReviewResultNotFoundError` を使うよう step 名で分岐する
- `code-review.ts` の `capabilities` を `{ gitWrite: true }` に変更し、コメントを「source code は read-only / review-feedback file requires gitWrite」に書き換える :: 旧コメント「read-only reviewer」は openspec-workflow の local execution 前提を Managed Agents 制約に誤移植した根本原因
- `spec-review.ts` の capabilities が `{ gitWrite: true }` であることを確認・追加する :: Managed Agents では agent 自身が push する必要があり、`gitWrite: true` が唯一の配送手段
- `spec-review-system.ts` の initial message に `buildGitPushInstruction(branch)` を embed する :: propose / fixer 系と同じ shape で push 指示を埋め込む。`SpecReviewPromptInput` に `branch` フィールドを追加して `buildSpecReviewInitialMessage` で注入する
- `buildCodeReviewInitialMessage` に `branch` 引数を追加して `buildGitPushInstruction(branch)` を user message 末尾に embed する :: code-review system prompt はすでに "MUST commit and push" を要求しているため、user message への push instruction 追加で capability 宣言と一致させる
- `implementer-system.ts` に日本語 workflow context を追記する :: 既存 IMPLEMENTER_SYSTEM_PROMPT が全文日本語であり、英語混在は LLM 遵守率を下げるリスクがある
- 既存 `specReviewResultNotFoundError` 呼び出し箇所を step 名で分岐させる :: executor.ts は step 名を知っているため、step.name === "code-review" のとき `codeReviewResultNotFoundError` を使う。それ以外は `specReviewResultNotFoundError` を使う
- ADR を `openspec-workflow/adr/` に生成する :: 将来 "read-only reviewer" コメントが再コピーされないよう逸脱の根拠と検討済み代替案を記録する
- TC-021 (dogfooding E2E) は implementation-notes.md の Blocked Tasks に手動検証手順として記録する :: 実際の Anthropic API セッション起動が必要で CI 環境では自動化不可
