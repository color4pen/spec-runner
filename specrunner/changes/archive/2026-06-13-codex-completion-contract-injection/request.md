# codex adapter: main turn に完了報告の明示指示を注入し、回収失敗の診断を構造化記録に残す

## Meta

- **type**: spec-change
- **slug**: codex-completion-contract-injection
- **base-branch**: main
- **adr**: false

## 背景

混成モデル実測（2026-06-12、issue #662 / #672 の run）で、gpt-5.4 を judge に置いた 2 job が request-review の completion report 回収に **6/6 turn 失敗**し（main + follow-up 2 × 2 job）、fail-closed escalation で停止した。gpt-5.5 は同一機構で 10/10 step 成功しており、モデル依存の差が大きい。

構造要因が 2 つある:

1. **main turn には完了報告の指示が存在しない**。共有 prompt は provider 中立化（#661）により「完了結果を報告してください」と意図のみを述べ、手段（JSON で返す）の指示は adapter の責務とされたが、codex adapter は outputSchema 注入のみで手段を伝えており、outputSchema が機能しない環境・従わないモデルでは「JSON を返せ」という指示がどの turn にも無い（follow-up retry の文言にのみ存在する）。
2. **回収失敗の診断（failureReason + finalResponse 断片、#670 で追加）が stderr 出力のため、inbox（crontab）起動の job では一切残らない**。今回の 6 連続失敗も「なぜ失敗したか」の断片が取得できず、モデル別の失敗様態を分析できなかった。

## 現状コードの前提

- `src/adapter/codex/agent-runner.ts:283-287` — main turn の fullPrompt は `step.buildMessage` + `buildAdditionalInstructions(ctx)` のみ。`src/adapter/shared/prompt-builder.ts` に完了報告・JSON への言及は無い（grep 確認済み）
- `src/adapter/codex/agent-runner.ts:505-513` — main turn の回収失敗時、診断は `stderrWrite` のみ
- `src/adapter/codex/agent-runner.ts:520-543` — follow-up retry のプロンプトにのみ「スキーマに一致する JSON オブジェクトのみを返してください」が存在する
- `ctx.session.logPath` 指定時は SessionLogWriter（JSONL）が利用可能（#659）。events.jsonl への step-attempt 記録は executor 側に存在する
- 完了契約の「手段の指示は adapter の責務」という設計は #661（prompts-completion-contract-neutral）で確立済み

## 要件

1. reportTool が設定された step の main turn プロンプトに、完了報告の手段（スキーマに従う JSON を最終応答として返す）を明示する指示を adapter が注入する。文言は follow-up retry と整合させ、単一ソース化する
2. 回収失敗の診断（failureReason + rawFragment）を stderr に加えて構造化記録（SessionLogWriter の JSONL、または events 経由で step-attempt outcome）に残し、inbox 起動の job でも事後分析できるようにする
3. outputSchema 注入は維持する（対応モデルの正常経路を変えない）。gpt-5.5 で実証済みの既存挙動を退行させない

## スコープ外

- claude-code adapter（MCP tool 方式で main turn から契約が伝わっており本問題は存在しない）
- 共有 prompt（src/prompts/）の変更 — 手段の指示を共有層に戻さない（#661 の設計を維持）
- モデル別の文言出し分け

## 受け入れ基準

- [ ] reportTool 設定時の main turn プロンプトに完了報告指示が含まれることをテストで固定する（未設定 step には含まれないこと）
- [ ] 回収失敗時に failureReason + rawFragment が構造化記録に残ることをテストで固定する
- [ ] 既存の回収経路（素 JSON / フェンス付き / 括弧抽出、follow-up retry、fail-closed）が無退行であることを確認する
- [ ] `typecheck && test` が green

## 関連

- 実測: 2026-06-12 の混成モデル run（gpt-5.4 judge が 6/6 回収失敗、診断は inbox 起動のため消失）
- #670（回収の 3 段階 fallback — 本 request はその前段の「指示」と後段の「診断」を埋める）
- #661（手段の指示は adapter の責務、という設計の出典）
