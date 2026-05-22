# Spec Review Result: foreground-progress-display

- **verdict**: approved
- **reviewer**: spec-reviewer
- **date**: 2026-05-23

---

## 総評

request → design → tasks → delta spec の一貫性が高く、受け入れ基準がすべてタスクにトレースできる。アーキテクチャ上の主要リスク（timer leak）は設計・タスク・テストシナリオの三層で対策されており、実装可能な仕様として承認する。

---

## 検証サマリー

### 網羅性チェック

| 受け入れ基準 | 対応タスク | delta spec シナリオ |
|---|---|---|
| step+elapsed が定期出力される（floor） | Task 5.5–5.7 | message-streaming: Floor scenario |
| TTY/非TTY 分岐 | Task 5.7 | message-streaming: TTY-Aware 3シナリオ |
| DomainEvent に step:progress 追加 | Task 1 | message-streaming: DomainEvent scenario |
| throttle/render が ProgressDisplay 集約 | Task 5, D2 | agent-runner-port: adapter no throttle |
| timer が pipeline:complete/fail で停止 | Task 5.9 | message-streaming: safety net 2シナリオ |
| heartbeat interval が config/env で可変 | Task 4, 6 | message-streaming: Config 6シナリオ |
| 共通ヘルパーで main/follow-up を統一 | Task 3.1–3.3 | agent-runner-port: Common helper scenario |
| pipeline/agent 挙動不変 | Task 7 (regression test) | — |
| typecheck & test green | Task 8 | — |

### delta spec 形式チェック

- `message-streaming/spec.md`: 全 Requirement に `SHALL` あり、全シナリオに Given/When/Then あり ✓
- `agent-runner-port/spec.md`: 全 Requirement に `SHALL` あり、全シナリオに Given/When/Then あり ✓
- `delta-spec-validation-result.md`: approved ✓

### セキュリティレビュー

- 新規 API / 認証経路なし
- `SPECRUNNER_HEARTBEAT_INTERVAL` env var は `parseInt` でパース済み（injection リスクなし）
- `target` フィールド（ファイルパス等）は stdout のみへの出力で永続化・送信なし
- OWASP Top 10 該当なし

---

## 実装時の注意点（blocking ではない）

### 1. `clearTimerFn` と options の不整合（Task 5.2 vs 5.1）

tasks 5.2 の内部状態に `clearTimerFn: typeof clearInterval` が列挙されているが、tasks 5.1 の `ProgressDisplayOptions` に対応する injection point がない。実装時に以下いずれかで解決すること:

- `options` に `clearTimerFn?: typeof clearInterval` を追加（推奨、`timerFn` と対称）
- または production では `clearInterval` を直接参照し、vitest の `vi.useFakeTimers()` でグローバル置換に頼る

### 2. `elapsedSeconds` の `nowFn` 未適用

tasks 5.5 で `this.nowFn()` を `stepStartTimes.set` に使っているが、既存の `elapsedSeconds` メソッドは `Date.now()` 直参照のまま（progress.ts:69）。テストで injected time を使うなら `elapsedSeconds` も `this.nowFn()` に変える必要がある。明示的に変更するか、既存のままテストで `Date.now` をモックするか実装者が選択すること。

### 3. `isTTY` の注入なし

`isTTY` は constructor で `process.stdout.isTTY` からキャプチャされるが、options に injection がないためテストでは `process.stdout.isTTY` をモックする必要がある。テスト 7.2 の TTY/非TTY シナリオは vitest の `Object.defineProperty` 等でカバー可能。実装上の問題はなし。

### 4. `emitToolProgress` 内の `as any` キャスト（Task 3.1）

```ts
const cb = (msg as any).event.content_block;
```

`isToolUse` で narrowing した後でもアクセスに `as any` が必要な場合、型定義の narrowed type に `content_block` を含めることで回避できる。`isToolUse` の返却型（tasks 2）に `content_block.name` が含まれているため、guard 通過後は `as any` 不要になるはず。実装時に確認すること。

---

## 決定事項の確認

- `step:progress` を DomainEvent union に正規追加 → executor.ts:152 の `as never` は `step:progress` に対して不要になる（他 non-standard event の `as never` は残存、許容）
- managed runtime は floor のみ（tool enrichment なし）— scope 外として明記済み、適切
- heartbeat timer は cli（ProgressDisplay）に置く — core に置かない、design D1 原則に合致
- CLI flag は今回追加しない（env で十分）— 設計判断として明記済み、適切
