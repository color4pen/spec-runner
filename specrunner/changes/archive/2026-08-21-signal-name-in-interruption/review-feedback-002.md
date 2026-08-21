# Code Review Feedback — signal-name-in-interruption — Iteration 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### diff / scope

- `git diff main...HEAD --stat` で変更ファイル一覧を確認（20 files: event-journal.ts / local.ts / managed.ts / signal-name-in-interruption.test.ts / specrunner-resume-dispatch.test.ts + change folder）
- 実装変更 3 ファイル（`event-journal.ts`, `local.ts`, `managed.ts`）の全行を確認
- 新規テストファイル `signal-name-in-interruption.test.ts`（337 行）を全行確認
- 既存 `exit-guard.ts` の変更なしを確認
- `exit-guard.test.ts` の signal 関連テスト（lines 212, 272, 312）を確認
- `specrunner-resume-dispatch.test.ts` の追加内容（19 行：DEBUG / SPECRUNNER_LOG_LEVEL の beforeEach/afterEach 保存復元）を確認
- events.jsonl でイテレーション 1 の code-review escalation 記録と operator 裁定の適用を確認
- commit 履歴（`git log main...HEAD`）を確認し、第 2 implementer pass（cbdec4dc）の内容が specrunner-resume-dispatch.test.ts のみであることを確認

### 前回（iteration 1）の findings と今回の対応状況

| Finding | 前回分類 | 今回の状態 |
|---------|---------|-----------|
| F-001: TC-004 テスト欠落 | medium / fixable | **未対応**（コードは不変）|
| F-002: local.ts:1718 の誤解コメント | low / fixable | **未対応**（コードは不変）|
| F-003: out-of-scope env var 変更 | low / decision-needed | **解決済**（operator 裁定: Keep as-is）|

### 実装の正確性（再確認）

- `InterruptionRecord.signal?: "SIGINT" | "SIGTERM" | "SIGHUP"` が optional で追加済 ✓
- `local.ts:1683` — `signalCleanup(signal: NodeJS.Signals)` に変更済 ✓
- `local.ts:1695-1700` — `appendInterruption` に `signal` フィールド追加済 ✓
- `local.ts:1703` — transition reason が `` `Interrupted by ${signal}` `` に変更済 ✓
- `local.ts:1708` — `resumePoint.reason` は `"Interrupted by signal"` のまま不変 ✓
- `local.ts:1721-1723` — SIGINT / SIGTERM / SIGHUP が登録済 ✓
- `local.ts:1740-1742` — teardown で 3 シグナル全て deregister 済 ✓
- `local.ts:1718` — コメント `// 128 + SIGINT(2)` が残存（F-002 未対応）✗
- `managed.ts:741` — `signalCleanup(signal: NodeJS.Signals)` に変更済 ✓
- `managed.ts:748` — transition reason が `` `Interrupted by ${signal}` `` に変更済 ✓
- `managed.ts:753` — `resumePoint.reason` は `"Interrupted by signal"` のまま不変 ✓
- `managed.ts:765-767` — SIGINT / SIGTERM / SIGHUP が登録済 ✓
- `managed.ts:776-778` — teardown で 3 シグナル全て deregister 済 ✓
- `exit-guard.ts` は変更なし（D5 通り、`appendInterruption` call-site に `signal` フィールドなし）✓

### テストカバレッジ（test-cases.md 対照）

