# STEP_TIMEOUT の halt 記録に最後の tool 実行情報を残す

## Meta

- **type**: spec-change
- **slug**: step-timeout-last-progress
- **base-branch**: main
- **adr**: false

## 背景

inactivity watchdog が STEP_TIMEOUT で step を落としたとき、halt 記録には「no agent event for NNNms」しか残らない。kill された agent session は usage.json にも記録されず transcript も残らないため、無音の 15 分に何が起きていたか(終了しないコマンドの実行中だったのか、tool は完了済みで生成中の API stall だったのか)を事後診断する材料がゼロになる。実際に code-fixer / implementer で計 3 回の STEP_TIMEOUT が発生し、原因特定には operator が生きているプロセスツリーを OS レベルで覗く必要があった(実測で `bun test` の hang と判明)。

一方、「いま何を実行中か」は両 runtime で既に正規化済みの domain event として流れている: claude-code adapter は tool_use content block(tool 名 + input)から、codex adapter は `item.started` ThreadItem(command 文字列)から、いずれも `step:progress {step, tool, target}` を emit する。現在の消費者は terminal 表示のみで、watchdog にも halt 記録にも渡っていない。この既存 event を timeout の halt 記録に接続する。

## 現状コードの前提

- `src/adapter/shared/inactivity-watchdog.ts` — bump/clear/fired を持つ共有 watchdog。timeout メッセージは「Step '<name>' inactivity timeout: no agent event for NNNms」固定
- `src/adapter/claude-code/agent-runner.ts:342-358` — `emitToolProgress`: tool_use content block から `step:progress {step, tool, target}` を emit(target は `extractTarget(tool, input)`)
- `src/adapter/codex/agent-runner.ts:224-232,423` — `extractCodexProgress`: `item.started` から `{tool: "Bash", target: <command 先頭40字>}` を導出して `step:progress` を emit
- `src/cli/progress.ts:102` — `step:progress` の唯一の消費者(terminal 表示)
- events.jsonl の step-attempt 記録は `error: {code: "STEP_TIMEOUT", message, hint}` を持ち、現状 hint は null

## 要件

1. **最終 tool 観測の保持** — 各 agent runner(claude-code / codex)は、session 中に最後に観測した tool 開始情報(tool 名・target・観測時刻)と、その後に対応する完了(claude: tool_result の到着、codex: 当該 item の completed)を観測したかを保持する。
2. **timeout 記録への反映** — inactivity timeout 発火時のエラーメッセージまたは hint に次を含める:
   - 最後に開始された tool と target、開始からの経過時間
   - その tool が完了済みか実行中(in-flight)かの区別
   - tool を一度も観測していない session では「no tool observed」を明示する(API stall との切り分け)
3. **記録の到達先** — この情報が events.jsonl の step-attempt error 記録(message または hint)から読み取れること。halt 後に log を開いた operator が、プロセスを覗かずに原因クラス(コマンド hang / API stall)を判別できる状態をゴールとする。
4. **既存挙動の不変** — watchdog の閾値・bump 契約・halt 遷移(awaiting-resume への退避)・`step:progress` の terminal 表示は変更しない。

## スコープ外

- watchdog 閾値の変更・tool 実行中の timeout 免除等のポリシー変更(観測の追加のみ)
- kill 時のプロセスツリー snapshot 等 OS レベルの観測
- agent stream 全体の永続化
- codex の target 40 字切詰めの仕様変更(現行の粒度で足りる)

## 受け入れ基準

- [ ] claude-code runner: tool_use 観測後に timeout した場合、エラー記録に tool 名・target・経過が含まれることをテストで固定する
- [ ] codex runner: `item.started` 観測後に timeout した場合、同様の情報が含まれることをテストで固定する
- [ ] tool 完了(tool_result / item.completed)後の無音で timeout した場合、in-flight でない旨が読み取れることをテストで固定する
- [ ] tool を一度も観測せず timeout した場合、「no tool observed」相当が含まれることをテストで固定する
- [ ] 既存の watchdog テスト(閾値・bump・halt 遷移)の更新対象を design で全列挙し根拠を明示する。列挙外は無変更で green
- [ ] `typecheck && test` が green
