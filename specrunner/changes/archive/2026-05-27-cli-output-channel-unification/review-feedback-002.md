# Code Review Feedback — cli-output-channel-unification — iteration 2

## Summary

Iteration 1 の must-fix (F1: `managed.ts:210` 直接 `process.stdout.write`) は修正済み。全受け入れ基準を充足しており、テスト 3022 件 pass。minor 指摘のみ残存するため approved とする。

---

## Findings

### F1 (from iteration 1): `src/cli/managed.ts:210` — 修正済み ✅

前回 must-fix に指摘した `process.stdout.write("No stale managed config. Nothing to reset.\n")` が `stderrWrite("No stale managed config. Nothing to reset.")` に修正されている。

---

### F2 (from iteration 1, carry-over): logInfo / logStep / logSuccess / stdoutWrite / logResult の単体テスト欠如 (TC-49 gap)

- **severity**: minor
- **file**: `tests/unit/logger/`（欠如）

前回と同様、以下のテストが存在しない:

- `logInfo` → stderr（TC-01）
- `logStep` → stderr（TC-02）
- `logSuccess` → stderr（TC-03）
- `stdoutWrite` が `maskSensitive` を適用する（TC-04 / TC-40）
- `logResult` → stdout + `\n` + `maskSensitive`（TC-05 / TC-06）

実装は正しい（コード検査で確認済み）が、リグレッション防止のためのテストが不在のまま。次回 Phase 1 に対するメンテナンス変更で対処することを推奨する。

---

### F3: `pipeline.ts` の JSDoc コメント重複 — trivial

- **severity**: trivial
- **file**: `src/core/pipeline/pipeline.ts`
- **lines**: 42–43

```typescript
  /** Loop name for stdout progress output (matches legacy runLoopUntil output). */
  /** Loop name for stdout progress output (matches legacy runLoopUntil output). */
  private readonly loopName: string;
```

同一の JSDoc が 2 行連続しており、コピーペーストの残滓と思われる。加えて「stdout progress output」という記述は出力先が EventBus → stderr に移行したため stale。次の機会に `/** Primary loop step name for iteration progress tracking. */` 程度に整理することを推奨する。機能には無影響。

---

### F4: `progress.test.ts` の describe 文字列が旧 stdout 出力を示している — trivial

- **severity**: trivial
- **file**: `tests/unit/cli/progress.test.ts`
- **line**: 88

```typescript
describe("TC-6.1: ProgressDisplay — EventBus emit → stdout 出力", () => {
```

`→ stdout 出力` と書かれているが、実際のテストは `stderrSpy` で stderr を検証している。テストの動作は正しいが、説明文が誤解を招く。`→ stderr 出力` に修正を推奨する。機能には無影響。

---

## Acceptance Criteria チェック

| 基準 | 状態 |
|------|------|
| `src/` に `process.stdout.write` の直接呼び出しなし（許可された例外を除く） | ✅ |
| `stdoutWrite` が `maskSensitive` を適用している | ✅ |
| stdout に出力されるのはプログラムの結果のみ | ✅ |
| 進捗表示・warning・error は stderr に出力される | ✅ |
| `pipeline.ts` の直接 stdoutWrite が廃止され、EventBus 経由になっている | ✅ |
| 新 DomainEvent が `src/core/event/types.ts` に定義されている | ✅ |
| `progress.ts` の TTY 検出が `process.stderr.isTTY` を参照している | ✅ |
| 既存マスクパターンが全出力パスに適用されている | ✅ |
| `bun run typecheck && bun run test` が green | ✅（3022 tests passed） |

---

## Must シナリオ網羅状況

| TC | 説明 | 状態 |
|----|------|------|
| TC-01 | logInfo → stderr | ✅ コード確認済（テスト欠如、F2） |
| TC-02 | logStep → stderr | ✅ コード確認済（テスト欠如、F2） |
| TC-03 | logSuccess → stderr | ✅ コード確認済（テスト欠如、F2） |
| TC-04 | stdoutWrite が maskSensitive を適用 | ✅ コード確認済（テスト欠如、F2） |
| TC-05 | logResult → stdout + \n | ✅ コード確認済（テスト欠如、F2） |
| TC-06 | logResult が maskSensitive を適用 | ✅ コード確認済（テスト欠如、F2） |
| TC-07〜09 | DomainEvent 型定義 | ✅ |
| TC-10 | pipeline.ts に stdoutWrite なし | ✅ |
| TC-11〜16 | pipeline.ts が正しい event を emit | ✅ |
| TC-17 | progress.ts に process.stdout.write なし | ✅ |
| TC-18 | TTY 検出が process.stderr.isTTY | ✅ |
| TC-19 | columns が process.stderr.columns | ✅ |
| TC-20 | non-TTY で \r なし | ✅ |
| TC-21〜26 | progress.ts が新 event を subscribe して stderr に出力 | ✅ |
| TC-27 | src/ に process.stdout.write なし | ✅ grep で残存なし |
| TC-28 | src/ に process.stderr.write なし（許可除く） | ✅ コメントのみ |
| TC-36〜40 | マスキング全適用 | ✅ |
| TC-41〜42 | stdout/stderr 分離（構造的保証） | ✅ |
| TC-45 | typecheck green | ✅ |
| TC-46 | test green | ✅ 3022 tests |
| TC-47 | progress.ts tests が stderr mock | ✅ |
| TC-48 | pipeline.ts tests が EventBus emit を検証 | ✅ |
| TC-49 | logInfo 等のテストが stderr を検証 | ❌ テスト欠如（minor、F2） |
| TC-52〜54 | 後退防止（EventBus sync、maskSensitive パターン） | ✅ |

---

- **verdict**: approved
