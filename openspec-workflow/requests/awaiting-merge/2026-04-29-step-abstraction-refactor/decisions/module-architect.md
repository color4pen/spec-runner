# Decisions — module-architect (Step 2.5)

形式: 「〜する :: 理由」（current tense / ahead-of-time）。session 喪失時の再構築用。

- 機械的 6 軸（testability / readability / cohesion / coupling / reusability / SRP）のみで評価する :: extensibility / deployment / security / domain は author-bias 維持と spec-review の責務境界保持のため scope outside
- 提案 9 モジュールに対して個別スコアを付ける :: implementer が「どこが懸念で、どこが安全か」を一目で参照できるようにする
- `core/step/` の cohesion を最低 6（懸念あり）とする :: 6 ファイル以上集まる懸念があり、サブディレクトリ化の判断を implementer に委ねる
- `core/pipeline/`, `core/event/`, `core/port/`, `core/agent/` は高スコア（8-10）を付ける :: 単一責務性が高く、依存も極小で機械的に健全
- `adapter/anthropic/` の testability を 7 にとどめる :: SDK mock の重さは構造上不可避、port interface 経由の core 側 test で迂回するのが正解
- module 間 import direction を 9x6 マトリクスに整理する :: spec module-boundary の散文 declaration を機械的に検証可能な形に正規化、CI gate 設計の参考に
- 共通化候補（C1-C8）を 6 軸ラベル付きで列挙する :: implementer が StepExecutor 設計時に「どこが集約対象、どこが共通化しない」を判断できるよう根拠を残す
- `core/loop.ts:runLoopUntil` を廃止候補とする :: Pipeline class が transition table 駆動になるため、loop の独立性が失われる。history append + stdout 出力の責務は Pipeline 内に移植
- `core/session-runner.ts` を削除候補とする :: StepExecutor が同責務を吸収するため二重実装になる。spec-fixer のみ使用している現状から、StepExecutor 統合後は不要
- propose の SSE 機構を `adapter/anthropic/sse-stream.ts` への移動を推奨する :: core 層からの SDK 直 import 排除（spec module-boundary 要件）と整合させるため
- `register_branch` handler の dispatch 経路を `SessionClient.streamEvents(sessionId, { onCustomToolUse })` callback とする :: handler 本体は step 所有、dispatch は adapter 所有という責務分離を明確にする
- `core/types.ts:PipelineDeps.client: Anthropic` の除去を推奨する :: SDK 型が core 全層に漏洩する現状の根本要因。composition root から `SessionClient` port のみ注入する形へ
- `state/helpers.ts:getLatestStepResult / pushStepResult` を `store/job-state-store.ts` 内 private に吸収する案を提示する :: 外部 call site から `JobStateStore` method のみアクセス可能になり、persistence authority 要件と整合
- `state/schema.ts:normalizeSteps` の既存実装を `JobStateStore.load` から再利用するよう推奨する :: 重複実装の発生を防ぐ。Legacy A (object→array) は既に正規化ロジックがある
- L1〜L8 の責務漏れ・越境懸念を independent table で列挙する :: implementer が PR commit ごとに verify するチェックリストとして使えるようにする
- module-analysis.md は implementer の参考情報であり判断を拘束しない旨を明示する :: pipeline-context.md の宣言と整合、author-bias 維持
- decision log を current tense + ahead-of-time で記述する :: session 喪失時に「自分はこうする予定だった」を即座に再構築できる、過去形だと「もう実行した」と誤認するリスク