| TC | Priority | 状態 |
|----|---------|------|
| TC-001: SIGINT → appendInterruption with signal field | must | ✓ 新規テスト（parameterized loop） |
| TC-002: SIGTERM → appendInterruption with signal field | must | ✓ 新規テスト |
| TC-003: SIGHUP → appendInterruption with signal field | must | ✓ 新規テスト |
| **TC-004: exit-guard fires → signal field absent** | **must** | **✗ 未カバー** |
| TC-005: SIGTERM local transition message | must | ✓ 新規テスト |
| TC-006: SIGTERM managed transition message | must | ✓ 新規テスト |
| TC-007: SIGHUP local transition message | must | ✓ 新規テスト |
| TC-008: SIGINT managed transition message | should | ✓ 新規テスト |
| TC-009: SIGHUP managed transition message | should | ✓ 新規テスト |
| TC-010: local resumePoint.reason 不変 | must | ✓ 新規テスト |
| TC-011: managed resumePoint.reason 不変 | must | ✓ 新規テスト |
| TC-012: exit-guard resumePoint.reason = "signal" | must | ✓ exit-guard.test.ts L212/272/312 |
| TC-013: SIGHUP local 登録 | must | ✓ 新規テスト |
| TC-014: SIGHUP local teardown | must | ✓ 新規テスト |
| TC-015: SIGHUP managed 登録 | must | ✓ 新規テスト |
| TC-016: SIGHUP managed teardown | must | ✓ 新規テスト |
| TC-017/018: TypeScript 型チェック | must | ✓ typecheck gate |
| TC-019/020/021: 既存テスト不変 | must | ✓ verification passed |
| TC-022: typecheck green | must | ✓ verification iter 2 passed |
| TC-023: test suite green | must | ✓ verification iter 2 passed |

### operator 裁定の適用確認

operator 裁定「F-003（env var 変更）は選択肢 1（Keep as-is）を採用する」に従い、`specrunner-resume-dispatch.test.ts` の env var 保存・復元ロジックは keep 済。本 iteration では F-003 を finding として報告しない。

---

## 検証できなかった項目

None — 必要な全ファイルを確認した。

---

## Findings 詳細

### F-001: TC-004「exit-guard fires → signal field absent」のテストが存在しない（medium）

test-cases.md は TC-004 を **must** priority で定義している:

> "Given a job is running and the process exits without any registered signal handler firing, When the `beforeExit` exit-guard handler calls `appendInterruption`, Then the record is `{ type: "interruption", reason: "signal", ts: <ISO string> }` with no `signal` field"

iteration 1 のレビュー時点から変更なし。新規テストファイルも既存 `exit-guard.test.ts` も、`appendInterruption` のコール引数から `signal` フィールドの**欠如**を runtime でアサートするテストを持たない。

- `exit-guard.test.ts` L212/272/312 は `resumePoint.reason === "signal"` を検証するが、`InterruptionRecord.signal` フィールドの存在/欠如は検査しない
- TypeScript の optional フィールドはコンパイル時に欠如を保証しない
- 将来の誤ったリファクタリングで exit-guard に `signal` が追加されても検出できない

**修正案（`exit-guard.test.ts` または signal-name 専用テストファイルに追加）**:

```ts
it("TC-004: exit-guard fires → appendInterruption receives record without signal field", async () => {
  const appendInterruptionSpy = vi
    .spyOn(JobStateStore.prototype, "appendInterruption")
    .mockResolvedValue(undefined);
  vi.spyOn(JobStateStore.prototype, "load").mockResolvedValue(/* running state */);
  vi.spyOn(JobStateStore.prototype, "persist").mockResolvedValue(undefined);
  // signal handler NOT fired — exit-guard path
  // ... trigger exit guard ...
  const record = appendInterruptionSpy.mock.calls[0]![0];
  expect(record.signal).toBeUndefined();
});
```

---

### F-002: `local.ts:1718` のコメントが誤解を招く（low）

```ts
process.exit(130); // 128 + SIGINT(2)
```

iteration 1 のレビュー時点から変更なし。ハンドラが SIGTERM(128+15=143) / SIGHUP(128+1=129) にも登録されたにもかかわらず、コメントは `SIGINT(2)` のみを言及しており、「exit code = 130 はシグナル別に計算されている」という誤解を招く。

設計判断（architect 確認済）: exit code は 130 固定でシグナル別化はスコープ外。

**修正案**:
```ts
process.exit(130); // fixed; per-signal exit codes (128+n) are out of scope
```
