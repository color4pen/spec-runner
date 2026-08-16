# agent step の完了契機を report 受領主・プロセス終了 fallback の二重系にする

## Meta

- **type**: spec-change
- **slug**: report-settles-step
- **base-branch**: main
- **adr**: true

## 背景

claude-code adapter の agent step 完了契機は「SDK message generator の終了 = agent session プロセスの exit」のみであり、`report_result` の受領は契機になっていない。agent が report で成功を宣言済みでも、session に background task(harness が tool timeout した foreground コマンドを自動降格したものを含む)が残ると session は exit できず、900 秒の inactivity watchdog が発火して **受領済みの成功 report を破棄し STEP_TIMEOUT で halt する**(issue #1003。実測では同一 job で 4 attempt 連続、うち少なくとも 1 attempt は `report_result {ok: true}` 受領済みの完了状態を破棄した)。

これは「agent が tool 呼び出しで自分の完了を能動的に宣言する」という report_result 導入時の設計、および「adapter は toolResult という事実を返し、executor が ok を解釈する」という ADR D3 の定義と逆転している。上流(Claude Code / Agent SDK)には background task が session を塞ぐ問題の確実な解決手段が無く(issue #1003 のコメント参照)、adapter 側で report 受領を契機に昇格させるのが唯一確実な防御である。

## 現状コードの前提

- `src/adapter/claude-code/agent-runner.ts:563-588` — report_result は MCP tool handler が閉包で `capturedToolResult` に格納する。コメントが「accessed after the query loop」と設計を明言
- `src/adapter/claude-code/agent-runner.ts:677-680` — main の `for await` loop に capturedToolResult 受領で抜ける条件は無い。loop 終了条件は generator の終了のみ
- `src/adapter/claude-code/agent-runner.ts:1136-1154` — watchdog abort の catch 経路は `completionReason: "timeout"`・**`toolResult: null`** を返し、閉包に生きている受領済み report を破棄する
- `src/adapter/claude-code/agent-runner.ts:904-921` — `extractedSessionId` / `modelUsage` / metrics は最終 success result(`SDKResultSuccess`)からのみ抽出。generator が閉じなければ一切取れない
- `src/adapter/claude-code/agent-runner.ts:931-951` — report retry follow-up は `resume: extractedSessionId` で別 query として走る。`:955-` の postWork prompts(rules follow-up)も同様
- `src/adapter/shared/inactivity-watchdog.ts:12` — inactivity 閾値は 900 秒(DEFAULT_INACTIVITY_TIMEOUT_MS)。event 毎に bump
- `src/adapter/codex/agent-runner.ts:15-16,164-184` — codex の report は finalResponse そのもの(thread.runStreamed の output schema + `tryExtractToolResult`)であり、「report 受領後に session が居残る」構造が存在しない
- session の実体は transcript(`~/.claude/projects/.../<session-id>.jsonl`)であり、プロセス kill で失われない。abort teardown は子プロセスを道連れにする(実測: hang した `bun test` のゾンビ残存ゼロ)

## 要件

1. **report 受領を step 完了の主契機にする** — main work turn 中に valid な report_result を受領したら、step の semantic result はその時点で確定する。ok:true / ok:false は問わない(受領 = agent work turn の完了。ok の解釈は従来どおり executor の責務であり変更しない)
2. **grace 付きの脱出** — report 受領後、短い grace(30〜60 秒の固定値)だけ generator の自然終了を待つ。grace 内に終了すれば従来どおり最終 result から modelUsage / metrics を回収する。終了しなければ abort し、受領済み toolResult で settle する(usage は欠損許容: 取れれば記録、取れなければ欠損)
3. **sessionId の早期確保** — `extractedSessionId` を最終 success result より前(session 初期化 message 等、generator が閉じる前に到着する SDK message)から確保する。grace 後 abort の経路でも postWork prompts(rules follow-up)が `resume: sessionId` で実行できること
4. **abort 経路で受領済み report を破棄しない** — watchdog / step timeout の catch 経路は、`capturedToolResult` が非 null なら timeout ではなく成功として返す。`toolResult: null` での上書きを廃す
5. **report 不在時の fallback は不変** — report が無いまま generator が終了した場合の report retry follow-up → error、および report が無いまま watchdog が発火した場合の STEP_TIMEOUT halt は、現行挙動を一切変えない
6. **codex adapter は対象外** — 構造上この欠陥が存在しないため変更しない

## スコープ外

- rules の配送方式(follow-up / prompt 注入)の変更 — issue #1004 の別 request
- `bun test` の repo レベル封鎖(bunfig.toml)
- `@anthropic-ai/claude-agent-sdk` の update
- inactivity watchdog の閾値・機構自体の変更
- executor 側の verdict 解釈・routing の変更
- codex adapter の変更

## 受け入れ基準

- [ ] report(ok:true)受領後に generator が閉じない場合、grace 経過後に abort して success で settle することをテストで固定する(受領済み toolResult が executor に渡る)
- [ ] report(ok:false)受領でも同様に settle し、従来どおり executor の判定へ渡ることをテストで固定する
- [ ] sessionId が最終 result より前に確保され、grace 後 abort の経路でも postWork prompts(rules follow-up)が resume で実行されることをテストで固定する
- [ ] report 受領後 grace 内に generator が自然終了した場合、従来どおり最終 result から modelUsage が回収されることをテストで固定する
- [ ] report 不在で generator が終了した場合の report retry → error 経路、および report 不在で watchdog が発火した場合の STEP_TIMEOUT halt が現行と同一であることをテストで固定する(既存テスト無改変で green)
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **grace は固定値、設定化しない** — 調整の需要が観測されてから開放する(YAGNI)。値は 60 秒を推奨(`bun run test` の実測 59 秒とは無関係 — report 後の待ちであり、コマンド実行時間とは競合しない)
- **即 abort でなく grace を挟む理由** — 正常系(generator が report 直後に閉じる大多数のケース)の usage 回収を保つ。即 abort は正常系のコスト実測を欠損させるため不採用
- **watchdog の bump を report 受領で代替しない** — report 受領は「完了」であり「活動」ではない。watchdog の意味論を汚さず、report 経路は独立した grace timer で扱う
- **completionReason に新値を増やさない** — report 受領済み abort は "success" として返す。executor から見た契約(success + toolResult)を変えないため、executor 側の変更が不要になる
