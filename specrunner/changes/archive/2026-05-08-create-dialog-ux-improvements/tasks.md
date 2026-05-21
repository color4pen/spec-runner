# Tasks: create-dialog-ux-improvements

## 1. スピナーモジュール作成

- [x] 1.1 `src/cli/spinner.ts` を新規作成する。`createSpinner()` ファクトリ関数を export する。戻り値は `{ start(): void; stop(): void }` の 2 メソッドオブジェクト
- [x] 1.2 スピナーのアニメーションフレーム配列と interval（目安 80ms）を定義する。フレームパターンは braille dots（`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`）等、実装者が決定
- [x] 1.3 `start()`: `process.stderr.isTTY === false` の場合は即 return（no-op）。既に動作中（timer !== null）の場合も即 return。`setInterval` で stderr にフレームを `\r` + フレーム文字で出力
- [x] 1.4 `stop()`: timer が null なら即 return。`clearInterval` で停止し、`process.stderr.write("\r\x1b[K")` でスピナー行をクリア

## 2. ストリーミング制御の関数抽出

- [x] 2.1 `src/core/command/create-dialog.ts` に `consumeStream()` 関数を追加する。シグネチャ:

```typescript
interface StreamConsumerResult {
  textBuffer: string;
  hasAssistantMessage: boolean;
  sessionId: string | undefined;
}

async function consumeStream(
  messages: AsyncGenerator<unknown>,
  spinner: { start(): void; stop(): void },
  onAssistantComplete: (textBuffer: string) => Promise<void>,
): Promise<StreamConsumerResult>
```

- [x] 2.2 `consumeStream` の実装: `for await (const msg of messages)` ループで以下を処理:
  - `isTextDelta(msg)`: `spinner.stop()` → `process.stdout.write(text)` → textBuffer に蓄積
  - `isToolUseSummary(msg)`: `spinner.stop()` → `process.stderr.write(\`\n[tool] ${msg.summary}\n\`)`
  - assistant メッセージ（`type === "assistant"`、初回のみ）: `spinner.stop()` → `process.stdout.write("\n")` → `onAssistantComplete(textBuffer)` を await
  - `isResultMessage(msg)`: sessionId を取得して break
- [x] 2.3 `processAssistantTurn` を書き換える: ストリーミング I/O 処理を削除し、`consumeStream()` を呼び出す。`onAssistantComplete` コールバック内で slug 検出 / FINAL_DRAFT 検出 / ユーザー確認を実行する
- [x] 2.4 `processAssistantTurn` または `consumeStream` 内で、スピナー cleanup を保証する: `try { ... } finally { spinner.stop() }` で例外パスでも interval を確実に解除

## 3. スピナーの呼び出し統合

- [x] 3.1 `processAssistantTurn` の冒頭で `createSpinner()` を呼んでスピナーインスタンスを生成する
- [x] 3.2 `consumeStream()` 呼び出し前に `spinner.start()` を呼ぶ（query() 直後、最初のメッセージ到着前にスピナー開始）
- [x] 3.3 `createSpinner` を `src/cli/spinner.ts` から import する

## 4. FINAL_DRAFT 出力の簡素化

- [x] 4.1 `processAssistantTurn` の `onAssistantComplete` コールバック内で FINAL_DRAFT 検出時に draft ファイルパスを表示する: `process.stderr.write(\`\nrequest.md を作成しました: specrunner/requests/draft/${slug}/request.md\n\`)`. slug が未確定の場合はパス表示をスキップする
- [x] 4.2 確認メッセージ `"この内容で request.md を書き出しますか？ [y/N] "` は変更しない（既存動作維持）

## 5. テスト

- [x] 5.1 `tests/unit/cli/spinner.test.ts` を新規作成する:
  - `createSpinner()` が `{ start, stop }` を返すこと
  - `start()` 呼び出し後に `stop()` で interval がクリアされること
  - `process.stderr.isTTY === false` の場合、`start()` が no-op（setInterval が呼ばれない）であること
  - `stop()` を 2 回呼んでもエラーにならないこと
  - `start()` を 2 回呼んでも interval が 1 つだけであること
- [x] 5.2 `tests/unit/core/command/create-dialog.test.ts` にストリーミング制御抽出後のテストを追加:
  - text_delta が stdout に出力されること（既存テスト TC-CD-010 の維持）
  - tool_use_summary が stderr に出力されること
  - FINAL_DRAFT 検出時に draft パスが stderr に出力されること

## 6. 検証

- [x] 6.1 `bun run typecheck` が green
- [x] 6.2 `bun run test` が green
