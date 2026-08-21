# Code Review Feedback — signal-name-in-interruption — Iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### diff / scope

- `git diff main...HEAD --stat` で変更ファイル一覧を確認（19 files, 2819 insertions）
- 実装変更 3 ファイル（`event-journal.ts`, `local.ts`, `managed.ts`）の diff を全行確認
- 新規テストファイル `signal-name-in-interruption.test.ts` の diff を全行確認
- 既存 `exit-guard.ts` の diff（変更なし）を確認
- `specrunner-resume-dispatch.test.ts` の変更内容を確認

### 実装の正確性

- `InterruptionRecord` に `signal?: "SIGINT" | "SIGTERM" | "SIGHUP"` が optional で追加されていることを確認
- `local.ts` で `signalCleanup` が `(signal: NodeJS.Signals) => Promise<void>` に変更、`appendInterruption` に `signal` フィールドが追加されていることを確認
- `local.ts` で transition message が `` `Interrupted by ${signal}` `` に変更されていることを確認
- `local.ts` で `resumePoint.reason` が `"Interrupted by signal"` のまま不変であることを確認
- `managed.ts` で同様のシグネチャ変更・transition message 変更・`resumePoint.reason` 不変を確認
- `local.ts`, `managed.ts` 両方で SIGHUP が `process.on` 登録・`process.off` 解除されていることを確認
- `exit-guard.ts` が一切変更されていないこと（`appendInterruption` call-site に `signal` フィールドなし）を確認
- `process.exit(130)` が変更されていないことを確認

### テストカバレッジ

- 新規テストファイル 16 tests が全 pass（verification-result.md 確認）
- test-cases.md の 23 TC を新規テスト・既存テスト・ゲートに対してマッピング確認
- TC-001/002/003（appendInterruption に signal フィールド）: new file でカバー ✓
- TC-005/007（local transition message）: new file でカバー ✓
- TC-006/008/009（managed transition message）: new file でカバー ✓
- TC-010/011（resumePoint.reason 不変）: new file でカバー ✓
- TC-012（exit-guard resumePoint.reason = "signal"）: 既存 exit-guard.test.ts 212/272/312 行でカバー ✓
- TC-013/014（local SIGHUP 登録/解除）: new file でカバー ✓
- TC-015/016（managed SIGHUP 登録/解除）: new file でカバー ✓
- TC-017/018（型チェック）: typecheck gate でカバー ✓
- TC-019/020/021（既存テスト不変）: test gate でカバー ✓
- TC-022/023（typecheck && test green）: verification-result.md で確認 ✓
- **TC-004（exit-guard fires → signal field absent）: どこにもカバーなし ✗**

### 既存テストへの影響

- `signal-handler-order.test.ts` が `signalCleanup()` を引数なしで呼ぶことを確認（`as unknown as { signalCleanup: () => Promise<void> }` キャスト経由）。`signal === undefined` → JSON シリアライズで `signal` フィールド省略、`appendInterruption`/`persist` はモック済み。影響なし
- `exit-guard.test.ts` の `resumePoint.reason: "signal"` アサーションが exit-guard 変更なしにより影響なし
- `member-resume-routing.test.ts`, `resume-member-context.test.ts` の `resumePoint.reason: "Interrupted by signal"` フィクスチャが変更なし
- verification-result.md で全テスト suite が green であることを確認

### コメント・型安全性

- `local.ts:1718` のコメント `// 128 + SIGINT(2)` を確認。ハンドラが SIGTERM/SIGHUP にも共有されたため、コメントが誤解を招く
- `signal: signal as "SIGINT" | "SIGTERM" | "SIGHUP"` キャストを確認。`NodeJS.Signals` から narrow union へのキャストは技術的に unsound だが、登録シグナルが 3 種に限定されているため実害なし

### out-of-scope 変更

- `specrunner-resume-dispatch.test.ts` の env var 保存/復元ロジックが signal 機能と無関係であることを確認

---

## 検証できなかった項目

None — 必要な全ファイルを確認した。

---

## Findings 詳細

### F-001: TC-004「exit-guard fires → signal field absent」のテストが存在しない（medium）

test-cases.md は TC-004 を "must" priority で定義している:

> exit-guard が `appendInterruption` を呼ぶとき、記録は `{ type: "interruption", reason: "signal", ts: … }` であり `signal` フィールドが存在しないこと

新規テストファイルも既存 `exit-guard.test.ts` も、この「フィールド不在」を runtime でアサートするテストを持たない。既存テストは `resumePoint.reason` 値や events.jsonl 行数を確認するが、`InterruptionRecord` の内容（特に `signal` フィールドの欠如）は検査しない。

TypeScript のコンパイルは `signal?` が optional なので call-site を受理するが、将来の誤ったリファクタリングで exit-guard に `signal` が入っても検出できない。

**修正案**: `exit-guard.test.ts`（または signal-name 専用テストファイル）に以下のようなテストを追加する:

```ts
it("TC-004: exit-guard fires → appendInterruption has no signal field", async () => {
  // ... setup job state ...
  const spy = vi.spyOn(JobStateStore.prototype, "appendInterruption").mockResolvedValue(undefined);
  // ... trigger exit guard (no signal handler fired) ...
  const record = spy.mock.calls[0]![0];
  expect(record.signal).toBeUndefined();
});
```

---

### F-002: `local.ts:1718` のコメントが誤解を招く（low）

変更前: SIGINT 専用ハンドラに `// 128 + SIGINT(2)` は正確だった。  
変更後: 同一ハンドラが SIGTERM (128+15=143), SIGHUP (128+1=129) にも呼ばれるが exit code は 130 固定のため、コメントが SIGINT を特定している点で誤解を招く。

**修正案**:
```ts
process.exit(130); // fixed; per-signal exit codes (128+n) are out of scope
```

---

### F-003: `specrunner-resume-dispatch.test.ts` の変更がスコープ外（low）

env var (`DEBUG`, `SPECRUNNER_LOG_LEVEL`) の beforeEach/afterEach 保存・復元は signal-name-in-interruption とは無関係。テスト衛生改善としては有益だが、このPRの変更スコープに含まれない。

**選択肢**:
- **Keep**: 軽微なテスト品質向上として受容する（リスクなし）
- **Revert**: 別コミット/PR に分離してスコープを厳密に管理する
