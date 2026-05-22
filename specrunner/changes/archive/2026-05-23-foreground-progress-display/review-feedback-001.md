# Code Review Feedback — foreground-progress-display — iter 1

- **verdict**: approved
- **reviewer**: code-reviewer
- **date**: 2026-05-23

---

## 総評

差分実装は design.md / tasks.md / delta spec / test-cases.md と一貫しており、最重要リスクとされた timer leak は startHeartbeat 冒頭 stopHeartbeat + step:complete/step:error + pipeline:complete/pipeline:fail + dispose() の 4 経路で確実に塞がれている。`bun run typecheck && bun run test` は 2687/2687 green、test-coverage は 46/46 must TC をカバー済み。型安全性・async 正当性・security に critical/major 問題なし。実装可能な範囲で十分に高品質。

下記の minor / info は blocking ではない（将来 cleanup の候補）。

---

## 検証スコープ

- 実装ファイル
  - `src/cli/progress.ts` — heartbeat timer / render 分岐 / dispose
  - `src/adapter/claude-code/agent-runner.ts` — emitToolProgress + extractTarget + 2 stream loop wire
  - `src/adapter/claude-code/message-types.ts` — isToolUse type guard
  - `src/config/schema.ts` — ProgressConfig + validateConfig
  - `src/core/event/types.ts` — DomainEvent / EventPayloadMap への step:progress 追加
  - `src/cli/run.ts` / `src/cli/resume.ts` — resolveHeartbeatInterval + wireProgressDisplay + dispose
- テスト
  - `tests/unit/cli/progress.test.ts` — TC-HB-1〜10 + TC-6.1
  - `tests/unit/adapter/claude-code/agent-runner.test.ts` — TC-EMIT-001/002/003
  - `tests/unit/adapter/claude-code/message-types.test.ts` — TC-MT-005 (isToolUse)
  - `tests/unit/config/runtime-config.test.ts` — TC-PROG-001〜007

---

## must scenario 網羅性 (test-cases.md)

| ID | 内容 | 対応テスト | 状態 |
|---|---|---|---|
| TC-001 | step:progress が DomainEvent union に含まれる | `src/core/event/types.ts:14` | OK (型レベル) |
| TC-002 | EventPayloadMap.step:progress payload 型 | `src/core/event/types.ts:28` | OK |
| TC-004 | 既存 as never (commit:push) への影響なし | typecheck green | OK |
| TC-010〜012 | isToolUse 判別 | `message-types.test.ts:170-254` | OK |
| TC-020 | main loop で step:progress emit | TC-EMIT-001 | OK |
| TC-021 | follow-up loop で step:progress emit | TC-EMIT-003 | OK |
| TC-022 | tool_use なしで emit しない | TC-EMIT-002 | OK |
| TC-026 | managed runtime は step:progress を emit しない | `src/adapter/managed-agent/` 内 grep で確認 | OK (構造的) |
| TC-030〜034 | config validation | TC-PROG-001〜005 | OK |
| TC-036 | progress 未定義で valid | TC-PROG-007 | OK |
| TC-040 | step:start で timer 開始 | TC-HB-1 | OK |
| TC-041 | tick で elapsed 出力 | TC-HB-1 (heartbeat tick outputs elapsed line) | OK |
| TC-042〜045 | step:complete/error/pipeline:complete/fail で停止 | TC-HB-3/9/4 | OK |
| TC-046 | dispose() で停止 | TC-HB-5 | OK |
| TC-047 | heartbeatIntervalSec=0 で timer 起動なし | TC-HB-6 | OK |
| TC-048 | 連続 step で leak しない | TC-HB-10 | OK |
| TC-050〜053 | progressCount / lastTool / リセット | TC-HB-2 | OK |
| TC-060 | TTY 非verbose で \r 上書き | TC-HB-7 | OK |
| TC-062 | 非TTY で \n append | TC-HB-8 | OK |
| TC-063 | verbose で \n append | TC-HB-8 second case | OK |
| TC-080/081 | timer leak 防止 | TC-HB-3/4/9/10 | OK |
| TC-091/092 | typecheck / test green | verification-result.md | OK |

