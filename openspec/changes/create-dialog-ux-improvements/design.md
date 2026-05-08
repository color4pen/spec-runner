# Design: create-dialog-ux-improvements

## Context

R2（interactive-create-dialog）+ R3（create-polish-and-resume）で確立した構造:

- `processAssistantTurn()` — `for await (const msg of messages)` ループで SDK メッセージを消費。text_delta を `process.stdout.write()`、tool_use_summary を `process.stderr.write()` で出力。slug 検出 / FINAL_DRAFT 検出 / ユーザー確認も同じループ内で処理
- `detectCompletion()` — assistant メッセージ受信後に textBuffer 全体を走査して `<!-- FINAL_DRAFT -->` マーカーを検出
- `finalize()` — request.md を active/ に書き出し + validate + draft 削除

問題:
1. `query()` → 最初の text_delta までの間、ターミナルが無反応
2. FINAL_DRAFT 検出時に request.md 全文が stdout に表示されるが冗長
3. `processAssistantTurn` にストリーミング I/O と制御フローが混在

## Goals

- LLM 応答待ち中にスピナーで視覚的フィードバックを提供する
- FINAL_DRAFT 検出後の UX を簡素化する（全文表示は許容、パスで案内）
- ストリーミング表示制御を独立関数に抽出し `processAssistantTurn` の責務を明確化する

## Non-Goals

- ストリーミング表示のマークダウンレンダリング
- ツール実行の進捗バー
- FINAL_DRAFT 後の出力済みテキストの ANSI クリア（一瞬表示されて消える UX は避ける）
- `ora` 等の外部スピナーライブラリの導入

## Decisions

### D1: スピナーの自前実装（`src/cli/spinner.ts`）

**問題**: LLM 応答待ち中にユーザーがフリーズと誤認する。スピナーライブラリ（`ora` 等）は 10+ の transitive dependencies。

**方針**: ANSI エスケープで簡易スピナーを自前実装する。独立モジュール `src/cli/spinner.ts` に配置。

```typescript
// src/cli/spinner.ts
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function createSpinner(): { start(): void; stop(): void } {
  let timer: ReturnType<typeof setInterval> | null = null;
  let frameIndex = 0;

  return {
    start() {
      if (timer !== null) return; // already running
      if (!process.stderr.isTTY) return; // non-TTY guard
      frameIndex = 0;
      timer = setInterval(() => {
        process.stderr.write(`\r${FRAMES[frameIndex++ % FRAMES.length]}`);
      }, 80);
    },
    stop() {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
      process.stderr.write("\r\x1b[K"); // clear spinner line
    },
  };
}
```

**理由**: CLI スピナー程度なら `setInterval` + `\r\x1b[K` で十分。依存ゼロ。`process.stderr.isTTY === false` の場合は `start()` が no-op になるため、パイプ環境でゴミ文字が出ない。

### D2: スピナーのライフサイクル（start / stop タイミング）

**問題**: スピナーの開始・停止タイミングを明確にする必要がある。ツール連続実行時のチャタリングも防止したい。

**方針**:

| イベント | アクション |
|---------|-----------|
| `query()` 呼び出し直後 | `spinner.start()` |
| 最初の text_delta 受信 | `spinner.stop()` |
| tool_use_summary 受信 | `spinner.stop()` → `[tool] <summary>` 表示 |
| tool 後の text_delta 受信 | スピナー再開**しない** |
| assistant メッセージ完了 | `spinner.stop()`（念のため） |

ツール連続実行時（tool_use_summary → tool_use_summary）はスピナーが停止したままになる。次の text_delta でもスピナーは再開しない。これにより、ツール実行中の `[tool]` 表示がスピナーに上書きされるチャタリングを防止する。

スピナーは query() 呼び出しの **前** に 1 回だけ start() する。text_delta/tool_use_summary で stop() 後は再開しない。次のターン（次の query() 呼び出し）で再び start() する。

**理由**: 1 ターン 1 スピナーのシンプルなモデル。中間状態の遷移管理が不要。

### D3: FINAL_DRAFT 出力の簡素化

