# モデル実測評価台帳（provider 混成運用）

最終更新: 2026-06-13

pipeline の step 役割ごとに、どのモデルが実用に耐えるかの実測記録。評価は印象ではなく観測値（report 回収率 / gate 通過 / usage）で行う。

## 評価マトリクス

| モデル | 完了契約（report 回収） | レビュー品質 | 実装品質 | 備考 |
|---|---|---|---|---|
| gpt-5.5 | ✅ 12/12 turn（e2e 10 + #662 再レビュー 2） | ✅ judge verdict 妥当（#662 の再レビューも同一論点を一貫指摘 — 判断の再現性あり） | ✅ implementer 出力が verification 一発 green | main turn の outputSchema stall を確率的に観測（1 回）。timeoutMs 保険必須 |
| gpt-5.4 | ❌ 0/6 turn（2 job × main+follow-up2） | ✅ findings の質は高い（#662 の HIGH は request の実欠陥） | 未測定 | 現 adapter では judge 不可。#673（main turn への契約明示注入）後に再評価 |
| gpt-5.4-mini | ✅ 4/4 turn（#680）+ #676 code-fixer（/resume の人間判断 option を受けて report 回収 ✅） | — | ✅ fixer として機能（5.5 code-review を 2 round で収束 approved）。#676 で /resume 経由の人間判断（option 選択）を受けて resume-context の one-shot edge-case を正確修正 | producer 系 report は問題なし。fixer の input headline は大きい（3.7〜8.5M in）が cacheRead 95〜96% で fresh 消費は小さい（#676/#680 実測） |
| gpt-5.3-codex 系 | — | — | — | **確定: ChatGPT アカウント認証では SDK/exec 経由で利用不可**（Plus + 再ログイン後も 400、2026-06-13）。API key（従量）でのみ可能性。implementer 最適化として試す動機が出るまで棚上げ |
| claude-sonnet-4-6（対照） | ✅ | — | design 1 step 成功 | global config の byRequestType 経由で混入した対照データ |
| claude-opus-4-8 / sonnet（従来構成） | ✅（MCP tool 方式） | 基準 | 基準 | 2026-06-12 以前の全 run |

## 役割別の現行推奨（2026-06-12 時点）

| 役割 | モデル | 状態 |
|---|---|---|
| design / implementer | gpt-5.5 | 実証済み |
| judge 系（defaults） | gpt-5.5 | 5.4 は #673 取り込み後に再評価 |
| fixer / gen 系 | gpt-5.4-mini | 観測中 |

## 消費実測

- e2e job（10 step、ほぼ gpt-5.5、小粒 bug-fix）: input 4.95M / cache read 4.12M / output 47.8k — API 単価換算で $60 級が ChatGPT Plus 定額内で完走
- 無料枠は 1 job 途中（6 step 相当）で枯渇
- **Plus は 5 時間ローリング枠で ≈ 2 job + α / window**（2026-06-12 実測: e2e 残 4 step + 混成 job 1 本完走 + もう 1 本の code-fixer 手前で limit）。1 日あたり実効 4〜5 window ≈ 8〜10 job が理論上限。quota 停止は awaiting-resume で冬眠 → 枠回復後に素の /resume で続行できるため、運用上は失敗でなく待機。Pro（$200）が Claude Max と同価格帯という比較軸
- **cache は resume gap の長さに実質非依存で長寿命**（2026-06-13 実測 cacheRead: 27 分→96% / 119 分→85% / 511 分=8.5h overnight→96%。cold〈<30%〉に落ちた big step は観測ゼロ）。codex は thread を `~/.codex/sessions/` に永続し backend が thread 単位で context を保持するため、生 API の prefix-cache（数分 TTL）とは別物。quota 冬眠を跨いだ resume も warm のまま continue でき、cold-cache による fresh 再投入ペナルティは無い
- resume は完了済み step を飛ばすぶん、最初からの run より一貫して安い。冬眠時間の長短はコストに影響しない（上記 cache 寿命による）

## 計測プロトコル

run ごとに記録するもの:

1. step × 実効モデル（usage.json の `commandInvocations[].modelUsage` が真実 — config の想定と突合する）
2. report 回収: events.jsonl の step-attempt `toolResult`（null = 失敗）と `followUpAttempts`
3. verdict の妥当性: escalation が本物の人間ゲートか fail-closed かを区別する
4. stall / timeout の発生
5. usage（model 別 in/out/cache）

注意:
- `inputTokens` は cacheRead を内包する総プロンプト値。fresh 消費は `input − cacheRead` で読む（headline input だけ見ると過大評価になる）。
- `reasoning_output_tokens` は codex SDK から取得しているが ModelUsage に未マッピングで usage.json に現れない（出力計測の穴）。

## インシデント台帳

| 日付 | 事象 | 帰結 |
|---|---|---|
| 2026-06-12 | gpt-5.5 + outputSchema の確率的 stall（CLI 10 分無応答 / SDK turn 凍結） | timeoutMs 明示が必須と判明。恒久対処は #670 の fallback + main turn 注入（#673） |
| 2026-06-12 | gpt-5.4 judge が completion report 0/6 | fail-closed が正しく escalation。#673 起票。judge を 5.5 に切り戻し |
| 2026-06-12 | design だけ sonnet で実行 | global config の `byRequestType` が project defaults に優先（仕様通り）。可視化を #672 で対応 |
| 2026-06-12 | 回収失敗の診断が inbox 起動 job で消失 | stderr のみの出力が原因。#673 の要件 2 で構造化記録へ |
| 2026-06-12 | codex adapter が resumePrompt を未消費 — /resume の判断が agent に届かず同一 escalation × 3（#662） | #674 起票。応急処置として request-review を claude-sonnet-4-6 に一時退避 |