must TC: 46/46 covered (verification-result.md と一致)。

---

## Findings

### F-01 [minor] resolveHeartbeatInterval が run.ts と resume.ts で重複実装されている

**場所**: `src/cli/run.ts:21-37`、`src/cli/resume.ts:14-27`

両ファイルにほぼ同一の 16 行関数がコピペされている。プロセス全体で 1 度しか呼ばれない util だが、env / config / TTY default の precedence ロジックは「振る舞いの単一真実」であるべき。片方を変更したらもう片方を変え忘れる drift リスクが高い。

`src/cli/progress-config.ts` 等に切り出し、両方が import する形にすると、TC-070〜076 で要求されている precedence 動作の単体テストも 1 箇所に書ける（現状この関数自体の単体テストは 0 件）。

**推奨**: blocking ではない。次の change で抽出 + テスト追加。

### F-02 [minor] `as any` 相当キャストが残存している

**場所**: `src/adapter/claude-code/agent-runner.ts:82`

```ts
const cb = (msg as { type: string; event: { content_block: { name: string; input?: Record<string, unknown> } } }).event.content_block;
```

`isToolUse(msg)` で type narrowing 済みのため、本来この個別キャストは不要。`isToolUse` の guard 戻り型に `content_block.name: string` / `content_block.input?: Record<string, unknown>` がすでに含まれているので、`if (!isToolUse(msg)) return;` を抜けたあとは `msg.event.content_block.name` 等を素直にアクセスできるはず（spec-review-result-001 #4 で既に指摘されていた）。

ランタイム挙動は同じだが「narrow が効いている保証」が型システムから外れるため、SDK 形状の drift を検出できなくなる。

**推奨**: 次の cleanup pass で。

### F-03 [info] dispose の冪等性は OK だが、二重 dispose 経路に注意

`onPipelineComplete` / `onPipelineFail` ですでに stopHeartbeat 済み + finally で `progress.dispose()` を呼ぶため、pipeline 正常終了パスでは stopHeartbeat が 2 度呼ばれる。`heartbeatTimer === null` ガードで安全なので動作問題なし、test TC-HB-5 second case で idempotent も確認済み。

ただし composition point (`run.ts:93` / `resume.ts:69`) の finally で `progress.dispose()` を直接呼ぶ設計は、将来 EventBus 不通や handler 例外が発生したときの safety net として正しい。コメントで「safety net」と明記しておくと意図が伝わる。

**推奨**: 修正不要、コメント追加だけ検討。

### F-04 [info] resolveHeartbeatInterval の precedence test が欠落

`tests/unit/cli/progress.test.ts` には config/env/default precedence の test (TC-070〜076 相当) が存在しない。`resolveHeartbeatInterval` が module-local function で export されていないため、外部テストが書けない構造。

現状 `wireProgressDisplay` 経由で `heartbeatIntervalSec` を直接渡しているので機能テストはカバーされている (TC-HB-1/6) が、precedence ロジックそのものの regression は捕まらない。F-01 と合わせて util 抽出すれば test しやすい。

**推奨**: F-01 のリファクタとセットで対応。

### F-05 [info] `lastTool` の文字列結合が target 長制限なし

`onStepProgress` で `${tool} ${target}` を構築するが、`extractTarget` の Bash 分岐では 40 文字 + "…" に省略済み (`agent-runner.ts:54`)。Edit/Write の `file_path` は省略していないため、絶対パスが長いと heartbeat 出力が端末幅を超え、TTY mode で `padEnd(columns)` が無効になる可能性がある（`padEnd` は短い場合のみ伸ばすため）。

実害は表示崩れ程度で機能には影響なし。

**推奨**: 現状で OK。将来 file_path も切り詰めるなら adapter 側 extractTarget に集約する。

---

## Confidence

- F-01〜F-05 はすべて confidence 90%+ で観測した事実ベース。
- critical/major 該当なし。
- 既存テスト 2687 件が green、新規追加分は明示的に該当 must TC をカバー。
