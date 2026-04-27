# Code Fixer Decisions — 2026-04-27-cli-core-pipeline

## H1: pipeline.ts race condition
`onBranchRegistered` コールバック内の fire-and-forget async state 更新を廃止し、コールバックは `registeredBranch` 変数更新のみ行い、history/state 永続化は SSE 完了後の main flow で同期的に行う :: race condition を排除する最小変更であり、main flow が sequential である保証が得られる

## H2: isProposeComplete の stop_reason 確認
ポーリング API が `stop_reason` を公開しない SDK の制約上、H2 の spec divergence は「ポーリング側は `idle` を主指標、`stop_reason` は SSE のみで確認」という運用を明示する方針で対処する :: SDK 0.91.0 の `BetaManagedAgentsSession.status` に stop_reason が存在しないため実装で完全対応は不可能。代わりに SessionResult に terminationReason を追加し、SSE 経路と polling fallback 経路を明示的に区別することで、ambiguity を排除する

## H3: SessionResult.terminationReason 追加
`SessionResult` に `terminationReason: 'end_turn' | 'terminated' | 'sse_error' | 'aborted' | 'unknown'` を追加し、pipeline.ts の fallback 判定をこれに基づく明示的な条件分岐に変更する :: `idleEndTurnDetected: false` でループを抜けた理由が不明な ambiguous な状態を排除する

## H4: must テスト追加
TC-035〜042（pipeline 振る舞い）、TC-057〜061（init）、TC-063〜068（run/ps）、TC-072（不明 cmd）、TC-070〜071（ハッシュ安定性）を優先して実装する :: review-findings で指摘された最も重要な correctness バグの検出に直結するテストから着手する

## M9: dead code ternary 修正
`status: sseResult.idleEndTurnDetected ? "ok" : "ok"` の三項演算子を削除し polling fallback 経由の場合は `"warning"` を出す :: polling fallback で完了した場合は情報として warning 記録が適切

## M11: loadJobState dead code 削除
`loadJobState` は現在コードベース内で未参照のため削除する :: dead code は保守負債であり、将来使う場合は改めて実装する

## M13: register-branch.ts のモジュールレベル state 削除
`currentBranch` / `getRegisteredBranch` / `resetRegisteredBranch` を削除し、handler は input を validate して戻り値で branch を返すだけにする :: SSE dispatcher が onBranchRegistered callback 経由で branch を受け取るため、module-level state は dead state
