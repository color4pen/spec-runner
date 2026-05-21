# Code Review: request-create-progress (iter 1)

- **reviewer**: code-reviewer (Claude)
- **date**: 2026-05-18
- **iteration**: 1

## Summary

実装の核心部分は正しい。`stderrWrite()` の挿入位置・メッセージ文言・出力順序はすべて design.md および request.md の仕様と合致する。TC-PROG-01〜03 はカバー済み、verification は全フェーズ green。

ただし test-cases.md で **must** に分類された TC-PROG-04（request-create 失敗メッセージのテスト）と TC-PROG-05（request-review 失敗メッセージのテスト）が未実装。これが唯一の要修正点。

---

## Findings

### F-01: TC-PROG-04 が未実装（must シナリオ）

- **severity**: MEDIUM
- **category**: test-coverage
- **file**: `tests/unit/command/request-create.test.ts`
- **description**: `manager.create` がエラーをスローしたとき `"✗ Failed: LLM timeout"` が stderr に出力されること（および既存の `"Error: ..."` 出力が維持されること）を検証するテストがない。
- **implementation status**: 実装コード自体は正しい（`catch` 内の `stderrWrite("✗ Failed: " + ...)` → `process.stderr.write("Error: ...")` の順序も仕様通り）。
- **action**: `request-create.test.ts` に TC-PROG-04 ケースを追加する。`manager.create` を `vi.fn().mockRejectedValue(new Error("LLM timeout"))` で差し替えて stderr 出力を検証する。

### F-02: TC-PROG-05 が未実装（must シナリオ）

- **severity**: MEDIUM
- **category**: test-coverage
- **file**: `tests/unit/command/request-review-progress.test.ts`
- **description**: `runReview` が例外をスローしたとき `"✗ Failed:"` が stderr に出力されることを検証するテストがない。
- **implementation status**: 実装コード自体は正しい（`SpecRunnerError` / 一般エラー両方のパスで `stderrWrite("✗ Failed: ...")` が呼ばれる）。
- **action**: `request-review-progress.test.ts` に TC-PROG-05 ケースを追加する。`runReview` を `vi.fn().mockRejectedValue(new Error("..."))` で差し替えて stderr 出力を検証する。

### F-03: TC-PROG-03 が `request-review.test.ts` でなく別ファイルに分離

- **severity**: LOW
- **category**: spec-deviation
- **file**: `tests/unit/command/request-review-progress.test.ts`
- **description**: tasks.md は TC-PROG-03 を `request-review.test.ts` への追記として指定していたが、vi.mock ホイスティング競合を避けるため別ファイルに分離されている。
- **impact**: テストは存在して green。機能上の問題なし。
- **action**: なし（分離の理由が明確で合理的）。

---

## Test Coverage Check (test-cases.md must シナリオ)

| TC | Priority | Covered | File |
|----|----------|---------|------|
| TC-PROG-01 | must | ✅ | `request-create.test.ts` |
| TC-PROG-02 | must | ✅ | `request-create.test.ts` |
| TC-PROG-03 | must | ✅ | `request-review-progress.test.ts` |
| TC-PROG-04 | must | ❌ | — |
| TC-PROG-05 | must | ❌ | — |
| TC-PROG-10 | must | ✅ | 既存テスト全件 pass |
| TC-PROG-11 | must | ✅ | delta spec 存在・MODIFIED Requirements セクションあり |
| TC-PROG-12 | must | ✅ | verification-result.md: passed |

---

## Implementation Quality Notes

- `stderrWrite` は `maskSensitive()` 経由のため API key 漏洩なし。セキュリティ上の問題なし。
- `request-create.ts`: 開始メッセージは try ブロック内 `manager.create()` 直前に配置（正しい）。
- `request-review.ts`: 開始メッセージは try ブロック外・直前に配置。`stderrWrite` は同期処理なのでタイミング問題なし。
- 失敗メッセージの出力順（`✗ Failed:` → `Error: ...` → `Hint: ...`）は design.md の仕様通り。
- delta spec は `## MODIFIED Requirements` セクションを持ち、6 シナリオを WHEN/THEN 形式で記述。baseline spec は未編集（AUTHORITY_SPEC_GUARD_RULE 準拠）。

---

## Verdict

- **verdict**: needs-fix

F-01 / F-02（TC-PROG-04, TC-PROG-05: must シナリオ未実装）を修正してください。F-03 は対応不要。
