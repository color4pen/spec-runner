# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### request.md との整合性

- 要件 1〜4・スコープ外・受け入れ基準すべてを design.md / tasks.md / spec.md と突き合わせた。
- 設計の各 Decision（D1〜D5）が要件にトレースできることを確認した。

### コードベース照合（主要箇所）

| 確認対象 | 確認結果 |
|---|---|
| `inactivity-watchdog.ts` の `bump/clear/fired/elapsedMs` API | 設計の記述と一致（l.14–71） |
| `formatInactivityTimeoutMessage` 出力フォーマット | 確認（l.80–82）。TC-013 が "inactivity"・step名・elapsedMs を assert |
| `emitToolProgress` 3 呼び出し箇所 | main loop l.658、postWork callback l.944、repair loop l.1021 を確認 |
| `extractCodexProgress` の返り値型 `{tool, target?} \| null` | l.227–255 で確認 |
| codex `item.started` / `item.completed` ハンドラ位置 | l.419–434 で確認 |
| STEP_TIMEOUT error 構築（claude-code） | l.1128–1131: `Object.assign(new Error(timeoutMessage), { code: "STEP_TIMEOUT" })` — hint なし |
| STEP_TIMEOUT error 構築（codex） | l.774–777: 同じパターン — hint なし |
| `ErrorInfo.hint: string` フィールド | `types.ts` l.104 で確認 |
| `makeTimeoutHalt` の hint 読み取り | `step-halt.ts` l.131: `(err as Error & { hint?: string }).hint ?? ""` — 設計の persistence path が有効 |
| event-journal への `ErrorInfo` 書き込み | `stepRunToRecord` で `outcome.error` が丸ごと出力されることを確認 |
| `BetaToolUseBlock.id: string` の存在 | SDK 型定義 `messages.d.ts` l.2154 で確認 |
| `SDKUserMessage` の `message: MessageParam` | `sdk.d.ts` l.3489 で確認（type: 'user'、message: MessageParam） |
| `ThreadItem` の `[key: string]: unknown` index signature | codex `agent-runner.ts` l.65–68 — `["id"]` アクセスは有効（要キャスト） |
| AC#5 対象 6 ファイルに hint assertion がないこと | `inactivity-watchdog.test.ts` TC-010〜013、`executor-sequential-regression.test.ts`、`commit-orchestrator.test.ts`、`executor-drift-detection.test.ts`、`no-op-detect-exemption.test.ts`、`agent-runner-transient-retry.test.ts` を参照、hint assertion がないことを確認 |

### spec.md シナリオ網羅性

- 4 つの Requirement に計 10 シナリオ（tracker 4 + claude 3 + codex 3 + persistence 1 + 不変 2）。
- request.md の受け入れ基準（claude 3 ケース・codex 3 ケース・既存テスト不変・typecheck+test green）に対応するシナリオが存在する。
- 各 Requirement に SHALL/MUST normative keyword があり、spec.md 記法規約を満たす。

### セキュリティ観点

- hint に格納される情報はすべて SDK stream 由来の内部情報（tool 名・コマンド文字列）。外部ユーザー入力が混入しない。
- codex の target は `extractCodexProgress` で最大 40 字に切り詰め済み。サイズ上限は設計で既定。
- events.jsonl への書き込みは既存の `ErrorInfo` 永続化パスを流用するだけであり、新たなインジェクション面が生まれない。
- 認証・認可の変更なし。OWASP Top 10 の該当観点（インジェクション/アクセス制御/ロギング）について問題なし。

### 設計の一貫性

- D1（hint 使用）と D2（shared factory）は独立ファイル方針により `inactivity-watchdog.ts` を一切変更しない。AC#5 の前提と整合する。
- D3 の `isToolResult` guard は `isToolUse` の defensive パターンを踏襲するよう明示されており、実装時の混線リスクは低い。
- D4 の hint 文言 3 パターンがそのまま spec.md・tasks.md にも反映されている。
- D5 の "unconditional hint attach" は壁掛け timeout と inactivity timeout の両方を包む設計で、ACs が inactivity のみを要求することと矛盾しない（上位集合）。

## 検証できなかった項目

- tasks.md T-06/T-07 の mock 生成器詳細（`AbortController.signal` race、`vi.useFakeTimers` 連携）は実際に動かさずに構造のみ確認した。実行検証は T-08（typecheck && test green）が担保する。
- `SDKUserMessage.message.content` に含まれる `tool_result` ブロックの `tool_use_id` フィールドが実際の SDK stream で常に存在するかはランタイム実測外（設計の Risks セクションが「tool_result は full user message で yielded」と断言しており、この主張は SDK 仕様として信頼する）。

## Findings 詳細

### F-01（low / fixable）: `isToolUse` の型ナローイングに `id` が含まれていない — 実装ガイダンスを補足すべき

`message-types.ts` の `isToolUse` 返り値型は `content_block: { type: "tool_use"; name: string; input?: ... }` に `id` を持たない。T-04 は「`cb.id` を使う」と記述するが、現行の型上では `cb.id` は直接到達できず実装時にキャスト拡張が必要になる。

SDK 型 `BetaToolUseBlock` は `id: string` を持つことを確認済みであり、技術的には `(cb as { ...; id?: string }).id` で取得できる。ただし tasks.md がこのキャスト拡張を明示していないため、実装者が `isToolUse` の返り値型自体を更新するか、キャスト追加で対応するかが曖昧になっている。

**推奨**: T-03 または T-04 に「`isToolUse` の narrowed return type に `id?: string` を追加する（または T-04 内でキャストして取得する）」を明示する。修正しなくても実装は可能だが、型安全性と可読性のため対処を推奨する。

### F-02（low / fixable）: tasks.md に T-03 → T-04 のタスク依存順序が未記載

T-03（`isToolResult` 追加）は T-04（claude-code runner への wire）の前提であり、T-03 が未完では T-04 が typecheck を通過しない。tasks.md の T-04 の冒頭に "前提: T-03 完了" の一行を追加すると実装ステップの順序が明確になる。軽微なガイダンス欠落であり実装は可能。

### 問題なし

- spec.md の Requirement / Scenario 構造は規約準拠。
- design.md の AC#5 test inventory（6 ファイル、全 UNCHANGED 判定）はコードと一致。
- `hint → ErrorInfo → events.jsonl` の persistence path は既存コードで完結している（設計の Open Questions "None" と整合）。
- セキュリティ面で新たなリスクは発見されなかった。
