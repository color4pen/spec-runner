# timeoutMs の実施と StepRun の実行時間記録を修正する

## Meta

- **type**: bug-fix
- **slug**: timeout-enforcement
- **base-branch**: main
- **date**: 2026-05-15
- **author**: color4pen

## 背景

ADR-0013 で wall-clock timeout は意図的に無効化された。理由は implementer/build-fixer 等の長時間ステップで false positive が多発したため。各 adapter には AbortController / timeoutMs パラメータの配線が既に存在するが、ADR-0013 の方針により config の timeoutMs は実質的に null 固定で運用されている。

現在の問題:
- config で timeoutMs を設定しても ADR-0013 の方針で無効化されているため、ユーザーが timeout を制御できない
- `state/helpers.ts` の `pushStepResult()` で `startedAt` と `endedAt` が同じタイムスタンプで記録されるバグがあり、実行時間データが取れない
- 異常時の手段が Ctrl+C のみ（cancel コマンドは別 issue #61）

方針: ADR-0013 を supersede し、デフォルトは null（無制限）のまま、ユーザーが config で timeoutMs を設定した場合に各 adapter が自身の SDK に合った方法で timeout を実施する。既存の 4-level fallback（step 別 → defaults → step 定義 → SDK デフォルト null）はそのまま活用する。

## 要件

### StepRun の実行時間記録修正

1. StepRun の `startedAt` を step 実行開始時に、`endedAt` を step 完了時に記録する。現在は `executor.ts` で completedAt が `runner.run()` の前に取得され、`helpers.ts` の `pushStepResult()` で両方に同じタイムスタンプが使われているバグがある。修正は executor.ts（開始時刻の取得位置）と helpers.ts（startedAt の受け渡し）の両方に及ぶ
2. state schema（StepRun）の型定義は変更しない（startedAt / endedAt は既に string フィールドとして存在する）

### timeoutMs の実施

3. 各 adapter が自身の SDK に合った方法で timeout を実施する。timeout の所有者は adapter（StepExecutor ではない）。StepExecutor の責務は「結果の解釈」であり、timeout の「実施」は adapter の責務とする
4. Claude Code adapter: config の timeoutMs を AbortController + setTimeout に反映し、signal を `query()` の options に渡す（既に配線が存在する）
5. Codex adapter: config の timeoutMs を AbortController + setTimeout に反映し、signal を `thread.run()` の `turnOptions.signal` に渡す（既に配線が存在する）
6. Managed Agent adapter: config の timeoutMs を `pollUntilComplete()` の timeoutMs パラメータに渡す（AbortSignal ではなく timeoutMs パラメータを使う。pollUntilComplete は abortSignal で return するが throw しないため、executor の completionReason: "timeout" 判定と整合しない。timeoutMs パラメータ経由なら既存の PollTimeoutError が throw され、executor のエラーハンドリングに乗る）
7. タイムアウト発生時は既存の executor のハンドリング（`completionReason === "timeout"` → awaiting-resume に遷移）に従う。job は再開可能な状態で保存される
8. デフォルトは null（無制限）。ユーザーが config で明示的に設定した場合のみ有効になる

### ADR-0013 の更新

9. ADR-0013 の status を Superseded に変更し、新 ADR で「timeoutMs をデフォルト null（無制限）で再有効化した」旨を記録する。「silently ignore」と「設定可能」が同一 ADR 内に矛盾して共存しないようにする

## スコープ外

- timeoutMs のデフォルト値の変更（null のまま）
- cancel コマンドの実装（#61 で別途対応）
- ps コマンドへの経過時間表示の追加（別 issue）
- step ごとの推奨 timeout 値の策定（実行時間データが蓄積されてから判断）
- Managed Agent の DEFAULT_POLL_TIMEOUT_MS（15分）の変更（poll timeout は session timeout とは別概念。SSE 切断後の polling fallback の上限であり、step の実行時間制限ではない）
- AbortController の共有ヘルパー抽出（Claude Code と Codex の重複パターンを `src/adapter/shared/` に集約する改善は有用だが、本 request のスコープ外）

## 受け入れ基準

- [ ] StepRun の startedAt が step 実行開始時、endedAt が step 完了時のタイムスタンプを記録する
- [ ] config に `steps.implementer.timeoutMs: 600000` を設定した場合、implementer が 10 分を超えるとタイムアウトする
- [ ] config に timeoutMs を設定しない場合（デフォルト null）、従来通り無制限で実行される
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

- ADR-0013 の「silently ignore」判断を supersede し、「デフォルト null で設定可能」に変更する。false positive の問題は「デフォルト無制限」で解決し、ユーザーが自環境に合わせて設定する運用にする
- timeout の所有者は adapter（StepExecutor ではない）。3 つの SDK の timeout メカニズムが異なる（AbortController / signal / timeoutMs パラメータ）ため、統一インターフェースに無理がある。StepExecutor の責務は「結果の解釈」であり、timeout の「実施」は adapter が担う（モジュールアーキテクト分析済み: 6軸中5軸で adapter 維持が優位）
- タイムアウト時は awaiting-resume に遷移し、job を再開可能な状態で保存する（既存の executor のハンドリングに準拠）
- startedAt/endedAt のバグ修正は timeout とは独立した修正だが、timeout の効果検証にも実行時間データが必要なため同一 request に含める
- Managed Agent の DEFAULT_POLL_TIMEOUT_MS（15分）は poll timeout（SSE 切断後の polling fallback 上限）であり、step の実行時間を制限する session timeout とは別概念。本 request では変更しない
