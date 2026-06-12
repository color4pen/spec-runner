# codex adapter の completion report 回収を頑健化する（outputSchema 不全環境での fallback と観測性）

## Meta

- **type**: bug-fix
- **slug**: codex-completion-report-fallback
- **base-branch**: main
- **adr**: false

## 背景

codex runtime での end-to-end 実証（job c812a533、2026-06-12）で、request-review の本処理は正常完了した（106 秒、result ファイル出力、文面は approve）にもかかわらず、completion report が main turn + follow-up retry 2 回のすべてで回収できず（`toolResult: null`）、fail-closed により escalation で停止した。

同日の実測で判明している環境事実:

- ChatGPT アカウント認証では `gpt-5.x-codex` 系モデルはすべて 400（`The '<model>' model is not supported when using Codex with a ChatGPT account.`）。本流 `gpt-5.5` のみ使用可
- `gpt-5.5` は通常プロンプトに数秒で応答するが、codex CLI に `--output-schema` を付けると同じプロンプトが 10 分以上無応答（ハング）になる
- SDK 経由（pipeline 内）では turn 自体は完了するが、finalResponse から completion report が parse できない

つまり「ChatGPT アカウント + 本流モデル」という移行で実際に使う組合せで、structured output（outputSchema）への依存が機能しない。回収失敗時に finalResponse の内容が一切記録されないため、「schema が無視されて通常テキストが返った」のか「JSON がコードフェンス等で包まれて生 parse に失敗した」のかを確定できなかった（観測性の欠落）。

## 現状コードの前提

- `src/adapter/codex/agent-runner.ts:15-18` — 設計コメント: reportTool は outputSchema として注入し、finalResponse を JSON parse して parseInput で検証する方針
- `src/adapter/codex/agent-runner.ts:136-140` — `buildOutputSchema`: zodSchema → OpenAI strict 互換 JSON Schema
- `src/adapter/codex/agent-runner.ts:144-150` — `tryParseToolResult`: finalResponse を**生の `JSON.parse`** にかける。コードフェンス（```json ... ```）や前置きテキスト付きの JSON は無条件に失敗する
- `src/adapter/codex/agent-runner.ts:464-468` — follow-up retry turn にも同じ `outputSchema` を注入しており、main turn と同じ失敗モードを繰り返す
- `src/adapter/codex/agent-runner.ts:479-486` — postWorkPrompts turn は outputSchema なし（既存の非注入経路が存在する）
- parse 失敗時、finalResponse の内容・失敗理由はログにも events にも記録されない

## 要件

1. finalResponse からの completion report 回収を頑健化する: コードフェンス付き・前後にテキストが付随する JSON からの抽出を許容する（抽出方式は design で決定。検証は従来通り `parseInput` で行い、検証契約は緩めない）
2. outputSchema 注入の失敗モードに対処する: 注入を維持した上で fallback するか、capture 失敗後の follow-up turn では schema を外して prompt 指示のみで JSON を要求するか等を、上記の実測事実を判断材料に design で決定する
3. 回収失敗時の観測性を追加する: parse 失敗の理由と finalResponse の断片を verbose log / events に記録する（出力長の上限と機密マスキングを考慮）
4. すべての turn で回収不能だった場合の挙動は従来通り fail-closed（toolResult null → escalation 系 verdict）を維持する

## スコープ外

- claude-code adapter の completion report 経路（MCP tool 方式、本件と独立）
- ChatGPT アカウントで使用不可なモデルの registry / pricing 上の扱い
- prompt 本文（共有 prompt 表層）の変更 — 完了契約は provider 中立化済みであり、手段の指示は adapter の責務

## 受け入れ基準

- [ ] コードフェンス付き JSON・前置きテキスト付き JSON の finalResponse から toolResult が回収され、verdict が導出されることをテストで固定する
- [ ] 不正な（抽出不能な）finalResponse が全 turn で続いた場合に fail-closed になることをテストで固定する（退行なし）
- [ ] 回収失敗時に診断情報（理由 + finalResponse 断片）が記録されることをテストで固定する
- [ ] 素の JSON finalResponse（既存の正常経路）が退行しないことをテストで固定する
- [ ] `typecheck && test` が green

## 関連

- 実証: job c812a533（archive-branch-delete-idempotent、awaiting-resume で保全中 — 本修正の取り込み後に resume して end-to-end 実証を再開する）
- #659（codex adapter parity。本件はその実地検証で発見された最初の実環境ギャップ）