**問題**: LLM が `<!-- FINAL_DRAFT -->` の後に request.md 全文を出力するが、対話中に draft は随時更新されている。全文がストリーミング出力されるのは冗長。

**方針**: 
- FINAL_DRAFT 検出のロジック（`detectCompletion()` で textBuffer 全体を走査）は変更しない
- ストリーミング中の全文出力（text_delta → stdout）もそのまま残す（ANSI クリアしない）
- FINAL_DRAFT 検出時の確認メッセージに draft ファイルパスを追加表示する:

```
request.md を作成しました: specrunner/requests/draft/<slug>/request.md

この内容で request.md を書き出しますか？ [y/N]
```

**理由**: text_delta のリアルタイムスキャンで FINAL_DRAFT マーカーを検出し、以降の出力を抑制する方式は delta 境界問題が複雑。全文が一度表示されることを許容し、確認メッセージで draft パスを案内する方がシンプル。ANSI クリア（`\x1b[K` 連発で全文を消す）は一瞬表示されて消える不自然な UX になるため採用しない。

### D4: ストリーミング制御の関数抽出

**問題**: `processAssistantTurn` がストリーミング I/O（スピナー制御、text_delta の stdout 出力、tool_use_summary の stderr 出力）と制御フロー（slug 検出、FINAL_DRAFT 検出、ユーザー確認）を混在させている。

**方針**: ストリーミング表示制御を独立関数に抽出する。

```typescript
interface StreamConsumerResult {
  textBuffer: string;
  hasAssistantMessage: boolean;
  sessionId: string | undefined;
}

/**
 * SDK メッセージストリームを消費し、表示制御を担当する。
 * - text_delta → stdout + textBuffer 蓄積
 * - tool_use_summary → stderr
 * - spinner の start/stop
 * - assistant / result メッセージの検出
 *
 * 制御フロー（slug 検出、FINAL_DRAFT 検出、ユーザー確認）は呼び出し元に委譲。
 */
async function consumeStream(
  messages: AsyncGenerator<unknown>,
  spinner: { start(): void; stop(): void },
): Promise<StreamConsumerResult>
```

`processAssistantTurn` は `consumeStream()` を呼んだ後、戻り値の textBuffer に対して slug 検出 / FINAL_DRAFT 検出 / ユーザー確認を行う。

**制約**: 現在の `processAssistantTurn` は `assistant` メッセージ受信後にユーザー確認（`rl.question()`）を行い、**その後も** iterator を消費し続けて result メッセージを取得する。`consumeStream()` に抽出すると、assistant 受信 → ユーザー確認 → result 取得の順序を維持する必要がある。

**解決**: `consumeStream()` は assistant メッセージ受信で一旦 yield し、呼び出し元が制御フローを処理した後、残りのメッセージ（result）を消費する。ただし AsyncGenerator の 2 段消費は複雑になるため、代わりに **callback パターン** を採用する:

```typescript
async function consumeStream(
  messages: AsyncGenerator<unknown>,
  spinner: { start(): void; stop(): void },
  onAssistantComplete: (textBuffer: string) => Promise<void>,
): Promise<StreamConsumerResult>
```

`onAssistantComplete` コールバックで slug 検出 / FINAL_DRAFT 検出 / ユーザー確認を実行。consumeStream は callback 完了後に iterator を最後まで消費し、result message の session_id を返す。

**理由**: callback パターンにより、consumeStream はストリーミング I/O に専念しつつ、assistant 完了時の制御フローを呼び出し元に委譲できる。processAssistantTurn の行数が大幅に削減される。

## Risks

### R1: setInterval の cleanup 漏れ

スピナーの `setInterval` を `stop()` で `clearInterval` する。processAssistantTurn の例外パスで stop が呼ばれない場合、interval が残り続ける。対策: finally ブロックで `spinner.stop()` を呼ぶ。

### R2: 非 TTY 判定のタイミング

`process.stderr.isTTY` はプロセス起動時に確定する。実行中に変化しないため、`start()` 内でのチェックで十分。
